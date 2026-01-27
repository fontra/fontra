import io
from copy import copy
from itertools import product
from os import PathLike
from typing import Any, Generator

from fontTools.misc.fixedTools import fixedToFloat
from fontTools.misc.psCharStrings import SimpleT2Decompiler
from fontTools.pens.pointPen import GuessSmoothPointPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables.otTables import NO_VARIATION_INDEX
from fontTools.varLib.varStore import VarStoreInstancer

from ..core.classes import (
    Axes,
    CrossAxisMapping,
    DiscreteFontAxis,
    FontAxis,
    FontInfo,
    FontSource,
    GlyphSource,
    Kerning,
    Layer,
    OpenTypeFeatures,
    ShaperFontData,
    ShaperFontGlyphOrderSorting,
    StaticGlyph,
    VariableGlyph,
)
from ..core.path import PackedPath, PackedPathPointPen
from ..core.protocols import ReadableFontBackend
from ..core.varutils import locationToTuple, unnormalizeLocation, unnormalizeValue
from .base import ReadableBaseBackend
from .filewatcher import Change
from .watchable import WatchableBackend

shaperFontTables = {"fvar", "head", "name", "GDEF", "GSUB", "GPOS", "BASE", "post"}


class OTFBackend(WatchableBackend, ReadableBaseBackend):
    @classmethod
    def fromPath(cls, path: PathLike) -> ReadableFontBackend:
        return cls(path=path)

    def __init__(self, *, path: PathLike) -> None:
        super().__init__()
        self._initializeFromPath(path)

    def _initializeFromPath(self, path: PathLike) -> None:
        self.path = path
        self.font = self._loadFontFromPath(path)
        self._initialize()

    def _loadFontFromPath(self, path: PathLike) -> TTFont:
        return TTFont(path, lazy=True)

    def _initialize(self) -> None:
        self.axes = unpackAxes(self.font)
        gvar = self.font.get("gvar")
        self.gvarVariations = gvar.variations if gvar is not None else None
        varc = self.font.get("VARC")
        self.varcTable = varc.table if varc is not None else None
        self.charStrings = (
            list(self.font["CFF2"].cff.values())[0].CharStrings
            if "CFF2" in self.font
            else None
        )
        self.characterMap = self.font.getBestCmap()
        glyphMap: dict[str, list[int]] = {}
        for glyphName in self.font.getGlyphOrder():
            glyphMap[glyphName] = []
        for code, glyphName in sorted(self.characterMap.items()):
            glyphMap[glyphName].append(code)
        self.glyphMap = glyphMap
        self.glyphSet = self.font.getGlyphSet()
        self.variationGlyphSets: dict[str, Any] = {}

    async def aclose(self):
        self.font.close()

    async def getGlyphMap(self) -> dict[str, list[int]]:
        return self.glyphMap

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        if glyphName not in self.glyphSet:
            return None
        defaultLayerName = "default"
        glyph = VariableGlyph(name=glyphName)
        staticGlyph = buildStaticGlyph(self.glyphSet, glyphName)
        layers = {defaultLayerName: Layer(glyph=staticGlyph)}
        defaultLocation = {axis.name: 0 for axis in self.axes.axes}
        sources = [
            GlyphSource(
                location=unnormalizeLocation(defaultLocation, self.axes.axes),
                name=defaultLayerName,
                layerName=defaultLayerName,
            )
        ]

        for sparseLoc in self._getGlyphVariationLocations(glyphName):
            fullLoc = defaultLocation | sparseLoc
            locStr = locationToString(unnormalizeLocation(sparseLoc, self.axes.axes))
            varGlyphSet = self.variationGlyphSets.get(locStr)
            if varGlyphSet is None:
                varGlyphSet = self.font.getGlyphSet(location=fullLoc, normalized=True)
                self.variationGlyphSets[locStr] = varGlyphSet
            varGlyph = buildStaticGlyph(varGlyphSet, glyphName)
            layers[locStr] = Layer(glyph=varGlyph)
            sources.append(
                GlyphSource(
                    location=unnormalizeLocation(fullLoc, self.axes.axes),
                    name=locStr,
                    layerName=locStr,
                )
            )
        if self.charStrings is not None:
            checkAndFixCFF2Compatibility(glyphName, layers)
        glyph.layers = layers
        glyph.sources = sources
        return glyph

    def _getGlyphVariationLocations(self, glyphName: str) -> list[dict[str, float]]:
        # TODO/FIXME: This misses variations that only exist in HVAR/VVAR
        locations = set()

        if self.gvarVariations is not None and glyphName in self.gvarVariations:
            locations |= {
                tuple(sorted(coords))
                for variation in self.gvarVariations[glyphName]
                for coords in product(
                    *(
                        [(k, v) for v in sorted(set(tent)) if v]
                        for k, tent in variation.axes.items()
                    )
                )
            }

        if self.varcTable is not None:
            fvarAxes = self.font["fvar"].axes
            varStore = self.varcTable.MultiVarStore
            try:
                index = self.varcTable.Coverage.glyphs.index(glyphName)
            except ValueError:
                pass
            else:
                composite = self.varcTable.VarCompositeGlyphs.VarCompositeGlyph[index]
                for component in composite.components:
                    if component.axisValuesVarIndex != NO_VARIATION_INDEX:
                        locations.update(
                            locationToTuple(loc)
                            for loc in getLocationsFromMultiVarstore(
                                component.axisValuesVarIndex >> 16, varStore, fvarAxes
                            )
                        )
                    if component.transformVarIndex != NO_VARIATION_INDEX:
                        locations.update(
                            locationToTuple(loc)
                            for loc in getLocationsFromMultiVarstore(
                                component.transformVarIndex >> 16, varStore, fvarAxes
                            )
                        )

        if (
            self.charStrings is not None
            and glyphName in self.charStrings
            and getattr(self.charStrings, "varStore", None) is not None
        ):
            cs = self.charStrings[glyphName]
            subrs = getattr(cs.private, "Subrs", [])
            collector = VarIndexCollector(subrs, cs.globalSubrs, cs.private)
            collector.execute(cs)
            vsIndices = sorted(collector.vsIndices)
            fvarAxes = self.font["fvar"].axes
            varStore = self.charStrings.varStore.otVarStore
            locations |= {
                locationToTuple(loc)
                for varDataIndex in vsIndices
                for loc in getLocationsFromVarstore(varDataIndex, varStore, fvarAxes)
            }

        return [dict(loc) for loc in sorted(locations)]

    async def getFontInfo(self) -> FontInfo:
        return FontInfo()

    async def getAxes(self) -> Axes:
        return self.axes

    async def getSources(self) -> dict[str, FontSource]:
        return {}

    async def getUnitsPerEm(self) -> int:
        return self.font["head"].unitsPerEm

    async def getKerning(self) -> dict[str, Kerning]:
        # TODO: extract kerning from GPOS
        return {}

    async def getFeatures(self) -> OpenTypeFeatures:
        # TODO: do best effort of reading GSUB/GPOS with fontFeatures
        return OpenTypeFeatures()

    async def getCustomData(self) -> dict[str, Any]:
        return {}

    async def getShaperFontData(self) -> ShaperFontData | None:
        with self._getShaperFont() as font:
            for tableTag in font.keys():
                if tableTag not in shaperFontTables:
                    del font[tableTag]

            f = io.BytesIO()
            font.save(f)

        data = f.getvalue()

        return ShaperFontData(
            glyphOrderSorting=ShaperFontGlyphOrderSorting.FROMGLYPHMAP, data=data
        )

    def _getShaperFont(self):
        return self._loadFontFromPath(self.path)

    async def fileWatcherProcessChanges(
        self, changes: set[tuple[Change, str]]
    ) -> dict[str, Any] | None:
        self._initializeFromPath(self.path)
        return None  # Reload all

    def fileWatcherWasInstalled(self) -> None:
        self.fileWatcherSetPaths([self.path])


class TTXBackend(OTFBackend):
    def _loadFontFromPath(self, path: PathLike) -> TTFont:
        font = TTFont()
        font.importXML(path)
        return font

    def _getShaperFont(self):
        font = copy(self.font)  # shallow copy
        font.tables = dict(font.tables)  # shallow copy tables dict for table subsetting
        return font


def getLocationsFromVarstore(
    varDataIndex: int, varStore, fvarAxes
) -> Generator[dict[str, float], None, None]:
    regions = varStore.VarRegionList.Region
    for regionIndex in varStore.VarData[varDataIndex].VarRegionIndex:
        location = {
            fvarAxes[i].axisTag: reg.PeakCoord
            for i, reg in enumerate(regions[regionIndex].VarRegionAxis)
            if reg.PeakCoord != 0
        }
        yield location


def getLocationsFromMultiVarstore(
    varDataIndex: int, varStore, fvarAxes
) -> Generator[dict[str, float], None, None]:
    regions = varStore.SparseVarRegionList.Region
    for regionIndex in varStore.MultiVarData[varDataIndex].VarRegionIndex:
        location = {
            fvarAxes[reg.AxisIndex].axisTag: reg.PeakCoord
            for reg in regions[regionIndex].SparseVarRegionAxis
            # if reg.PeakCoord != 0
        }
        yield location


def unpackAxes(font: TTFont) -> Axes:
    fvar = font.get("fvar")
    if fvar is None:
        return Axes()
    nameTable = font["name"]
    avar = font.get("avar")
    avarMapping = (
        {k: sorted(v.items()) for k, v in avar.segments.items()}
        if avar is not None
        else {}
    )
    axisList: list[FontAxis | DiscreteFontAxis] = []
    for axis in fvar.axes:
        normMin = -1 if axis.minValue < axis.defaultValue else 0
        normMax = 1 if axis.maxValue > axis.defaultValue else 0
        mapping = avarMapping.get(axis.axisTag, [])
        if mapping:
            mapping = [
                [
                    unnormalizeValue(
                        inValue, axis.minValue, axis.defaultValue, axis.maxValue
                    ),
                    unnormalizeValue(
                        outValue, axis.minValue, axis.defaultValue, axis.maxValue
                    ),
                ]
                for inValue, outValue in mapping
                if normMin <= outValue <= normMax
            ]

            if all([inValue == outValue for inValue, outValue in mapping]):
                mapping = []

        axisNameRecord = nameTable.getName(axis.axisNameID, 3, 1, 0x409)
        axisName = (
            axisNameRecord.toUnicode() if axisNameRecord is not None else axis.axisTag
        )
        axisList.append(
            FontAxis(
                minValue=axis.minValue,
                defaultValue=axis.defaultValue,
                maxValue=axis.maxValue,
                label=axisName,
                name=axis.axisTag,  # Fontra identifies axes by name
                tag=axis.axisTag,
                mapping=mapping,
                hidden=bool(axis.flags & 0x0001),  # HIDDEN_AXIS
            )
        )

    mappings = []

    if avar is not None and avar.majorVersion >= 2:
        fvarAxes = fvar.axes
        varStore = avar.table.VarStore
        varIdxMap = avar.table.VarIdxMap

        locations = set()
        for varIdx in varIdxMap.mapping:
            if varIdx == NO_VARIATION_INDEX:
                continue

            for loc in getLocationsFromVarstore(varIdx >> 16, varStore, fvarAxes):
                locations.add(locationToTuple(loc))

        for locTuple in sorted(locations):
            inputLocation = dict(locTuple)
            instancer = VarStoreInstancer(varStore, fvarAxes, inputLocation)

            outputLocation = {}
            for i, varIdx in enumerate(varIdxMap.mapping):
                if varIdx == NO_VARIATION_INDEX:
                    continue

                outputLocation[fvarAxes[i].axisTag] = fixedToFloat(
                    instancer[varIdx], 14
                )

            mappings.append(
                CrossAxisMapping(
                    inputLocation=unnormalizeLocation(inputLocation, axisList),
                    outputLocation=unnormalizeLocation(outputLocation, axisList),
                )
            )

    return Axes(axes=axisList, mappings=mappings)


def buildStaticGlyph(glyphSet, glyphName):
    pen = PackedPathPointPen()
    ttGlyph = glyphSet[glyphName]
    ttGlyph.drawPoints(GuessSmoothPointPen(pen))
    path = pen.getPath()
    staticGlyph = StaticGlyph()
    staticGlyph.path = path
    staticGlyph.components = pen.components
    staticGlyph.xAdvance = ttGlyph.width
    # TODO: yAdvance, verticalOrigin
    return staticGlyph


def locationToString(loc):
    parts = []
    for k, v in sorted(loc.items()):
        v = round(v, 5)  # enough to differentiate all 2.14 fixed values
        iv = int(v)
        if iv == v:
            v = iv
        parts.append(f"{k}={v}")
    return ",".join(parts)


class VarIndexCollector(SimpleT2Decompiler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.vsIndices = set()

    def op_blend(self, index):
        super().op_blend(index)
        self.vsIndices.add(self.vsIndex)


def checkAndFixCFF2Compatibility(glyphName, layers):
    #
    # https://github.com/fonttools/fonttools/issues/2838
    #
    # Via ttGlyphSet.py, we're using SegmentToPointPen to convert CFF/T2 segments
    # to points, which normally leads to closing curve-to points being removed.
    #
    # However, as the fonttools issue above shows, in some situations, it does
    # not close onto the starting point at *some* locations, due to rounding errors
    # in the source deltas.
    #
    # This functions detects those cases and compensates for it by appending the
    # starting point at the end of the contours that *do* close nicely.
    #
    # This is a somewhat ugly trade-off to keep interpolation compatibility.
    #
    layers = list(layers.values())
    firstPath = layers[0].glyph.path
    firstPointTypes = firstPath.pointTypes
    unpackedContourses = [None] * len(layers)
    contourLengths = None
    for layerIndex, layer in enumerate(layers):
        if layer.glyph.path.pointTypes != firstPointTypes:
            if contourLengths is None:
                unpackedContourses[0] = firstPath.unpackedContours()
                contourLengths = [len(c["points"]) for c in unpackedContourses[0]]
            unpackedContours = layer.glyph.path.unpackedContours()
            unpackedContourses[layerIndex] = unpackedContours
            assert len(contourLengths) == len(unpackedContours)
            contourLengths = [
                max(cl, len(unpackedContours[i]["points"]))
                for i, cl in enumerate(contourLengths)
            ]
    if contourLengths is None:
        # All good, nothing to do
        return
    for layerIndex, layer in enumerate(layers):
        if unpackedContourses[layerIndex] is None:
            unpackedContourses[layerIndex] = layer.glyph.path.unpackedContours()
        unpackedContours = unpackedContourses[layerIndex]
        for i, contourLength in enumerate(contourLengths):
            if len(unpackedContours[i]["points"]) + 1 == contourLength:
                firstPoint = unpackedContours[i]["points"][0]
                firstPoint["smooth"] = False
                unpackedContours[i]["points"].append(firstPoint)
        layer.glyph.path = PackedPath.fromUnpackedContours(unpackedContours)
