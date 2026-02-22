from __future__ import annotations

import argparse
from types import SimpleNamespace
from typing import Any, Awaitable, Callable, Protocol, runtime_checkable

from aiohttp import web

from .classes import (
    Axes,
    FontInfo,
    FontSource,
    ImageData,
    Kerning,
    OpenTypeFeatures,
    ShaperFontData,
    VariableGlyph,
)


@runtime_checkable
class ReadableFontBackend(Protocol):
    async def aclose(self) -> None:
        pass

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        pass

    async def getFontInfo(self) -> FontInfo:
        pass

    async def getAxes(self) -> Axes:
        pass

    async def getSources(self) -> dict[str, FontSource]:
        pass

    async def getGlyphMap(self) -> dict[str, list[int]]:
        pass

    async def getKerning(self) -> dict[str, Kerning]:
        pass

    async def getFeatures(self) -> OpenTypeFeatures:
        pass

    async def getCustomData(self) -> dict[str, Any]:
        pass

    async def getUnitsPerEm(self) -> int:
        pass

    async def getShaperFontData(self) -> ShaperFontData | None:
        pass


@runtime_checkable
class WritableFontBackend(ReadableFontBackend, Protocol):
    async def putGlyph(
        self, glyphName: str, glyph: VariableGlyph, codePoints: list[int]
    ) -> None:
        pass

    async def deleteGlyph(self, glyphName: str) -> None:
        pass

    async def putFontInfo(self, fontInfo: FontInfo):
        pass

    async def putAxes(self, value: Axes) -> None:
        pass

    async def putSources(self, sources: dict[str, FontSource]) -> None:
        pass

    async def putGlyphMap(self, value: dict[str, list[int]]) -> None:
        pass

    async def putKerning(self, kerning: dict[str, Kerning]) -> None:
        pass

    async def putFeatures(self, features: OpenTypeFeatures) -> None:
        pass

    async def putCustomData(self, value: dict[str, Any]) -> None:
        pass

    async def putUnitsPerEm(self, value: int) -> None:
        pass


@runtime_checkable
class WatchableFontBackend(Protocol):
    async def watchExternalChanges(
        self, callback: Callable[[Any], Awaitable[None]]
    ) -> None:
        pass


@runtime_checkable
class ReadBackgroundImage(Protocol):
    async def getBackgroundImage(self, imageIdentifier: str) -> ImageData | None:
        pass


@runtime_checkable
class WriteBackgroundImage(Protocol):
    async def putBackgroundImage(self, imageIdentifier: str, data: ImageData) -> None:
        pass

    # TODO: since the image data does not itself participate in change messages,
    # we may depend on the backend itself to purge unused images.
    # async def deleteBackgroundImage(self, imageIdentifier: str) -> None:
    #     pass


@runtime_checkable
class ProjectManagerFactory(Protocol):
    @staticmethod
    def addArguments(parser: argparse.ArgumentParser) -> None:
        pass

    @staticmethod
    def getProjectManager(arguments: SimpleNamespace) -> ProjectManager:
        pass


@runtime_checkable
class ProjectManager(Protocol):
    async def aclose(self) -> None:
        pass

    async def authorize(self, request: web.Request) -> str | None:
        pass

    async def projectAvailable(self, projectIdentifier: str, token: str) -> bool:
        pass

    async def getRemoteSubject(self, projectIdentifier: str, token: str) -> Any:
        pass

    async def getProjectList(self, token: str) -> list[str]:
        pass

    async def rootDocumentHandler(self, request: web.Request) -> web.Response:
        pass

    def setupWebRoutes(self, server) -> None:
        pass


@runtime_checkable
class MetaInfoProvider(Protocol):
    async def getMetaInfo(
        self, projectIdentifier: str, authorizationToken: str
    ) -> dict[str, Any]:
        pass

    async def putMetaInfo(
        self, projectIdentifier: str, metaInfo: dict[str, Any], authorizationToken: str
    ) -> None:
        pass


@runtime_checkable
class ExportManager(Protocol):
    async def exportAs(self, projectIdentifier: str, options: dict):
        pass

    def getSupportedExportFormats(self) -> list[str]:
        pass


@runtime_checkable
class ProjectOpenListener(Protocol):
    def projectOpened(self, projectIdentifier: str) -> None:
        pass

    def projectClosed(self, projectIdentifier: str) -> None:
        pass
