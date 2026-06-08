from __future__ import annotations

import logging
import pathlib
from copy import deepcopy
from dataclasses import dataclass, field
from typing import get_type_hints

from ...core.classes import FontInfo, GlyphSource, VariableGlyph, structure, unstructure
from ..merger import cmapFromGlyphMap
from . import ActionError, registerFilterAction
from .base import BaseFilter

logger = logging.getLogger(__name__)


fontInfoNames = set(get_type_hints(FontInfo))


@registerFilterAction("set-font-info")
@dataclass(kw_only=True)
class SetFontInfo(BaseFilter):
    fontInfo: dict[str, str]

    async def processFontInfo(self, fontInfo: FontInfo) -> FontInfo:
        extraNames = set(self.fontInfo) - fontInfoNames
        if extraNames:
            extraNamesString = ", ".join(repr(n) for n in sorted(extraNames))
            logger.error(f"{self.actionName}: unknown name(s): {extraNamesString}")
        return structure(unstructure(fontInfo) | self.fontInfo, FontInfo)


@registerFilterAction("amend-cmap")
@dataclass(kw_only=True)
class AmendCmap(BaseFilter):
    cmap: dict[int | str, str | None] = field(default_factory=dict)
    cmapFile: str | None = None

    def __post_init__(self) -> None:
        self.cmap = {
            (
                codePoint
                if isinstance(codePoint, int)
                else parseCodePointString(codePoint, self.actionName)
            ): glyphName
            for codePoint, glyphName in self.cmap.items()
        }

        if not self.cmapFile:
            return
        path = pathlib.Path(self.cmapFile)
        assert path.is_file()

        cmap = {}
        for line in path.read_text().splitlines():
            parts = line.split()
            if len(parts) == 1:
                codePointString = parts[0]
                glyphName = None
            else:
                codePointString, glyphName = parts

            codePoint = parseCodePointString(codePointString, self.actionName)
            cmap[codePoint] = glyphName

        self.cmap = cmap | self.cmap

    async def processGlyphMap(
        self, glyphMap: dict[str, list[int]]
    ) -> dict[str, list[int]]:
        newGlyphMap: dict[str, list[int]] = {glyphName: [] for glyphName in glyphMap}
        cmap = cmapFromGlyphMap(glyphMap) | self.cmap
        for codePoint, glyphName in sorted(cmap.items()):
            if glyphName:
                if glyphName not in newGlyphMap:
                    logger.warning(
                        f"{self.actionName}: glyph {glyphName} does not exist"
                    )
                else:
                    newGlyphMap[glyphName].append(codePoint)
        return newGlyphMap


def parseCodePointString(codePointString, actionName):
    if not codePointString[:2] == "U+":
        raise ActionError(
            f"{actionName} codePoint must start with U+, found {codePointString}"
        )

    return int(codePointString[2:], 16)


@registerFilterAction("check-interpolation")
@dataclass(kw_only=True)
class CheckInterpolation(BaseFilter):
    fixWithFallback: bool = False

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        try:
            instancer = await self.fontInstancer.getGlyphInstancer(glyphName)
        except Exception as e:
            logger.error(
                f"{self.actionName}: glyph {glyphName} can't be interpolated {e!r}"
            )
            return None

        try:
            instancer.checkCompatibility()
        except Exception as e:
            if not self.fixWithFallback:
                raise

            logger.error(
                f"{self.actionName}: glyph {glyphName} can't be interpolated {e!r}"
            )
            glyph = VariableGlyph(
                name=glyphName,
                sources=[GlyphSource(name="default", layerName="default")],
                layers={
                    "default": deepcopy(
                        instancer.glyph.layers[instancer.fallbackSource.layerName]
                    )
                },
            )
        else:
            glyph = instancer.glyph

        return glyph


@registerFilterAction("drop-kerning")
@dataclass(kw_only=True)
class DropKerning(BaseFilter):
    async def processKerning(self, kerning):
        return {}


@registerFilterAction("drop-font-sources-and-kerning")
@dataclass(kw_only=True)
class DropFontSources(BaseFilter):
    async def processSources(self, sources):
        return {}

    async def processKerning(self, kerning):
        return {}
