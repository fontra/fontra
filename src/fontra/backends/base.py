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

    async def getGlyphInfos(self) -> dict[str, Any]:
        return {}


class WritableBaseBackend(ReadableBaseBackend):
    async def putGlyph(
        self, glyphName: str, glyph: VariableGlyph, codePoints: list[int]
    ) -> None:
        raise NotImplementedError()

    async def deleteGlyph(self, glyphName: str) -> None:
        raise NotImplementedError()

    async def putFontInfo(self, fontInfo: FontInfo):
        raise NotImplementedError()

    async def putAxes(self, value: Axes) -> None:
        raise NotImplementedError()

    async def putSources(self, sources: dict[str, FontSource]) -> None:
        raise NotImplementedError()

    async def putGlyphMap(self, value: dict[str, list[int]]) -> None:
        raise NotImplementedError()

    async def putKerning(self, kerning: dict[str, Kerning]) -> None:
        raise NotImplementedError()

    async def putFeatures(self, features: OpenTypeFeatures) -> None:
        raise NotImplementedError()

    async def putCustomData(self, value: dict[str, Any]) -> None:
        raise NotImplementedError()

    async def putUnitsPerEm(self, value: int) -> None:
        raise NotImplementedError()

    async def putGlyphInfos(self, glyphInfos: dict[str, Any]) -> None:
        pass  # Better drop the glyph infos than to crash
