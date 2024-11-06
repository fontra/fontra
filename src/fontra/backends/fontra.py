import asyncio
import base64
import csv
import json
import logging
import pathlib
import shutil
from collections import defaultdict
from copy import deepcopy
from dataclasses import dataclass, field
from functools import partial
from typing import Any, Callable

from ..core.async_property import async_property
from ..core.classes import (
    Axes,
    Font,
    FontInfo,
    FontSource,
    Kerning,
    OpenTypeFeatures,
    VariableGlyph,
    structure,
    unstructure,
)
from ..core.glyphdependencies import GlyphDependencies
from ..core.protocols import WritableFontBackend
from ..core.subprocess import runInSubProcess
from .filenames import fileNameToString, stringToFileName

logger = logging.getLogger(__name__)


class FontraBackend:
    glyphInfoFileName = "glyph-info.csv"
    fontDataFileName = "font-data.json"
    kerningFileName = "kerning.csv"
    featureTextFileName = "features.txt"
    glyphsDirName = "glyphs"

    @classmethod
    def fromPath(cls, path) -> WritableFontBackend:
        return cls(path=path)

    @classmethod
    def createFromPath(cls, path) -> WritableFontBackend:
        return cls(path=path, create=True)

    def __init__(self, *, path: Any, create: bool = False):
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
        if not create:
            self._readGlyphInfo()
            self._readFontData()
        else:
            self.fontData = Font()
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
    def binaryDataPath(self):
        binaryDataPath = self.path / "binaryData"
        if not binaryDataPath.is_dir():
            binaryDataPath.mkdir()
        return binaryDataPath

    async def aclose(self):
        self.flush()

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

        if codePoints != self.glyphMap.get(glyphName):
            self.glyphMap[glyphName] = codePoints
            self._scheduler.schedule(self._writeGlyphInfo)

        if self._glyphDependencies is not None:
            self._glyphDependencies.update(glyphName, componentNamesFromGlyph(glyph))

    async def deleteGlyph(self, glyphName: str) -> None:
        if glyphName not in self.glyphMap:
            raise KeyError(f"Glyph '{glyphName}' does not exist")
        filePath = self.getGlyphFilePath(glyphName)
        filePath.unlink()
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
        self._scheduler.schedule(self._writeFontData)

    async def getFeatures(self) -> OpenTypeFeatures:
        return deepcopy(self.fontData.features)

    async def putFeatures(self, features: OpenTypeFeatures) -> None:
        assert isinstance(features, OpenTypeFeatures)
        self.fontData.features = deepcopy(features)
        self._scheduler.schedule(self._writeFontData)

    async def getCustomData(self) -> dict[str, Any]:
        return deepcopy(self.fontData.customData)

    async def putCustomData(self, customData: dict[str, Any]) -> None:
        self.fontData.customData = deepcopy(customData)
        self._scheduler.schedule(self._writeFontData)

    async def getBinaryData(self) -> bytes | None:
        binaryData = {}
        if not self.binaryDataPath.is_dir():
            return binaryData
        for filePath in self.binaryDataPath.iterdir():
            if filePath.is_file():
                binaryData[filePath.name] = base64.b64encode(
                    filePath.read_bytes()
                ).decode("utf-8")
        return binaryData

    async def putBinaryData(self, name: str, binaryData: bytes) -> None:
        filePath = self.binaryDataPath / name
        filePath.write_bytes(binaryData)

    def _readGlyphInfo(self) -> None:
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

    def _readFontData(self) -> None:
        self.fontData = structure(
            json.loads(self.fontDataPath.read_text(encoding="utf-8")), Font
        )
        if self.featureTextPath.exists():
            self.fontData.features.text = self.featureTextPath.read_text(
                encoding="utf-8"
            )
        if self.kerningPath.exists():
            self.fontData.kerning = readKerningFile(self.kerningPath)

    def _writeFontData(self) -> None:
        fontData = unstructure(self.fontData)
        fontData.pop("glyphs", None)
        fontData.pop("glyphMap", None)
        fontData.pop("kerning", None)

        if self.fontData.kerning:
            writeKerningFile(self.kerningPath, self.fontData.kerning)
        elif self.kerningPath.exists():
            self.kerningPath.unlink()

        featureText = None
        if "features" in fontData:
            featureText = fontData["features"].pop("text", None)
            if fontData["features"].get("language", "fea") == "fea":
                # omit if default
                del fontData["features"]
            if featureText:
                self.featureTextPath.write_text(featureText, encoding="utf-8")
        if not featureText and self.featureTextPath.exists():
            self.featureTextPath.unlink()

        self.fontDataPath.write_text(serialize(fontData) + "\n", encoding="utf-8")

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
            if not isFirst:
                writer.writerow([])
            isFirst = False

            writer.writerow(["TYPE"])
            writer.writerow([kernType])
            writer.writerow([])

            writer.writerow(["GROUPS"])
            for groupName, group in sorted(kerningTable.groups.items()):
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

            groups = kerningReadGroups(rowIter)
            sourceIdentifiers, values = kerningReadValues(rowIter)

            kerning[kernType] = Kerning(
                groups=groups, sourceIdentifiers=sourceIdentifiers, values=values
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


def kerningReadGroups(rowIter):
    lineNumber, row = nextNonBlankRow(rowIter)
    if not row or row[0] != "GROUPS":
        raise KerningParseError(f"expected GROUPS keyword (line {lineNumber})")

    groups = {}

    for lineNumber, row in rowIter:
        if not row or not row[0]:
            break
        groups[row[0]] = row[1:]

    return groups


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
    componentInfo = await runInSubProcess(
        partial(_extractComponentInfoFromUFO, glyphsDir)
    )

    dependencies = GlyphDependencies()
    for glyphName, componentNames in componentInfo.items():
        dependencies.update(glyphName, componentNames)
    return dependencies


def _extractComponentInfoFromUFO(glyphsDir: pathlib.Path) -> dict[str, set[str]]:
    componentInfo = {}
    for glyphPath in glyphsDir.glob("*.json"):
        glyphName = fileNameToString(glyphPath.stem)
        glyphData = json.loads(glyphPath.read_text(encoding="utf-8"))
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
