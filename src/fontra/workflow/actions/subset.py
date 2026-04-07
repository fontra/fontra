from __future__ import annotations

import logging
import pathlib
from dataclasses import dataclass, field, replace
from typing import Any

from ...core.async_property import async_cached_property
from ...core.classes import (
    ConditionalSubstitutions,
    Kerning,
    OpenTypeFeatures,
    VariableGlyph,
)
from ..features import LayoutHandling, subsetFeatures
from . import ActionError
from .base import BaseFilter, getActiveSources, registerFilterAction

logger = logging.getLogger(__name__)


@dataclass(kw_only=True)
class BaseGlyphSubsetter(BaseFilter):
    layoutHandling: str = LayoutHandling.SUBSET

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        glyphMap, _ = await self._subsettedGlyphMapAndFeatures
        if glyphName not in glyphMap:
            return None
        return await self.validatedInput.getGlyph(glyphName)

    async def processKerning(self, kerning: dict[str, Kerning]) -> dict[str, Kerning]:
        glyphMap, _ = await self._subsettedGlyphMapAndFeatures
        return subsetKerning(kerning, glyphMap)

    async def processConditionalSubstitutions(
        self, substitutions: ConditionalSubstitutions
    ) -> ConditionalSubstitutions:
        glyphMap, _ = await self._subsettedGlyphMapAndFeatures
        return subsetConditionalSubstitutions(substitutions, glyphMap)

    async def getFeatures(self) -> OpenTypeFeatures:
        _, features = await self._subsettedGlyphMapAndFeatures
        return features

    async def getGlyphMap(self) -> dict[str, list[int]]:
        glyphMap, _ = await self._subsettedGlyphMapAndFeatures
        return glyphMap

    async def processGlyphInfos(self, glyphInfos: dict[str, Any]) -> dict[str, Any]:
        glyphMap = await self.getGlyphMap()
        return filterGlyphDict(glyphInfos, glyphMap)

    @async_cached_property
    async def _subsettedGlyphMapAndFeatures(
        self,
    ) -> tuple[dict[str, list[int]], OpenTypeFeatures]:
        inputGlyphMap = await self.inputGlyphMap
        selectedGlyphs = await self._buildSubsettedGlyphSet(inputGlyphMap)

        if LayoutHandling(self.layoutHandling) == LayoutHandling.CLOSURE:
            selectedGlyphs = await self._conditionalSubstitutionsClosure(selectedGlyphs)

        selectedGlyphs, features = await self._featuresClosure(selectedGlyphs)
        selectedGlyphs = await self._componentsClosure(selectedGlyphs)
        glyphMap = filterGlyphDict(inputGlyphMap, selectedGlyphs)
        return glyphMap, features

    async def _buildSubsettedGlyphSet(
        self, inputGlyphMap: dict[str, list[int]]
    ) -> set[str]:
        # Override
        raise NotImplementedError

    async def _conditionalSubstitutionsClosure(
        self, selectedGlyphs: set[str]
    ) -> set[str]:
        substitutions = await self.validatedInput.getConditionalSubstitutions()
        additionalGlyphs = set()

        for rule in substitutions.rules:
            inputGlyphNames = selectedGlyphs & set(rule.substitutions)
            for glyphName in sorted(inputGlyphNames):
                additionalGlyphs.add(rule.substitutions[glyphName])

        return selectedGlyphs | additionalGlyphs

    async def _featuresClosure(
        self, selectedGlyphs
    ) -> tuple[set[str], OpenTypeFeatures]:
        features = await self.validatedInput.getFeatures()

        if features.language != "fea" and features.text:
            logger.warning(
                f"{self.actionName}: can't subset features in language={features.language}"
            )
        elif features.text:
            subsettedFeatureText, subsettedGlyphMap = subsetFeatures(
                features.text,
                await self.inputGlyphMap,
                keepGlyphNames=selectedGlyphs,
                layoutHandling=LayoutHandling(self.layoutHandling),
            )
            selectedGlyphs = set(subsettedGlyphMap)
            features = OpenTypeFeatures(text=subsettedFeatureText)

        return selectedGlyphs, features

    async def _componentsClosure(self, glyphNames) -> set[str]:
        glyphsToCheck = set(glyphNames)  # this set will shrink
        glyphNamesExpanded = set(glyphNames)  # this set may grow

        while glyphsToCheck:
            glyphName = glyphsToCheck.pop()

            try:
                glyph = await self.validatedInput.getGlyph(glyphName)
                if glyph is None:
                    raise ActionError(f"Unexpected missing glyph {glyphName}")
            except Exception as e:
                if glyphName != ".notdef":
                    logger.error(
                        f"{self.actionName}: glyph {glyphName} caused an error: {e!r}"
                    )
                continue

            componentNames = getComponentNames(glyph)
            uncheckedGlyphs = componentNames - glyphNamesExpanded
            glyphNamesExpanded.update(uncheckedGlyphs)
            glyphsToCheck.update(uncheckedGlyphs)

        return glyphNamesExpanded


def subsetKerning(kerning, glyphNames):
    newKerning = {}
    for kernType, kernTable in kerning.items():
        newKernTable = subsetKernTable(kernTable, glyphNames)
        if newKernTable.values:
            newKerning[kernType] = newKernTable
    return newKerning


def subsetKernTable(kernTable, glyphNames):
    newGroupsSide1 = subsetGroups(kernTable.groupsSide1, glyphNames)
    newGroupsSide2 = subsetGroups(kernTable.groupsSide2, glyphNames)

    groupSide1Names = {"@" + groupName for groupName in newGroupsSide1.keys()}
    groupSide2Names = {"@" + groupName for groupName in newGroupsSide2.keys()}

    newValues = {}
    for left, rightDict in kernTable.values.items():
        rightDict = {
            right: values
            for right, values in rightDict.items()
            if right in glyphNames or right in groupSide2Names
        }
        if rightDict and (left in glyphNames or left in groupSide1Names):
            newValues[left] = rightDict

    # TODO: should groups be dropped that are not used (anymore) in the subsetted
    # kerning?

    return replace(
        kernTable,
        groupsSide1=newGroupsSide1,
        groupsSide2=newGroupsSide2,
        values=newValues,
    )


def subsetGroups(groups, glyphNames):
    newGroups = {}
    for groupName, group in groups.items():
        group = [glyphName for glyphName in group if glyphName in glyphNames]
        if group:
            newGroups[groupName] = group
    return newGroups


def subsetConditionalSubstitutions(
    substitutions: ConditionalSubstitutions, glyphNames: set[str]
) -> ConditionalSubstitutions:
    subsettedRules = [
        subsetSubstitutionRule(rule, glyphNames) for rule in substitutions.rules
    ]
    subsettedRules = [rule for rule in subsettedRules if rule.substitutions]

    return ConditionalSubstitutions(
        featureTags=list(substitutions.featureTags), rules=subsettedRules
    )


def subsetSubstitutionRule(rule, glyphNames):
    return replace(
        rule,
        substitutions={
            g1: g2
            for g1, g2 in rule.substitutions.items()
            if g1 in glyphNames and g2 in glyphNames
        },
    )


def getComponentNames(glyph):
    return {
        compo.name
        for layer in glyph.layers.values()
        for compo in layer.glyph.components
    }


def filterGlyphDict(glyphMap, glyphNames):
    return {
        glyphName: value
        for glyphName, value in glyphMap.items()
        if glyphName in glyphNames
    }


@registerFilterAction("drop-unreachable-glyphs")
@dataclass(kw_only=True)
class DropUnreachableGlyphs(BaseGlyphSubsetter):
    keepNotdef: bool = True
    layoutHandling: str = LayoutHandling.CLOSURE

    async def _buildSubsettedGlyphSet(
        self, inputGlyphMap: dict[str, list[int]]
    ) -> set[str]:
        reachableGlyphs = {
            glyphName for glyphName, codePoints in inputGlyphMap.items() if codePoints
        }

        if self.keepNotdef and ".notdef" in inputGlyphMap:
            reachableGlyphs.add(".notdef")

        return reachableGlyphs


@registerFilterAction("subset-glyphs")
@dataclass(kw_only=True)
class SubsetGlyphs(BaseGlyphSubsetter):
    glyphNames: set[str] = field(default_factory=set)
    glyphNamesFile: str | None = None
    dropGlyphNames: set[str] = field(default_factory=set)
    dropGlyphNamesFile: str | None = None

    def __post_init__(self):
        if self.glyphNamesFile:
            path = pathlib.Path(self.glyphNamesFile)
            assert path.is_file()
            glyphNames = set(path.read_text().split())
            self.glyphNames = set(self.glyphNames) | glyphNames
        if self.dropGlyphNamesFile:
            path = pathlib.Path(self.dropGlyphNamesFile)
            assert path.is_file()
            dropGlyphNames = set(path.read_text().split())
            self.dropGlyphNames = set(self.dropGlyphNames) | dropGlyphNames

    async def _buildSubsettedGlyphSet(
        self, inputGlyphMap: dict[str, list[int]]
    ) -> set[str]:
        glyphNames = set(self.glyphNames)
        if not glyphNames and self.dropGlyphNames:
            glyphNames = set(inputGlyphMap)
        if self.dropGlyphNames:
            glyphNames = glyphNames - set(self.dropGlyphNames)

        return glyphNames


@registerFilterAction("subset-by-development-status")
@dataclass(kw_only=True)
class SubsetByDevelopmentStatus(BaseGlyphSubsetter):
    statuses: list[int]
    sourceSelectBehavior: str = (
        "default"  # "any", "all" or "default" (the default source)
    )

    async def _buildSubsettedGlyphSet(
        self, inputGlyphMap: dict[str, list[int]]
    ) -> set[str]:
        statuses = set(self.statuses)
        selectedGlyphs = set()

        for glyphName in inputGlyphMap:
            if self.sourceSelectBehavior == "default":
                try:
                    instancer = await self.fontInstancer.getGlyphInstancer(
                        glyphName, fixComponentLocationCompatibility=False
                    )
                except Exception as e:
                    logger.error(
                        f"{self.actionName}: glyph {glyphName} caused an error: {e!r}"
                    )
                    continue
                sources = [instancer.fallbackSource]
                selectFunc = any
            else:
                selectFunc = any if self.sourceSelectBehavior == "any" else all
                glyph = await self.validatedInput.getGlyph(glyphName)
                if glyph is None:
                    continue
                sources = getActiveSources(glyph.sources)

            if selectFunc(
                source.customData.get("fontra.development.status") in statuses
                for source in sources
            ):
                selectedGlyphs.add(glyphName)

        return selectedGlyphs
