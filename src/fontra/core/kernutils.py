from typing import Any

from fontTools.fontBuilder import FontBuilder
from ufo2ft.featureWriters.kernFeatureWriter import unicodeBidiType
from ufo2ft.util import classifyGlyphs

from .classes import FontAxis, Kerning

NestedKerningValues = dict[str, dict[str, list[float | None]]]
FlatKerningValues = dict[tuple[str, str], list[float | None]]
KerningGroups = dict[str, list[str]]


def splitKerningByDirection(
    kerning: Kerning,
    ltrGlyphs: set[str],
    rtlGlyphs: set[str],
) -> tuple[Kerning, Kerning]:
    ltrGroupsSide1, neutralGroupsSide1, rtlGroupsSide1 = classifyGroupsByDirection(
        kerning.groupsSide1, ltrGlyphs, rtlGlyphs
    )
    ltrGroupsSide2, neutralGroupsSide2, rtlGroupsSide2 = classifyGroupsByDirection(
        kerning.groupsSide2, ltrGlyphs, rtlGlyphs
    )

    unnestedValues = _unnestKerningValues(kerning.values)
    ltrValues: FlatKerningValues = {}
    rtlValues: FlatKerningValues = {}

    for (left, right), values in unnestedValues.items():
        leftGroup = left[1:] if left.startswith("@") else None
        rightGroup = right[1:] if right.startswith("@") else None

        leftIsLTR = (
            leftGroup in ltrGroupsSide1 if leftGroup is not None else left in ltrGlyphs
        )
        leftIsRTL = (
            leftGroup in rtlGroupsSide1 if leftGroup is not None else left in rtlGlyphs
        )

        rightIsLTR = (
            rightGroup in ltrGroupsSide2
            if rightGroup is not None
            else right in ltrGlyphs
        )
        rightIsRTL = (
            rightGroup in rtlGroupsSide2
            if rightGroup is not None
            else right in rtlGlyphs
        )

        if leftIsLTR or rightIsLTR:
            ltrValues[left, right] = values

        if leftIsRTL or rightIsRTL:
            rtlValues[left, right] = values

    ltrKerning = Kerning(
        groupsSide1=ltrGroupsSide1 | neutralGroupsSide1,
        groupsSide2=ltrGroupsSide2 | neutralGroupsSide2,
        sourceIdentifiers=kerning.sourceIdentifiers,
        values=_nestKerningValues(ltrValues),
    )

    rtlKerning = Kerning(
        groupsSide1=rtlGroupsSide1 | neutralGroupsSide1,
        groupsSide2=rtlGroupsSide2 | neutralGroupsSide2,
        sourceIdentifiers=kerning.sourceIdentifiers,
        values=_nestKerningValues(rtlValues),
    )

    return ltrKerning, rtlKerning


def classifyGroupsByDirection(
    groups: KerningGroups, ltrGlyphs: set[str], rtlGlyphs: set[str]
) -> tuple[KerningGroups, KerningGroups, KerningGroups]:
    ltrGroups: KerningGroups = {}
    neutralGroups: KerningGroups = {}
    rtlGroups: KerningGroups = {}

    for groupName, glyphNames in groups.items():
        isLTR = any(glyphName in ltrGlyphs for glyphName in glyphNames)
        isRTL = any(glyphName in rtlGlyphs for glyphName in glyphNames)
        if isLTR and not isRTL:
            ltrGroups[groupName] = glyphNames
        elif isRTL and not isLTR:
            rtlGroups[groupName] = glyphNames
        else:
            neutralGroups[groupName] = glyphNames

    return ltrGroups, neutralGroups, rtlGroups


def flipKerningDirection(kerning: Kerning) -> Kerning:
    unnestedValues = _unnestKerningValues(kerning.values)
    flippedValues = {
        (right, left): values for (left, right), values in unnestedValues.items()
    }

    return Kerning(
        groupsSide1=kerning.groupsSide2,
        groupsSide2=kerning.groupsSide1,
        sourceIdentifiers=kerning.sourceIdentifiers,
        values=_nestKerningValues(flippedValues),
    )


def classifyGlyphsByDirection(
    glyphMap: dict[str, list[int]], featureText: str, fontraAxes: list[FontAxis]
) -> tuple[set[str], set[str]]:
    cmap = {
        codePoint: glyphName
        for glyphName, codePoints in glyphMap.items()
        for codePoint in codePoints
    }
    classifications = classifyGlyphs(unicodeBidiType, cmap=cmap)
    if classifications.get("R"):
        glyphOrder = sorted({".notdef"} | set(glyphMap))
        gsub = compileGSUB(featureText, glyphOrder, fontraAxes)
        classifications = classifyGlyphs(unicodeBidiType, cmap=cmap, gsub=gsub)

    ltrGlyphs = classifications.get("L", set())
    rtlGlyphs = classifications.get("R", set())

    return ltrGlyphs, rtlGlyphs


def compileGSUB(
    featureText: str, glyphOrder: list[str], fontraAxes: list[FontAxis]
) -> Any | None:
    axes = [
        (axis.tag, axis.minValue, axis.defaultValue, axis.maxValue, axis.name)
        for axis in fontraAxes
    ]

    fb = FontBuilder(unitsPerEm=1000)

    fb.setupGlyphOrder(glyphOrder)
    if axes:
        fb.setupNameTable({})
        fb.setupFvar(axes, [])
    fb.addOpenTypeFeatures(featureText, tables={"GSUB"})

    return fb.font.get("GSUB")


def _unnestKerningValues(values: NestedKerningValues) -> FlatKerningValues:
    return {
        (left, right): values
        for left, rightDict in values.items()
        for right, values in rightDict.items()
    }


def _nestKerningValues(unnestedValues: FlatKerningValues) -> NestedKerningValues:
    nestedValues: NestedKerningValues = {}

    for (left, right), values in unnestedValues.items():
        if left not in nestedValues:
            nestedValues[left] = {}
        nestedValues[left][right] = values

    return nestedValues
