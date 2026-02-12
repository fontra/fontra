from __future__ import annotations

import asyncio
import logging
import os
import pathlib
import shutil
import uuid
from collections import defaultdict
from copy import deepcopy
from dataclasses import asdict, dataclass, field, replace
from datetime import datetime
from functools import cache, cached_property, singledispatch
from os import PathLike
from types import SimpleNamespace
from typing import Any, Callable

from fontTools.designspaceLib import (
    AxisDescriptor,
    AxisLabelDescriptor,
    DesignSpaceDocument,
    DiscreteAxisDescriptor,
    SourceDescriptor,
)
from fontTools.misc.transform import DecomposedTransform, Transform
from fontTools.pens.pointPen import AbstractPointPen
from fontTools.pens.recordingPen import RecordingPointPen
from fontTools.ufoLib import (
    FEATURES_FILENAME,
    FONTINFO_FILENAME,
    GROUPS_FILENAME,
    KERNING_FILENAME,
    LIB_FILENAME,
    UFOLibError,
    UFOReader,
    UFOReaderWriter,
)
from fontTools.ufoLib.glifLib import GlyphSet

from ..core import kernutils
from ..core.async_property import async_property
from ..core.classes import (
    Anchor,
    Axes,
    AxisValueLabel,
    BackgroundImage,
    Component,
    CrossAxisMapping,
    DiscreteFontAxis,
    FontAxis,
    FontInfo,
    FontSource,
    GlyphAxis,
    GlyphSource,
    Guideline,
    ImageData,
    ImageType,
    Kerning,
    Layer,
    LineMetric,
    OpenTypeFeatures,
    RGBAColor,
    StaticGlyph,
    VariableGlyph,
)
from ..core.glyphdependencies import GlyphDependencies
from ..core.path import PackedPathPointPen
from ..core.protocols import WritableFontBackend
from ..core.subprocess import runInSubProcess
from ..core.varutils import locationToTuple, makeDenseLocation, makeSparseLocation
from .base import ReadableBaseBackend
from .filewatcher import Change
from .ufo_utils import extractGlyphNameAndCodePoints
from .watchable import WatchableBackend

logger = logging.getLogger(__name__)


VARIABLE_COMPONENTS_LIB_KEY = "com.black-foundry.variable-components"
GLYPH_DESIGNSPACE_LIB_KEY = "com.black-foundry.glyph-designspace"
SOURCE_NAME_MAPPING_LIB_KEY = "xyz.fontra.source-names"
LAYER_NAME_MAPPING_LIB_KEY = "xyz.fontra.layer-names"
GLYPH_CUSTOM_DATA_LIB_KEY = "xyz.fontra.customData"
GLYPH_SOURCE_CUSTOM_DATA_LIB_KEY = "xyz.fontra.glyph.source.customData"
LINE_METRICS_HOR_ZONES_KEY = "xyz.fontra.lineMetricsHorizontalLayout.zones"
GLYPH_NOTE_LIB_KEY = "fontra.glyph.note"
RF_GUIDELINE_LOCK_LIB_PREFIX = "com.typemytype.robofont.guideline.locked."


defaultUFOInfoAttrs = {
    "unitsPerEm": 1000,
    "ascender": 750,
    "descender": -250,
    "xHeight": 500,
    "capHeight": 750,
}


lineMetricsHorDefaults = {
    "ascender": {"value": 0.75, "zone": 0.016},
    "capHeight": {"value": 0.75, "zone": 0.016},
    "xHeight": {"value": 0.5, "zone": 0.016},
    "descender": {"value": -0.25, "zone": -0.016},
    # TODO: baseline does not exist in UFO -> find a solution
    "baseline": {"value": 0, "zone": -0.016},
}


lineMetricsVerMapping = {
    # Fontra / UFO
    "ascender": "openTypeVheaVertTypoAscender",
    "descender": "openTypeVheaVertTypoDescender",
    "lineGap": "openTypeVheaVertTypoLineGap",  # TODO: this doesn't really belong here
    # ("slopeRise", "openTypeVheaCaretSlopeRise"),
    # ("slopeRun", "openTypeVheaCaretSlopeRun"),
    # ("caretOffset", "openTypeVheaCaretOffset"),
}


fontInfoNameMapping = [
    # (Fontra, UFO)
    ("familyName", "familyName"),
    ("versionMajor", "versionMajor"),
    ("versionMinor", "versionMinor"),
    ("copyright", "copyright"),
    ("trademark", "trademark"),
    ("description", "openTypeNameDescription"),
    ("sampleText", "openTypeNameSampleText"),
    ("designer", "openTypeNameDesigner"),
    ("designerURL", "openTypeNameDesignerURL"),
    ("manufacturer", "openTypeNameManufacturer"),
    ("manufacturerURL", "openTypeNameManufacturerURL"),
    ("licenseDescription", "openTypeNameLicense"),
    ("licenseInfoURL", "openTypeNameLicenseURL"),
    ("vendorID", "openTypeOS2VendorID"),
]


ufoFontInfoAttributes = [infoAttr for _, infoAttr in fontInfoNameMapping] + [
    "unitsPerEm"
]


# CustomData, Font Family Level:
ufoInfoAttributesToRoundTripFamilyLevel = [
    "openTypeNameUniqueID",
    "openTypeHeadCreated",
    "openTypeNameVersion",
    "openTypeNamePreferredFamilyName",
    "openTypeNameWWSFamilyName",
    "openTypeOS2CodePageRanges",
    "openTypeOS2UnicodeRanges",
    "openTypeOS2FamilyClass",
    "openTypeOS2Type",  # embedding bit
    "postscriptWindowsCharacterSet",  # The Windows character set.
    "openTypeOS2Panose",
    "openTypeOS2Selection",
    "openTypeOS2WeightClass",  # Note: The OS/2.usWeightClass, OS/2.usWidthClass and post.italicAngle values are not supported by variation data in the MVAR table. # noqa: E501
    "openTypeOS2WidthClass",
]

# CustomData, Font Source Level:
ufoInfoAttributesToRoundTrip = [
    # "openTypeGaspRangeRecords", # part of MVAR, but commented out for now, as too complex
    "openTypeHheaAscender",
    "openTypeHheaCaretOffset",
    "openTypeHheaCaretSlopeRise",
    "openTypeHheaCaretSlopeRun",
    "openTypeHheaDescender",
    "openTypeHheaLineGap",
    "openTypeOS2StrikeoutPosition",
    "openTypeOS2StrikeoutSize",
    "openTypeOS2SubscriptXOffset",
    "openTypeOS2SubscriptXSize",
    "openTypeOS2SubscriptYOffset",
    "openTypeOS2SubscriptYSize",
    "openTypeOS2SuperscriptXOffset",
    "openTypeOS2SuperscriptXSize",
    "openTypeOS2SuperscriptYOffset",
    "openTypeOS2SuperscriptYSize",
    "openTypeOS2TypoAscender",
    "openTypeOS2TypoDescender",
    "openTypeOS2TypoLineGap",
    "openTypeOS2WinAscent",
    "openTypeOS2WinDescent",
    "openTypeVheaCaretOffset",
    "openTypeVheaCaretSlopeRise",
    "openTypeVheaCaretSlopeRun",
    "openTypeVheaVertTypoLineGap",
    "postscriptUnderlinePosition",
    "postscriptUnderlineThickness",
    "openTypeNameCompatibleFullName",
    "openTypeNamePreferredSubfamilyName",
    "openTypeNameWWSSubfamilyName",
    "postscriptBlueFuzz",
    "postscriptBlueScale",
    "postscriptBlueShift",
    "postscriptBlueValues",
    "postscriptFamilyBlues",
    "postscriptFamilyOtherBlues",
    "postscriptForceBold",
    "postscriptIsFixedPitch",
    "postscriptOtherBlues",
    "postscriptSlantAngle",
    "postscriptStemSnapH",
    "postscriptStemSnapV",
]

# Let's NOT expose (for now):
#     "openTypeHeadFlags",  # too low level?
#     "openTypeHeadLowestRecPPEM", # the smallest readable size might different between fonts (eg. Text vs. Display) # noqa: E501
#     "openTypeNameRecords", # more complex, can be all, family level, source level and instance level + different languages # noqa: E501
#     "postscriptUniqueID",
#     "postscriptWeightName",
#     "postscriptDefaultCharacter", # The name of the glyph that should be used as the default character in PFM files. # noqa: E501
#     "postscriptDefaultWidthX", # Default width for glyphs.
#     "postscriptNominalWidthX", # Nominal width for glyphs.


featuresWarning = """\
#
# FONTRA WARNING! Fontra had to alter the feature code when it was read from the UFO.
#
# If you are editing a .designspace/UFO project that was not originally authored with
# Fontra, please beware of the following.
#
# Fontra is not a general purpose UFO features editor, and has limitations that affect
# how the features are written back to the UFO(s) when edited:
# - 'Included files' are resolved and are inlined
# - Only the UFO at the default designspace location will contain features
# - Variable GPOS features currently lose their variability, unless they use
#   fonttools variable feature syntax: https://github.com/fontra/fontra/issues/2185
#   In a future version of Fontra, variable GPOS features that are spread out over
#   the source UFOs will likely be converted to single-file variable feature syntax.
#

"""


class DesignspaceBackend(WatchableBackend, ReadableBaseBackend):
    @classmethod
    def fromPath(cls, path: PathLike) -> WritableFontBackend:
        return cls(DesignSpaceDocument.fromfile(path))

    @classmethod
    def createFromPath(cls, path: PathLike) -> WritableFontBackend:
        dsDoc = DesignSpaceDocument()
        dsDoc.write(path)
        return cls(dsDoc)

    def __init__(self, dsDoc: DesignSpaceDocument) -> None:
        super().__init__()
        self._glyphDependenciesTask: asyncio.Task[GlyphDependencies] | None = None
        self._glyphDependencies: GlyphDependencies | None = None
        self._backgroundTasksTask: asyncio.Task | None = None
        self._imageMapping = DoubleDict()
        self._imageDataToWrite: dict[str, ImageData] = {}
        # Set this to true to set "public.truetype.overlap" in each writte .glif's lib:
        self.setOverlapSimpleFlag = False
        self._familyName: str | None = None
        self._defaultFontInfo: UFOFontInfo | None = None
        self._initialize(dsDoc)
        self._implicitDefaultLocationBase: str | None = None

    def _initialize(self, dsDoc: DesignSpaceDocument) -> None:
        self.dsDoc = ensureDSSourceNamesAreUnique(dsDoc)

        self.ufoManager = UFOManager()
        self.updateAxisInfo()
        self.loadUFOLayers()
        self.buildGlyphFileNameMapping()
        self.glyphMap = (
            {}
            if self.defaultDSSource is None
            else getGlyphMapFromGlyphSet(self.defaultDSSource.layer.glyphSet)
        )
        self.savedGlyphModificationTimes: dict[str, set] = {}
        self.zombieDSSources: dict[str, DSSource] = {}
        self._ltrGlyphs: set | None = None
        self._rtlGlyphs: set | None = None

    def startOptionalBackgroundTasks(self) -> None:
        self._backgroundTasksTask = asyncio.create_task(self.glyphDependencies)

    @property
    def familyName(self) -> str:
        return self._familyName if self._familyName is not None else "Untitled"

    @async_property
    async def glyphDependencies(self) -> GlyphDependencies:
        if self._glyphDependencies is not None:
            return self._glyphDependencies

        if self.defaultDSSource is None:
            self._glyphDependencies = GlyphDependencies()
            return self._glyphDependencies

        if self._glyphDependenciesTask is None:
            self._glyphDependenciesTask = asyncio.create_task(
                extractGlyphDependenciesFromUFO(
                    self.defaultDSSource.layer.path, self.defaultDSSource.layer.name
                )
            )

            def setResult(task):
                if not task.cancelled() and task.exception() is None:
                    self._glyphDependencies = task.result()

            self._glyphDependenciesTask.add_done_callback(setResult)

        return await self._glyphDependenciesTask

    async def findGlyphsThatUseGlyph(self, glyphName):
        return sorted((await self.glyphDependencies).usedBy.get(glyphName, []))

    def _reloadEverything(self) -> None:
        self._initialize(DesignSpaceDocument.fromfile(self.dsDoc.path))

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

        self.axisMappings = [
            CrossAxisMapping(
                description=mapping.description,
                groupDescription=mapping.groupDescription,
                inputLocation=dict(mapping.inputLocation),
                outputLocation=dict(mapping.outputLocation),
            )
            for mapping in self.dsDoc.axisMappings
        ]

        self.axisNames = set(defaultLocation)
        self.axisPolePositions = axisPolePositions
        self.defaultLocation = defaultLocation

    async def aclose(self) -> None:
        await self.fileWatcherClose()
        if self._glyphDependenciesTask is not None:
            self._glyphDependenciesTask.cancel()
        if self._backgroundTasksTask is not None:
            self._backgroundTasksTask.cancel()

    @property
    def defaultDSSource(self):
        return self.dsSources.findItem(isDefault=True)

    @property
    def defaultUFOLayer(self):
        assert self.defaultDSSource is not None
        return self.defaultDSSource.layer

    @property
    def defaultReader(self):
        return self.defaultUFOLayer.reader

    @property
    def ufoDir(self) -> pathlib.Path:
        return pathlib.Path(
            self.dsDoc.path
            if self.defaultDSSource is None
            else self.defaultUFOLayer.path
        ).parent

    @property
    def defaultFontInfo(self):
        if self._defaultFontInfo is None:
            fontInfo = UFOFontInfo()
            if self.defaultDSSource is not None:
                self.defaultReader.readInfo(fontInfo)
            self._defaultFontInfo = fontInfo
        return self._defaultFontInfo

    @property
    def ltrGlyphs(self):
        if self._ltrGlyphs is None:
            self._classifyGlyphsByDirection()
        return self._ltrGlyphs

    @property
    def rtlGlyphs(self):
        if self._rtlGlyphs is None:
            self._classifyGlyphsByDirection()
        return self._rtlGlyphs

    def _classifyGlyphsByDirection(self):
        features = self._getFeaturesSync()
        self._ltrGlyphs, self.rtlGlyphs = kernutils.classifyGlyphsByDirection(
            self.glyphMap, features.text, self.axes
        )

    def loadUFOLayers(self) -> None:
        manager = self.ufoManager
        self.dsSources = ItemList()
        self.ufoLayers = ItemList()

        makeUniqueSourceName = uniqueNameMaker()
        for source in self.dsDoc.sources:
            if self._familyName is None and source.familyName:
                self._familyName = source.familyName
            ufoPath = os.path.normpath(source.path)
            reader = manager.getReader(ufoPath, createIfNeeded=False)
            defaultLayerName = reader.getDefaultLayerName()
            ufoLayerName = source.layerName or defaultLayerName

            sourceLayer = self.ufoLayers.findItem(path=ufoPath, name=ufoLayerName)
            if sourceLayer is None:
                sourceLayer = UFOLayer(
                    manager=manager,
                    path=ufoPath,
                    name=ufoLayerName,
                    fontraLayerName=source.name,
                )
                self.ufoLayers.append(sourceLayer)

            sourceName = source.styleName or (
                sourceLayer.fileName
                if ufoLayerName == defaultLayerName
                else source.layerName
            )
            sourceName = makeUniqueSourceName(sourceName)

            self.dsSources.append(
                DSSource(
                    identifier=source.name,
                    name=sourceName,
                    layer=sourceLayer,
                    location=makeDenseLocation(source.location, self.defaultLocation),
                    isDefault=source == self.dsDoc.default,
                    isSparse=source.layerName is not None,
                )
            )

        self._addNonSourceLayers()
        self._updatePathsToWatch()

    def _addNonSourceLayers(self) -> None:
        # Add remaining layers (background layers, variable glyph layers)
        manager = self.ufoManager
        for source in self.dsDoc.sources:
            ufoPath = os.path.normpath(source.path)
            reader = manager.getReader(ufoPath, createIfNeeded=False)
            for ufoLayerName in reader.getLayerNames():
                layer = self.ufoLayers.findItem(path=ufoPath, name=ufoLayerName)
                if layer is None:
                    fontraLayerName = self._getFontraLayerNameFromUFOLayerName(
                        source.name, ufoLayerName
                    )
                    self.ufoLayers.append(
                        UFOLayer(
                            manager=manager,
                            path=ufoPath,
                            name=ufoLayerName,
                            fontraLayerName=fontraLayerName,
                        )
                    )

    def _getFontraLayerNameFromUFOLayerName(self, sourceIdentifier, ufoLayerName):
        fontraLayerName = f"{sourceIdentifier}^{ufoLayerName}"
        if "^" in ufoLayerName:
            # This is possibly a background layer for a sparse master, if the
            # UFO layer name is prefixed with an existing source identifier
            sourceIdentifier, _ = ufoLayerName.split("^", 1)
            if self.dsSources.findItem(identifier=sourceIdentifier) is not None:
                fontraLayerName = ufoLayerName
        return fontraLayerName

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

    def ensureGlyphInGlyphOrder(self, layer, glyphName):
        reader = layer.reader
        originalGlyphOrderMapping = layer.originalGlyphOrderMapping
        lib = reader.readLib()
        glyphOrder = lib.get("public.glyphOrder")
        if glyphOrder is not None and glyphName not in glyphOrder:
            glyphOrder.append(glyphName)
            glyphOrder.sort(
                key=lambda gn: originalGlyphOrderMapping.get(gn, 0xFFFFFFFF)
            )
            reader.writeLib(lib)
            self.fileWatcherIgnoreNextChange(os.path.join(layer.path, LIB_FILENAME))

    def ensureGlyphNotInGlyphOrder(self, layer, glyphName):
        reader = layer.reader
        lib = reader.readLib()
        glyphOrder = lib.get("public.glyphOrder")
        if not layer.originalGlyphOrderMapping and glyphOrder is not None:
            layer.originalGlyphOrderMapping.update(
                {gn: i for i, gn in enumerate(glyphOrder)}
            )

        if glyphOrder is not None and glyphName in glyphOrder:
            glyphOrder.remove(glyphName)
            reader.writeLib(lib)
            self.fileWatcherIgnoreNextChange(os.path.join(layer.path, LIB_FILENAME))

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

        defaultStaticGlyph, defaultUFOGlyph = ufoLayerToStaticGlyph(
            self.defaultUFOLayer.glyphSet, glyphName
        )

        localDS = defaultUFOGlyph.lib.get(GLYPH_DESIGNSPACE_LIB_KEY)
        if localDS is not None:
            axes, localSources = self._unpackLocalDesignSpace(
                localDS, self.defaultUFOLayer.name
            )
        sourceNameMapping = defaultUFOGlyph.lib.get(SOURCE_NAME_MAPPING_LIB_KEY, {})
        layerNameMapping = defaultUFOGlyph.lib.get(LAYER_NAME_MAPPING_LIB_KEY, {})

        # global per glyph custom data, eg. glyph locking
        customData = defaultUFOGlyph.lib.get(GLYPH_CUSTOM_DATA_LIB_KEY, {})

        if defaultUFOGlyph.note:
            customData[GLYPH_NOTE_LIB_KEY] = defaultUFOGlyph.note

        # per glyph source custom data, eg. status color code
        sourcesCustomData = {}

        for ufoLayer in self.ufoLayers:
            if glyphName not in ufoLayer.glyphSet:
                continue

            staticGlyph, ufoGlyph = (
                (defaultStaticGlyph, defaultUFOGlyph)
                if ufoLayer == self.defaultUFOLayer
                else ufoLayerToStaticGlyph(ufoLayer.glyphSet, glyphName)
            )

            layerName = layerNameMapping.get(
                ufoLayer.fontraLayerName, ufoLayer.fontraLayerName
            )
            sourcesCustomData[layerName] = ufoGlyph.lib.get(
                GLYPH_SOURCE_CUSTOM_DATA_LIB_KEY, {}
            )

            if staticGlyph.backgroundImage is not None:
                staticGlyph.backgroundImage.identifier = self._getImageIdentifier(
                    ufoLayer.path, staticGlyph.backgroundImage.identifier
                )

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
            sources.append(dsSource.asFontraGlyphSource(localDefaultOverride))

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

        for source in sources:
            source.name = sourceNameMapping.get(source.name, source.name)
            source.customData = sourcesCustomData.get(source.layerName, {})

        return VariableGlyph(
            name=glyphName,
            axes=axes,
            sources=sources,
            layers=layers,
            customData=customData,
        )

    def _unpackLocalDesignSpace(self, dsDict, defaultLayerName):
        axes = [
            GlyphAxis(
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
                ufoLayerName if ufoLayerName != defaultLayerName else "default",
            )

            sourceLocation = {**self.defaultLocation, **source["location"]}
            globalLocation = self._getGlobalPortionOfLocation(
                sourceLocation, localAxisNames
            )
            dsSource = self.dsSources.findItem(
                locationTuple=locationToTuple(globalLocation)
            )
            assert dsSource is not None
            ufoPath = dsSource.layer.path

            ufoLayer = self.ufoLayers.findItem(path=ufoPath, name=ufoLayerName)
            assert ufoLayer is not None
            # Calc the location to be added to the base location
            location = {
                k: v
                for k, v in source["location"].items()
                if dsSource.location.get(k) != v
            }
            sources.append(
                GlyphSource(
                    name=sourceName,
                    locationBase=dsSource.identifier,
                    location=location,
                    layerName=ufoLayer.fontraLayerName,
                )
            )
        return axes, sources

    async def putGlyph(
        self, glyphName: str, glyph: VariableGlyph, codePoints: list[int]
    ) -> None:
        assert isinstance(codePoints, list)
        assert all(isinstance(cp, int) for cp in codePoints)
        self.glyphMap[glyphName] = codePoints

        if self._glyphDependencies is not None:
            self._glyphDependencies.update(glyphName, componentNamesFromGlyph(glyph))

        if self.defaultDSSource is None:
            # This is the first glyph ever to be written, and font sources were not set up
            # explicitly, so we need to create the default UFO
            sourceName = getDefaultSourceName(glyph, self.defaultLocation, "Regular")
            self._createDefaultSourceAndUFO(sourceName)

        defaultLayerGlyph = readGlyphOrCreate(
            self.defaultUFOLayer.glyphSet, glyphName, codePoints
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
        sourcesCustomData = {}
        for source in glyph.sources:
            sourceInfo = self._prepareUFOSourceLayer(
                glyphName, source, localDefaultLocation, revLayerNameMapping
            )
            if sourceInfo.sourceName != source.name and not (
                source.locationBase and not source.name
            ):
                sourceNameMapping[sourceInfo.sourceName] = source.name
            if sourceInfo.layerName != source.layerName:
                layerNameMapping[sourceInfo.layerName] = source.layerName
            if sourceInfo.localSourceDict is not None:
                localSources.append(sourceInfo.localSourceDict)

            sourcesCustomData[sourceInfo.layerName] = source.customData

        # Prepare local design space
        localDS = {}
        if localAxes:
            localDS["axes"] = localAxes
        if localSources:
            localDS["sources"] = localSources

        revLayerNameMapping = reverseSparseDict(layerNameMapping)
        assert len(revLayerNameMapping) == len(layerNameMapping)

        # Gather all UFO layers
        usedLayers = set()
        layers = []
        for layerName, layer in glyph.layers.items():
            layerName = revLayerNameMapping.get(layerName, layerName)
            ufoLayer = self.ufoLayers.findItem(fontraLayerName=layerName)
            ufoPath = self.defaultUFOLayer.path

            if ufoLayer is None and "^" in layerName:
                ufoPath, layerName = self._findUFOForLayerName(
                    layerName, self.defaultUFOLayer.path
                )
                ufoLayer = self.ufoLayers.findItem(path=ufoPath, name=layerName)

            if ufoLayer is None:
                # This layer is not used by any source and we haven't seen it
                # before. Let's create a new layer in the appropriate UFO.
                ufoLayer = self._createUFOLayer(
                    glyphName, ufoPath, layerName, layerName
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
                layerGlyph.note = glyph.customData.pop(GLYPH_NOTE_LIB_KEY, None)
                storeInLib(layerGlyph, GLYPH_CUSTOM_DATA_LIB_KEY, glyph.customData)
            else:
                layerGlyph = readGlyphOrCreate(glyphSet, glyphName, codePoints)

            storeInLib(
                layerGlyph,
                GLYPH_SOURCE_CUSTOM_DATA_LIB_KEY,
                sourcesCustomData.get(ufoLayer.fontraLayerName),
            )
            if self.setOverlapSimpleFlag:
                layerGlyph.lib["public.truetype.overlap"] = True

            imageFileName = None
            if layer.glyph.backgroundImage is not None:
                imageInfo = self._imageMapping.reverse.get(
                    layer.glyph.backgroundImage.identifier
                )
                if imageInfo is not None:
                    _, imageFileName = imageInfo
                else:
                    imageIdentifier = layer.glyph.backgroundImage.identifier
                    imageFileName = f"{imageIdentifier}.png"
                    imageInfo = (ufoLayer.path, imageFileName)
                    self._imageMapping[imageInfo] = imageIdentifier
                    imageData = self._imageDataToWrite.pop(imageIdentifier, None)
                    if imageData is not None:
                        await self.putBackgroundImage(imageIdentifier, imageData)

            drawPointsFunc = populateUFOLayerGlyph(
                layerGlyph,
                layer.glyph,
                hasVariableComponents,
                imageFileName=imageFileName,
            )
            glyphSet.writeGlyph(glyphName, layerGlyph, drawPointsFunc=drawPointsFunc)
            if writeGlyphSetContents:
                # FIXME: this is inefficient if we write many glyphs
                self.updateGlyphSetContents(glyphSet)
                self.ensureGlyphInGlyphOrder(ufoLayer, glyphName)

            modTimes.add(glyphSet.getGLIFModificationTime(glyphName))

        # Prune unused UFO layers
        relevantLayerNames = set(
            layer.fontraLayerName
            for layer in self.ufoLayers
            if glyphName in layer.glyphSet
        )

        layersToDelete = relevantLayerNames - usedLayers

        for layerName in sorted(layersToDelete):
            ufoLayer = self.ufoLayers.findItem(fontraLayerName=layerName)
            glyphSet = ufoLayer.glyphSet
            glyphSet.deleteGlyph(glyphName)
            # FIXME: this is inefficient if we write many glyphs
            self.updateGlyphSetContents(glyphSet)
            if ufoLayer.isDefaultLayer:
                self.ensureGlyphNotInGlyphOrder(ufoLayer, glyphName)
            modTimes.add(None)

        self.savedGlyphModificationTimes[glyphName] = modTimes

    def _findUFOForLayerName(self, layerName, ufoPath):
        if "^" in layerName:
            sourceIdentifier, bgLayerName = layerName.split("^", 1)
            dsSource = self.dsSources.findItem(identifier=sourceIdentifier)
            if dsSource is not None and not dsSource.isSparse:
                ufoPath = dsSource.layer.path
                layerName = bgLayerName
            # else:
            #     print([s for s in self.dsSources])
            #     assert 0, ("===", sourceIdentifier, layerName)

        return ufoPath, layerName

    def _createDefaultSourceAndUFO(self, sourceName):
        assert not self.dsSources
        assert not self.dsDoc.sources
        sourceIdentifier = makeDSSourceIdentifier(self.dsDoc, 0, None)
        ufoLayer = self._createUFO(sourceName, sourceIdentifier)

        assert os.path.isdir(ufoLayer.path)

        if self._familyName is None:
            self._familyName = pathlib.Path(self.dsDoc.path).stem

        dsSource = DSSource(
            identifier=sourceIdentifier,
            name=sourceName,
            layer=ufoLayer,
            location=self.defaultLocation,
            isDefault=True,
            isSparse=False,
        )
        self.dsSources.append(dsSource)
        self.dsDoc.sources.append(dsSource.asDSSourceDescriptor(self.familyName))
        self._writeDesignSpaceDocument()

    def _prepareUFOSourceLayer(
        self,
        glyphName: str,
        source: GlyphSource,
        localDefaultLocation: dict[str, float],
        revLayerNameMapping: dict[str, str],
    ):
        baseLocation = {}
        if source.locationBase:
            dsSource = self.dsSources.findItem(identifier=source.locationBase)
            if dsSource is not None:
                baseLocation = dsSource.location
            elif self._implicitDefaultLocationBase is None:
                # We allow for ONE non-existing locationBase, as this may have come
                # from a single-file UFO
                self._implicitDefaultLocationBase = source.locationBase
            elif self._implicitDefaultLocationBase != source.locationBase:
                raise ValueError(
                    f"Unknown font source identifier: {source.locationBase}"
                )

        sourceLocation = baseLocation | localDefaultLocation | source.location
        sparseLocalLocation = {
            name: sourceLocation[name]
            for name, value in localDefaultLocation.items()
            if sourceLocation.get(name, value) != value
        }
        sourceLocation = {**self.defaultLocation, **sourceLocation}
        globalLocation = self._getGlobalPortionOfLocation(
            sourceLocation, localDefaultLocation
        )

        dsSource = self.dsSources.findItem(
            locationTuple=locationToTuple(globalLocation)
        )
        if dsSource is None:
            dsSource = self._createDSSourceForGlyph(
                glyphName,
                source.name,
                source.layerName,
                globalLocation,
            )
            self.dsSources.append(dsSource)
            self.dsDoc.sources.append(dsSource.asDSSourceDescriptor(self.familyName))
            self._writeDesignSpaceDocument()

        if sparseLocalLocation:
            layerName = revLayerNameMapping.get(source.layerName, source.layerName)
            ufoPath, layerName = self._findUFOForLayerName(
                layerName, dsSource.layer.path
            )
            assert dsSource.layer.path == ufoPath

            ufoLayer = self.ufoLayers.findItem(path=ufoPath, name=layerName)

            if ufoLayer is None:
                ufoLayer = self._createUFOLayer(
                    glyphName, ufoPath, layerName, source.layerName
                )
                ufoLayerName = ufoLayer.name
            else:
                ufoLayerName = ufoLayer.name
            normalizedSourceName = source.name
            normalizedLayerName = f"{dsSource.identifier}^{ufoLayerName}"
            defaultUFOLayerName = ufoLayer.reader.getDefaultLayerName()

            localSourceDict = {"name": source.name}
            if ufoLayerName != defaultUFOLayerName:
                localSourceDict["layername"] = ufoLayerName
            localSourceDict["location"] = makeSparseLocation(
                sourceLocation, {**self.defaultLocation, **localDefaultLocation}
            )
        else:
            normalizedSourceName = dsSource.name
            normalizedLayerName = dsSource.layer.fontraLayerName
            localSourceDict = None

        return SimpleNamespace(
            sourceName=normalizedSourceName,
            layerName=normalizedLayerName,
            localSourceDict=localSourceDict,
        )

    def _createDSSourceForGlyph(
        self,
        glyphName: str | None,
        sourceName: str,
        layerName: str,
        location: dict,
    ) -> DSSource:
        sourceIdentifier = makeDSSourceIdentifier(self.dsDoc, len(self.dsSources), None)

        _, notAtPole = splitLocationByPolePosition(location, self.axisPolePositions)

        if notAtPole:
            # Assume sparse source, add new layer to existing UFO
            poleDSSource = self._findDSSourceForSparseSource(location)
            ufoLayer = self._createUFOLayer(
                glyphName,
                poleDSSource.layer.path,
                layerName,
                sourceIdentifier,
                mustCreateNewLayer=True,
            )
        else:
            # New UFO
            ufoLayer = self._createUFO(sourceName, layerName)

        return DSSource(
            identifier=sourceIdentifier,
            name=sourceName,
            layer=ufoLayer,
            location=location,
            isSparse=notAtPole,
        )

    def _findDSSourceForSparseSource(self, location, dsSources=None):
        if dsSources is None:
            dsSources = self.dsSources
        atPole, _ = splitLocationByPolePosition(location, self.axisPolePositions)
        atPole = {**self.defaultLocation, **atPole}
        poleDSSource = dsSources.findItem(locationTuple=locationToTuple(atPole))
        if poleDSSource is None:
            poleDSSource = dsSources.findItem(isDefault=True)
            assert poleDSSource is not None

        return poleDSSource

    def _createUFO(self, sourceName: str, sourceIdentifier: str) -> UFOLayer:
        dsFileName = pathlib.Path(self.dsDoc.path).stem
        suggestedUFOFileName = f"{dsFileName}_{sourceName}"

        ufoPath = os.fspath(makeUniqueUFOPath(self.ufoDir, suggestedUFOFileName))

        reader = self.ufoManager.getReader(ufoPath)  # this creates the UFO
        info = UFOFontInfo()
        for infoAttr in ufoFontInfoAttributes:
            value = getattr(self.defaultFontInfo, infoAttr, None)
            if value is not None:
                setattr(info, infoAttr, value)
        reader.writeInfo(info)
        glyphSet = reader.getGlyphSet()  # this creates the default layer
        glyphSet.writeContents()
        reader.writeLayerContents()
        ufoLayerName = reader.getDefaultLayerName()
        assert os.path.isdir(ufoPath)

        ufoLayer = UFOLayer(
            manager=self.ufoManager,
            path=ufoPath,
            name=ufoLayerName,
            fontraLayerName=sourceIdentifier,
        )
        self.ufoLayers.append(ufoLayer)
        self._updatePathsToWatch()
        return ufoLayer

    def _createUFOLayer(
        self,
        glyphName: str | None,
        ufoPath: str,
        suggestedLayerName: str,
        fontraLayerName: str,
        mustCreateNewLayer: bool = False,
    ) -> UFOLayer:
        reader = self.ufoManager.getReader(ufoPath)
        existingLayerNames = set(reader.getLayerNames())
        ufoLayerName = suggestedLayerName
        count = 0

        if mustCreateNewLayer:
            while ufoLayerName in existingLayerNames:
                count += 1
                ufoLayerName = f"{suggestedLayerName}#{count}"
            # This creates the layer
            self.ufoManager.getGlyphSet(ufoPath, ufoLayerName)
        else:
            # getGlyphSet() will create the layer if it doesn't already exist
            while glyphName in self.ufoManager.getGlyphSet(ufoPath, ufoLayerName):
                # TODO: THIS IS NOT COVERED BY TESTS
                # The glyph already exists in the layer, which means there is
                # a conflict. Let's make up a layer name in which the glyph
                # does not exist.
                count += 1
                ufoLayerName = f"{suggestedLayerName}#{count}"

        if ufoLayerName not in existingLayerNames:
            reader.writeLayerContents()
            glyphSet = self.ufoManager.getGlyphSet(ufoPath, ufoLayerName)
            glyphSet.writeContents()

        ufoLayer = UFOLayer(
            manager=self.ufoManager,
            path=ufoPath,
            name=ufoLayerName,
            fontraLayerName=fontraLayerName,
        )
        self.ufoLayers.append(ufoLayer)

        return ufoLayer

    def _getGlobalPortionOfLocation(self, location, localAxisNames):
        fontAxisNames = self.axisNames
        globalLocation = {
            name: value
            for name, value in location.items()
            if name in fontAxisNames and name not in localAxisNames
        }
        return {**self.defaultLocation, **globalLocation}

    async def deleteGlyph(self, glyphName):
        if glyphName not in self.glyphMap:
            logger.debug(f"Can't delete unknown glyph '{glyphName}'")
            return

        for ufoLayer in self.ufoLayers:
            glyphSet = ufoLayer.glyphSet
            if glyphName in glyphSet:
                glyphSet.deleteGlyph(glyphName)
                # FIXME: this is inefficient if we write many glyphs
                glyphSet.writeContents()
                if ufoLayer.isDefaultLayer:
                    self.ensureGlyphNotInGlyphOrder(ufoLayer, glyphName)
        del self.glyphMap[glyphName]
        self.savedGlyphModificationTimes[glyphName] = {None}
        if self._glyphDependencies is not None:
            self._glyphDependencies.update(glyphName, ())

    async def getFontInfo(self) -> FontInfo:
        ufoInfo = self.defaultFontInfo
        info = {}
        for fontraName, ufoName in fontInfoNameMapping:
            value = getattr(ufoInfo, ufoName, None)
            if value is not None:
                info[fontraName] = value

        customData = {}
        for infoAttr in ufoInfoAttributesToRoundTripFamilyLevel:
            value = getattr(ufoInfo, infoAttr, None)
            if value is not None:
                customData[infoAttr] = value

        if customData:
            info["customData"] = customData

        return FontInfo(**info)

    async def putFontInfo(self, fontInfo: FontInfo):
        infoDict: dict[str, Any] = {}
        for fontraName, ufoName in fontInfoNameMapping:
            infoDict[ufoName] = getattr(fontInfo, fontraName, None)

        if fontInfo.familyName:
            self._familyName = fontInfo.familyName

        for infoAttr in ufoInfoAttributesToRoundTripFamilyLevel:
            infoDict[infoAttr] = fontInfo.customData.get(infoAttr)

        self._updateGlobalFontInfo(infoDict)

    async def getAxes(self) -> Axes:
        return Axes(axes=deepcopy(self.axes), mappings=deepcopy(self.axisMappings))

    async def putAxes(self, axes: Axes) -> None:
        self.dsDoc.axes = []
        self.dsDoc.axisMappings = []

        for axis in axes.axes:
            axisParameters = dict(
                name=axis.name,
                tag=axis.tag,
                default=axis.defaultValue,
                map=deepcopy(axis.mapping) if axis.mapping else None,
                axisLabels=packAxisLabels(axis.valueLabels),
                hidden=axis.hidden,
            )

            if isinstance(axis, FontAxis):
                axisParameters["minimum"] = axis.minValue
                axisParameters["maximum"] = axis.maxValue
            else:
                assert isinstance(axis, DiscreteFontAxis)
                axisParameters["values"] = axis.values

            self.dsDoc.addAxisDescriptor(**axisParameters)

        for mapping in axes.mappings:
            self.dsDoc.addAxisMappingDescriptor(
                description=mapping.description,
                groupDescription=mapping.groupDescription,
                inputLocation=mapping.inputLocation,
                outputLocation=mapping.outputLocation,
            )

        self.updateAxisInfo()
        self._writeDesignSpaceDocument()
        self.loadUFOLayers()

    async def getSources(self) -> dict[str, FontSource]:
        unitsPerEm = await self.getUnitsPerEm()
        return {
            dsSource.identifier: dsSource.asFontraFontSource(unitsPerEm)
            for dsSource in self.dsSources
        }

    async def putSources(self, sources: dict[str, FontSource]) -> None:
        newDSSources = ItemList()
        for sourceIdentifier, fontSource in sorted(
            sources.items(), key=lambda item: item[1].isSparse
        ):
            denseSourceLocation = makeDenseLocation(
                fontSource.location, self.defaultLocation
            )
            dsSource = self.dsSources.findItem(identifier=sourceIdentifier)

            if dsSource is None:
                # Revive previously deleted DSSource
                dsSource = self.zombieDSSources.pop(sourceIdentifier, None)

            if dsSource is None:
                # Fall back to search by location
                dsSource = self.dsSources.findItem(
                    locationTuple=locationToTuple(denseSourceLocation)
                )

            if dsSource is not None:
                if dsSource.isDefault and dsSource.isSparse:
                    raise ValueError("The default source cannot be sparse")
                if not fontSource.isSparse and dsSource.mustBeSparse:
                    raise ValueError(
                        "A source using a non-default UFO layer cannot be made not sparse"
                    )
                dsSource = replace(
                    dsSource,
                    identifier=sourceIdentifier,
                    name=fontSource.name,
                    location=denseSourceLocation,
                    isSparse=fontSource.isSparse,
                )
            else:
                if not fontSource.isSparse:
                    # Create a whole new UFO
                    ufoLayer = self._createUFO(fontSource.name, sourceIdentifier)
                else:
                    # Create a new layer in the appropriate existing UFO
                    poleDSSource = self._findDSSourceForSparseSource(
                        denseSourceLocation, newDSSources
                    )
                    ufoLayer = self._createUFOLayer(
                        None, poleDSSource.layer.path, fontSource.name, sourceIdentifier
                    )

                dsSource = DSSource(
                    identifier=sourceIdentifier,
                    name=fontSource.name,
                    layer=ufoLayer,
                    location=denseSourceLocation,
                    isDefault=denseSourceLocation == self.defaultLocation,
                    isSparse=fontSource.isSparse,
                )

            if not dsSource.isSparse:
                updateFontInfoFromFontSource(dsSource.layer.reader, fontSource)
                self.fileWatcherIgnoreNextChange(
                    os.path.join(dsSource.layer.path, FONTINFO_FILENAME)
                )
                self.fileWatcherIgnoreNextChange(
                    os.path.join(dsSource.layer.path, LIB_FILENAME)
                )

            newDSSources.append(dsSource)

        if not newDSSources:
            fallbackDefaultSource = self.dsSources.findItem(isDefault=True)
            if fallbackDefaultSource is not None:
                newDSSources.append(fallbackDefaultSource)

        self.zombieDSSources.update(
            {s.identifier: s for s in self.dsSources if s.identifier not in sources}
        )

        self.dsSources = newDSSources

        # Prune layers
        newLayers = ItemList()
        for dsSource in newDSSources:
            newLayers.append(dsSource.layer)
        self.ufoLayers = newLayers

        axisOrder = [axis.name for axis in self.dsDoc.axes]
        newSourceDescriptors = [
            source.asDSSourceDescriptor(self.familyName) for source in newDSSources
        ]
        self.dsDoc.sources = sortedSourceDescriptors(
            newSourceDescriptors, self.dsDoc.sources, axisOrder
        )

        self._addNonSourceLayers()

        self._writeDesignSpaceDocument()

        await self.fileWatcherNotifyCallbacks({"glyphs": None})

    async def getUnitsPerEm(self) -> int:
        return self.defaultFontInfo.unitsPerEm

    async def putUnitsPerEm(self, value: int) -> None:
        self._updateGlobalFontInfo({"unitsPerEm": value})

    def _updateGlobalFontInfo(self, infoDict: dict) -> None:
        _updateFontInfoFromDict(self.defaultFontInfo, infoDict)
        ufoPaths = sorted(set(self.ufoLayers.iterAttrs("path")))
        for ufoPath in ufoPaths:
            reader = self.ufoManager.getReader(ufoPath)
            info = UFOFontInfo()
            reader.readInfo(info)
            _updateFontInfoFromDict(info, infoDict)
            reader.writeInfo(info)
            self.fileWatcherIgnoreNextChange(os.path.join(ufoPath, FONTINFO_FILENAME))

    async def getKerning(self) -> dict[str, Kerning]:
        groups: dict[str, list[str]] = {}
        dsSources = [dsSource for dsSource in self.dsSources if not dsSource.isSparse]
        sourceIdentifiers = [dsSource.identifier for dsSource in dsSources]
        valueDicts: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(dict))

        # TODO: fixup RTL kerning
        # Context: UFO3's kern direction is "writing direction", but I want kerning
        # in Fontra to be "visial left to right", as that is much easier to manage.
        for dsSource in dsSources:
            groups = mergeKernGroups(groups, dsSource.layer.reader.readGroups())
            sourceKerning = dsSource.layer.reader.readKerning()

            for (leftKey, rightKey), value in sourceKerning.items():
                valueDicts[leftKey][rightKey][dsSource.identifier] = value

        values = {
            adjustGroupPrefix(left): {
                adjustGroupPrefix(right): [
                    valueDict.get(key) for key in sourceIdentifiers
                ]
                for right, valueDict in rightDict.items()
            }
            for left, rightDict in valueDicts.items()
        }

        groupsSide1, groupsSide2 = splitGroups(groups)

        kerning = Kerning(
            groupsSide1=groupsSide1,
            groupsSide2=groupsSide2,
            sourceIdentifiers=sourceIdentifiers,
            values=values,
        )

        return {"kern": kerning}

    async def putKerning(self, kerning: dict[str, Kerning]) -> None:
        for kernType, kerningTable in kerning.items():
            sourceIdentifiers = kerningTable.sourceIdentifiers

            dsSources = [
                self.dsSources.findItem(identifier=sourceIdentifier)
                for sourceIdentifier in sourceIdentifiers
            ]

            unknownSourceIdentifiers = [
                sourceIdentifier
                for sourceIdentifier, dsSource in zip(sourceIdentifiers, dsSources)
                if dsSource is None
            ]

            if unknownSourceIdentifiers:
                raise ValueError(
                    f"kerning uses unknown source identifiers: {unknownSourceIdentifiers}"
                )

            if any(dsSource.isSparse for dsSource in dsSources):
                sparseIdentifiers = [
                    dsSource.identifier for dsSource in dsSources if dsSource.isSparse
                ]
                raise ValueError(
                    f"can't write kerning to sparse sources: {sparseIdentifiers}"
                )

            kerningPerSource: dict = defaultdict(dict)

            for left, rightDict in kerningTable.values.items():
                left = "public.kern1." + left[1:] if left.startswith("@") else left
                for right, values in rightDict.items():
                    right = (
                        "public.kern2." + right[1:] if right.startswith("@") else right
                    )
                    for sourceIdentifier, value in zip(sourceIdentifiers, values):
                        if value is not None:
                            kerningPerSource[sourceIdentifier][left, right] = value

            for dsSource in self.dsSources:
                if dsSource.isSparse:
                    continue
                if kernType == "kern":
                    groups = prefixGroups(
                        kerningTable.groupsSide1, "public.kern1."
                    ) | prefixGroups(kerningTable.groupsSide2, "public.kern2.")
                    dsSource.layer.reader.writeGroups(groups)
                    ufoKerning = kerningPerSource.get(dsSource.identifier, {})
                    dsSource.layer.reader.writeKerning(ufoKerning)
                    self.fileWatcherIgnoreNextChange(
                        os.path.join(dsSource.layer.path, GROUPS_FILENAME)
                    )
                    self.fileWatcherIgnoreNextChange(
                        os.path.join(dsSource.layer.path, KERNING_FILENAME)
                    )
                else:
                    # TODO: store in lib
                    logger.error(
                        "kerning types other than 'kern' are not yet implemented for UFO"
                    )

    async def getFeatures(self) -> OpenTypeFeatures:
        return self._getFeaturesSync()

    def _getFeaturesSync(self) -> OpenTypeFeatures:
        ufoFeatureText = self.defaultReader.readFeatures()
        featureText = resolveFeatureIncludes(
            ufoFeatureText, self.ufoDir, set(self.glyphMap)
        )
        if featureText != ufoFeatureText:
            featureText = featuresWarning + featureText
        return OpenTypeFeatures(language="fea", text=featureText)

    async def putFeatures(self, features: OpenTypeFeatures) -> None:
        if features.language != "fea":
            logger.warning(
                f"skip writing features in unsupported language: {features.language!r}"
            )
            return

        paths = sorted(set(self.ufoLayers.iterAttrs("path")))
        defaultPath = self.defaultUFOLayer.path if paths else None
        for path in paths:
            writer = self.ufoManager.getReader(path)
            featureText = features.text if path == defaultPath else ""
            writer.writeFeatures(featureText)
            self.fileWatcherIgnoreNextChange(os.path.join(path, FEATURES_FILENAME))

    async def getBackgroundImage(self, imageIdentifier: str) -> ImageData | None:
        imageInfo = self._imageMapping.reverse.get(imageIdentifier)
        if imageInfo is None:
            return None

        ufoPath, imageFileName = imageInfo
        reader = self.ufoManager.getReader(ufoPath)

        try:
            data = reader.readImage(imageFileName, validate=True)
        except UFOLibError as e:
            logger.warning(str(e))
            return None

        return ImageData(type=ImageType.PNG, data=data)

    async def putBackgroundImage(self, imageIdentifier: str, data: ImageData) -> None:
        if data.type != ImageType.PNG:
            data = convertImageData(data, ImageType.PNG)

        imageInfo = self._imageMapping.reverse.get(imageIdentifier)
        if imageInfo is None:
            # We don't yet know in which layer to write this image, let's postpone
            # until putGlyph() comes across it.
            self._imageDataToWrite[imageIdentifier] = data
        else:
            ufoPath, imageFileName = self._imageMapping.reverse[imageIdentifier]
            reader = self.ufoManager.getReader(ufoPath)
            reader.writeImage(imageFileName, data.data, validate=True)

    def _getImageIdentifier(self, ufoPath: str, imageFileName: str) -> str:
        key = (ufoPath, imageFileName)
        imageIdentifier = self._imageMapping.get(key)

        if imageIdentifier is None:
            ufoFileName = os.path.basename(ufoPath)
            imageIdentifier = str(
                uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"https://fontra.xyz/image-ids/{ufoFileName}/{imageFileName}",
                )
            )
            self._imageMapping[key] = imageIdentifier

        return imageIdentifier

    async def getCustomData(self) -> dict[str, Any]:
        return deepcopy(self.dsDoc.lib)

    async def putCustomData(self, lib):
        self.dsDoc.lib = deepcopy(lib)
        self._writeDesignSpaceDocument()

    def _writeDesignSpaceDocument(self):
        for source in self.dsDoc.sources:
            source.location = {**self.defaultLocation, **source.location}
        self.dsDoc.write(self.dsDoc.path)
        self.fileWatcherIgnoreNextChange(self.dsDoc.path)

    def fileWatcherWasInstalled(self):
        self._updatePathsToWatch()

    def _updatePathsToWatch(self):
        paths = sorted(set(self.ufoLayers.iterAttrs("path")))
        if self.dsDoc.path:
            paths.append(self.dsDoc.path)

        self.fileWatcherSetPaths(paths)

    async def fileWatcherProcessChanges(
        self, changes: set[tuple[Change, str]]
    ) -> dict[str, Any] | None:
        changedItems = await self._analyzeExternalChanges(changes)
        if changedItems is None:
            # The .designspace file changed, or a .ufo was replaced: reload all the things
            self._reloadEverything()
            return None

        glyphMapUpdates: dict[str, list[int] | None] = {}

        # TODO: update glyphMap for changed non-new glyphs

        for glyphName in changedItems.newGlyphs | changedItems.changedGlyphs:
            try:
                glifData = self.defaultDSSource.layer.glyphSet.getGLIF(glyphName)
            except KeyError:
                logger.info(f"new glyph '{glyphName}' not found in default source")
                continue
            gn, codePoints = extractGlyphNameAndCodePoints(glifData)
            if self.glyphMap.get(glyphName) != codePoints:
                glyphMapUpdates[glyphName] = codePoints

        for glyphName in changedItems.deletedGlyphs:
            if glyphName in self.glyphMap:
                glyphMapUpdates[glyphName] = None

        reloadPattern = changedItems.reloadPattern
        if changedItems.changedGlyphs:
            reloadPattern["glyphs"] = dict.fromkeys(changedItems.changedGlyphs)

        if glyphMapUpdates:
            reloadPattern["glyphMap"] = None
            for glyphName, updatedCodePoints in glyphMapUpdates.items():
                if updatedCodePoints is None:
                    del self.glyphMap[glyphName]
                else:
                    self.glyphMap[glyphName] = updatedCodePoints

        return reloadPattern

    async def _analyzeExternalChanges(self, changes) -> SimpleNamespace | None:
        if any(
            os.path.splitext(path)[1] in {".designspace", ".ufo"} for _, path in changes
        ):
            # .designspace or whole .ufo changed externally, reload all the things
            return None

        changedItems = SimpleNamespace(
            reloadPattern={},
            changedGlyphs=set(),
            newGlyphs=set(),
            deletedGlyphs=set(),
            rebuildGlyphSetContents=False,
        )

        for change, path in sorted(changes):
            fileName = os.path.basename(path)
            _, fileSuffix = os.path.splitext(fileName)

            if fileSuffix == ".glif":
                self._analyzeExternalGlyphChanges(change, path, changedItems)

            if fileName == FONTINFO_FILENAME:
                changedItems.reloadPattern["fontInfo"] = None
                changedItems.reloadPattern["sources"] = None
                self._defaultFontInfo = None

            if fileName in {KERNING_FILENAME, GROUPS_FILENAME}:
                changedItems.reloadPattern["kerning"] = None

            if fileName == FEATURES_FILENAME:
                changedItems.reloadPattern["features"] = None

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
        glyphWasDeleted = False
        glyphIsNew = False
        rebuildGlyphSetContents = False

        if change == Change.deleted:
            # Deleted glyph
            rebuildGlyphSetContents = True
            if path.startswith(os.path.join(self.dsDoc.default.path, "glyphs/")):
                # The glyph was deleted from the default source,
                # do a full delete
                glyphWasDeleted = True
            # else:
            # The glyph was deleted from a non-default source,
            # just reload.
        elif change == Change.added:
            # New glyph
            rebuildGlyphSetContents = True
            if glyphName is None:
                with open(path, "rb") as f:
                    glyphName, _ = extractGlyphNameAndCodePoints(f.read())

                glyphIsNew = True
        else:
            # Changed glyph
            assert change == Change.modified

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
        if savedMTimes is None or mtime not in savedMTimes:
            logger.info(f"external change '{glyphName}'")
            if glyphWasDeleted:
                del self.glifFileNames[fileName]
                changedItems.deletedGlyphs.add(glyphName)
            elif glyphIsNew:
                self.glifFileNames[fileName] = glyphName
                changedItems.newGlyphs.add(glyphName)
            if rebuildGlyphSetContents:
                changedItems.rebuildGlyphSetContents = True
            changedItems.changedGlyphs.add(glyphName)


@singledispatch
def unpackDSAxis(dsAxis: AxisDescriptor):
    axis = FontAxis(
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
    axis = DiscreteFontAxis(
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


# def getPostscriptBlueValues(fontInfo):
#     blueValues = getattr(fontInfo, "postscriptBlueValues", [])
#     otherBluesValue = getattr(fontInfo, "postscriptOtherBlues", [])
#     values = blueValues + otherBluesValue
#     return sorted(values)


# def getZone(value, blueValues):
#     if len(blueValues) % 2:
#         # ensure the list has an even number of items
#         blueValues = blueValues[:-1]

#     for i in range(0, len(blueValues), 2):
#         blueValue = blueValues[i]
#         nextBlueValue = blueValues[i + 1]
#         if value == blueValue:
#             return nextBlueValue - blueValue
#         elif value == nextBlueValue:
#             return blueValue - nextBlueValue
#     return 0


class UFOBackend(DesignspaceBackend):
    @classmethod
    def fromPath(cls, path):
        dsDoc = DesignSpaceDocument()
        dsDoc.addSourceDescriptor(
            name="default", path=os.fspath(path), styleName="Regular"
        )
        return cls(dsDoc)

    @classmethod
    def createFromPath(cls, path):
        path = pathlib.Path(path).resolve()
        if path.is_dir():
            shutil.rmtree(path)
        elif path.exists():
            path.unlink()
        dsDoc = createDSDocFromUFOPath(path, "Regular")
        return cls(dsDoc)

    def _reloadEverything(self) -> None:
        self._initialize(self.dsDoc)

    async def getCustomData(self) -> dict[str, Any]:
        return self.defaultReader.readLib()

    async def putCustomData(self, lib):
        self.defaultReader.writeLib(lib)
        self.fileWatcherIgnoreNextChange(
            os.path.join(self.defaultUFOLayer.path, LIB_FILENAME)
        )

    async def putAxes(self, axes):
        if axes.axes or axes.mappings:
            raise ValueError("The single-UFO backend does not support variation axes")

    async def putSources(self, sources: dict[str, FontSource]) -> None:
        if len(sources) > 1:
            logger.warning("The single-UFO backend does not support multiple sources")
        else:
            await super().putSources(sources)

    def _writeDesignSpaceDocument(self):
        pass


def createDSDocFromUFOPath(ufoPath, styleName):
    ufoPath = os.fspath(ufoPath)
    assert not os.path.exists(ufoPath)
    writer = UFOReaderWriter(ufoPath)  # this creates the UFO
    info = UFOFontInfo()
    _updateFontInfoFromDict(info, defaultUFOInfoAttrs)
    writer.writeInfo(info)
    glyphSet = writer.getGlyphSet()  # this creates the default layer
    glyphSet.writeContents()
    writer.writeLayerContents()
    assert os.path.isdir(ufoPath)

    dsDoc = DesignSpaceDocument()
    dsDoc.addSourceDescriptor(
        name="default", styleName=styleName, path=ufoPath, location={}
    )
    return dsDoc


def _updateFontInfoFromDict(fontInfo: UFOFontInfo, infoDict: dict):
    # set attribute
    for infoAttr, value in infoDict.items():
        if value is None or value == "":
            if hasattr(fontInfo, infoAttr):
                delattr(fontInfo, infoAttr)
        else:
            setattr(fontInfo, infoAttr, value)


@dataclass(kw_only=True)
class UFOGlyph:
    unicodes: list = field(default_factory=list)
    width: float | None = 0
    height: float | None = None
    anchors: list = field(default_factory=list)
    guidelines: list = field(default_factory=list)
    image: dict | None = None
    note: str | None = None
    lib: dict = field(default_factory=dict)


class UFOFontInfo:
    unitsPerEm = 1000
    guidelines: list = []


class UFOManager:
    @cache
    def getReader(self, path: str, createIfNeeded: bool = True) -> UFOReaderWriter:
        if not createIfNeeded and not os.path.exists(path):
            raise FileNotFoundError(path)
        return UFOReaderWriter(path)

    @cache
    def getGlyphSet(self, path: str, layerName: str) -> GlyphSet:
        return self.getReader(path).getGlyphSet(layerName, defaultLayer=False)


@dataclass(kw_only=True, frozen=True)
class DSSource:
    identifier: str
    name: str
    layer: UFOLayer
    location: dict[str, float]
    isDefault: bool = False
    isSparse: bool = False

    @cached_property
    def locationTuple(self):
        return locationToTuple(self.location)

    def asFontraFontSource(self, unitsPerEm: int) -> FontSource:
        customData = {}
        if self.isSparse:
            lineMetricsHorizontalLayout: dict[str, LineMetric] = {}
            lineMetricsVerticalLayout: dict[str, LineMetric] = {}
            guidelines = []
            italicAngle = 0
        else:
            fontInfo = UFOFontInfo()
            self.layer.reader.readInfo(fontInfo)
            lib = self.layer.reader.readLib()
            zones = lib.get(LINE_METRICS_HOR_ZONES_KEY, {})

            lineMetricsHorizontalLayout = {}
            for name, defaultFactor in lineMetricsHorDefaults.items():
                value = 0 if name == "baseline" else getattr(fontInfo, name, None)
                if value is None:
                    value = round(defaultFactor["value"] * unitsPerEm)
                zone = zones.get(name)
                if zone is None:
                    zone = round(defaultFactor["zone"] * unitsPerEm)
                lineMetricsHorizontalLayout[name] = LineMetric(value=value, zone=zone)

            lineMetricsVerticalLayout = {}
            for fontraName, ufoName in lineMetricsVerMapping.items():
                value = getattr(fontInfo, ufoName, None)
                if value is not None:
                    lineMetricsVerticalLayout[fontraName] = LineMetric(value=value)

            guidelines = unpackGuidelines(fontInfo.guidelines, lib)
            italicAngle = getattr(fontInfo, "italicAngle", 0)

            for infoAttr in ufoInfoAttributesToRoundTrip:
                value = getattr(fontInfo, infoAttr, None)
                if value is not None:
                    customData[infoAttr] = value

        return FontSource(
            name=self.name,
            location=self.location,
            italicAngle=italicAngle,
            lineMetricsHorizontalLayout=lineMetricsHorizontalLayout,
            lineMetricsVerticalLayout=lineMetricsVerticalLayout,
            guidelines=guidelines,
            isSparse=self.isSparse,
            customData=customData,
        )

    def asFontraGlyphSource(self, localDefaultOverride=None):
        if localDefaultOverride is None:
            localDefaultOverride = {}
        return GlyphSource(
            name=self.name if localDefaultOverride else "",
            locationBase=self.identifier,
            location={**localDefaultOverride},
            layerName=self.layer.fontraLayerName,
        )

    def asDSSourceDescriptor(self, familyName) -> SourceDescriptor:
        defaultLayerName = self.layer.reader.getDefaultLayerName()
        ufoLayerName = (
            self.layer.name
            if (
                self.layer.name != defaultLayerName
                or (self.isSparse and not self.isDefault)
            )
            else None
        )
        return SourceDescriptor(
            name=self.identifier,
            styleName=self.name,
            familyName=familyName,
            location=self.location,
            path=self.layer.path,
            layerName=ufoLayerName,
        )

    @property
    def mustBeSparse(self):
        return not self.layer.isDefaultLayer


@dataclass(kw_only=True, frozen=True)
class UFOLayer:
    manager: UFOManager
    path: str
    name: str
    fontraLayerName: str
    originalGlyphOrderMapping: dict[str, int] = field(default_factory=dict)

    @cached_property
    def fileName(self) -> str:
        return os.path.splitext(os.path.basename(self.path))[0]

    @cached_property
    def reader(self) -> UFOReaderWriter:
        return self.manager.getReader(self.path)

    @cached_property
    def glyphSet(self) -> GlyphSet:
        return self.manager.getGlyphSet(self.path, self.name)

    @cached_property
    def isDefaultLayer(self) -> bool:
        assert self.name
        return self.name == self.reader.getDefaultLayerName()


class ItemList:
    def __init__(self):
        self.items = []
        self.invalidateCache()

    def __iter__(self):
        return iter(self.items)

    def __len__(self):
        return len(self.items)

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


class DoubleDict(dict):
    def __init__(self):
        self.reverse = {}

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        self.reverse[value] = key

    def __delitem__(self, key):
        raise NotImplementedError()

    def pop(self, *args, **kwargs):
        raise NotImplementedError()

    def setdefault(self, *args, **kwargs):
        raise NotImplementedError()


def ufoLayerToStaticGlyph(glyphSet, glyphName, penClass=PackedPathPointPen):
    glyph = UFOGlyph()
    pen = penClass()
    glyphSet.readGlyph(glyphName, glyph, pen, validate=False)
    components = [*pen.components] + unpackVariableComponents(glyph.lib)
    verticalOrigin = glyph.lib.get("public.verticalOrigin")
    staticGlyph = StaticGlyph(
        path=pen.getPath(),
        components=components,
        xAdvance=glyph.width,
        yAdvance=(
            glyph.height if glyph.height else None
        ),  # Default height in UFO is 0 :-(
        verticalOrigin=verticalOrigin,
        anchors=unpackAnchors(glyph.anchors),
        guidelines=unpackGuidelines(glyph.guidelines, glyph.lib),
        backgroundImage=unpackBackgroundImage(glyph.image),
    )

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


def unpackAnchors(anchors):
    return [Anchor(name=a.get("name"), x=a["x"], y=a["y"]) for a in anchors]


def unpackGuidelines(guidelines, lib):
    return [
        Guideline(
            name=g.get("name"),
            x=g.get("x", 0),
            y=g.get("y", 0),
            angle=g.get("angle", 0),
            locked=(
                lib.get(RF_GUIDELINE_LOCK_LIB_PREFIX + g["identifier"], False)
                if "identifier" in g
                else False
            ),
            # TODO: Guidelines, how do we handle customData like:
            # color=g.get("color"),
            # identifier=g.get("identifier"),
        )
        for g in guidelines
    ]


imageTransformFields = [
    ("xScale", 1),
    ("xyScale", 0),
    ("yxScale", 0),
    ("yScale", 1),
    ("xOffset", 0),
    ("yOffset", 0),
]


def unpackBackgroundImage(imageDict: dict | None) -> BackgroundImage | None:
    if imageDict is None:
        return None

    t = Transform(*(imageDict.get(k, dv) for k, dv in imageTransformFields))
    colorChannels = (
        [float(ch.strip()) for ch in imageDict["color"].split(",")]
        if "color" in imageDict
        else None
    )

    opacity = 1.0

    if colorChannels:
        if len(colorChannels) == 4:
            opacity = colorChannels[3]
            if colorChannels[:3] != [0, 0, 0]:
                colorChannels[3] = 1.0
            else:
                colorChannels = None
        else:
            colorChannels = None

    return BackgroundImage(
        identifier=imageDict["fileName"],
        transformation=DecomposedTransform.fromTransform(t),
        opacity=opacity,
        color=RGBAColor(*colorChannels) if colorChannels else None,
    )


def packBackgroundImage(backgroundImage, imageFileName) -> dict:
    imageDict = {"fileName": imageFileName}

    t = backgroundImage.transformation.toTransform()
    for (fieldName, default), value in zip(imageTransformFields, t):
        if value != default:
            imageDict[fieldName] = value

    if backgroundImage.color is not None:
        c = backgroundImage.color
        imageDict["color"] = ",".join(
            _formatChannelValue(ch)
            for ch in [c.red, c.green, c.blue, backgroundImage.opacity]
        )
    elif backgroundImage.opacity != 1.0:
        imageDict["color"] = f"0,0,0,{_formatChannelValue(backgroundImage.opacity)}"

    return imageDict


def _formatChannelValue(ch):
    s = f"{ch:0.5f}"
    s = s.rstrip("0")
    s = s.rstrip(".")
    return s


def packGuidelines(guidelines, lib):
    for key in list(lib):
        if key.startswith(RF_GUIDELINE_LOCK_LIB_PREFIX):
            del lib[key]
    packedGuidelines = []
    for index, g in enumerate(guidelines):
        identifier = f"fontra-guideline-{index}"
        pg = {}
        if g.name is not None:
            pg["name"] = g.name
        pg["x"] = g.x
        pg["y"] = g.y
        pg["angle"] = g.angle
        if g.locked:
            lib[RF_GUIDELINE_LOCK_LIB_PREFIX + identifier] = True
            pg["identifier"] = identifier
        packedGuidelines.append(pg)
    return packedGuidelines


def readGlyphOrCreate(
    glyphSet: GlyphSet,
    glyphName: str,
    codePoints: list[int],
) -> UFOGlyph:
    layerGlyph = UFOGlyph()
    if glyphName in glyphSet:
        # We read the existing glyph so we don't lose any data that
        # Fontra doesn't understand
        glyphSet.readGlyph(glyphName, layerGlyph, validate=False)
    layerGlyph.unicodes = codePoints
    return layerGlyph


def populateUFOLayerGlyph(
    layerGlyph: UFOGlyph,
    staticGlyph: StaticGlyph,
    forceVariableComponents: bool = False,
    imageFileName: str | None = None,
) -> Callable[[AbstractPointPen], None]:
    pen = RecordingPointPen()

    layerGlyph.width = staticGlyph.xAdvance
    if staticGlyph.yAdvance is not None:
        layerGlyph.height = staticGlyph.yAdvance
    if staticGlyph.verticalOrigin is not None:
        layerGlyph.lib["public.verticalOrigin"] = staticGlyph.verticalOrigin

    staticGlyph.path.drawPoints(pen)
    variableComponents = []
    layerGlyph.anchors = [
        {"name": a.name, "x": a.x, "y": a.y} for a in staticGlyph.anchors
    ]
    layerGlyph.guidelines = packGuidelines(staticGlyph.guidelines, layerGlyph.lib)

    if staticGlyph.backgroundImage is not None and imageFileName is not None:
        layerGlyph.image = packBackgroundImage(
            staticGlyph.backgroundImage, imageFileName
        )
    else:
        layerGlyph.image = None

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
        gn, codePoints = extractGlyphNameAndCodePoints(glifData)
        assert gn == glyphName, (gn, glyphName)
        glyphMap[glyphName] = codePoints
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


def makeUniqueUFOPath(ufoDir, suggestedUFOFileName):
    makeUniqueFileName = uniqueNameMaker(p.stem for p in ufoDir.glob("*.ufo"))
    ufoFileName = makeUniqueFileName(suggestedUFOFileName)
    ufoFileName = ufoFileName + ".ufo"
    ufoPath = ufoDir / ufoFileName
    assert not ufoPath.exists()
    return ufoPath


def cleanupTransform(t):
    """Convert any integer float values into ints. This is to prevent glifLib
    from writing float values that can be integers."""
    return tuple(int(v) if int(v) == v else v for v in t)


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


class ComponentsOnlyPointPen(PackedPathPointPen):
    def beginPath(self, **kwargs) -> None:
        pass

    def addPoint(self, pt, segmentType=None, smooth=False, *args, **kwargs) -> None:
        pass

    def endPath(self) -> None:
        pass


async def extractGlyphDependenciesFromUFO(
    ufoPath: str, layerName: str
) -> GlyphDependencies:
    componentInfo = await runInSubProcess(
        _extractComponentInfoFromUFO, ufoPath, layerName
    )
    dependencies = GlyphDependencies()
    for glyphName, componentNames in componentInfo.items():
        dependencies.update(glyphName, componentNames)
    return dependencies


def _extractComponentInfoFromUFO(ufoPath: str, layerName: str) -> dict[str, set[str]]:
    reader = UFOReader(ufoPath)
    glyphSet = reader.getGlyphSet(layerName=layerName)
    componentInfo = {}
    for glyphName in glyphSet.keys():
        glyph, _ = ufoLayerToStaticGlyph(
            glyphSet, glyphName, penClass=ComponentsOnlyPointPen
        )
        if glyph.components:
            componentInfo[glyphName] = {compo.name for compo in glyph.components}
    return componentInfo


def componentNamesFromGlyph(glyph):
    return {
        compo.name
        for layer in glyph.layers.values()
        for compo in layer.glyph.components
    }


def resolveFeatureIncludes(featureText, includeDir, glyphNames):
    if "include" in featureText:
        from io import StringIO

        from fontTools.feaLib.parser import Parser

        f = StringIO(featureText)
        p = Parser(f, includeDir=includeDir, glyphNames=glyphNames)
        ff = p.parse()
        featureText = ff.asFea()

    return featureText


def ensureDSSourceNamesAreUnique(dsDoc):
    sourceNames = {
        source.name
        for source in dsDoc.sources
        if source.name and not source.name.startswith("temp_master.")
    }

    if len(sourceNames) == len(dsDoc.sources):
        return dsDoc

    dsDoc = deepcopy(dsDoc)

    usedSourceNames = set()
    for i, source in enumerate(dsDoc.sources):
        if source.name and source.name.startswith("temp_master."):
            source.name = None

        source.name = makeDSSourceIdentifier(
            dsDoc,
            i,
            source.name,
            usedSourceNames,
        )
        usedSourceNames.add(source.name)

    return dsDoc


def makeDSSourceIdentifier(
    dsDoc, sourceIndex, originalSourceName, usedSourceNames=None
):
    usedSourceNames = (
        {source.name for source in dsDoc.sources if source.name}
        if usedSourceNames is None
        else usedSourceNames
    )

    if originalSourceName is None:
        originalSourceName = ""

    sourceName = originalSourceName
    counter = 0

    while not sourceName or sourceName in usedSourceNames:
        counterString = f"#{counter}" if counter else ""
        sourceName = originalSourceName + f"::fontra{sourceIndex:03}{counterString}"
        counter += 1

    return sourceName


def getDefaultSourceName(
    glyph: VariableGlyph, defaultLocation: dict[str, float], sourceName: str
) -> str:
    sourceName
    for glyphSource in glyph.sources:
        if (
            not glyphSource.inactive
            and makeDenseLocation(glyphSource.location, defaultLocation)
            == defaultLocation
        ):
            sourceName = glyphSource.name
            break
    return sourceName


def updateFontInfoFromFontSource(reader, fontSource):
    fontInfo = UFOFontInfo()
    reader.readInfo(fontInfo)

    zones = {}
    for name, metric in fontSource.lineMetricsHorizontalLayout.items():
        if name in lineMetricsHorDefaults:
            if name != "baseline":
                setattr(fontInfo, name, metric.value)
            if metric.zone:
                zones[name] = metric.zone
        else:
            # TODO: store in lib
            pass

    for name, metric in fontSource.lineMetricsVerticalLayout.items():
        ufoName = lineMetricsVerMapping.get(name)
        if ufoName is not None:
            setattr(fontInfo, ufoName, round(metric.value))

    fontInfo.italicAngle = fontSource.italicAngle

    lib = reader.readLib()

    fontInfo.guidelines = packGuidelines(fontSource.guidelines, lib)

    # set custom data
    for infoAttr, value in fontSource.customData.items():
        setattr(fontInfo, infoAttr, value)

    # delete custom data
    for infoAttr in ufoInfoAttributesToRoundTrip:
        if infoAttr not in fontSource.customData.keys():
            if hasattr(fontInfo, infoAttr):
                delattr(fontInfo, infoAttr)

    reader.writeInfo(fontInfo)

    if zones:
        lib[LINE_METRICS_HOR_ZONES_KEY] = zones
    else:
        lib.pop(LINE_METRICS_HOR_ZONES_KEY, None)
    reader.writeLib(lib)


def sortedSourceDescriptors(newSourceDescriptors, oldSourceDescriptors, axisOrder):
    """Sort `newSourceDescriptors` as much as possible like `oldSourceDescriptors`,
    sort non-matching by location.
    """
    newSourceDescriptors = sorted(
        newSourceDescriptors,
        key=lambda source: [source.location[axisName] for axisName in axisOrder],
    )

    sourceOrderBuckets = {None: []}
    sourceOrderBuckets.update(
        {oldSource.name: [] for oldSource in oldSourceDescriptors}
    )

    currentBucket = sourceOrderBuckets[None]
    for source in newSourceDescriptors:
        nextBucket = sourceOrderBuckets.get(source.name)
        if nextBucket is not None:
            currentBucket = nextBucket
        currentBucket.append(source)

    sortedSourceDescriptors = []
    for bucket in sourceOrderBuckets.values():
        sortedSourceDescriptors.extend(bucket)
    assert len(sortedSourceDescriptors) == len(newSourceDescriptors)
    assert {s.name for s in sortedSourceDescriptors} == {
        s.name for s in newSourceDescriptors
    }
    return sortedSourceDescriptors


def mergeKernGroups(
    groupsA: dict[str, list[str]], groupsB: dict[str, list[str]]
) -> dict[str, list[str]]:
    mergedGroups = {}

    for groupName in sorted(set(groupsA) | set(groupsB)):
        gA = groupsA.get(groupName)
        gB = groupsB.get(groupName)
        if gA is None:
            assert gB is not None
            mergedGroups[groupName] = gB
        elif gB is None:
            mergedGroups[groupName] = gA
        else:
            if gA == gB:
                mergedGroups[groupName] = gA
            else:
                gASet = set(gA)
                mergedGroups[groupName] = gA + [n for n in gB if n not in gASet]

    return mergedGroups


def convertImageData(data, type):
    import io

    from PIL import Image

    image = Image.open(io.BytesIO(data.data))
    if image.mode == "RGBA" and type == ImageType.JPEG:
        # from https://stackoverflow.com/questions/9166400/convert-rgba-png-to-rgb-with-pil
        image.load()  # required for image.split()
        imageJPEG = Image.new("RGB", image.size, (255, 255, 255))
        imageJPEG.paste(image, mask=image.split()[3])  # 3 is the alpha channel
        image = imageJPEG

    outFile = io.BytesIO()
    image.save(outFile, type)
    return ImageData(type=type, data=outFile.getvalue())


def adjustGroupPrefix(kernPairName: str) -> str:
    if kernPairName.startswith(("public.kern1.", "public.kern2.")):
        return "@" + kernPairName[13:]
    return kernPairName


def addLeftPrefix(kernPairName: str) -> str:
    return replacePrefix(kernPairName, "@", "public.kern1.")


def addRightPrefix(kernPairName: str) -> str:
    return replacePrefix(kernPairName, "@", "public.kern2.")


def replacePrefix(s: str, oldPrefix: str, newPrefix: str) -> str:
    return newPrefix + s[len(oldPrefix) :] if s.startswith(oldPrefix) else s


def prefixGroups(groups, prefix):
    return {prefix + groupName: glyphNames for groupName, glyphNames in groups.items()}


def splitGroups(
    groups: dict[str, list[str]],
) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    groupsSide1 = {}
    groupsSide2 = {}

    for groupName, glyphNames in groups.items():
        if groupName.startswith("public.kern1."):
            groupsSide1[groupName[13:]] = glyphNames
        elif groupName.startswith("public.kern2."):
            groupsSide2[groupName[13:]] = glyphNames
        else:
            # not a kerning group -- drop
            pass

    return groupsSide1, groupsSide2
