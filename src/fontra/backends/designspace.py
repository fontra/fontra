from __future__ import annotations

import asyncio
import logging
import os
import pathlib
import shutil
from collections import defaultdict
from copy import deepcopy
from dataclasses import asdict, dataclass
from datetime import datetime
from functools import cache, cached_property, singledispatch
from os import PathLike
from types import SimpleNamespace
from typing import Any, AsyncGenerator, Callable

import watchfiles
from fontTools.designspaceLib import (
    AxisDescriptor,
    AxisLabelDescriptor,
    DesignSpaceDocument,
    DiscreteAxisDescriptor,
)
from fontTools.misc.transform import DecomposedTransform
from fontTools.pens.pointPen import AbstractPointPen
from fontTools.pens.recordingPen import RecordingPointPen
from fontTools.ufoLib import UFOReaderWriter
from fontTools.ufoLib.glifLib import GlyphSet

from ..core.changes import applyChange
from ..core.classes import (
    AxisValueLabel,
    Component,
    GlobalAxis,
    GlobalDiscreteAxis,
    Layer,
    LocalAxis,
    Source,
    StaticGlyph,
    VariableGlyph,
)
from ..core.path import PackedPathPointPen
from ..core.protocols import WritableFontBackend
from .ufo_utils import extractGlyphNameAndUnicodes

logger = logging.getLogger(__name__)


VARIABLE_COMPONENTS_LIB_KEY = "com.black-foundry.variable-components"
GLYPH_DESIGNSPACE_LIB_KEY = "com.black-foundry.glyph-designspace"
SOURCE_NAME_MAPPING_LIB_KEY = "xyz.fontra.source-names"
LAYER_NAME_MAPPING_LIB_KEY = "xyz.fontra.layer-names"


defaultUFOInfoAttrs = {
    "unitsPerEm": 1000,
    "ascender": 750,
    "descender": -250,
    "xHeight": 500,
    "capHeight": 750,
    "familyName": None,
    "copyright": None,
    "year": None,
}


class DesignspaceBackend:
    @classmethod
    def fromPath(cls, path: PathLike) -> WritableFontBackend:
        return cls(DesignSpaceDocument.fromfile(path))

    @classmethod
    def createFromPath(cls, path: PathLike) -> WritableFontBackend:
        path = pathlib.Path(path)
        ufoDir = path.parent

        # Create default UFO
        makeUniqueFileName = uniqueNameMaker(p.stem for p in ufoDir.glob("*.ufo"))
        familyName = path.stem
        styleName = "Regular"
        ufoFileName = makeUniqueFileName(f"{familyName}_{styleName}")
        ufoFileName = ufoFileName + ".ufo"
        ufoPath = ufoDir / ufoFileName
        dsDoc = createDSDocFromUFOPath(ufoPath, styleName)
        dsDoc.write(path)
        return cls(dsDoc)

    def __init__(self, dsDoc):
        self.dsDoc = dsDoc
        self.ufoManager = UFOManager()
        self.updateAxisInfo()
        self.loadUFOLayers()
        self.buildGlyphFileNameMapping()
        self.glyphMap = getGlyphMapFromGlyphSet(self.defaultDSSource.layer.glyphSet)
        self.savedGlyphModificationTimes = {}

    def updateAxisInfo(self):
        self.dsDoc.findDefault()
        axes = []
        axisPolePositions = {}
        defaultLocation = {}
        for dsAxis in self.dsDoc.axes:
            axis, poles = unpackDSAxis(dsAxis)
            axes.append(axis)
            axisPolePositions[dsAxis.name] = {dsAxis.map_forward(p) for p in poles}
            defaultLocation[dsAxis.name] = dsAxis.map_forward(dsAxis.default)
        self.axes = axes
        self.axisPolePositions = axisPolePositions
        self.defaultLocation = defaultLocation

    def close(self):
        pass

    @property
    def defaultDSSource(self):
        return self.dsSources.findItem(isDefault=True)

    @property
    def defaultUFOLayer(self):
        return self.defaultDSSource.layer

    @property
    def defaultReader(self):
        return self.defaultUFOLayer.reader

    @cached_property
    def defaultFontInfo(self):
        fontInfo = UFOFontInfo()
        self.defaultReader.readInfo(fontInfo)
        return fontInfo

    def loadUFOLayers(self):
        manager = self.ufoManager
        self.dsSources = ItemList()
        self.ufoLayers = ItemList()

        # Using a dict as an order-preserving set:
        ufoPaths = {source.path: None for source in self.dsDoc.sources}
        for ufoPath in ufoPaths:
            reader = manager.getReader(ufoPath)
            for ufoLayerName in reader.getLayerNames():
                self.ufoLayers.append(
                    UFOLayer(manager=manager, path=ufoPath, name=ufoLayerName)
                )

        makeUniqueSourceName = uniqueNameMaker()
        for source in self.dsDoc.sources:
            reader = manager.getReader(source.path)
            defaultLayerName = reader.getDefaultLayerName()
            ufoLayerName = source.layerName or defaultLayerName

            sourceLayer = self.ufoLayers.findItem(path=source.path, name=ufoLayerName)
            sourceStyleName = source.styleName or sourceLayer.fileName
            sourceName = (
                sourceStyleName
                if ufoLayerName == defaultLayerName
                else source.layerName
            )
            sourceName = makeUniqueSourceName(sourceName)

            self.dsSources.append(
                DSSource(
                    name=sourceName,
                    layer=sourceLayer,
                    location={**self.defaultLocation, **source.location},
                    isDefault=source == self.dsDoc.default,
                )
            )

    def buildGlyphFileNameMapping(self):
        glifFileNames = {}
        for glyphSet in self.ufoLayers.iterAttrs("glyphSet"):
            for glyphName, fileName in glyphSet.contents.items():
                glifFileNames[fileName] = glyphName
        self.glifFileNames = glifFileNames

    def updateGlyphSetContents(self, glyphSet):
        glyphSet.writeContents()
        glifFileNames = self.glifFileNames
        for glyphName, fileName in glyphSet.contents.items():
            glifFileNames[fileName] = glyphName

    async def getGlyphMap(self) -> dict[str, list[int]]:
        return dict(self.glyphMap)

    async def putGlyphMap(self, value: dict[str, list[int]]) -> None:
        pass

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        if glyphName not in self.glyphMap:
            return None

        axes = []
        sources = []
        localSources = []
        layers = {}
        sourceNameMapping = {}
        layerNameMapping = {}

        for ufoLayer in self.ufoLayers:
            if glyphName not in ufoLayer.glyphSet:
                continue

            staticGlyph, ufoGlyph = ufoLayerToStaticGlyph(ufoLayer.glyphSet, glyphName)
            if ufoLayer == self.defaultUFOLayer:
                localDS = ufoGlyph.lib.get(GLYPH_DESIGNSPACE_LIB_KEY)
                if localDS is not None:
                    axes, localSources = self._unpackLocalDesignSpace(
                        localDS, ufoLayer.name
                    )
                sourceNameMapping = ufoGlyph.lib.get(SOURCE_NAME_MAPPING_LIB_KEY, {})
                layerNameMapping = ufoGlyph.lib.get(LAYER_NAME_MAPPING_LIB_KEY, {})
            layers[ufoLayer.fontraLayerName] = Layer(glyph=staticGlyph)

        # When a glyph has axes with names that also exist as global axes, we need
        # to make sure our source locations use the *local* default values. We do
        # that with a location dict that only contains local values for such "shadow"
        # axes.
        localDefaultOverride = {
            axis.name: axis.defaultValue
            for axis in axes
            if axis.name in self.defaultLocation
        }

        for dsSource in self.dsSources:
            glyphSet = dsSource.layer.glyphSet
            if glyphName not in glyphSet:
                continue
            sources.append(dsSource.newFontraSource(localDefaultOverride))

        sources.extend(localSources)

        if layerNameMapping:
            for source in sources:
                source.layerName = layerNameMapping.get(
                    source.layerName, source.layerName
                )
            layers = {
                layerNameMapping.get(layerName, layerName): layer
                for layerName, layer in layers.items()
            }

        if sourceNameMapping:
            for source in sources:
                source.name = sourceNameMapping.get(source.name, source.name)

        return VariableGlyph(name=glyphName, axes=axes, sources=sources, layers=layers)

    def _unpackLocalDesignSpace(self, dsDict, defaultLayerName):
        axes = [
            LocalAxis(
                name=axis["name"],
                minValue=axis["minimum"],
                defaultValue=axis["default"],
                maxValue=axis["maximum"],
            )
            for axis in dsDict["axes"]
        ]
        localAxisNames = {axis.name for axis in axes}

        sources = []
        for source in dsDict.get("sources", ()):
            ufoLayerName = source.get("layername", defaultLayerName)
            sourceName = source.get(
                "name",
                ufoLayerName if ufoLayerName != defaultLayerName else "<default>",
            )

            sourceLocation = {**self.defaultLocation, **source["location"]}
            globalLocation = self._getGlobalPortionOfLocation(
                sourceLocation, localAxisNames
            )
            dsSource = self.dsSources.findItem(
                locationTuple=tuplifyLocation(globalLocation)
            )
            assert dsSource is not None
            ufoPath = dsSource.layer.path

            ufoLayer = self.ufoLayers.findItem(path=ufoPath, name=ufoLayerName)
            assert ufoLayer is not None
            sources.append(
                Source(
                    name=sourceName,
                    location=source["location"],
                    layerName=ufoLayer.fontraLayerName,
                )
            )
        return axes, sources

    async def putGlyph(
        self, glyphName: str, glyph: VariableGlyph, unicodes: list[int]
    ) -> None:
        assert isinstance(unicodes, list)
        assert all(isinstance(cp, int) for cp in unicodes)
        self.glyphMap[glyphName] = unicodes

        defaultLayerGlyph = readGlyphOrCreate(
            self.defaultUFOLayer.glyphSet, glyphName, unicodes
        )
        revLayerNameMapping = reverseSparseDict(
            defaultLayerGlyph.lib.get(LAYER_NAME_MAPPING_LIB_KEY, {})
        )

        localAxes = packLocalAxes(glyph.axes)
        localDefaultLocation = {axis.name: axis.defaultValue for axis in glyph.axes}

        # Prepare UFO source layers and local sources
        sourceNameMapping = {}
        layerNameMapping = {}
        localSources = []
        for source in glyph.sources:
            sourceInfo = self._prepareUFOSourceLayer(
                glyphName, source, localDefaultLocation, revLayerNameMapping
            )
            if sourceInfo.sourceName != source.name:
                sourceNameMapping[sourceInfo.sourceName] = source.name
            if sourceInfo.layerName != source.layerName:
                layerNameMapping[sourceInfo.layerName] = source.layerName
            if sourceInfo.localSourceDict is not None:
                localSources.append(sourceInfo.localSourceDict)

        # Prepare local design space
        localDS = {}
        if localAxes:
            localDS["axes"] = localAxes
        if localSources:
            localDS["sources"] = localSources

        revLayerNameMapping = reverseSparseDict(layerNameMapping)

        # Gather all UFO layers
        usedLayers = set()
        layers = []
        for layerName, layer in glyph.layers.items():
            layerName = revLayerNameMapping.get(layerName, layerName)
            ufoLayer = self.ufoLayers.findItem(fontraLayerName=layerName)

            if ufoLayer is None:
                # This layer is not used by any source and we haven't seen it
                # before. Let's create a new layer in the default UFO.
                ufoLayer = self._newUFOLayer(
                    glyphName, self.defaultUFOLayer.path, layerName
                )
                if ufoLayer.fontraLayerName != layerName:
                    layerNameMapping[ufoLayer.fontraLayerName] = layerName
                layerName = ufoLayer.fontraLayerName
            layers.append((layer, ufoLayer))
            usedLayers.add(layerName)

        # Write all UFO layers
        hasVariableComponents = glyphHasVariableComponents(glyph)
        modTimes = set()
        for layer, ufoLayer in layers:
            glyphSet = ufoLayer.glyphSet
            writeGlyphSetContents = glyphName not in glyphSet

            if glyphSet == self.defaultUFOLayer.glyphSet:
                layerGlyph = defaultLayerGlyph
                storeInLib(layerGlyph, GLYPH_DESIGNSPACE_LIB_KEY, localDS)
                storeInLib(layerGlyph, SOURCE_NAME_MAPPING_LIB_KEY, sourceNameMapping)
                storeInLib(layerGlyph, LAYER_NAME_MAPPING_LIB_KEY, layerNameMapping)
            else:
                layerGlyph = readGlyphOrCreate(glyphSet, glyphName, unicodes)

            drawPointsFunc = populateUFOLayerGlyph(
                layerGlyph, layer.glyph, hasVariableComponents
            )
            glyphSet.writeGlyph(glyphName, layerGlyph, drawPointsFunc=drawPointsFunc)
            if writeGlyphSetContents:
                # FIXME: this is inefficient if we write many glyphs
                self.updateGlyphSetContents(glyphSet)

            modTimes.add(glyphSet.getGLIFModificationTime(glyphName))

        # Prune unused UFO layers
        relevantLayerNames = set(
            layer.fontraLayerName
            for layer in self.ufoLayers
            if glyphName in layer.glyphSet
        )
        layersToDelete = relevantLayerNames - usedLayers
        for layerName in layersToDelete:
            glyphSet = self.ufoLayers.findItem(fontraLayerName=layerName).glyphSet
            glyphSet.deleteGlyph(glyphName)
            # FIXME: this is inefficient if we write many glyphs
            self.updateGlyphSetContents(glyphSet)
            modTimes.add(None)

        self.savedGlyphModificationTimes[glyphName] = modTimes

    def _prepareUFOSourceLayer(
        self, glyphName, source, localDefaultLocation, revLayerNameMapping
    ):
        sparseLocalLocation = {
            name: source.location[name]
            for name, value in localDefaultLocation.items()
            if source.location.get(name, value) != value
        }
        sourceLocation = {**self.defaultLocation, **source.location}
        globalLocation = self._getGlobalPortionOfLocation(
            sourceLocation, localDefaultLocation
        )

        dsSource = self.dsSources.findItem(
            locationTuple=tuplifyLocation(globalLocation)
        )
        if dsSource is None:
            dsSource = self._createDSSource(glyphName, source, globalLocation)

        if sparseLocalLocation:
            ufoLayer = self.ufoLayers.findItem(
                fontraLayerName=revLayerNameMapping.get(
                    source.layerName, source.layerName
                )
            )

            if ufoLayer is None:
                ufoPath = dsSource.layer.path
                ufoLayer = self._newUFOLayer(glyphName, ufoPath, source.layerName)
                ufoLayerName = ufoLayer.name
            else:
                ufoLayerName = ufoLayer.name
            normalizedSourceName = source.name
            normalizedLayerName = f"{ufoLayer.fileName}/{ufoLayerName}"
            defaultUFOLayerName = ufoLayer.reader.getDefaultLayerName()

            localSourceDict = {"name": source.name}
            if ufoLayerName != defaultUFOLayerName:
                localSourceDict["layername"] = ufoLayerName
            localSourceDict["location"] = source.location
        else:
            normalizedSourceName = dsSource.name
            normalizedLayerName = dsSource.layer.fontraLayerName
            localSourceDict = None

        return SimpleNamespace(
            sourceName=normalizedSourceName,
            layerName=normalizedLayerName,
            localSourceDict=localSourceDict,
        )

    def _createDSSource(self, glyphName, source, globalLocation):
        manager = self.ufoManager
        atPole, notAtPole = splitLocationByPolePosition(
            globalLocation, self.axisPolePositions
        )
        if not notAtPole:
            # Create a whole new UFO
            ufoDir = pathlib.Path(self.defaultUFOLayer.path).parent
            makeUniqueFileName = uniqueNameMaker(p.stem for p in ufoDir.glob("*.ufo"))
            dsFileName = pathlib.Path(self.dsDoc.path).stem
            ufoFileName = makeUniqueFileName(f"{dsFileName}_{source.name}")
            ufoFileName = ufoFileName + ".ufo"
            ufoPath = os.fspath(ufoDir / ufoFileName)
            assert not os.path.exists(ufoPath)
            reader = manager.getReader(ufoPath)  # this creates the UFO
            info = UFOFontInfo()
            for infoAttr in defaultUFOInfoAttrs:
                value = getattr(self.defaultFontInfo, infoAttr, None)
                if value is not None:
                    setattr(info, infoAttr, value)
            _ = reader.getGlyphSet()  # this creates the default layer
            reader.writeLayerContents()
            ufoLayerName = reader.getDefaultLayerName()
            assert os.path.isdir(ufoPath)

            ufoLayer = UFOLayer(
                manager=manager,
                path=ufoPath,
                name=ufoLayerName,
            )
            self.ufoLayers.append(ufoLayer)
        else:
            # Create a new layer in the appropriate existing UFO
            atPole = {**self.defaultLocation, **atPole}
            poleDSSource = self.dsSources.findItem(
                locationTuple=tuplifyLocation(atPole)
            )
            if poleDSSource is None:
                poleDSSource = self.defaultDSSource
            assert poleDSSource is not None
            ufoPath = poleDSSource.layer.path
            ufoLayer = self._newUFOLayer(
                glyphName, poleDSSource.layer.path, source.layerName
            )
            ufoLayerName = ufoLayer.name

        self.dsDoc.addSourceDescriptor(
            styleName=source.name,
            location=globalLocation,
            path=ufoPath,
            layerName=ufoLayerName,
        )
        self.dsDoc.write(self.dsDoc.path)

        dsSource = DSSource(
            name=source.name,
            layer=ufoLayer,
            location=globalLocation,
        )
        self.dsSources.append(dsSource)

        return dsSource

    def _newUFOLayer(self, glyphName, ufoPath, suggestedLayerName):
        reader = self.ufoManager.getReader(ufoPath)
        existingLayerNames = set(reader.getLayerNames())
        ufoLayerName = suggestedLayerName
        count = 0
        # getGlyphSet() will create the layer if it doesn't already exist
        while glyphName in self.ufoManager.getGlyphSet(ufoPath, ufoLayerName):
            # The glyph already exists in the layer, which means there is
            # a conflict. Let's make up a layer name in which the glyph
            # does not exist.
            count += 1
            ufoLayerName = f"{suggestedLayerName}#{count}"

        if ufoLayerName not in existingLayerNames:
            reader.writeLayerContents()

        ufoLayer = UFOLayer(
            manager=self.ufoManager,
            path=ufoPath,
            name=ufoLayerName,
        )
        self.ufoLayers.append(ufoLayer)

        return ufoLayer

    def _getGlobalPortionOfLocation(self, location, localAxisNames):
        globalLocation = {
            name: value
            for name, value in location.items()
            if name not in localAxisNames
        }
        return {**self.defaultLocation, **globalLocation}

    async def deleteGlyph(self, glyphName):
        if glyphName not in self.glyphMap:
            raise KeyError(f"Glyph '{glyphName}' does not exist")
        for glyphSet in self.ufoLayers.iterAttrs("glyphSet"):
            if glyphName in glyphSet:
                glyphSet.deleteGlyph(glyphName)
                glyphSet.writeContents()
        del self.glyphMap[glyphName]
        self.savedGlyphModificationTimes[glyphName] = None

    async def getGlobalAxes(self) -> list[GlobalAxis | GlobalDiscreteAxis]:
        return self.axes

    async def putGlobalAxes(self, axes):
        self.dsDoc.axes = []
        for axis in axes:
            axisParameters = dict(
                name=axis.name,
                tag=axis.tag,
                default=axis.defaultValue,
                map=deepcopy(axis.mapping) if axis.mapping else None,
                axisLabels=packAxisLabels(axis.valueLabels),
            )
            if isinstance(axis, GlobalAxis):
                axisParameters["minimum"] = axis.minValue
                axisParameters["maximum"] = axis.maxValue
            else:
                assert isinstance(axis, GlobalDiscreteAxis)
                axisParameters["values"] = axis.values
            self.dsDoc.addAxisDescriptor(**axisParameters)
        self.dsDoc.write(self.dsDoc.path)
        self.updateAxisInfo()
        self.loadUFOLayers()

    async def getUnitsPerEm(self) -> int:
        return self.defaultFontInfo.unitsPerEm

    async def putUnitsPerEm(self, value: int) -> None:
        del self.defaultFontInfo
        ufoPaths = sorted(set(self.ufoLayers.iterAttrs("path")))
        for ufoPath in ufoPaths:
            reader = self.ufoManager.getReader(ufoPath)
            info = UFOFontInfo()
            reader.readInfo(info)
            info.unitsPerEm = value
            reader.writeInfo(info)

    async def getCustomData(self) -> dict[str, Any]:
        return deepcopy(self.dsDoc.lib)

    async def putCustomData(self, lib):
        self.dsDoc.lib = deepcopy(lib)
        self.dsDoc.write(self.dsDoc.path)

    async def watchExternalChanges(self) -> AsyncGenerator[tuple[Any, Any], None]:
        ufoPaths = sorted(set(self.ufoLayers.iterAttrs("path")))
        async for changes in watchfiles.awatch(*ufoPaths):
            changes = cleanupWatchFilesChanges(changes)
            changedItems = await self._analyzeExternalChanges(changes)

            glyphMapUpdates: dict[str, list[int] | None] = {}

            # TODO: update glyphMap for changed non-new glyphs

            for glyphName in changedItems.newGlyphs:
                try:
                    glifData = self.defaultDSSource.layer.glyphSet.getGLIF(glyphName)
                except KeyError:
                    logger.info(f"new glyph '{glyphName}' not found in default source")
                    continue
                gn, unicodes = extractGlyphNameAndUnicodes(glifData)
                glyphMapUpdates[glyphName] = unicodes

            for glyphName in changedItems.deletedGlyphs:
                if glyphName in self.glyphMap:
                    glyphMapUpdates[glyphName] = None

            externalChange = makeGlyphMapChange(glyphMapUpdates)

            reloadPattern = (
                {"glyphs": dict.fromkeys(changedItems.changedGlyphs)}
                if changedItems.changedGlyphs
                else None
            )

            if externalChange:
                rootObject = {"glyphMap": self.glyphMap}
                applyChange(rootObject, externalChange)

            if externalChange or reloadPattern:
                yield externalChange, reloadPattern

    async def _analyzeExternalChanges(self, changes):
        changedItems = SimpleNamespace(
            changedGlyphs=set(),
            newGlyphs=set(),
            deletedGlyphs=set(),
            rebuildGlyphSetContents=False,
        )
        for change, path in changes:
            _, fileSuffix = os.path.splitext(path)

            if fileSuffix == ".glif":
                self._analyzeExternalGlyphChanges(change, path, changedItems)

        if changedItems.rebuildGlyphSetContents:
            #
            # In some cases we're responding to a changed glyph while the
            # contents.plist hasn't finished writing yet. Let's pause a little
            # bit and hope for the best.
            #
            # This is obviously not a solid solution, and I'm not sure there is
            # one, given we don't know whether new .glif files written before or
            # after the corresponding contents.plist file. And even if we do know,
            # the amount of time between the two events can be arbitrarily long,
            # at least in theory, when many new glyphs are written at once.
            #
            # TODO: come up with a better solution.
            #
            await asyncio.sleep(0.15)
            for glyphSet in self.ufoLayers.iterAttrs("glyphSet"):
                glyphSet.rebuildContents()

        return changedItems

    def _analyzeExternalGlyphChanges(self, change, path, changedItems):
        fileName = os.path.basename(path)
        glyphName = self.glifFileNames.get(fileName)

        if change == watchfiles.Change.deleted:
            # Deleted glyph
            changedItems.rebuildGlyphSetContents = True
            if path.startswith(os.path.join(self.dsDoc.default.path, "glyphs/")):
                # The glyph was deleted from the default source,
                # do a full delete
                del self.glifFileNames[fileName]
                changedItems.deletedGlyphs.add(glyphName)
            # else:
            # The glyph was deleted from a non-default source,
            # just reload.
        elif change == watchfiles.Change.added:
            # New glyph
            changedItems.rebuildGlyphSetContents = True
            if glyphName is None:
                with open(path, "rb") as f:
                    glyphName, _ = extractGlyphNameAndUnicodes(f.read())
                self.glifFileNames[fileName] = glyphName
                changedItems.newGlyphs.add(glyphName)
                return
        else:
            # Changed glyph
            assert change == watchfiles.Change.modified

        if glyphName is None:
            return

        if os.path.exists(path):
            mtime = os.stat(path).st_mtime
            # Round-trip through datetime, as that's effectively what is happening
            # in getGLIFModificationTime, deep down in the fs package. It makes sure
            # we're comparing timestamps that are actually comparable, as they're
            # rounded somewhat, compared to the raw st_mtime timestamp.
            mtime = datetime.fromtimestamp(mtime).timestamp()
        else:
            mtime = None
        savedMTimes = self.savedGlyphModificationTimes.get(glyphName, ())
        if savedMTimes is not None and mtime not in savedMTimes:
            logger.info(f"external change '{glyphName}'")
            changedItems.changedGlyphs.add(glyphName)


@singledispatch
def unpackDSAxis(dsAxis: AxisDescriptor):
    axis = GlobalAxis(
        minValue=dsAxis.minimum,
        defaultValue=dsAxis.default,
        maxValue=dsAxis.maximum,
        label=dsAxis.name,
        name=dsAxis.name,
        tag=dsAxis.tag,
        hidden=dsAxis.hidden,
        valueLabels=unpackAxisLabels(dsAxis.axisLabels),
    )
    if dsAxis.map:
        axis.mapping = [[a, b] for a, b in dsAxis.map]
    poles = (dsAxis.minimum, dsAxis.default, dsAxis.maximum)
    return axis, poles


@unpackDSAxis.register
def _(dsAxis: DiscreteAxisDescriptor):
    axis = GlobalDiscreteAxis(
        values=dsAxis.values,
        defaultValue=dsAxis.default,
        label=dsAxis.name,
        name=dsAxis.name,
        tag=dsAxis.tag,
        hidden=dsAxis.hidden,
        valueLabels=unpackAxisLabels(dsAxis.axisLabels),
    )
    if dsAxis.map:
        axis.mapping = [[a, b] for a, b in dsAxis.map]
    return axis, dsAxis.values


_fontraToDSAxisLabelFields = {
    "name": "name",
    "value": "userValue",
    "minValue": "userMinimum",
    "maxValue": "userMaximum",
    "linkedValue": "linkedUserValue",
    "elidable": "elidable",
    "olderSibling": "olderSibling",
}

_dsToFontraAxisLabelFields = {v: k for k, v in _fontraToDSAxisLabelFields.items()}


def unpackAxisLabels(dsLabels):
    # designspace -> fontra
    return [
        AxisValueLabel(
            **{
                fName: getattr(dsAxisLabel, dsName)
                for fName, dsName in _fontraToDSAxisLabelFields.items()
            }
        )
        for dsAxisLabel in dsLabels
    ]


def packAxisLabels(valueLabels):
    # fontra -> designspace
    return [
        AxisLabelDescriptor(
            **{
                dsName: getattr(label, fName)
                for dsName, fName in _dsToFontraAxisLabelFields.items()
            }
        )
        for label in valueLabels
    ]


def makeGlyphMapChange(glyphMapUpdates):
    if not glyphMapUpdates:
        return None
    changes = [
        {"f": "=", "a": [glyphName, unicodes]}
        for glyphName, unicodes in glyphMapUpdates.items()
        if unicodes is not None
    ] + [
        {"f": "d", "a": [glyphName]}
        for glyphName, unicodes in glyphMapUpdates.items()
        if unicodes is None
    ]
    glyphMapChange = {"p": ["glyphMap"]}
    if len(changes) == 1:
        glyphMapChange.update(changes[0])
    else:
        glyphMapChange["c"] = changes
    return glyphMapChange


class UFOBackend(DesignspaceBackend):
    @classmethod
    def fromPath(cls, path):
        dsDoc = DesignSpaceDocument()
        dsDoc.addSourceDescriptor(path=os.fspath(path), styleName="default")
        return cls(dsDoc)

    @classmethod
    def createFromPath(cls, path):
        path = pathlib.Path(path).resolve()
        if path.is_dir():
            shutil.rmtree(path)
        elif path.exists():
            path.unlink()
        dsDoc = createDSDocFromUFOPath(path, "default")
        return cls(dsDoc)

    async def putGlobalAxes(self, axes):
        if axes:
            raise ValueError("The single-UFO backend does not support variation axes")


def createDSDocFromUFOPath(ufoPath, styleName):
    ufoPath = os.fspath(ufoPath)
    assert not os.path.exists(ufoPath)
    writer = UFOReaderWriter(ufoPath)  # this creates the UFO
    info = UFOFontInfo()
    for infoAttr, value in defaultUFOInfoAttrs.items():
        if value is not None:
            setattr(info, infoAttr, value)
    writer.writeInfo(info)
    _ = writer.getGlyphSet()  # this creates the default layer
    writer.writeLayerContents()
    assert os.path.isdir(ufoPath)

    dsDoc = DesignSpaceDocument()
    dsDoc.addSourceDescriptor(styleName=styleName, path=ufoPath, location={})
    return dsDoc


class UFOGlyph:
    unicodes: list = []
    width: float | None = 0
    height: float | None = None
    lib: dict


class UFOFontInfo:
    unitsPerEm = 1000


class UFOManager:
    @cache
    def getReader(self, path):
        return UFOReaderWriter(path)

    @cache
    def getGlyphSet(self, path, layerName):
        return self.getReader(path).getGlyphSet(layerName, defaultLayer=False)


@dataclass(kw_only=True, frozen=True)
class DSSource:
    name: str
    layer: UFOLayer
    location: dict[str, float]
    isDefault: bool = False

    @cached_property
    def locationTuple(self):
        return tuplifyLocation(self.location)

    def newFontraSource(self, localDefaultOverride=None):
        if localDefaultOverride is None:
            localDefaultOverride = {}
        return Source(
            name=self.name,
            location={**self.location, **localDefaultOverride},
            layerName=self.layer.fontraLayerName,
        )


@dataclass(kw_only=True, frozen=True)
class UFOLayer:
    manager: UFOManager
    path: str
    name: str

    @cached_property
    def fileName(self):
        return os.path.splitext(os.path.basename(self.path))[0]

    @cached_property
    def fontraLayerName(self):
        return f"{self.fileName}/{self.name}"

    @cached_property
    def reader(self):
        return self.manager.getReader(self.path)

    @cached_property
    def glyphSet(self):
        return self.manager.getGlyphSet(self.path, self.name)


class ItemList:
    def __init__(self):
        self.items = []
        self.invalidateCache()

    def __iter__(self):
        return iter(self.items)

    def append(self, item):
        self.items.append(item)
        self.invalidateCache()

    def invalidateCache(self):
        self._mappings = {}

    def findItem(self, **kwargs):
        items = self.findItems(**kwargs)
        return items[0] if items else None

    def findItems(self, **kwargs):
        attrTuple = tuple(kwargs.keys())
        valueTuple = tuple(kwargs.values())
        keyMapping = self._mappings.get(attrTuple)
        if keyMapping is None:
            keyMapping = defaultdict(list)
            for item in self.items:
                itemValueTuple = tuple(
                    getattr(item, attrName) for attrName in attrTuple
                )
                keyMapping[itemValueTuple].append(item)
            self._mappings[attrTuple] = dict(keyMapping)
        return keyMapping.get(valueTuple)

    def iterAttrs(self, attrName):
        for item in self:
            yield getattr(item, attrName)


def ufoLayerToStaticGlyph(glyphSet, glyphName):
    glyph = UFOGlyph()
    glyph.lib = {}
    pen = PackedPathPointPen()
    glyphSet.readGlyph(glyphName, glyph, pen, validate=False)
    components = [*pen.components] + unpackVariableComponents(glyph.lib)
    staticGlyph = StaticGlyph(
        path=pen.getPath(), components=components, xAdvance=glyph.width
    )
    # TODO: anchors
    # TODO: yAdvance, verticalOrigin
    return staticGlyph, glyph


def unpackVariableComponents(lib):
    components = []
    for componentDict in lib.get(VARIABLE_COMPONENTS_LIB_KEY, ()):
        glyphName = componentDict["base"]
        transformationDict = componentDict.get("transformation", {})
        transformation = DecomposedTransform(**transformationDict)
        location = componentDict.get("location", {})
        components.append(
            Component(name=glyphName, transformation=transformation, location=location)
        )
    return components


def readGlyphOrCreate(
    glyphSet: GlyphSet,
    glyphName: str,
    unicodes: list[int],
) -> UFOGlyph:
    layerGlyph = UFOGlyph()
    layerGlyph.lib = {}
    if glyphName in glyphSet:
        # We read the existing glyph so we don't lose any data that
        # Fontra doesn't understand
        glyphSet.readGlyph(glyphName, layerGlyph, validate=False)
    layerGlyph.unicodes = unicodes
    return layerGlyph


def populateUFOLayerGlyph(
    layerGlyph: UFOGlyph,
    staticGlyph: StaticGlyph,
    forceVariableComponents: bool = False,
) -> Callable[[AbstractPointPen], None]:
    pen = RecordingPointPen()
    layerGlyph.width = staticGlyph.xAdvance
    layerGlyph.height = staticGlyph.yAdvance
    staticGlyph.path.drawPoints(pen)
    variableComponents = []
    for component in staticGlyph.components:
        if component.location or forceVariableComponents:
            # Store as a variable component
            varCoDict = {"base": component.name, "location": component.location}
            if component.transformation != DecomposedTransform():
                varCoDict["transformation"] = asdict(component.transformation)
            variableComponents.append(varCoDict)
        else:
            # Store as a regular component
            pen.addComponent(
                component.name,
                cleanupTransform(component.transformation.toTransform()),
            )

    storeInLib(layerGlyph, VARIABLE_COMPONENTS_LIB_KEY, variableComponents)

    return pen.replay


def getGlyphMapFromGlyphSet(glyphSet):
    glyphMap = {}
    for glyphName in glyphSet.keys():
        glifData = glyphSet.getGLIF(glyphName)
        gn, unicodes = extractGlyphNameAndUnicodes(glifData)
        assert gn == glyphName, (gn, glyphName)
        glyphMap[glyphName] = unicodes
    return glyphMap


def uniqueNameMaker(existingNames=()):
    usedNames = set(existingNames)

    def makeUniqueName(name):
        count = 0
        uniqueName = name
        while uniqueName in usedNames:
            count += 1
            uniqueName = f"{name}#{count}"
        usedNames.add(uniqueName)
        return uniqueName

    return makeUniqueName


def cleanupTransform(t):
    """Convert any integer float values into ints. This is to prevent glifLib
    from writing float values that can be integers."""
    return tuple(int(v) if int(v) == v else v for v in t)


def cleanupWatchFilesChanges(changes):
    # If a path is mentioned with more than one event type, we pick the most
    # appropriate one among them:
    # - if there is a delete event and the path does not exist: delete it is
    # - else: keep the lowest sorted event (order: added, modified, deleted)
    perPath = {}
    for change, path in sorted(changes):
        if path in perPath:
            if change == watchfiles.Change.deleted and not os.path.exists(path):
                # File doesn't exist, event to "deleted"
                perPath[path] = watchfiles.Change.deleted
            # else: keep the first event
        else:
            perPath[path] = change
    return [(change, path) for path, change in perPath.items()]


def tuplifyLocation(loc):
    # TODO: find good place to share this (duplicated from opentype.py)
    return tuple(sorted(loc.items()))


def splitLocationByPolePosition(location, poles):
    atPole = {}
    notAtPole = {}
    for name, value in location.items():
        if value in poles.get(name, ()):
            atPole[name] = value
        else:
            notAtPole[name] = value
    return atPole, notAtPole


def packLocalAxes(axes):
    return [
        dict(
            name=axis.name,
            minimum=axis.minValue,
            default=axis.defaultValue,
            maximum=axis.maxValue,
        )
        for axis in axes
    ]


def reverseSparseDict(d):
    return {v: k for k, v in d.items() if k != v}


def storeInLib(layerGlyph, key, value):
    if value:
        layerGlyph.lib[key] = value
    else:
        layerGlyph.lib.pop(key, None)


def glyphHasVariableComponents(glyph):
    return any(
        compo.location or compo.transformation.tCenterX or compo.transformation.tCenterY
        for layer in glyph.layers.values()
        for compo in layer.glyph.components
    )
