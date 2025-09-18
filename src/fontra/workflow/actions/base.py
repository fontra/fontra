from __future__ import annotations

import json
import logging
import os
import pathlib
import tempfile
from contextlib import aclosing, asynccontextmanager
from dataclasses import dataclass, field
from functools import cached_property
from typing import Any, AsyncGenerator, ClassVar

from ...backends import getFileSystemBackend, newFileSystemBackend
from ...backends.copy import copyFont
from ...backends.filenames import stringToFileName
from ...backends.null import NullBackend
from ...core.async_property import async_cached_property
from ...core.classes import (
    Axes,
    FontInfo,
    FontSource,
    ImageData,
    Kerning,
    OpenTypeFeatures,
    VariableGlyph,
    structure,
    unstructure,
)
from ...core.instancer import FontInstancer
from ...core.protocols import ReadableFontBackend
from . import (
    OutputProcessorProtocol,
    registerFilterAction,
    registerInputAction,
    registerOutputAction,
)

logger = logging.getLogger(__name__)


@registerInputAction("fontra-read")
@dataclass(kw_only=True)
class FontraRead:
    source: str

    @asynccontextmanager
    async def prepare(self) -> AsyncGenerator[ReadableFontBackend, None]:
        backend = getFileSystemBackend(pathlib.Path(self.source).resolve())
        try:
            yield backend
        finally:
            await backend.aclose()


@registerOutputAction("fontra-write")
@dataclass(kw_only=True)
class FontraWrite:
    destination: str
    input: ReadableFontBackend = field(init=False, default=NullBackend())

    @cached_property
    def validatedInput(self) -> ReadableFontBackend:
        assert isinstance(self.input, ReadableFontBackend)
        return self.input

    @asynccontextmanager
    async def connect(
        self, input: ReadableFontBackend
    ) -> AsyncGenerator[OutputProcessorProtocol, None]:
        self.input = input
        try:
            yield self
        finally:
            self.input = NullBackend()
            await input.aclose()
            try:
                del self.validatedInput
            except AttributeError:
                pass

    async def process(
        self, outputDir: os.PathLike = pathlib.Path(), *, continueOnError=False
    ) -> None:
        outputDir = pathlib.Path(outputDir)
        output = newFileSystemBackend((outputDir / self.destination).resolve())

        async with aclosing(output):
            await copyFont(self.validatedInput, output, continueOnError=continueOnError)


@dataclass(kw_only=True)
class BaseFilter:
    input: ReadableFontBackend = field(init=False, default=NullBackend())
    actionName: ClassVar[str]

    @cached_property
    def validatedInput(self) -> ReadableFontBackend:
        assert isinstance(self.input, ReadableFontBackend)
        return self.input

    @cached_property
    def fontInstancer(self):
        return FontInstancer(self.validatedInput)

    @async_cached_property
    def inputAxes(self):
        return self.validatedInput.getAxes()

    @async_cached_property
    def inputGlyphMap(self):
        return self.validatedInput.getGlyphMap()

    @async_cached_property
    def inputSources(self):
        return self.validatedInput.getSources()

    @async_cached_property
    def inputKerning(self):
        return self.validatedInput.getKerning()

    @asynccontextmanager
    async def connect(
        self, input: ReadableFontBackend
    ) -> AsyncGenerator[ReadableFontBackend, None]:
        self.input = input
        try:
            yield self
        finally:
            self.input = NullBackend()
            await input.aclose()
            try:
                del self.validatedInput
            except AttributeError:
                pass

    async def aclose(self) -> None:
        pass

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        glyph = await self.validatedInput.getGlyph(glyphName)
        if glyph is None:
            return None
        return await self.processGlyph(glyph)

    async def getFontInfo(self) -> FontInfo:
        fontInfo = await self.validatedInput.getFontInfo()
        return await self.processFontInfo(fontInfo)

    async def getAxes(self) -> Axes:
        axes = await self.validatedInput.getAxes()
        return await self.processAxes(axes)

    async def getSources(self) -> dict[str, FontSource]:
        sources = await self.validatedInput.getSources()
        return await self.processSources(sources)

    async def getGlyphMap(self) -> dict[str, list[int]]:
        return await self.processGlyphMap(await self.inputGlyphMap)

    async def getKerning(self) -> dict[str, Kerning]:
        kerning = await self.validatedInput.getKerning()
        return await self.processKerning(kerning)

    async def getFeatures(self) -> OpenTypeFeatures:
        features = await self.validatedInput.getFeatures()
        return await self.processFeatures(features)

    async def getCustomData(self) -> dict[str, Any]:
        customData = await self.validatedInput.getCustomData()
        return await self.processCustomData(customData)

    async def getUnitsPerEm(self) -> int:
        unitsPerEm = await self.validatedInput.getUnitsPerEm()
        return await self.processUnitsPerEm(unitsPerEm)

    async def getBackgroundImage(self, imageIdentifier: str) -> ImageData | None:
        assert hasattr(self.validatedInput, "getBackgroundImage")
        imageData = await self.validatedInput.getBackgroundImage(imageIdentifier)
        return await self.processBackgroundImage(imageData)

    # Default no-op process methods, to be overridden.

    # These methods should *not* modify the objects, but return modified *copies*

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        return glyph

    async def processFontInfo(self, fontInfo: FontInfo) -> FontInfo:
        return fontInfo

    async def processAxes(self, axes: Axes) -> Axes:
        return axes

    async def processSources(
        self, sources: dict[str, FontSource]
    ) -> dict[str, FontSource]:
        return sources

    async def processGlyphMap(
        self, glyphMap: dict[str, list[int]]
    ) -> dict[str, list[int]]:
        return glyphMap

    async def processKerning(self, kerning: dict[str, Kerning]) -> dict[str, Kerning]:
        return kerning

    async def processFeatures(self, features: OpenTypeFeatures) -> OpenTypeFeatures:
        return features

    async def processCustomData(self, customData):
        return customData

    async def processUnitsPerEm(self, unitsPerEm: int) -> int:
        return unitsPerEm

    async def processBackgroundImage(
        self, imageData: ImageData | None
    ) -> ImageData | None:
        return imageData


@registerFilterAction("memory-cache")
@dataclass(kw_only=True)
class MemoryCache(BaseFilter):
    def __post_init__(self):
        self._glyphCache = {}

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        if glyphName not in self._glyphCache:
            self._glyphCache[glyphName] = await self.validatedInput.getGlyph(glyphName)
        return self._glyphCache[glyphName]


@registerFilterAction("disk-cache")
@dataclass(kw_only=True)
class DiskCache(BaseFilter):
    def __post_init__(self):
        self._tempDir = tempfile.TemporaryDirectory(
            prefix="fontra-workflow-disk-cache-"
        )
        self._tempDirPath = pathlib.Path(self._tempDir.name)
        logger.info(f"disk-cache: created temp dir: {self._tempDir.name}")
        self._glyphFilePaths = {}

    async def aclose(self):
        await super().aclose()
        logger.info(f"disk-cache: cleaning up temp dir: {self._tempDir.name}")
        self._tempDir.cleanup()

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        path = self._glyphFilePaths.get(glyphName)
        if path is None:
            glyph = await self.validatedInput.getGlyph(glyphName)
            obj = unstructure(glyph)
            text = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
            path = self._tempDirPath / (stringToFileName(glyphName) + ".json")
            self._glyphFilePaths[glyphName] = path
            path.write_text(text, encoding="utf-8")
        else:
            text = path.read_text(encoding="utf-8")
            obj = json.loads(text)
            glyph = structure(obj, VariableGlyph)

        return glyph


def getActiveSources(sources):
    return [source for source in sources if not source.inactive]


def sparseLocation(location, defaultFontSourceLocation):
    return {k: v for k, v in location.items() if v != defaultFontSourceLocation[k]}


def locationToString(loc):
    # TODO: create module for helpers like this, duplicated from opentype.py
    parts = []
    for k, v in sorted(loc.items()):
        v = round(v, 5)  # enough to differentiate all 2.14 fixed values
        iv = int(v)
        if iv == v:
            v = iv
        parts.append(f"{k}={v}")
    return ",".join(parts)


def filterLocation(loc: dict[str, float], axisNames: set[str]) -> dict[str, float]:
    return {name: value for name, value in loc.items() if name in axisNames}
