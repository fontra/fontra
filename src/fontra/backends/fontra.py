import asyncio
import csv
import json
import logging
import os
import pathlib
import shutil
from collections import defaultdict
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Callable, Sequence

from ..core.async_property import async_property
from ..core.classes import (
    Axes,
    Font,
    FontInfo,
    FontSource,
    ImageData,
    ImageType,
    Kerning,
    OpenTypeFeatures,
    VariableGlyph,
    structure,
    unstructure,
)
from ..core.glyphdependencies import GlyphDependencies
from ..core.protocols import WritableFontBackend
from ..core.subprocess import runInSubProcess
from .base import ReadableBaseBackend
from .filenames import fileNameToString, stringToFileName
from .filewatcher import Change
from .watchable import WatchableBackend

logger = logging.getLogger(__name__)


class FontraBackend(WatchableBackend, ReadableBaseBackend):
    glyphInfoFileName = "glyph-info.csv"
    fontDataFileName = "font-data.json"
    kerningFileName = "kerning.csv"
    featureTextFileName = "features.txt"
    glyphsDirName = "glyphs"
    backgroundImagesDirName = "background-images"

    @classmethod
    def fromPath(cls, path) -> WritableFontBackend:
        return cls(path=path)

    @classmethod
    def createFromPath(cls, path) -> WritableFontBackend:
        return cls(path=path, create=True)

    def __init__(self, *, path: Any, create: bool = False):
        super().__init__()
        # Typing TODO: `path` needs to be PathLike or be similar to pathlib.Path
        if not hasattr(path, "read_text"):
            self.path = pathlib.Path(path).resolve()
        else:
            self.path = path
        if create:
            if self.path.is_dir():
                shutil.rmtree(self.path)
            elif self.path.exists():
                self.path.unlink()
            self.path.mkdir()
        self.glyphsDir.mkdir(exist_ok=True)
        self.glyphMap: dict[str, list[int]] = {}
        self.fontData = Font()
        if not create:
            self._readGlyphInfo()
            self._readFontData()
            self._readKerning()
            self._readFeatures()
        else:
            self._writeGlyphInfo()
            self._writeFontData()
        self._scheduler = Scheduler()

        self._glyphDependenciesTask: asyncio.Task[GlyphDependencies] | None = None
        self._glyphDependencies: GlyphDependencies | None = None
        self._backgroundTasksTask: asyncio.Task | None = None

    @property
    def fontDataPath(self):
        return self.path / self.fontDataFileName

    @property
    def kerningPath(self):
        return self.path / self.kerningFileName

    @property
    def featureTextPath(self):
        return self.path / self.featureTextFileName

    @property
    def glyphInfoPath(self):
        return self.path / self.glyphInfoFileName

    @property
    def glyphsDir(self):
        return self.path / self.glyphsDirName

    @property
    def backgroundImagesDir(self):
        return self.path / self.backgroundImagesDirName

    async def aclose(self):
        self.flush()
        await self.fileWatcherClose()

    def flush(self):
        self._scheduler.flush()

    async def getUnitsPerEm(self) -> int:
        return self.fontData.unitsPerEm

    async def putUnitsPerEm(self, unitsPerEm: int) -> None:
        self.fontData.unitsPerEm = unitsPerEm
        self._scheduler.schedule(self._writeFontData)

    async def getGlyphMap(self) -> dict[str, list[int]]:
        return dict(self.glyphMap)

    async def putGlyphMap(self, value: dict[str, list[int]]) -> None:
        pass

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        if glyphName not in self.glyphMap:
            return None
        try:
            jsonSource = self.getGlyphData(glyphName)
        except KeyError:
            return None
        return deserializeGlyph(jsonSource, glyphName)

    async def putGlyph(
        self, glyphName: str, glyph: VariableGlyph, codePoints: list[int]
    ) -> None:
        jsonSource = serializeGlyph(glyph, glyphName)
        filePath = self.getGlyphFilePath(glyphName)
        filePath.write_text(jsonSource, encoding="utf=8")
        self.fileWatcherIgnoreNextChange(filePath)

        if codePoints != self.glyphMap.get(glyphName):
            self.glyphMap[glyphName] = codePoints
            self._scheduler.schedule(self._writeGlyphInfo)

        if self._glyphDependencies is not None:
            self._glyphDependencies.update(glyphName, componentNamesFromGlyph(glyph))

    async def deleteGlyph(self, glyphName: str) -> None:
        if glyphName not in self.glyphMap:
            logger.debug(f"Can't delete unknown glyph '{glyphName}'")
            return

        filePath = self.getGlyphFilePath(glyphName)
        filePath.unlink()
        self.fileWatcherIgnoreNextChange(filePath)

        del self.glyphMap[glyphName]
        self._scheduler.schedule(self._writeGlyphInfo)
        if self._glyphDependencies is not None:
            self._glyphDependencies.update(glyphName, ())

    async def getFontInfo(self) -> FontInfo:
        return deepcopy(self.fontData.fontInfo)

    async def putFontInfo(self, fontInfo: FontInfo):
        self.fontData.fontInfo = deepcopy(fontInfo)
        self._scheduler.schedule(self._writeFontData)

    async def getAxes(self) -> Axes:
        return deepcopy(self.fontData.axes)

    async def putAxes(self, axes: Axes) -> None:
        self.fontData.axes = deepcopy(axes)
        self._scheduler.schedule(self._writeFontData)

    async def getSources(self) -> dict[str, FontSource]:
        return deepcopy(self.fontData.sources)

    async def putSources(self, sources: dict[str, FontSource]) -> None:
        self.fontData.sources = deepcopy(sources)
        self._scheduler.schedule(self._writeFontData)

    async def getKerning(self) -> dict[str, Kerning]:
        return deepcopy(self.fontData.kerning)

    async def putKerning(self, kerning: dict[str, Kerning]) -> None:
        assert all(isinstance(table, Kerning) for table in kerning.values())
        self.fontData.kerning = deepcopy(kerning)
        self._scheduler.schedule(self._writeKerning)

    async def getFeatures(self) -> OpenTypeFeatures:
        return deepcopy(self.fontData.features)

    async def putFeatures(self, features: OpenTypeFeatures) -> None:
        assert isinstance(features, OpenTypeFeatures)
        self.fontData.features = deepcopy(features)
        self._scheduler.schedule(self._writeFeatures)

    async def getBackgroundImage(self, imageIdentifier: str) -> ImageData | None:
        for imageType in [ImageType.PNG, ImageType.JPEG]:
            fileName = f"{imageIdentifier}.{imageType.lower()}"
            path = self.backgroundImagesDir / fileName
            if path.is_file():
                return ImageData(type=imageType, data=path.read_bytes())

        return None  # Image not found

    async def putBackgroundImage(self, imageIdentifier: str, data: ImageData) -> None:
        fileName = f"{imageIdentifier}.{data.type.lower()}"
        self.backgroundImagesDir.mkdir(exist_ok=True)
        path = self.backgroundImagesDir / fileName
        path.write_bytes(data.data)
        self.fileWatcherIgnoreNextChange(path)

    async def getCustomData(self) -> dict[str, Any]:
        return deepcopy(self.fontData.customData)

    async def putCustomData(self, customData: dict[str, Any]) -> None:
        self.fontData.customData = deepcopy(customData)
        self._scheduler.schedule(self._writeFontData)

    def _readGlyphInfo(self) -> None:
        self.glyphMap = {}
        with self.glyphInfoPath.open("r", encoding="utf-8", newline="") as file:
            reader = csv.reader(file, delimiter=";")
            header = next(reader)
            assert header[:2] == ["glyph name", "code points"]
            for row in reader:
                glyphName, *rest = row
                if rest:
                    codePoints = _parseCodePoints(rest[0])
                else:
                    codePoints = []
                self.glyphMap[glyphName] = codePoints

    def _writeGlyphInfo(self) -> None:
        with self.glyphInfoPath.open("w", encoding="utf-8", newline="") as file:
            writer = csv.writer(file, delimiter=";")
            writer.writerow(["glyph name", "code points"])
            for glyphName, codePoints in sorted(self.glyphMap.items()):
                codePointsString = ",".join(f"U+{cp:04X}" for cp in codePoints)
                writer.writerow([glyphName, codePointsString])

        self.fileWatcherIgnoreNextChange(self.glyphInfoPath)

    def _readFontData(self) -> None:
        kerning = self.fontData.kerning
        features = self.fontData.features
        self.fontData = structure(
            json.loads(self.fontDataPath.read_text(encoding="utf-8")), Font
        )
        self.fontData.kerning = kerning
        self.fontData.features = features

    def _readKerning(self) -> None:
        if self.kerningPath.exists():
            self.fontData.kerning = readKerningFile(self.kerningPath)

    def _readFeatures(self) -> None:
        if self.featureTextPath.exists():
            self.fontData.features.text = self.featureTextPath.read_text(
                encoding="utf-8"
            )

    def _writeFontData(self) -> None:
        fontData = unstructure(self.fontData)
        fontData.pop("glyphs", None)
        fontData.pop("glyphMap", None)
        fontData.pop("kerning", None)

        if (
            "features" in fontData
            and fontData["features"].get("language", "fea") == "fea"
        ):
            # omit if default feature format
            del fontData["features"]

        self.fontDataPath.write_text(serialize(fontData) + "\n", encoding="utf-8")
        self.fileWatcherIgnoreNextChange(self.fontDataPath)

    def _writeKerning(self) -> None:
        if any(
            kernTable.values or kernTable.groupsSide1 or kernTable.groupsSide2
            for kernTable in self.fontData.kerning.values()
        ):
            writeKerningFile(self.kerningPath, self.fontData.kerning)
        elif self.kerningPath.exists():
            self.kerningPath.unlink()

        self.fileWatcherIgnoreNextChange(self.kerningPath)

    def _writeFeatures(self) -> None:
        featureText = (
            self.fontData.features.text
            if self.fontData.features.language == "fea"
            else None  # Other hypothetical feature format
        )

        if featureText:
            self.featureTextPath.write_text(featureText, encoding="utf-8")
        elif self.featureTextPath.exists():
            self.featureTextPath.unlink()

        self.fileWatcherIgnoreNextChange(self.featureTextPath)

    def getGlyphData(self, glyphName: str) -> str:
        filePath = self.getGlyphFilePath(glyphName)
        if not filePath.is_file():
            raise KeyError(glyphName)
        return filePath.read_text(encoding="utf-8")

    def getGlyphFilePath(self, glyphName):
        return self.glyphsDir / (stringToFileName(glyphName) + ".json")

    async def findGlyphsThatUseGlyph(self, glyphName):
        return sorted((await self.glyphDependencies).usedBy.get(glyphName, []))

    @async_property
    async def glyphDependencies(self) -> GlyphDependencies:
        if self._glyphDependencies is not None:
            return self._glyphDependencies

        if self._glyphDependenciesTask is None:
            self._glyphDependenciesTask = asyncio.create_task(
                extractGlyphDependenciesFromFontra(self.glyphsDir)
            )

            def setResult(task):
                if not task.cancelled() and task.exception() is None:
                    self._glyphDependencies = task.result()

            self._glyphDependenciesTask.add_done_callback(setResult)

        return await self._glyphDependenciesTask

    def startOptionalBackgroundTasks(self) -> None:
        self._backgroundTasksTask = asyncio.create_task(self.glyphDependencies)

    def fileWatcherWasInstalled(self):
        self.fileWatcherSetPaths([self.path])

    async def fileWatcherProcessChanges(
        self, changes: set[tuple[Change, str]]
    ) -> dict[str, Any] | None:
        reloadPattern: dict[str, Any] = {}
        glyphChanges = set()
        glyphsDir = os.fspath(self.glyphsDir)
        backgroundImagesDir = os.fspath(self.backgroundImagesDir)
        ourPath = os.fspath(self.path)

        shouldReloadAll = False

        for change, path in sorted(changes):
            fileName = os.path.basename(path)
            stem, suffix = os.path.splitext(fileName)

            if path == ourPath:
                # The whole .fontra folder might have been replaced. Reload everything.
                self._readGlyphInfo()
                self._readFontData()
                self._readKerning()
                self._readFeatures()
                shouldReloadAll = True
                break

            if fileName == self.fontDataFileName:
                self._readFontData()
                shouldReloadAll = True

            if fileName == self.glyphInfoFileName:
                reloadPattern["glyphMap"] = None
                self._readGlyphInfo()

            if fileName == self.kerningFileName:
                reloadPattern["kerning"] = None
                self._readKerning()

            if fileName == self.featureTextFileName:
                reloadPattern["features"] = None
                self._readFeatures()

            if path.startswith(glyphsDir) and suffix == ".json":
                glyphName = fileNameToString(stem)
                glyphChanges.add(glyphName)

            if path.startswith(backgroundImagesDir):
                # Reload everything, as we don't want to bother to figure out
                # which glyph uses the changed image
                shouldReloadAll = True

        if shouldReloadAll:
            return None

        if glyphChanges:
            reloadPattern["glyphs"] = dict.fromkeys(sorted(glyphChanges))

        return reloadPattern


def _parseCodePoints(cell: str) -> list[int]:
    codePoints = []
    cell = cell.strip()
    if cell:
        for s in cell.split(","):
            s = s.strip()
            # U+ should become mandatory, but for now let's be lenient
            if s.startswith("U+"):
                s = s[2:]
            codePoints.append(int(s, 16))
    return codePoints


def serializeGlyph(glyph, glyphName=None):
    glyph = glyph.convertToPaths()
    jsonGlyph = unstructure(glyph)
    if glyphName is not None:
        jsonGlyph["name"] = glyphName
    return serialize(jsonGlyph) + "\n"


def deserializeGlyph(jsonSource: str, glyphName: str | None = None) -> VariableGlyph:
    jsonGlyph = json.loads(jsonSource)
    if glyphName is not None:
        jsonGlyph["name"] = glyphName
    glyph = structure(jsonGlyph, VariableGlyph)
    return glyph.convertToPackedPaths()


def serialize(data: list | dict) -> str:
    return json.dumps(data, indent=0, ensure_ascii=False)


def writeKerningFile(path: pathlib.Path, kerning: dict[str, Kerning]) -> None:
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file, delimiter=";")

        isFirst = True
        for kernType, kerningTable in kerning.items():
            if (
                not kerningTable.values
                and not kerningTable.groupsSide1
                and not kerningTable.groupsSide2
            ):
                continue

            if not isFirst:
                writer.writerow([])
            isFirst = False

            writer.writerow(["TYPE"])
            writer.writerow([kernType])
            writer.writerow([])

            writer.writerow(["GROUPS1"])
            for groupName, group in sorted(kerningTable.groupsSide1.items()):
                writer.writerow([groupName] + group)
            writer.writerow([])

            writer.writerow(["GROUPS2"])
            for groupName, group in sorted(kerningTable.groupsSide2.items()):
                writer.writerow([groupName] + group)
            writer.writerow([])

            writer.writerow(["VALUES"])
            sourceIdentifiers = kerningTable.sourceIdentifiers
            writer.writerow(["side1", "side2"] + sourceIdentifiers)
            for left, rightDict in kerningTable.values.items():
                for right, values in rightDict.items():
                    row = ["" if v is None else v for v in values]
                    writer.writerow([left, right] + row)


class KerningParseError(Exception):
    pass


def readKerningFile(path: pathlib.Path) -> dict[str, Kerning]:
    kerning = {}

    with path.open("r", encoding="utf-8", newline="") as file:
        reader = csv.reader(file, delimiter=";")
        rowIter = iter(enumerate(reader, 1))

        while True:
            kernType = kerningReadType(rowIter)
            if kernType is None:
                break

            groupsSide1, isLegacy = kerningReadGroups(rowIter, "GROUPS1", True)
            groupsSide2, _ = (
                (None, None)
                if isLegacy
                else kerningReadGroups(rowIter, "GROUPS2", False)
            )

            sourceIdentifiers, values = kerningReadValues(rowIter)

            if isLegacy:
                groupsSide1, groupsSide2, values = upconvertKerning(
                    groupsSide1, values, kernType
                )

            assert groupsSide2 is not None

            kerning[kernType] = Kerning(
                groupsSide1=groupsSide1,
                groupsSide2=groupsSide2,
                sourceIdentifiers=sourceIdentifiers,
                values=values,
            )

    return kerning


def kerningReadType(rowIter):
    lineNumber, row = nextNonBlankRow(rowIter)
    if lineNumber is None:
        return None

    if not row or row[0] != "TYPE":
        raise KerningParseError(f"expected TYPE keyword (line {lineNumber})")

    lineNumber, row = next(rowIter)
    if not row or not row[0]:
        raise KerningParseError(f"expected TYPE value string (line {lineNumber})")

    return row[0]


def kerningReadGroups(rowIter, keyword, allowLegacy):
    lineNumber, row = nextNonBlankRow(rowIter)
    if not row or (row[0] != keyword and (not allowLegacy or row[0] != "GROUPS")):
        raise KerningParseError(f"expected {keyword} keyword (line {lineNumber})")

    isLegacy = row[0] == "GROUPS"

    groups = {}

    for lineNumber, row in rowIter:
        if not row or not row[0]:
            break
        groups[row[0]] = row[1:]

    return groups, isLegacy


def kerningReadValues(rowIter):
    lineNumber, row = nextNonBlankRow(rowIter)
    if not row or row[0] != "VALUES":
        raise KerningParseError(f"expected VALUES keyword (line {lineNumber})")

    lineNumber, row = next(rowIter)
    if not row or len(row) < 3 or row[:2] != ["side1", "side2"]:
        raise KerningParseError(f"expected source identifier row (line {lineNumber})")

    sourceIdentifiers = row[2:]

    values = defaultdict(dict)

    for lineNumber, row in rowIter:
        if not row or not row[0]:
            break
        if len(row) < 2:
            raise KerningParseError(f"expected kern values (line {lineNumber})")

        left = row[0]
        right = row[1]
        try:
            values[left][right] = [kerningParseValue(v) if v else None for v in row[2:]]
        except ValueError as e:
            raise KerningParseError(f"parse error: {e!r} (line {lineNumber})")

    return sourceIdentifiers, dict(values)


def kerningParseValue(s):
    f = float(s)
    i = int(f)
    return i if i == f else f


def nextNonBlankRow(rowIter):
    for lineNumber, row in rowIter:
        if row and row[0]:
            return lineNumber, row
    return None, None


@dataclass(kw_only=True)
class Scheduler:
    delay: float = 0.2
    scheduledCallables: dict[str, Callable] = field(default_factory=dict)
    timerHandle: asyncio.TimerHandle | None = None

    def schedule(self, callable: Callable):
        self.scheduledCallables[callable.__name__] = callable
        if self.timerHandle is not None:
            self.timerHandle.cancel()
        loop = asyncio.get_running_loop()
        self.timerHandle = loop.call_later(self.delay, self.flush)

    def flush(self):
        if self.timerHandle is not None:
            self.timerHandle.cancel()
            self.timerHandle = None
        logger.debug("calling scheduled callables")
        for callable in self.scheduledCallables.values():
            callable()
        self.scheduledCallables = {}


async def extractGlyphDependenciesFromFontra(
    glyphsDir: pathlib.Path,
) -> GlyphDependencies:
    componentInfo = await runInSubProcess(_extractComponentInfoFromFontra, glyphsDir)

    dependencies = GlyphDependencies()
    for glyphName, componentNames in componentInfo.items():
        dependencies.update(glyphName, componentNames)
    return dependencies


def _extractComponentInfoFromFontra(glyphsDir: pathlib.Path) -> dict[str, set[str]]:
    componentInfo = {}
    for glyphPath in glyphsDir.glob("*.json"):
        glyphName = fileNameToString(glyphPath.stem)
        try:
            glyphData = json.loads(glyphPath.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            logger.error(
                f"error while extracting component info from {glyphName}: {e!r}",
            )
        else:
            componentInfo[glyphName] = componentNamesFromGlyphData(glyphData)
    return componentInfo


def componentNamesFromGlyph(glyph):
    return {
        compo.name
        for layer in glyph.layers.values()
        for compo in layer.glyph.components
    }


def componentNamesFromGlyphData(glyphData):
    return {
        compoData["name"]
        for layerData in glyphData.get("layers", {}).values()
        for compoData in layerData["glyph"].get("components", [])
    }


def longestCommonPrefix(strings: Sequence[str]) -> str:
    if not strings:
        return ""

    firstString = strings[0]

    i = 0

    while i < len(firstString):
        c = firstString[i]
        if any(i >= len(s) or s[i] != c for s in strings):
            break
        i += 1

    return firstString[:i]


def guessPrefix(groupNames, prefixes):
    commonPrefix = longestCommonPrefix(groupNames)

    for prefix in prefixes:
        if commonPrefix.startswith(prefix):
            return prefix

    return ""


horLeftPrefixes = ["public.kern1.", "@MMK_L_"]
horRightPrefixes = ["public.kern2.", "@MMK_R_"]
verTopPrefixes = ["kern.top."]
verBottomPrefixes = ["kern.bottom."]


def upconvertKerning(groups, values, kernType):
    groupSide1Names = set()
    groupSide2Names = set()

    for leftName, valueDict in values.items():
        if leftName in groups:
            groupSide1Names.add(leftName)
        for rightName in valueDict:
            if rightName in groups:
                groupSide2Names.add(rightName)

    groupSide1Names = sorted(groupSide1Names)
    groupSide2Names = sorted(groupSide2Names)

    leftPrefixes = verTopPrefixes if kernType == "vkrn" else horLeftPrefixes
    rightPrefixes = verBottomPrefixes if kernType == "vkrn" else horRightPrefixes

    groupSide1Prefix = guessPrefix(groupSide1Names, leftPrefixes)
    groupSide2Prefix = guessPrefix(groupSide2Names, rightPrefixes)

    groupsSide1 = {
        groupName[len(groupSide1Prefix) :]: groups[groupName]
        for groupName in groups
        if groupName.startswith(groupSide1Prefix)
    }
    groupsSide2 = {
        groupName[len(groupSide2Prefix) :]: groups[groupName]
        for groupName in groups
        if groupName.startswith(groupSide2Prefix)
    }

    newValues = {}

    for leftName, valueDict in values.items():
        leftName = fixPrefix(leftName, groupSide1Prefix)
        newValues[leftName] = {}
        for rightName, values in valueDict.items():
            rightName = fixPrefix(rightName, groupSide2Prefix)
            newValues[leftName][rightName] = values

    return groupsSide1, groupsSide2, newValues


def fixPrefix(kernPairName, groupPrefix):
    return (
        (
            "@" + kernPairName[len(groupPrefix) :]
            if kernPairName.startswith(groupPrefix)
            else kernPairName
        )
        if groupPrefix
        else kernPairName
    )
