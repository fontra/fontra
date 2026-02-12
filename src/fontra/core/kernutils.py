from dataclasses import replace
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

        leftIsRTL = (
            leftGroup in rtlGroupsSide1 if leftGroup is not None else left in rtlGlyphs
        )

        rightIsRTL = (
            rightGroup in rtlGroupsSide2
            if rightGroup is not None
            else right in rtlGlyphs
        )

        if leftIsRTL or rightIsRTL:
            rtlValues[left, right] = values
        else:
            ltrValues[left, right] = values

    ltrNeutralGroupsSide1, ltrNeutralGroupsSide2 = _filterGroupsByValueUsage(
        neutralGroupsSide1, neutralGroupsSide2, ltrValues
    )

    ltrKerning = Kerning(
        groupsSide1=ltrGroupsSide1 | ltrNeutralGroupsSide1,
        groupsSide2=ltrGroupsSide2 | ltrNeutralGroupsSide2,
        sourceIdentifiers=kerning.sourceIdentifiers,
        values=_nestKerningValues(ltrValues),
    )

    rtlNeutralGroupsSide1, rtlNeutralGroupsSide2 = _filterGroupsByValueUsage(
        neutralGroupsSide1, neutralGroupsSide2, rtlValues
    )

    rtlKerning = Kerning(
        groupsSide1=rtlGroupsSide1 | rtlNeutralGroupsSide1,
        groupsSide2=rtlGroupsSide2 | rtlNeutralGroupsSide2,
        sourceIdentifiers=kerning.sourceIdentifiers,
        values=_nestKerningValues(rtlValues),
    )

    return ltrKerning, rtlKerning


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


def mergeKerning(kerningA: Kerning, kerningB: Kerning) -> Kerning:
    assert kerningA.sourceIdentifiers == kerningB.sourceIdentifiers
    kerningB = disambiguateKerningGroupNames(kerningB, kerningA, True)
    return Kerning(
        groupsSide1=kerningA.groupsSide1 | kerningB.groupsSide1,
        groupsSide2=kerningA.groupsSide2 | kerningB.groupsSide2,
        sourceIdentifiers=kerningA.sourceIdentifiers,
        values=_nestKerningValues(
            _unnestKerningValues(kerningA.values)
            | _unnestKerningValues(kerningB.values)
        ),
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


def disambiguateKerningGroupNames(
    kernTableA: Kerning, kernTableB: Kerning, allowSameGroupContents: bool = False
) -> Kerning:
    groupSide1NameMap, pairSide1NameMap = _getConflictResolutionMappings(
        kernTableA.groupsSide1, kernTableB.groupsSide1, allowSameGroupContents
    )

    groupSide2NameMap, pairSide2NameMap = _getConflictResolutionMappings(
        kernTableA.groupsSide2, kernTableB.groupsSide2, allowSameGroupContents
    )

    if not groupSide1NameMap and not groupSide2NameMap:
        return kernTableA

    groupsSide1 = _renameGroups(kernTableA.groupsSide1, groupSide1NameMap)
    groupsSide2 = _renameGroups(kernTableA.groupsSide2, groupSide2NameMap)

    values = {
        pairSide1NameMap.get(left, left): {
            pairSide2NameMap.get(right, right): values
            for right, values in rightDict.items()
        }
        for left, rightDict in kernTableA.values.items()
    }

    return replace(
        kernTableA, groupsSide1=groupsSide1, groupsSide2=groupsSide2, values=values
    )


def _getConflictResolutionMappings(
    groupsA: KerningGroups, groupsB: KerningGroups, allowSameGroupContents: bool
) -> tuple[dict[str, str], dict[str, str]]:
    groupsNamesA = set(groupsA)
    groupsNamesB = set(groupsB)

    if groupsNamesA.isdisjoint(groupsNamesB):
        return {}, {}

    conflictingNames = groupsNamesA & groupsNamesB
    usedNames = groupsNamesA | groupsNamesB

    groupNameMap = {}
    for name in sorted(conflictingNames):
        if allowSameGroupContents and groupsA[name] == groupsB[name]:
            continue
        count = 1
        while True:
            newName = f"{name}.{count}"
            if newName not in usedNames:
                break
            count += 1
        usedNames.add(newName)
        groupNameMap[name] = newName

    pairNameMap = {"@" + k: "@" + v for k, v in groupNameMap.items()}

    return groupNameMap, pairNameMap


def _renameGroups(groups: KerningGroups, renameMap: dict[str, str]) -> KerningGroups:
    return {renameMap.get(name, name): group for name, group in groups.items()}


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


def _filterGroupsByValueUsage(groupsSide1, groupsSide2, unnestedValues):
    leftUsedGroupNames = set()
    rightUsedGroupNames = set()

    for left, right in unnestedValues.keys():
        if left.startswith("@"):
            leftUsedGroupNames.add(left[1:])
        if right.startswith("@"):
            rightUsedGroupNames.add(right[1:])

    filteredGroupsSide1 = {
        k: v for k, v in groupsSide1.items() if k in leftUsedGroupNames
    }
    filteredGroupsSide2 = {
        k: v for k, v in groupsSide2.items() if k in rightUsedGroupNames
    }

    return filteredGroupsSide1, filteredGroupsSide2
