import asyncio
import pathlib
import shutil
from contextlib import aclosing

import pytest

from fontra.backends import getFileSystemBackend, newFileSystemBackend
from fontra.backends.copy import copyFont
from fontra.backends.fontra import longestCommonPrefix
from fontra.core.classes import ImageType, OpenTypeFeatures

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
