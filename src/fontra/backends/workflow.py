from dataclasses import dataclass, field
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


@dataclass(kw_only=True)
class WorkflowBackend(ReadableBaseBackend):
    workflow: Workflow
    context: Any = None
    endPoint: ReadableFontBackend | None = field(init=False, default=None)

    @classmethod
    def fromPath(cls, path):
        config = yaml.safe_load(path.read_text())
        return cls(workflow=Workflow(config=config, parentDir=path.parent))

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
