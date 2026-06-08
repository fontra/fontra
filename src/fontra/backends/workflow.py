from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from ..backends.base import ReadableBaseBackend
from ..core.classes import (
    Axes,
    FontInfo,
    FontSource,
    Kerning,
    OpenTypeFeatures,
    VariableGlyph,
)
from ..core.protocols import ReadableFontBackend
from ..workflow.workflow import Workflow
from .filewatcher import Change
from .watchable import WatchableBackend


@dataclass(kw_only=True)
class WorkflowBackend(WatchableBackend, ReadableBaseBackend):
    workflow: Workflow
    path: Path | None = None
    context: Any = field(init=False, default=None)
    endPoint: ReadableFontBackend | None = field(init=False, default=None)

    @classmethod
    def fromPath(cls, path: Path):
        return cls(workflow=_loadFromPath(path), path=path)

    async def _ensureSetup(self) -> ReadableFontBackend:
        if self.endPoint is None:
            self.context = self.workflow.endPoints()
            endPoints = await self.context.__aenter__()
            self.endPoint = endPoints.endPoint
            assert self.endPoint is not None
        return self.endPoint

    async def aclose(self) -> None:
        await self.context.__aexit__(None, None, None)

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        endPoint = await self._ensureSetup()
        return await endPoint.getGlyph(glyphName)

    async def getFontInfo(self) -> FontInfo:
        endPoint = await self._ensureSetup()
        return await endPoint.getFontInfo()

    async def getAxes(self) -> Axes:
        endPoint = await self._ensureSetup()
        return await endPoint.getAxes()

    async def getSources(self) -> dict[str, FontSource]:
        endPoint = await self._ensureSetup()
        return await endPoint.getSources()

    async def getGlyphMap(self) -> dict[str, list[int]]:
        endPoint = await self._ensureSetup()
        return await endPoint.getGlyphMap()

    async def getKerning(self) -> dict[str, Kerning]:
        endPoint = await self._ensureSetup()
        return await endPoint.getKerning()

    async def getFeatures(self) -> OpenTypeFeatures:
        endPoint = await self._ensureSetup()
        return await endPoint.getFeatures()

    async def getCustomData(self) -> dict[str, Any]:
        endPoint = await self._ensureSetup()
        return await endPoint.getCustomData()

    async def getUnitsPerEm(self) -> int:
        endPoint = await self._ensureSetup()
        return await endPoint.getUnitsPerEm()

    async def getGlyphInfos(self) -> dict[str, Any]:
        endPoint = await self._ensureSetup()
        return await endPoint.getGlyphInfos()

    async def fileWatcherProcessChanges(
        self, changes: set[tuple[Change, str]]
    ) -> dict[str, Any] | None:
        assert self.path is not None
        self.context = None
        self.endPoint = None
        self.workflow = _loadFromPath(self.path)
        return None  # Reload all

    def fileWatcherWasInstalled(self) -> None:
        if self.path is not None:
            self.fileWatcherSetPaths([self.path])


def _loadFromPath(path: Path) -> Workflow:
    config = yaml.safe_load(path.read_text())
    return Workflow(config=config, parentDir=path.parent)
