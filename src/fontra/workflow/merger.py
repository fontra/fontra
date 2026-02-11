from __future__ import annotations

import logging
from collections import defaultdict
from copy import deepcopy
from dataclasses import dataclass, replace
from typing import Any

from ..backends.base import ReadableBaseBackend
from ..backends.null import NullBackend
from ..core.async_property import async_cached_property
from ..core.classes import (
    Axes,
    FontInfo,
    FontSource,
    ImageData,
    Kerning,
    OpenTypeFeatures,
    VariableGlyph,
    unstructure,
)
from ..core.protocols import ReadableFontBackend, ReadBackgroundImage
from ..core.varutils import locationToTuple
from .actions.axes import mapFontSourceLocationsAndFilter
from .actions.subset import subsetKerning
from .features import mergeFeatures

logger = logging.getLogger(__name__)


@dataclass(kw_only=True)
class FontBackendMerger(ReadableBaseBackend):
    inputA: ReadableFontBackend
    inputB: ReadableFontBackend
    warnAboutDuplicates: bool = True

    def __post_init__(self) -> None:
        self._glyphNamesA: set[str] | None = None
        self._glyphNamesB: set[str] | None = None
        self._glyphMap: dict[str, list[int]] | None = None

    async def aclose(self) -> None:
        pass

    async def _prepareGlyphMap(self) -> None:
        if self._glyphMap is not None:
            return
        self._glyphMapA = await self.inputA.getGlyphMap()
        self._glyphMapB = await self.inputB.getGlyphMap()
        cmapA = cmapFromGlyphMap(self._glyphMapA)
        cmapB = cmapFromGlyphMap(self._glyphMapB)

        cmap = cmapA | cmapB
        encodedGlyphMap = defaultdict(set)
        for codePoint, glyphName in cmap.items():
            encodedGlyphMap[glyphName].add(codePoint)

        self._glyphMap = {
            glyphName: sorted(encodedGlyphMap.get(glyphName, []))
            for glyphName in self._glyphMapA | self._glyphMapB
        }

        self._glyphNamesB = set(self._glyphMapB)
        self._glyphNamesA = set(self._glyphMapA)

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        await self._prepareGlyphMap()
        assert self._glyphNamesA is not None
        assert self._glyphNamesB is not None
        if glyphName in self._glyphNamesB:
            if glyphName in self._glyphNamesA and self.warnAboutDuplicates:
                logger.warning(f"Merger: Glyph {glyphName!r} exists in both fonts")
            return await self.inputB.getGlyph(glyphName)
        elif glyphName in self._glyphNamesA:
            return await self.inputA.getGlyph(glyphName)
        return None

    async def getFontInfo(self) -> FontInfo:
        fontInfoA = await self.inputA.getFontInfo()
        fontInfoB = await self.inputB.getFontInfo()
        return FontInfo(**(unstructure(fontInfoA) | unstructure(fontInfoB)))

    @async_cached_property
    async def mergedAxes(self) -> Axes:
        axesA = await self.inputA.getAxes()
        axesB = await self.inputB.getAxes()
        axesByNameA = {axis.name: axis for axis in axesA.axes}
        axisNamesB = {axis.name for axis in axesB.axes}
        mergedAxes = []
        for axis in axesB.axes:
            if axis.name in axesByNameA:
                axis = _mergeAxes(axesByNameA[axis.name], axis)
            mergedAxes.append(axis)

        for axis in axesA.axes:
            if axis.name not in axisNamesB:
                mergedAxes.append(axis)

        if axesB.mappings and axesA.mappings:
            logger.warning(
                "Merger: Both fonts use cross-axis mappings, taking the ones from B"
            )

        mergedMappings = axesB.mappings or axesA.mappings
        mergedElidedFallBackname = axesB.elidedFallBackname or axesA.elidedFallBackname
        mergedCustomData = axesA.customData | axesB.customData

        return replace(
            axesB,
            axes=mergedAxes,
            mappings=mergedMappings,
            elidedFallBackname=mergedElidedFallBackname,
            customData=mergedCustomData,
        )

    async def getAxes(self) -> Axes:
        return await self.mergedAxes

    @async_cached_property
    async def mergedSourcesInfo(self) -> MergedSourcesInfo:
        mergedAxes = await self.mergedAxes
        defaultLocation = {axis.name: axis.defaultValue for axis in mergedAxes.axes}

        def mapLocation(location):
            return defaultLocation | location

        sourcesA = mapFontSourceLocationsAndFilter(
            await self.inputA.getSources(), mapLocation
        )
        sourcesB = mapFontSourceLocationsAndFilter(
            await self.inputB.getSources(), mapLocation
        )

        sourcesAByLocation = sourcesByLocation(sourcesA)
        sourcesBByLocation = sourcesByLocation(sourcesB)
        allLocations = sorted(set(sourcesAByLocation) | set(sourcesBByLocation))

        mergedSources = {}
        identifierMappingA = {}
        for location in allLocations:
            idA, sourceA = sourcesAByLocation.get(location, (None, None))
            idB, sourceB = sourcesBByLocation.get(location, (None, None))
            if idA is None:
                mergedSources[idB] = sourceB
            elif idB is None:
                mergedSources[idA] = sourceA
            else:
                identifierMappingA[idA] = idB
                mergedSources[idB] = replace(
                    sourceB,
                    lineMetricsHorizontalLayout=sourceA.lineMetricsHorizontalLayout
                    | sourceB.lineMetricsHorizontalLayout,
                    lineMetricsVerticalLayout=sourceA.lineMetricsVerticalLayout
                    | sourceB.lineMetricsVerticalLayout,
                    customData=sourceA.customData | sourceB.customData,
                )

        return MergedSourcesInfo(
            sources=mergedSources, identifierMappingA=identifierMappingA
        )

    async def getSources(self) -> dict[str, FontSource]:
        mergeInfo = await self.mergedSourcesInfo
        return mergeInfo.sources

    async def getGlyphMap(self) -> dict[str, list[int]]:
        await self._prepareGlyphMap()
        assert self._glyphMap is not None
        return self._glyphMap

    async def getKerning(self) -> dict[str, Kerning]:
        await self._prepareGlyphMap()
        assert self._glyphNamesA is not None
        assert self._glyphNamesB is not None

        mergeInfo = await self.mergedSourcesInfo

        kerningA = subsetKerning(
            await self.inputA.getKerning(), self._glyphNamesA - self._glyphNamesB
        )
        kerningB = subsetKerning(await self.inputB.getKerning(), self._glyphNamesB)

        newKerning = {}
        for kernType in sorted(set(kerningA) | set(kerningB)):
            kernTableA = kerningA.get(kernType)
            kernTableB = kerningB.get(kernType)

            if kernTableA is not None:
                kernTableA = replace(
                    kernTableA,
                    sourceIdentifiers=[
                        mergeInfo.identifierMappingA.get(sid, sid)
                        for sid in kernTableA.sourceIdentifiers
                    ],
                )

            if kernTableA is None:
                newKernTable = kernTableB
            elif kernTableB is None:
                newKernTable = kernTableA
            else:
                newKernTable = _mergeKernTable(kernTableA, kernTableB)

            newKerning[kernType] = newKernTable
        return newKerning

    async def getFeatures(self) -> OpenTypeFeatures:
        await self._prepareGlyphMap()
        featuresA = await self.inputA.getFeatures()
        featuresB = await self.inputB.getFeatures()
        if featuresA.language != "fea" or featuresB.language != "fea":
            logger.warning("can't merge languages other than fea")
            return featuresB

        if not featuresA.text:
            return featuresB
        elif not featuresB.text:
            return featuresA

        mergedFeatureText, mergedGlyphMap = mergeFeatures(
            featuresA.text, self._glyphMapA, featuresB.text, self._glyphMapB
        )

        assert self._glyphMap is not None
        assert set(mergedGlyphMap) == set(self._glyphMap)

        return OpenTypeFeatures(text=mergedFeatureText)

    async def getCustomData(self) -> dict[str, Any]:
        customDataA = await self.inputA.getCustomData()
        customDataB = await self.inputB.getCustomData()
        return customDataA | customDataB

    async def getUnitsPerEm(self) -> int:
        unitsPerEmA = await self.inputA.getUnitsPerEm()
        unitsPerEmB = await self.inputB.getUnitsPerEm()
        if unitsPerEmA != unitsPerEmB and self.inputA is not NullBackend():
            logger.warning(
                f"Merger: Fonts have different units-per-em; A: {unitsPerEmA}, B: {unitsPerEmB}"
            )
        return unitsPerEmB

    async def getBackgroundImage(self, imageIdentifier) -> ImageData | None:
        for inp in [self.inputB, self.inputA]:
            if isinstance(inp, ReadBackgroundImage):
                imageData = await inp.getBackgroundImage(imageIdentifier)
                if imageData is not None:
                    return imageData

        return None  # Image not found


@dataclass(kw_only=True)
class MergedSourcesInfo:
    sources: dict[str, FontSource]
    identifierMappingA: dict[str, str]


def sourcesByLocation(sources):
    return {
        locationToTuple(source.location): (sourceIdentifier, source)
        for sourceIdentifier, source in sources.items()
    }


def cmapFromGlyphMap(glyphMap):
    cmap = {}
    for glyphName, codePoints in sorted(glyphMap.items()):
        for codePoint in codePoints:
            if codePoint in cmap:
                logger.warning(
                    f"Merger: Code point U+{codePoint:04X} is mapped multiple times: "
                    f"{cmap[codePoint]}, {glyphName}"
                )
            else:
                cmap[codePoint] = glyphName
    return cmap


def _mergeAxes(axisA, axisB):
    # TODO: merge axis labels and axis value labels
    resultAxis = deepcopy(axisB)

    if axisA.mapping != axisB.mapping:
        logger.error(
            "Merger: Axis mappings should be the same; "
            f"{axisA.name}, A: {axisA.mapping}, B: {axisB.mapping}"
        )

    if axisA.defaultValue != axisB.defaultValue:
        logger.error(
            "Merger: Axis default values should be the same; "
            f"{axisA.name}, A: {axisA.defaultValue}, B: {axisB.defaultValue}"
        )

    if hasattr(axisA, "values") != hasattr(axisB, "values"):
        logger.error(
            f"Merger: Can't merge continuous axis with discrete axis: {axisA.name}"
        )
    elif hasattr(axisA, "values"):
        resultAxis.values = sorted(set(axisA.values) | set(axisB.values))
    else:
        resultAxis.maxValue = max(axisA.maxValue, axisB.maxValue)
        resultAxis.minValue = min(axisA.minValue, axisB.minValue)

    return resultAxis


def _mergeKernTable(kernTableA, kernTableB):
    kernTableA = _disambiguateKerningGroupNames(kernTableA, kernTableB)

    assert set(kernTableA.groupsSide1).isdisjoint(set(kernTableB.groupsSide1))
    assert set(kernTableA.groupsSide2).isdisjoint(set(kernTableB.groupsSide2))
    assert set(kernTableA.values).isdisjoint(set(kernTableB.values))

    mergedSourceIdentifiers = list(kernTableA.sourceIdentifiers)
    for sid in kernTableB.sourceIdentifiers:
        if sid not in mergedSourceIdentifiers:
            mergedSourceIdentifiers.append(sid)

    sidIndicesA = {sid: i for i, sid in enumerate(kernTableA.sourceIdentifiers)}
    sidIndicesB = {sid: i for i, sid in enumerate(kernTableB.sourceIdentifiers)}
    sidMapA = [(sid, sidIndicesA.get(sid)) for sid in mergedSourceIdentifiers]
    sidMapB = [(sid, sidIndicesB.get(sid)) for sid in mergedSourceIdentifiers]

    mappedValuesA = _remapKernValuesBySourceIdentifiers(kernTableA.values, sidMapA)
    mappedValuesB = _remapKernValuesBySourceIdentifiers(kernTableB.values, sidMapB)

    return Kerning(
        groupsSide1=kernTableA.groupsSide1 | kernTableB.groupsSide1,
        groupsSide2=kernTableA.groupsSide2 | kernTableB.groupsSide2,
        sourceIdentifiers=mergedSourceIdentifiers,
        values=mappedValuesA | mappedValuesB,
    )


def _disambiguateKerningGroupNames(kernTableA, kernTableB):
    groupSide1NameMap, pairSide1NameMap = _getConflictResolutionMappings(
        kernTableA.groupsSide1, kernTableB.groupsSide1
    )

    groupSide2NameMap, pairSide2NameMap = _getConflictResolutionMappings(
        kernTableA.groupsSide2, kernTableB.groupsSide2
    )

    if not groupSide1NameMap and not groupSide2NameMap:
        return kernTableA

    groupsSide1 = _renameGroups(kernTableA.groupsSide1, groupSide1NameMap)
    groupsSide2 = _renameGroups(kernTableA.groupsSide2, groupSide2NameMap)

    values = {
        pairSide1NameMap.get(left, left): {
            pairSide2NameMap.get(right, right): values
            for right, values in rightDict.items()
        }
        for left, rightDict in kernTableA.values.items()
    }

    return replace(
        kernTableA, groupsSide1=groupsSide1, groupsSide2=groupsSide2, values=values
    )


def _getConflictResolutionMappings(groupsA, groupsB):
    groupsNamesA = set(groupsA)
    groupsNamesB = set(groupsB)

    if groupsNamesA.isdisjoint(groupsNamesB):
        return {}, {}

    conflictingNames = groupsNamesA & groupsNamesB
    usedNames = groupsNamesA | groupsNamesB

    groupNameMap = {}
    for name in sorted(conflictingNames):
        count = 1
        while True:
            newName = f"{name}.{count}"
            if newName not in usedNames:
                break
            count += 1
        usedNames.add(newName)
        groupNameMap[name] = newName

    pairNameMap = {"@" + k: "@" + v for k, v in groupNameMap.items()}

    return groupNameMap, pairNameMap


def _renameGroups(groups, renameMap):
    return {renameMap.get(name, name): group for name, group in groups.items()}


def _remapKernValuesBySourceIdentifiers(kerningValues, sidMap):
    mappedKerningValues = {}

    for left, rightDict in kerningValues.items():
        mappedRightDict = {}

        for right, values in rightDict.items():
            mappedValues = [values[i] if i is not None else None for sid, i in sidMap]
            mappedRightDict[right] = mappedValues

        mappedKerningValues[left] = mappedRightDict

    return mappedKerningValues
