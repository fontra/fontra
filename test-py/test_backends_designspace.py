import pathlib
import shutil
from contextlib import aclosing
from dataclasses import asdict

import pytest
from fontTools.designspaceLib import DesignSpaceDocument

from fontra.backends import getFileSystemBackend, newFileSystemBackend
from fontra.backends.designspace import DesignspaceBackend, UFOBackend
from fontra.core.classes import (
    Anchor,
    Axes,
    FontAxis,
    GlyphAxis,
    GlyphSource,
    Layer,
    MultipleAxisMapping,
    StaticGlyph,
    unstructure,
)

dataDir = pathlib.Path(__file__).resolve().parent / "data"


def getTestFont():
    return DesignspaceBackend.fromPath(
        dataDir / "mutatorsans" / "MutatorSans.designspace"
    )


@pytest.fixture
def testFont():
    return getTestFont()


def getFontSingleUFO():
    return UFOBackend.fromPath(
        dataDir / "mutatorsans" / "MutatorSansLightCondensed.ufo"
    )


@pytest.fixture
def testFontSingleUFO():
    return getFontSingleUFO()


@pytest.fixture
def writableTestFont(tmpdir):
    mutatorPath = dataDir / "mutatorsans"
    for sourcePath in mutatorPath.iterdir():
        if sourcePath.suffix not in {".designspace", ".ufo"}:
            continue
        destPath = tmpdir / sourcePath.name
        if sourcePath.is_dir():
            shutil.copytree(sourcePath, destPath)
        else:
            shutil.copy(sourcePath, destPath)
    return DesignspaceBackend.fromPath(tmpdir / "MutatorSans.designspace")


@pytest.fixture
def writableTestFontSingleUFO(tmpdir):
    sourcePath = dataDir / "mutatorsans" / "MutatorSansLightCondensed.ufo"
    destPath = tmpdir / sourcePath.name
    shutil.copytree(sourcePath, destPath)
    return UFOBackend.fromPath(destPath)


def readGLIFData(glyphName, ufoLayers):
    glyphSets = {layer.fontraLayerName: layer.glyphSet for layer in ufoLayers}
    return {
        layerName: glyphSet.getGLIF(glyphName).decode("utf-8")
        for layerName, glyphSet in glyphSets.items()
        if glyphName in glyphSet
    }


@pytest.mark.parametrize(
    "glyphName", ["A", "B", "Q", "R.alt", "varcotest1", "varcotest2"]
)
async def test_roundTripGlyph(writableTestFont, glyphName):
    existingData = readGLIFData(glyphName, writableTestFont.ufoLayers)
    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    newData = readGLIFData(glyphName, writableTestFont.ufoLayers)
    for layerName in existingData:
        assert existingData[layerName] == newData[layerName], layerName
    assert existingData == newData  # just in case the keys differ


@pytest.mark.parametrize("glyphName", ["A"])
async def test_roundTripGlyphSingleUFO(writableTestFontSingleUFO, glyphName):
    existingData = readGLIFData(glyphName, writableTestFontSingleUFO.ufoLayers)
    glyphMap = await writableTestFontSingleUFO.getGlyphMap()
    glyph = await writableTestFontSingleUFO.getGlyph(glyphName)

    await writableTestFontSingleUFO.putGlyph(glyphName, glyph, glyphMap[glyphName])

    newData = readGLIFData(glyphName, writableTestFontSingleUFO.ufoLayers)
    for layerName in existingData:
        assert existingData[layerName] == newData[layerName], layerName
    assert existingData == newData  # just in case the keys differ


@pytest.mark.parametrize(
    "location, expectedDSSource",
    [
        (
            {"italic": 0, "weight": 400, "width": 0},
            dict(
                location=dict(italic=0, weight=400, width=0),
                styleName="mid",
                filename="MutatorSansLightCondensed.ufo",
                layerName="mid",
            ),
        ),
        (
            {"italic": 0, "weight": 400, "width": 1000},
            dict(
                location=dict(italic=0, weight=400, width=1000),
                styleName="mid",
                filename="MutatorSansLightWide.ufo",
                layerName="mid",
            ),
        ),
    ],
)
async def test_addNewSparseSource(writableTestFont, location, expectedDSSource):
    glyphName = "A"
    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)
    dsSources = unpackSources(writableTestFont.dsDoc.sources)

    glyph.sources.append(GlyphSource(name="mid", location=location, layerName="mid"))
    glyph.layers["mid"] = Layer(glyph=StaticGlyph())

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    newDSDoc = DesignSpaceDocument.fromfile(writableTestFont.dsDoc.path)
    newDSSources = unpackSources(newDSDoc.sources)
    assert dsSources == newDSSources[: len(dsSources)]
    assert len(newDSSources) == len(dsSources) + 1
    assert newDSSources[-1] == expectedDSSource


async def test_addNewDenseSource(writableTestFont):
    glyphName = "A"
    assert writableTestFont.dsDoc.axes[0].name == "width"

    # Move the width axis maximum
    writableTestFont.dsDoc.axes[0].maximum = 1500
    writableTestFont.__init__(writableTestFont.dsDoc)  # hacky reload from ds doc

    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)
    dsSources = unpackSources(writableTestFont.dsDoc.sources)

    glyph.sources.append(
        GlyphSource(name="widest", location={"width": 1500}, layerName="widest")
    )
    glyph.layers["widest"] = Layer(glyph=StaticGlyph())

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    newDSDoc = DesignSpaceDocument.fromfile(writableTestFont.dsDoc.path)
    newDSSources = unpackSources(newDSDoc.sources)
    assert dsSources == newDSSources[: len(dsSources)]
    assert len(newDSSources) == len(dsSources) + 1
    assert newDSSources[-1] == dict(
        location=dict(italic=0, weight=150, width=1500),
        styleName="widest",
        filename="MutatorSans_widest.ufo",
        layerName=None,
    )


async def test_addLocalAxis(writableTestFont):
    glyphName = "period"
    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)

    glyph.axes.append(GlyphAxis(name="test", minValue=0, defaultValue=50, maxValue=100))

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    savedGlyph = await writableTestFont.getGlyph(glyphName)

    assert asdict(glyph) == asdict(savedGlyph)


async def test_getAnchors(writableTestFont):
    glyph = await writableTestFont.getGlyph("E")

    layerName = "MutatorSansLightCondensed/foreground"
    layer = glyph.layers[layerName]

    assert 1 == len(layer.glyph.anchors)
    assert Anchor(name="top", x=207, y=746) == layer.glyph.anchors[0]


async def test_addAnchor(writableTestFont):
    glyphName = "E"
    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)

    layerName = "test"
    glyph.layers[layerName] = Layer(glyph=StaticGlyph(xAdvance=0))
    glyph.layers[layerName].glyph.anchors.append(Anchor(name="top", x=207, y=746))

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    savedGlyph = await writableTestFont.getGlyph(glyphName)

    assert (
        glyph.layers[layerName].glyph.anchors
        == savedGlyph.layers[layerName].glyph.anchors
    )


async def test_addLocalAxisAndSource(writableTestFont):
    glyphName = "period"
    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)

    layerName = "test"

    glyph.axes.append(GlyphAxis(name="test", minValue=0, defaultValue=50, maxValue=100))
    glyph.sources.append(
        GlyphSource(name="test", location={"test": 100}, layerName=layerName)
    )
    glyph.layers[layerName] = Layer(glyph=StaticGlyph(xAdvance=0))

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    savedGlyph = await writableTestFont.getGlyph(glyphName)

    assert asdict(glyph) == asdict(savedGlyph)


async def test_putAxes(writableTestFont):
    axes = await writableTestFont.getAxes()
    axes.axes.append(
        FontAxis(
            name="Testing",
            tag="TEST",
            label="Testing",
            minValue=10,
            defaultValue=20,
            maxValue=30,
            mapping=[[10, 0], [20, 100], [20, 200]],
        )
    )
    await writableTestFont.putAxes(axes)

    path = writableTestFont.dsDoc.path
    newFont = DesignspaceBackend.fromPath(path)
    newAxes = await newFont.getAxes()
    assert axes == newAxes


@pytest.mark.parametrize(
    "sourceFont, fileName, initialExpectedFileNames, expectedFileNames",
    [
        (
            getTestFont(),
            "Test.designspace",
            ["Test.designspace", "Test_Regular.ufo"],
            [
                "Test.designspace",
                "Test_BoldCondensed.ufo",
                "Test_BoldWide.ufo",
                "Test_LightWide.ufo",
                "Test_Regular.ufo",
            ],
        ),
        (
            getFontSingleUFO(),
            "Test_Regular.ufo",
            ["Test_Regular.ufo"],
            ["Test_Regular.ufo"],
        ),
    ],
)
async def test_newFileSystemBackend(
    tmpdir, sourceFont, fileName, initialExpectedFileNames, expectedFileNames
):
    tmpdir = pathlib.Path(tmpdir)
    destPath = tmpdir / fileName
    font = newFileSystemBackend(destPath)
    assert [] == (await font.getAxes()).axes
    assert initialExpectedFileNames == fileNamesFromDir(tmpdir)

    axes = await sourceFont.getAxes()
    await font.putAxes(axes)
    glyphMap = await sourceFont.getGlyphMap()
    glyph = await sourceFont.getGlyph("A")
    await font.putGlyph("A", glyph, glyphMap["A"])

    assert ["A_.glif", "contents.plist"] == fileNamesFromDir(
        tmpdir / "Test_Regular.ufo" / "glyphs"
    )

    assert [
        "fontinfo.plist",
        "glyphs",
        "glyphs.M_utatorS_ansL_ightC_ondensed_support",
        "layercontents.plist",
        "metainfo.plist",
    ] == fileNamesFromDir(tmpdir / "Test_Regular.ufo")

    assert expectedFileNames == fileNamesFromDir(tmpdir)

    newGlyph = await font.getGlyph("A")
    assert glyph == newGlyph

    # Check with freshly opened font
    referenceFont = getFileSystemBackend(destPath)
    referenceGlyph = await referenceFont.getGlyph("A")
    assert glyph == referenceGlyph


async def test_writeCorrectLayers(tmpdir, testFont):
    # Check that no redundant layers are written
    tmpdir = pathlib.Path(tmpdir)
    dsPath = tmpdir / "Test.designspace"
    font = newFileSystemBackend(dsPath)

    axes = await testFont.getAxes()
    await font.putAxes(axes)
    glyphMap = await testFont.getGlyphMap()
    glyph = await testFont.getGlyph("A")
    await font.putGlyph("A", glyph, glyphMap["A"])
    await font.putGlyph("A.alt", glyph, [])

    assert [
        "fontinfo.plist",
        "glyphs",
        "glyphs.M_utatorS_ansL_ightC_ondensed_support",
        "layercontents.plist",
        "metainfo.plist",
    ] == fileNamesFromDir(tmpdir / "Test_Regular.ufo")


async def test_deleteGlyph(writableTestFont):
    glyphName = "A"
    assert any(glyphName in layer.glyphSet for layer in writableTestFont.ufoLayers)
    assert any(
        glyphName in layer.glyphSet.contents for layer in writableTestFont.ufoLayers
    )
    await writableTestFont.deleteGlyph(glyphName)
    assert not any(glyphName in layer.glyphSet for layer in writableTestFont.ufoLayers)
    assert not any(
        glyphName in layer.glyphSet.contents for layer in writableTestFont.ufoLayers
    )
    assert await writableTestFont.getGlyph(glyphName) is None


async def test_deleteGlyphRaisesKeyError(writableTestFont):
    glyphName = "A.doesnotexist"
    with pytest.raises(KeyError, match="Glyph 'A.doesnotexist' does not exist"):
        await writableTestFont.deleteGlyph(glyphName)


async def test_findGlyphsThatUseGlyph(writableTestFont):
    async with aclosing(writableTestFont):
        assert [
            "Aacute",
            "Adieresis",
            "varcotest1",
        ] == await writableTestFont.findGlyphsThatUseGlyph("A")
        await writableTestFont.deleteGlyph("Adieresis")
        assert [
            "Aacute",
            "varcotest1",
        ] == await writableTestFont.findGlyphsThatUseGlyph("A")
        glyph = await writableTestFont.getGlyph("Aacute")
        await writableTestFont.putGlyph("B", glyph, [ord("B")])
        assert [
            "Aacute",
            "B",
            "varcotest1",
        ] == await writableTestFont.findGlyphsThatUseGlyph("A")


async def test_addGlyphCustomData_locked(writableTestFont):
    glyphName = "E"
    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)
    glyph.customData = {"locked": True}

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    savedGlyph = await writableTestFont.getGlyph(glyphName)

    assert glyph.customData["locked"] == savedGlyph.customData["locked"]


getSourcesTestData = [
    {
        "location": {"italic": 0.0, "weight": 150.0, "width": 0.0},
        "name": "LightCondensed",
        "verticalMetrics": {
            "ascender": {"value": 700},
            "capHeight": {"value": 700},
            "descender": {"value": -200},
            "italicAngle": {"value": 0},
            "xHeight": {"value": 500},
        },
    },
    {
        "location": {"italic": 0.0, "weight": 850.0, "width": 0.0},
        "name": "BoldCondensed",
        "verticalMetrics": {
            "ascender": {"value": 800},
            "capHeight": {"value": 800},
            "descender": {"value": -200},
            "italicAngle": {"value": 0},
            "xHeight": {"value": 500},
        },
    },
    {
        "location": {"italic": 0.0, "weight": 150.0, "width": 1000.0},
        "name": "LightWide",
        "verticalMetrics": {
            "ascender": {"value": 700},
            "capHeight": {"value": 700},
            "descender": {"value": -200},
            "italicAngle": {"value": 0},
            "xHeight": {"value": 500},
        },
    },
    {
        "location": {"italic": 0.0, "weight": 850.0, "width": 1000.0},
        "name": "BoldWide",
        "verticalMetrics": {
            "ascender": {"value": 800},
            "capHeight": {"value": 800},
            "descender": {"value": -200},
            "italicAngle": {"value": 0},
            "xHeight": {"value": 500},
        },
    },
    {
        "location": {"italic": 0.0, "weight": 595.0, "width": 0.0},
        "name": "support.crossbar",
        "verticalMetrics": {
            "ascender": {"value": 700},
            "capHeight": {"value": 700},
            "descender": {"value": -200},
            "italicAngle": {"value": 0},
            "xHeight": {"value": 500},
        },
    },
    {
        "location": {"italic": 0.0, "weight": 595.0, "width": 1000.0},
        "name": "support.S.wide",
        "verticalMetrics": {
            "ascender": {"value": 700},
            "capHeight": {"value": 700},
            "descender": {"value": -200},
            "italicAngle": {"value": 0},
            "xHeight": {"value": 500},
        },
    },
    {
        "location": {"italic": 0.0, "weight": 595.0, "width": 569.078},
        "name": "support.S.middle",
        "verticalMetrics": {
            "ascender": {"value": 700},
            "capHeight": {"value": 700},
            "descender": {"value": -200},
            "italicAngle": {"value": 0},
            "xHeight": {"value": 500},
        },
    },
    {
        "location": {"italic": 1.0, "weight": 150.0, "width": 0.0},
        "name": "LightCondensedItalic",
        "verticalMetrics": {
            "ascender": {"value": 750},
            "capHeight": {"value": 750},
            "descender": {"value": -250},
            "italicAngle": {"value": 0},
            "xHeight": {"value": 500},
        },
    },
]


async def test_getSources(testFont):
    sources = await testFont.getSources()
    sources = unstructure(sources)
    sourcesList = list(sources.values())  # ignore UUIDs
    assert sourcesList == getSourcesTestData


expectedAxesWithMappings = Axes(
    axes=[
        FontAxis(
            name="Diagonal",
            label="Diagonal",
            tag="DIAG",
            minValue=0.0,
            defaultValue=0.0,
            maxValue=100.0,
        ),
        FontAxis(
            name="Horizontal",
            label="Horizontal",
            tag="HORI",
            minValue=0.0,
            defaultValue=0.0,
            maxValue=100.0,
            hidden=True,
        ),
        FontAxis(
            name="Vertical",
            label="Vertical",
            tag="VERT",
            minValue=0.0,
            defaultValue=0.0,
            maxValue=100.0,
            hidden=True,
        ),
    ],
    mappings=[
        MultipleAxisMapping(
            description="Default mapping",
            groupDescription="Mappings group one",
            inputLocation={"Diagonal": 0.0},
            outputLocation={"Horizontal": 0.0, "Vertical": 0.0},
        ),
        MultipleAxisMapping(
            groupDescription="Mappings group one",
            inputLocation={"Diagonal": 25.0},
            outputLocation={"Horizontal": 0.0, "Vertical": 33.0},
        ),
        MultipleAxisMapping(
            groupDescription="Mappings group one",
            inputLocation={"Diagonal": 75.0},
            outputLocation={"Horizontal": 100.0, "Vertical": 67.0},
        ),
        MultipleAxisMapping(
            groupDescription="Mappings group one",
            inputLocation={"Diagonal": 100.0},
            outputLocation={"Horizontal": 100.0, "Vertical": 100.0},
        ),
    ],
)


async def test_getAxes_with_mappings():
    backend = getFileSystemBackend(dataDir / "avar2" / "DemoAvar2.designspace")
    axes = await backend.getAxes()
    assert expectedAxesWithMappings == axes


async def test_putAxes_with_mappings(tmpdir):
    outputPath = tmpdir / "TmpFont.designspace"
    outputBackend = newFileSystemBackend(outputPath)

    async with aclosing(outputBackend):
        await outputBackend.putAxes(expectedAxesWithMappings)

    reopenedBackend = getFileSystemBackend(outputPath)
    roundTrippedAxes = await reopenedBackend.getAxes()
    assert expectedAxesWithMappings == roundTrippedAxes


def fileNamesFromDir(path):
    return sorted(p.name for p in path.iterdir())


def unpackSources(sources):
    return [
        {k: getattr(s, k) for k in ["location", "styleName", "filename", "layerName"]}
        for s in sources
    ]
