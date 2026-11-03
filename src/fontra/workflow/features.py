from dataclasses import dataclass, field
from enum import StrEnum
from typing import Iterable

import ufomerge

from fontra.core.classes import OpenTypeFeatures

EnumBaseClass: type


class LayoutHandling(StrEnum):
    SUBSET = "subset"
    CLOSURE = "closure"
    IGNORE = "ignore"


def mergeFeatures(
    featureTextA: str,
    glyphMapA: dict[str, list[int]],
    featureTextB: str,
    glyphMapB: dict[str, list[int]],
) -> tuple[str, dict[str, list[int]]]:
    ufoA = MinimalUFO(glyphMap=glyphMapA, features=OpenTypeFeatures(text=featureTextA))
    ufoB = MinimalUFO(glyphMap=glyphMapB, features=OpenTypeFeatures(text=featureTextB))

    merger = ufomerge.UFOMerger(ufoA, ufoB)
    merger.merge()

    return ufoA.features.text, ufoA.getMergedGlyphMap()


def subsetFeatures(
    featureText: str,
    glyphMap: dict[str, list[int]],
    keepGlyphNames: Iterable[str],
    layoutHandling=LayoutHandling.SUBSET,
) -> tuple[str, dict[str, list[int]]]:
    subsettedUFO = MinimalUFO()
    ufo = MinimalUFO(glyphMap=glyphMap, features=OpenTypeFeatures(text=featureText))

    merger = ufomerge.UFOMerger(
        subsettedUFO, ufo, glyphs=keepGlyphNames, layout_handling=layoutHandling
    )
    merger.merge()

    return subsettedUFO.features.text, subsettedUFO.getMergedGlyphMap()


@dataclass(kw_only=True)
class MinimalGlyph:
    name: str
    unicodes: list[int] = field(default_factory=list)
    components: list = field(default_factory=list)
    anchors: list = field(default_factory=list)


@dataclass(kw_only=True)
class MinimalUFOInfo:
    unitsPerEm: int = 1000


@dataclass(kw_only=True)
class MinimalUFO:
    glyphMap: dict[str, list[int]] = field(default_factory=dict)
    info: MinimalUFOInfo = field(default_factory=MinimalUFOInfo)
    features: OpenTypeFeatures = field(default_factory=OpenTypeFeatures)
    layers: dict = field(init=False, repr=False, default_factory=dict)
    groups: dict = field(init=False, repr=False, default_factory=dict)
    kerning: dict = field(init=False, repr=False, default_factory=dict)
    lib: dict = field(init=False, repr=False, default_factory=dict)
    updatedGlyphMap: dict[str, list[int]] = field(
        init=False, repr=False, default_factory=dict
    )

    def keys(self) -> Iterable[str]:
        return self.glyphMap.keys()

    def __contains__(self, glyphName: str) -> bool:
        return glyphName in self.glyphMap

    def __iter__(self) -> Iterable[MinimalGlyph]:
        for glyphName, codePoints in self.glyphMap.items():
            yield MinimalGlyph(name=glyphName, unicodes=codePoints)

    def __getitem__(self, glyphName: str) -> MinimalGlyph:
        if glyphName not in self.glyphMap:
            raise KeyError(glyphName)
        return MinimalGlyph(name=glyphName, unicodes=self.glyphMap[glyphName])

    def __setitem__(self, glyphName: str, glyph: MinimalGlyph) -> None:
        assert glyph.name == glyphName
        self.addGlyph(glyph)

    def addGlyph(self, glyph: MinimalGlyph) -> None:
        self.updatedGlyphMap[glyph.name] = glyph.unicodes

    def getMergedGlyphMap(self) -> dict[str, list[int]]:
        return self.glyphMap | self.updatedGlyphMap
