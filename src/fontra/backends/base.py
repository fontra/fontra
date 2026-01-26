from typing import Any

from ..core.classes import (
    Axes,
    FontInfo,
    FontSource,
    Kerning,
    OpenTypeFeatures,
    ShaperFontData,
    VariableGlyph,
)


class ReadableBaseBackend:

    async def aclose(self) -> None:
        pass

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        return None

    async def getFontInfo(self) -> FontInfo:
        return FontInfo()

    async def getAxes(self) -> Axes:
        return Axes()

    async def getSources(self) -> dict[str, FontSource]:
        return {}

    async def getGlyphMap(self) -> dict[str, list[int]]:
        return {}

    async def getKerning(self) -> dict[str, Kerning]:
        return {}

    async def getFeatures(self) -> OpenTypeFeatures:
        return OpenTypeFeatures()

    async def getCustomData(self) -> dict[str, Any]:
        return {}

    async def getUnitsPerEm(self) -> int:
        return 1000

    async def getShaperFontData(self) -> ShaperFontData | None:
        return None
