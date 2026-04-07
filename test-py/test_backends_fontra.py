import asyncio
import pathlib
import shutil
from contextlib import aclosing
from copy import deepcopy

import pytest

from fontra.backends import getFileSystemBackend, newFileSystemBackend
from fontra.backends.copy import copyFont
from fontra.backends.fontra import longestCommonPrefix
from fontra.core.classes import (
    ConditionalSubstitutions,
    ImageType,
    Kerning,
    OpenTypeFeatures,
    SubstitionRule,
    SubstitutionCondition,
    SubstitutionConditionSet,
)
from fontra.core.fonthandler import FontHandler
from fontra.filesystem.projectmanager import FileSystemProjectManager

dataDir = pathlib.Path(__file__).resolve().parent / "data"
commonFontsDir = pathlib.Path(__file__).parent.parent / "test-common" / "fonts"


@pytest.fixture
def testDSFont():
    return getFileSystemBackend(dataDir / "mutatorsans" / "MutatorSans.designspace")


@pytest.fixture
def testFontraFont():
    return getFileSystemBackend(commonFontsDir / "MutatorSans.fontra")


@pytest.fixture
def writableFontraFont(tmpdir):
    srcPath = commonFontsDir / "MutatorSans.fontra"
    dstPath = tmpdir / "MutatorSans.fontra"
    shutil.copytree(srcPath, dstPath)
    return getFileSystemBackend(dstPath)


@pytest.fixture
def newFontraFont(tmpdir):
    return newFileSystemBackend(tmpdir / "newfont.fontra")


async def test_copy_to_fontra(testDSFont, newFontraFont):
    async with aclosing(newFontraFont):
        await copyFont(testDSFont, newFontraFont)

    fontraFont = getFileSystemBackend(newFontraFont.path)

    for dstFont in [newFontraFont, fontraFont]:
        for glyphName in ["A", "B", "E", "Q", "nlitest", "varcotest1"]:
            srcGlyph = await testDSFont.getGlyph(glyphName)
            dstGlyph = await dstFont.getGlyph(glyphName)
            assert srcGlyph == dstGlyph
        assert await testDSFont.getAxes() == await dstFont.getAxes()


async def test_fontraFormat(testFontraFont, newFontraFont):
    async with aclosing(newFontraFont):
        await copyFont(testFontraFont, newFontraFont)

    glyphMap = await newFontraFont.getGlyphMap()

    for glyphName in glyphMap:
        assert testFontraFont.getGlyphData(glyphName) == newFontraFont.getGlyphData(
            glyphName
        )
    assert await testFontraFont.getAxes() == await newFontraFont.getAxes()

    assert testFontraFont.fontDataPath.read_text(
        encoding="utf-8"
    ) == newFontraFont.fontDataPath.read_text(encoding="utf-8")

    assert testFontraFont.glyphInfoPath.read_text(
        encoding="utf-8"
    ) == newFontraFont.glyphInfoPath.read_text(encoding="utf-8")


async def test_deleteGlyph(writableFontraFont):
    glyphName = "A"
    assert writableFontraFont.getGlyphFilePath(glyphName).exists()
    assert await writableFontraFont.getGlyph(glyphName) is not None
    await writableFontraFont.deleteGlyph(glyphName)
    await asyncio.sleep(0.01)
    assert await writableFontraFont.getGlyph(glyphName) is None
    assert not writableFontraFont.getGlyphFilePath(glyphName).exists()
    reopenedFont = getFileSystemBackend(writableFontraFont.path)
    assert await reopenedFont.getGlyph(glyphName) is None


async def test_deleteUnknownGlyph(writableFontraFont):
    glyphName = "A.doesnotexist"
    glyphMap = await writableFontraFont.getGlyphMap()
    assert glyphName not in glyphMap
    # .deleteGlyph() should *not* raise an error if glyphName doesn't exist
    await writableFontraFont.deleteGlyph(glyphName)


async def test_emptyFontraProject(tmpdir):
    path = tmpdir / "newfont.fontra"
    backend = newFileSystemBackend(path)
    await backend.aclose()

    backend = getFileSystemBackend(path)
    glyphMap = await backend.getGlyphMap()
    assert [] == list(glyphMap)


test_featureData = OpenTypeFeatures(language="fea", text="# dummy fea data\n")


async def test_features(writableFontraFont):
    blankFeatures = await writableFontraFont.getFeatures()
    assert blankFeatures == OpenTypeFeatures()

    await writableFontraFont.putFeatures(test_featureData)
    writableFontraFont.flush()
    assert writableFontraFont.featureTextPath.is_file()

    reopenedFont = getFileSystemBackend(writableFontraFont.path)
    assert await reopenedFont.getFeatures() == test_featureData

    await writableFontraFont.putFeatures(OpenTypeFeatures())
    writableFontraFont.flush()
    assert not writableFontraFont.featureTextPath.is_file()

    reopenedFont = getFileSystemBackend(writableFontraFont.path)
    assert await reopenedFont.getFeatures() == OpenTypeFeatures()


async def test_statusFieldDefinitions(writableFontraFont):
    customData = await writableFontraFont.getCustomData()
    assert {} == customData

    statusTestData = {
        "fontra.sourceStatusFieldDefinitions": [
            {
                "color": [1, 0, 0, 1],
                "isDefault": True,
                "label": "In progress",
                "value": 0,
            },
            {"color": [1, 0.5, 0, 1], "label": "Checking-1", "value": 1},
            {"color": [1, 1, 0, 1], "label": "Checking-2", "value": 2},
            {"color": [0, 0.5, 1, 1], "label": "Checking-3", "value": 3},
            {"color": [0, 1, 0.5, 1], "label": "Validated", "value": 4},
        ]
    }
    await writableFontraFont.putCustomData(statusTestData)

    assert statusTestData == await writableFontraFont.getCustomData()


async def test_findGlyphsThatUseGlyph(writableFontraFont):
    async with aclosing(writableFontraFont):
        assert [
            "Aacute",
            "Adieresis",
            "varcotest1",
        ] == await writableFontraFont.findGlyphsThatUseGlyph("A")
        await writableFontraFont.deleteGlyph("Adieresis")
        assert [
            "Aacute",
            "varcotest1",
        ] == await writableFontraFont.findGlyphsThatUseGlyph("A")
        glyph = await writableFontraFont.getGlyph("Aacute")
        await writableFontraFont.putGlyph("B", glyph, [ord("B")])
        assert [
            "Aacute",
            "B",
            "varcotest1",
        ] == await writableFontraFont.findGlyphsThatUseGlyph("A")


async def test_getBackgroundImage(testFontraFont):
    glyph = await testFontraFont.getGlyph("C")
    bgImage = None
    for layer in glyph.layers.values():
        if layer.glyph.backgroundImage is not None:
            bgImage = layer.glyph.backgroundImage
            break
    assert bgImage is not None

    imageData = await testFontraFont.getBackgroundImage(bgImage.identifier)
    assert imageData.type == ImageType.PNG
    assert len(imageData.data) == 60979


longestCommonPrefixTestData = [
    ([], ""),
    ([""], ""),
    (["a"], "a"),
    (["abcdef"], "abcdef"),
    (["abcdef", "abcdefgh"], "abcdef"),
    (["abc", "ab", "abde", "abdef"], "ab"),
    (["abc", "ab", "abde", "abdef", "a"], "a"),
    (["abc", "ab", "abde", "abdef", ""], ""),
]


@pytest.mark.parametrize("strings, expectedPrefix", longestCommonPrefixTestData)
def test_longestCommonPrefix(strings, expectedPrefix):
    assert longestCommonPrefix(strings) == expectedPrefix


kerningEdgeCasesTestData = [
    (False, False, False, False, 0),
    (True, False, False, False, 10),
    (False, True, False, False, 10),
    (True, True, False, False, 11),
    (False, False, True, False, 10),
    (True, False, True, False, 11),
    (False, True, True, False, 11),
    (True, True, True, False, 12),
    (False, False, False, True, 12),
    (True, False, False, True, 23),
]


@pytest.mark.parametrize(
    "hasGroupsSide1, hasGroupsSide2, hasValues, hasVkrn, expectedNumLines",
    kerningEdgeCasesTestData,
)
async def test_kerningEdgeCases(
    tmpdir, hasGroupsSide1, hasGroupsSide2, hasValues, hasVkrn, expectedNumLines
):
    dstPath = tmpdir / "test.fontra"
    font = newFileSystemBackend(dstPath)
    kerning = {
        "kern": Kerning(
            groupsSide1={"A": ["A"]} if hasGroupsSide1 else {},
            groupsSide2={"A": ["A"]} if hasGroupsSide2 else {},
            sourceIdentifiers=["---"],
            values={"A": {"A": [-10]}} if hasValues else {},
        )
    }
    if hasVkrn:
        kerning["vkrn"] = Kerning(
            groupsSide1={"A": ["A"]},
            groupsSide2={"A": ["A"]},
            sourceIdentifiers=["---"],
            values={"A": {"A": [-10]}},
        )

    async with aclosing(font):
        await font.putKerning(kerning)

    kerningPath = dstPath / "kerning.csv"

    if expectedNumLines:
        with open(kerningPath) as f:
            numLines = len(f.readlines())
            assert numLines == expectedNumLines
    else:
        assert not kerningPath.exists()


async def test_externalChanges(writableFontraFont):
    listenerFont = getFileSystemBackend(writableFontraFont.path)
    listenerHandler = FontHandler(
        backend=listenerFont,
        projectIdentifier="test",
        metaInfoProvider=FileSystemProjectManager(),
    )

    async with aclosing(listenerHandler):
        await listenerHandler.startTasks()

        glyphName = "A"

        listenerGlyphMap = await listenerHandler.getGlyphMap()  # load in cache
        listenerGlyph = await listenerHandler.getGlyph(glyphName)  # load in cache
        listenerFontInfo = await listenerHandler.getFontInfo()  # load in cache
        listenerKerning = await listenerHandler.getKerning()  # load in cache
        listenerFeatures = await listenerHandler.getFeatures()  # load in cache

        glyphMap = await writableFontraFont.getGlyphMap()
        glyphMap[glyphName] = glyphMap[glyphName][:1]
        glyph = await writableFontraFont.getGlyph(glyphName)
        layerGlyph = glyph.layers[glyph.sources[0].layerName].glyph
        layerGlyph.path.coordinates[0] = 999

        fontInfo = await writableFontraFont.getFontInfo()
        fontInfo.familyName += "TESTING"

        kerning = await writableFontraFont.getKerning()
        kerning["kern"].values["A"]["J"][1] = 999

        features = await writableFontraFont.getFeatures()
        features.text += "\n# TEST"

        await writableFontraFont.putGlyph(glyphName, glyph, glyphMap[glyphName])
        await writableFontraFont.putFontInfo(fontInfo)
        await writableFontraFont.putKerning(kerning)
        await writableFontraFont.putFeatures(features)

        writableFontraFont.flush()

        await asyncio.sleep(0.15)  # give the file watcher a moment to catch up

        listenerGlyph = await listenerHandler.getGlyph(glyphName)
        assert glyph == listenerGlyph

        listenerFontInfo = await listenerHandler.getFontInfo()
        assert fontInfo == listenerFontInfo

        listenerKerning = await listenerHandler.getKerning()
        assert kerning == listenerKerning

        listenerFeatures = await listenerHandler.getFeatures()
        assert features == listenerFeatures

        listenerGlyphMap = await listenerHandler.getGlyphMap()
        assert glyphMap == listenerGlyphMap


async def test_putGlyphInfos(writableFontraFont):
    newGlyphsInfos = {
        "dot": {"category": "Mark", "subcategory": "Nonspacing"},
        "A": {"subcategory": "Ligature"},
        "B": {"custom": "anything"},
    }

    async with aclosing(writableFontraFont):
        glyphInfos = await writableFontraFont.getGlyphInfos()
        assert glyphInfos == {}
        await writableFontraFont.putGlyphInfos(newGlyphsInfos)

    reopenedFont = getFileSystemBackend(writableFontraFont.path)
    glyphInfos = await reopenedFont.getGlyphInfos()
    assert glyphInfos == newGlyphsInfos


expectedConditionalSubstitutions = ConditionalSubstitutions(
    featureTags=["rclt"],
    rules=[
        SubstitionRule(
            name="fold_I_serifs",
            conditionSets=[
                SubstitutionConditionSet(
                    conditions=[
                        SubstitutionCondition(
                            name="width", minValue=0.0, maxValue=328.0
                        )
                    ]
                )
            ],
            substitutions={"I": "I.narrow"},
        ),
        SubstitionRule(
            name="fold_S_terminals",
            conditionSets=[
                SubstitutionConditionSet(
                    conditions=[
                        SubstitutionCondition(
                            name="width", minValue=0.0, maxValue=1000.0
                        ),
                        SubstitutionCondition(
                            name="weight", minValue=0.0, maxValue=500.0
                        ),
                    ]
                )
            ],
            substitutions={"S": "S.closed"},
        ),
    ],
)


async def test_readWriteConditionalSubstitutions(writableFontraFont):
    substitutions = await writableFontraFont.getConditionalSubstitutions()
    assert substitutions == expectedConditionalSubstitutions

    modfiedExpected = deepcopy(expectedConditionalSubstitutions)
    modfiedExpected.rules[1].substitutions["A"] = "B"

    await writableFontraFont.putConditionalSubstitutions(modfiedExpected)
    await writableFontraFont.aclose()

    reopenedFont = getFileSystemBackend(writableFontraFont.path)
    reopenedSubstitutions = await reopenedFont.getConditionalSubstitutions()
    assert reopenedSubstitutions == modfiedExpected
