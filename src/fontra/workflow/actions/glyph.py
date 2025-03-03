from __future__ import annotations

import itertools
import logging
from collections import defaultdict
from dataclasses import dataclass, field, replace
from enum import Enum
from typing import Any

from fontTools.cu2qu.ufo import glyphs_to_quadratic
from fontTools.misc.roundTools import otRound
from fontTools.misc.transform import Transform
from fontTools.pens.pointPen import SegmentToPointPen

from ...core.async_property import async_cached_property
from ...core.classes import (
    Component,
    FontSource,
    GlyphSource,
    Kerning,
    Layer,
    StaticGlyph,
    VariableGlyph,
)
from ...core.glyphdependencies import GlyphDependencies
from ...core.instancer import FontInstancer, GlyphInstancer
from ...core.path import PackedPath, PackedPathPointPen, joinPaths
from ...core.pathops import unionPath
from ...core.varutils import locationToTuple
from .axes import (
    AxisRange,
    moveDefaultLocations,
    subsetLocationKeep,
    trimLocations,
    updateGlyphSourcesAndLayers,
)
from .base import (
    BaseFilter,
    getActiveSources,
    locationToString,
    registerFilterAction,
    sparseLocation,
)

logger = logging.getLogger(__name__)


@registerFilterAction("scale")
@dataclass(kw_only=True)
class Scale(BaseFilter):
    scaleFactor: float
    scaleFontMetrics: bool = True
    scaleKerning: bool = True

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        transformation = Transform().scale(self.scaleFactor)
        return replace(
            glyph,
            layers={
                layerName: replace(
                    layer, glyph=self._scaleStaticGlyph(layer.glyph, transformation)
                )
                for layerName, layer in glyph.layers.items()
            },
        )

    def _scaleStaticGlyph(
        self, glyph: StaticGlyph, transformation: Transform
    ) -> StaticGlyph:
        xAdvance = (
            glyph.xAdvance * self.scaleFactor if glyph.xAdvance else glyph.xAdvance
        )
        yAdvance = (
            glyph.yAdvance * self.scaleFactor if glyph.yAdvance else glyph.yAdvance
        )
        verticalOrigin = (
            glyph.verticalOrigin * self.scaleFactor
            if glyph.verticalOrigin
            else glyph.verticalOrigin
        )
        anchors = [
            replace(a, x=a.x * self.scaleFactor, y=a.y * self.scaleFactor)
            for a in glyph.anchors
        ]
        guidelines = [
            replace(g, x=g.x * self.scaleFactor, y=g.y * self.scaleFactor)
            for g in glyph.guidelines
        ]
        return replace(
            glyph,
            xAdvance=xAdvance,
            yAdvance=yAdvance,
            verticalOrigin=verticalOrigin,
            path=glyph.path.transformed(transformation),
            components=[
                self._scaleComponentOrigin(component) for component in glyph.components
            ],
            anchors=anchors,
            guidelines=guidelines,
        )

    def _scaleComponentOrigin(self, component: Component) -> Component:
        scaleFactor = self.scaleFactor
        x = component.transformation.translateX * scaleFactor
        y = component.transformation.translateY * scaleFactor
        return replace(
            component,
            transformation=replace(
                component.transformation, translateX=x, translateY=y
            ),
        )

    async def processUnitsPerEm(self, unitsPerEm: int) -> int:
        return (
            otRound(unitsPerEm * self.scaleFactor)
            if self.scaleFontMetrics
            else unitsPerEm
        )

    async def processSources(
        self, sources: dict[str, FontSource]
    ) -> dict[str, FontSource]:
        if not self.scaleFontMetrics:
            return sources

        return {
            sourceIdentifier: scaleFontSourceCoordinates(source, self.scaleFactor)
            for sourceIdentifier, source in sources.items()
        }

    async def processKerning(self, kerning: dict[str, Kerning]) -> dict[str, Kerning]:
        if not self.scaleKerning:
            return kerning

        return {
            kernType: scaleKerning(kernTable, self.scaleFactor)
            for kernType, kernTable in kerning.items()
        }


def scaleFontSourceCoordinates(source, scaleFactor):
    return replace(
        source,
        lineMetricsHorizontalLayout=scaleLineMetrics(
            source.lineMetricsHorizontalLayout, scaleFactor
        ),
        lineMetricsVerticalLayout=scaleLineMetrics(
            source.lineMetricsVerticalLayout, scaleFactor
        ),
    )


def scaleLineMetrics(lineMetrics, scaleFactor):
    return {
        name: replace(
            metric, value=metric.value * scaleFactor, zone=metric.zone * scaleFactor
        )
        for name, metric in lineMetrics.items()
    }


def scaleKerning(kernTable: Kerning, scaleFactor) -> Kerning:
    return replace(
        kernTable,
        values={
            left: {
                right: [v * scaleFactor if v else v for v in values]
                for right, values in rightDict.items()
            }
            for left, rightDict in kernTable.values.items()
        },
    )


@registerFilterAction("decompose-composites")
@dataclass(kw_only=True)
class DecomposeComposites(BaseFilter):
    onlyVariableComposites: bool = False

    async def getGlyph(self, glyphName: str) -> VariableGlyph:
        instancer = await self.fontInstancer.getGlyphInstancer(glyphName)

        if not instancer.componentTypes or (
            self.onlyVariableComposites and not any(instancer.componentTypes)
        ):
            glyph = instancer.glyph
        else:
            glyph = await decomposeComposites(self.fontInstancer, instancer)

        return glyph


async def decomposeComposites(
    fontInstancer: FontInstancer, instancer: GlyphInstancer
) -> VariableGlyph:
    defaultFontSourceLocation = instancer.defaultFontSourceLocation

    haveLocations = getFontSourceLocationsFromSources(
        fontInstancer, instancer.activeSources, defaultFontSourceLocation
    )

    needLocations = await getFontSourceLocationsFromBaseGlyphs(
        fontInstancer,
        instancer.glyph,
        fontInstancer.backend,
        defaultFontSourceLocation,
    )

    needLocations = multiplyLocations(
        haveLocations, needLocations, defaultFontSourceLocation
    )

    locationsToAdd = [
        dict(location) for location in sorted(needLocations - haveLocations)
    ]
    layerNames = [locationToString(location) for location in locationsToAdd]

    newSources = instancer.activeSources + [
        GlyphSource(name=name, location=location, layerName=name)
        for location, name in zip(locationsToAdd, layerNames, strict=True)
    ]
    newLayers = {}

    for source in newSources:
        instance = instancer.instantiate(fontInstancer.getGlyphSourceLocation(source))

        newLayers[source.layerName] = Layer(
            glyph=replace(
                instance.glyph,
                path=await instance.getDecomposedPath(),
                components=[],
            ),
        )

    return replace(instancer.glyph, sources=newSources, layers=newLayers)


async def getFontSourceLocationsFromBaseGlyphs(
    fontInstancer, glyph, backend, defaultFontSourceLocation, seenGlyphNames=None
) -> set[tuple]:
    if seenGlyphNames is None:
        seenGlyphNames = set()

    baseGlyphNames = set()
    for source in getActiveSources(glyph.sources):
        for compo in glyph.layers[source.layerName].glyph.components:
            baseGlyphNames.add(compo.name)

    baseGlyphNames -= seenGlyphNames

    baseGlyphs = []
    for name in baseGlyphNames:
        try:
            baseGlyphs.append(await backend.getGlyph(name))
        except Exception as e:
            logger.error(
                f"decompose-composites: glyph {glyph.name} error while "
                f"retrieving base glyph {name}: {e!r}"
            )

    baseGlyphs = [baseGlyph for baseGlyph in baseGlyphs if baseGlyph is not None]

    locations = set()
    for baseGlyph in baseGlyphs:
        locations.update(
            getFontSourceLocationsFromSources(
                fontInstancer,
                getActiveSources(baseGlyph.sources),
                defaultFontSourceLocation,
            )
        )

    seenGlyphNames |= baseGlyphNames

    for baseGlyph in baseGlyphs:
        locations.update(
            await getFontSourceLocationsFromBaseGlyphs(
                fontInstancer,
                baseGlyph,
                backend,
                defaultFontSourceLocation,
                seenGlyphNames,
            )
        )

    return locations


def getFontSourceLocationsFromSources(
    fontInstancer, sources, defaultFontSourceLocation
) -> set[tuple]:
    return {
        locationToTuple(
            defaultFontSourceLocation
            | {
                k: v
                for k, v in fontInstancer.getGlyphSourceLocation(source).items()
                if k in defaultFontSourceLocation
            }
        )
        for source in sources
    }


def multiplyLocations(
    haveLocationsTuples, needLocationsTuples, defaultFontSourceLocation
) -> set[tuple]:
    haveLocations = [dict(loc) for loc in haveLocationsTuples]
    needLocations = [
        sparseLocation(dict(loc), defaultFontSourceLocation)
        for loc in needLocationsTuples
    ]
    needLocations = [
        haveLoc | needLoc
        for haveLoc, needLoc in itertools.product(haveLocations, needLocations)
    ]
    return {locationToTuple(loc) for loc in needLocations}


class MoveDefaultBehavior(Enum):
    none = "none"  # Don't move any default axis positions
    empty = "empty"  # Only move the default for axes that will be dropped, as a way to instantiate
    any = "any"  # Move the default for axes if the needed range does not include the default


@registerFilterAction("shallow-decompose-composites")
@dataclass(kw_only=True)
class ShallowDecomposeComposites(BaseFilter):
    glyphNames: set[str] = field(default_factory=set)
    componentGlyphNames: set[str] = field(default_factory=set)

    def __post_init__(self):
        self.glyphNames = set(self.glyphNames)
        self.componentGlyphNames = set(self.componentGlyphNames)

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        glyphName = glyph.name
        if self.glyphNames and glyphName not in self.glyphNames:
            return glyph

        componentNames = {
            compo.name
            for layer in glyph.layers.values()
            for compo in layer.glyph.components
        }

        if self.componentGlyphNames:
            componentNames = componentNames & self.componentGlyphNames

        if not componentNames:
            return glyph

        instancer = await self.fontInstancer.getGlyphInstancer(glyphName)

        newLayers = dict(glyph.layers)

        for source in instancer.activeSources:
            location = instancer.getGlyphSourceLocation(source)
            instance = instancer.instantiate(location)
            newPaths = [instance.glyph.path]
            newComponents = []
            for compo in instance.glyph.components:
                if compo.name in componentNames:
                    decomposed = await instance.shallowDecomposeComponent(compo)
                    newPaths.append(decomposed.path)
                    newComponents.extend(decomposed.components)
                else:
                    newComponents.append(compo)
            layerGlyph = replace(
                instance.glyph, path=joinPaths(newPaths), components=newComponents
            )

            newLayers[source.layerName] = replace(
                newLayers[source.layerName], glyph=layerGlyph
            )

        return replace(glyph, layers=newLayers)


@registerFilterAction("trim-variable-glyphs")
@dataclass(kw_only=True)
class TrimVariableGlyphs(BaseFilter):
    moveDefaultBehavior: MoveDefaultBehavior = MoveDefaultBehavior.any

    @async_cached_property
    async def trimmedGlyphs(self) -> dict[str, VariableGlyph]:
        fontInstancer = self.fontInstancer

        dependencies = GlyphDependencies()
        glyphsToTrim = {}
        glyphAxisRanges = {}

        for glyphName in await self.inputGlyphMap:
            instancer = await fontInstancer.getGlyphInstancer(glyphName, True)

            glyph = instancer.glyph

            glyphAxisRanges[glyphName] = await getComponentAxisRanges(
                fontInstancer, instancer
            )

            if instancer.componentNames:
                dependencies.update(glyphName, instancer.componentNames)

            if glyph.axes:
                glyphsToTrim[glyphName] = instancer
            else:
                fontInstancer.dropGlyphInstancerFromCache(glyphName)

        axisRanges = mergeAxisRanges(glyphAxisRanges.values())

        trimmedGlyphs = {}

        while glyphsToTrim:
            # We want to trim those glyphs first, that are not *used* in
            # a glyph to be trimmed
            nextBatch = {
                glyphName: instancer
                for glyphName, instancer in glyphsToTrim.items()
                if not any(
                    parentGlyphName in glyphsToTrim
                    for parentGlyphName in dependencies.usedBy.get(glyphName, ())
                )
            }
            assert nextBatch, list(glyphsToTrim)

            for glyphName, instancer in nextBatch.items():
                del glyphsToTrim[glyphName]
                trimmedGlyphs[glyphName] = trimGlyphByAxisRanges(
                    fontInstancer,
                    instancer,
                    axisRanges.get(glyphName, {}),
                    MoveDefaultBehavior(self.moveDefaultBehavior),
                )
                trimmedInstancer = GlyphInstancer(
                    trimmedGlyphs[glyphName], fontInstancer
                )
                glyphAxisRanges[glyphName] = await getComponentAxisRanges(
                    fontInstancer, trimmedInstancer
                )

            axisRanges = mergeAxisRanges(glyphAxisRanges.values())

        return trimmedGlyphs

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        glyph = (await self.trimmedGlyphs).get(glyphName)
        if glyph is None:
            glyph = await self.validatedInput.getGlyph(glyphName)
        return glyph


async def getComponentAxisRanges(
    fontInstancer: FontInstancer, instancer: GlyphInstancer
) -> dict[str, dict[str, AxisRange]]:
    with fontInstancer.collectVariableGlyphAxisRanges() as axisRanges:
        _ = await decomposeComposites(fontInstancer, instancer)
        # axisRanges will also contain the full ranges for *this*
        # glyph, which defeats the purpose, so we drop that.
        del axisRanges[instancer.glyph.name]
        return axisRanges


def mergeAxisRanges(glyphAxisRanges):
    mergedAxisRanges = defaultdict(lambda: defaultdict(AxisRange))
    for axisRanges in glyphAxisRanges:
        for baseGlyphName, ranges in axisRanges.items():
            for axisName, axisRange in ranges.items():
                mergedAxisRanges[baseGlyphName][axisName].updateRange(axisRange)
    return mergedAxisRanges


def trimGlyphByAxisRanges(
    fontInstancer: FontInstancer,
    instancer: GlyphInstancer,
    axisRanges,
    moveDefaultBehavior,
) -> VariableGlyph:
    glyph = instancer.glyph
    glyphAxisNames = {axis.name for axis in glyph.axes}

    # Drop unknown axes
    axisRanges = subsetLocationKeep(axisRanges, glyphAxisNames)

    newDefaultSourceLocation = {}
    axesToDrop = set()
    newAxes = []
    for axis in glyph.axes:
        axisRange = axisRanges.get(axis.name)
        if axisRange is None:
            axisRange = AxisRange(axis.defaultValue, axis.defaultValue)
            axisRanges[axis.name] = axisRange

        # Ensure the range is within the original axis' range
        axisRange.clipRange(axis.minValue, axis.maxValue)

        if not (
            moveDefaultBehavior == MoveDefaultBehavior.any
            or (
                moveDefaultBehavior == MoveDefaultBehavior.empty and axisRange.isEmpty()
            )
        ):
            axisRange.update(axis.defaultValue)

        if axisRange.isEmpty():
            if axisRange.minValue != axis.defaultValue:
                newDefaultSourceLocation[axis.name] = axisRange.minValue
            axesToDrop.add(axis.name)
        else:
            newAxis = replace(
                axis,
                minValue=axisRange.minValue,
                defaultValue=axisRange.clipValue(axis.defaultValue),
                maxValue=axisRange.maxValue,
            )
            newAxes.append(newAxis)
            if axis.defaultValue != newAxis.defaultValue:
                newDefaultSourceLocation[axis.name] = newAxis.defaultValue

    originalDefaultSourceLocation = instancer.defaultSourceLocation

    locations = [
        originalDefaultSourceLocation | fontInstancer.getGlyphSourceLocation(source)
        for source in instancer.activeSources
    ]

    newLocations = (
        locations
        if not newDefaultSourceLocation
        else moveDefaultLocations(
            locations,
            originalDefaultSourceLocation,
            newDefaultSourceLocation,
            glyphAxisNames,
        )
    )

    trimmedLocations = trimLocations(newLocations, axisRanges)

    remainingAxisNames = instancer.combinedAxisNames - axesToDrop

    glyph = updateGlyphSourcesAndLayers(instancer, trimmedLocations, remainingAxisNames)
    glyph = replace(
        glyph,
        axes=newAxes,
    )
    return glyph


@registerFilterAction("drop-shapes")
@dataclass(kw_only=True)
class DropShapes(BaseFilter):
    dropPath: bool = True
    dropComponents: bool = True
    dropAnchors: bool = True
    dropGuidelines: bool = True

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        clearedItems: dict[str, Any] = {}
        if self.dropPath:
            clearedItems["path"] = PackedPath()
        if self.dropComponents:
            clearedItems["components"] = []
        if self.dropAnchors:
            clearedItems["anchors"] = []
        if self.dropGuidelines:
            clearedItems["guidelines"] = []

        return replace(
            glyph,
            layers={
                layerName: replace(layer, glyph=replace(layer.glyph, **clearedItems))
                for layerName, layer in glyph.layers.items()
            },
        )


@registerFilterAction("round-coordinates")
@dataclass(kw_only=True)
class RoundCoordinates(BaseFilter):
    roundPathCoordinates: bool = True
    roundComponentOrigins: bool = True
    roundGlyphMetrics: bool = True
    roundAnchors: bool = True
    roundLineMetrics: bool = True
    roundKerning: bool = True

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        roundPathCoordinates = self.roundPathCoordinates
        roundComponentOrigins = self.roundComponentOrigins
        roundGlyphMetrics = self.roundGlyphMetrics
        roundAnchors = self.roundAnchors

        newLayers = {
            layerName: replace(
                layer,
                glyph=roundCoordinates(
                    layer.glyph,
                    roundPathCoordinates,
                    roundComponentOrigins,
                    roundGlyphMetrics,
                    roundAnchors,
                ),
            )
            for layerName, layer in glyph.layers.items()
        }
        return replace(glyph, layers=newLayers)

    async def processSources(
        self, sources: dict[str, FontSource]
    ) -> dict[str, FontSource]:
        if not self.roundLineMetrics:
            return sources

        return {
            sourceIdentifier: roundFontSourceCoordinates(source)
            for sourceIdentifier, source in sources.items()
        }

    async def processKerning(self, kerning: dict[str, Kerning]) -> dict[str, Kerning]:
        if not self.roundKerning:
            return kerning

        return {
            kernType: roundKerning(kernTable) for kernType, kernTable in kerning.items()
        }


def roundCoordinates(
    glyph, roundPathCoordinates, roundComponentOrigins, roundGlyphMetrics, roundAnchors
):
    newFields = {}

    if roundPathCoordinates:
        newFields["path"] = glyph.path.rounded()

    if roundComponentOrigins:
        newFields["components"] = [
            replace(
                compo,
                transformation=replace(
                    compo.transformation,
                    translateX=otRound(compo.transformation.translateX),
                    translateY=otRound(compo.transformation.translateY),
                ),
            )
            for compo in glyph.components
        ]

    if roundGlyphMetrics:
        if glyph.xAdvance:
            newFields["xAdvance"] = otRound(glyph.xAdvance)
        if glyph.yAdvance:
            newFields["yAdvance"] = otRound(glyph.yAdvance)
        if glyph.verticalOrigin:
            newFields["verticalOrigin"] = otRound(glyph.verticalOrigin)

    if roundAnchors:
        newFields["anchors"] = [
            replace(anchor, x=otRound(anchor.x), y=otRound(anchor.y))
            for anchor in glyph.anchors
        ]

    return replace(glyph, **newFields)


def roundFontSourceCoordinates(source):
    return replace(
        source,
        lineMetricsHorizontalLayout=roundLineMetrics(
            source.lineMetricsHorizontalLayout
        ),
        lineMetricsVerticalLayout=roundLineMetrics(source.lineMetricsVerticalLayout),
    )


def roundLineMetrics(lineMetrics):
    return {
        name: replace(metric, value=round(metric.value), zone=round(metric.zone))
        for name, metric in lineMetrics.items()
    }


def roundKerning(kernTable: Kerning) -> Kerning:
    return replace(
        kernTable,
        values={
            left: {
                right: [round(v) if v is not None else v for v in values]
                for right, values in rightDict.items()
            }
            for left, rightDict in kernTable.values.items()
        },
    )


@registerFilterAction("set-vertical-glyph-metrics")
@dataclass(kw_only=True)
class SetVerticalGlyphMetrics(BaseFilter):
    verticalOrigin: int
    yAdvance: int

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        if not any(
            layer.glyph.yAdvance is None or layer.glyph.verticalOrigin is None
            for layer in glyph.layers.values()
        ):
            return glyph

        newLayers = {
            layerName: replace(
                layer,
                glyph=replace(
                    layer.glyph,
                    verticalOrigin=(
                        self.verticalOrigin
                        if layer.glyph.verticalOrigin is None
                        else layer.glyph.verticalOrigin
                    ),
                    yAdvance=(
                        self.yAdvance
                        if layer.glyph.yAdvance is None
                        else layer.glyph.yAdvance
                    ),
                ),
            )
            for layerName, layer in glyph.layers.items()
        }
        return replace(glyph, layers=newLayers)


@registerFilterAction("set-vertical-glyph-metrics-from-anchors")
@dataclass(kw_only=True)
class SetVerticalGlyphMetricsFromAnchors(BaseFilter):
    tsbAnchorName: str = "TSB_DEFAULT"
    bsbAnchorName: str = "BSB_DEFAULT"

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        def metricsFromAnchors(anchors):
            top = None
            bottom = None
            for anchor in anchors:
                if anchor.name == self.tsbAnchorName:
                    top = anchor.y
                elif anchor.name == self.bsbAnchorName:
                    bottom = anchor.y
            if top is not None and bottom is not None:
                return (top, top - bottom)
            return None, None

        newLayers = {}
        for layerName, layer in glyph.layers.items():
            verticalOrigin, yAdvance = metricsFromAnchors(layer.glyph.anchors)
            if verticalOrigin is not None:
                assert yAdvance is not None
                newLayers[layerName] = replace(
                    layer,
                    glyph=replace(
                        layer.glyph, verticalOrigin=verticalOrigin, yAdvance=yAdvance
                    ),
                )
        if newLayers:
            glyph = replace(glyph, layers=glyph.layers | newLayers)

        return glyph


@registerFilterAction("drop-background-images")
@dataclass(kw_only=True)
class DropBackgroundImages(BaseFilter):
    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        if any(
            layer.glyph.backgroundImage is not None for layer in glyph.layers.values()
        ):
            glyph = replace(
                glyph,
                layers={
                    layerName: (
                        replace(layer, glyph=replace(layer.glyph, backgroundImage=None))
                        if layer.glyph.backgroundImage is not None
                        else layer
                    )
                    for layerName, layer in glyph.layers.items()
                },
            )
        return glyph


@dataclass(kw_only=True)
class Cu2QuGlyphGlue:
    path: PackedPath

    def __post_init__(self):
        self._pen = None

    def clearContours(self):
        pass

    def drawPoints(self, pen):
        self.path.drawPoints(pen)

    def getPen(self):
        self._pen = PackedPathPointPen()
        return SegmentToPointPen(self._pen)

    @property
    def modifiedPath(self):
        return self._pen.getPath() if self._pen is not None else self.path


@registerFilterAction("convert-to-quadratics")
@dataclass(kw_only=True)
class ConvertToQuadratics(BaseFilter):
    maximumError: float | None = None
    reverseDirection: bool = False

    async def processGlyph(self, glyph):
        # TODO: we should split by discrete subspace so we can support discrete axes
        layers = {
            source.layerName: glyph.layers[source.layerName]
            for source in getActiveSources(glyph.sources)
        }
        wrappedPaths = [
            Cu2QuGlyphGlue(path=layer.glyph.path) for layer in layers.values()
        ]
        if glyphs_to_quadratic(
            wrappedPaths,
            max_err=self.maximumError,
            reverse_direction=self.reverseDirection,
        ):
            newLayers = dict(glyph.layers)
            for (layerName, layer), wrappedPath in zip(layers.items(), wrappedPaths):
                newLayers[layerName] = replace(
                    layer, glyph=replace(layer.glyph, path=wrappedPath.modifiedPath)
                )

            glyph = replace(glyph, layers=newLayers)

        return glyph


@registerFilterAction("remove-overlaps")
@dataclass(kw_only=True)
class RemoveOverlaps(BaseFilter):
    async def processGlyph(self, glyph):
        newLayers = {
            layerName: replace(
                layer, glyph=replace(layer.glyph, path=unionPath(layer.glyph.path))
            )
            for layerName, layer in glyph.layers.items()
        }
        return replace(glyph, layers=newLayers)
