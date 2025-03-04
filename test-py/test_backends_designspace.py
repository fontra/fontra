import pathlib
import shutil
import uuid
from contextlib import aclosing
from copy import deepcopy
from dataclasses import asdict

import pytest
from fontTools.designspaceLib import DesignSpaceDocument

from fontra.backends import getFileSystemBackend, newFileSystemBackend
from fontra.backends.copy import copyFont
from fontra.backends.designspace import DesignspaceBackend, UFOBackend, convertImageData
from fontra.backends.null import NullBackend
from fontra.core.classes import (
    Anchor,
    Axes,
    BackgroundImage,
    CrossAxisMapping,
    FontAxis,
    FontInfo,
    FontSource,
    GlyphAxis,
    GlyphSource,
    Guideline,
    ImageType,
    Layer,
    LineMetric,
    OpenTypeFeatures,
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
    return UFOBackend.fromPath(dataDir / "mutatorsans" / "MutatorSansLightWide.ufo")


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
        layerName: glyphSet.getGLIF(glyphName).decode("utf-8").replace("\r\n", "\n")
        for layerName, glyphSet in glyphSets.items()
        if glyphName in glyphSet
    }


@pytest.mark.parametrize(
    "glyphName", ["A", "B", "C", "Q", "R.alt", "varcotest1", "varcotest2"]
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


async def test_getCustomDataSingleUFO(testFontSingleUFO):
    customData = await testFontSingleUFO.getCustomData()
    assert 15 == len(customData)


async def test_putCustomDataSingleUFO(writableTestFontSingleUFO):
    customData = await writableTestFontSingleUFO.getCustomData()
    assert 17 == len(customData)
    customData["testing"] = 12
    await writableTestFontSingleUFO.putCustomData(customData)
    customData = await writableTestFontSingleUFO.getCustomData()
    assert 18 == len(customData)


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
    axisIndex = 1
    assert writableTestFont.dsDoc.axes[axisIndex].name == "width"

    # Move the width axis maximum
    writableTestFont.dsDoc.axes[axisIndex].maximum = 1500
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


# NOTE: font guidelines are tested via test_getSources, no need to repeat here


async def test_getGuidelines(writableTestFont):
    glyph = await writableTestFont.getGlyph("E")

    layerName = "MutatorSansLightCondensed/foreground"
    layer = glyph.layers[layerName]

    assert 1 == len(layer.glyph.guidelines)
    assert Guideline(name="E Bar", x=0, y=334, angle=0) == layer.glyph.guidelines[0]
    # TODO: Guideline test customData, eg. identifier, color, etc.
    # assert (
    #     Guideline(
    #         name="E Bar", x=0, y=334, angle=0, customData={"identifier": "wb94MzpUaN"}
    #     )
    #     == layer.glyph.guidelines[0]
    # )


async def test_addGuidelines(writableTestFont):
    glyphName = "E"
    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)

    layerName = "test"
    glyph.layers[layerName] = Layer(glyph=StaticGlyph(xAdvance=0))
    glyph.layers[layerName].glyph.guidelines.append(
        Guideline(name="Left", x=60, angle=90)
    )
    # add guideline without a name
    glyph.layers[layerName].glyph.guidelines.append(Guideline(y=500))

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    savedGlyph = await writableTestFont.getGlyph(glyphName)

    assert (
        glyph.layers[layerName].glyph.guidelines
        == savedGlyph.layers[layerName].glyph.guidelines
    )


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


async def test_getGlyphSourceStatusCode(testFont):
    glyph = await testFont.getGlyph("E")

    statusCodes = [
        source.customData.get("fontra.development.status") for source in glyph.sources
    ]
    assert statusCodes == [4, 3, None, None, None]


async def test_putGlyphSourceStatusCode(writableTestFont):
    glyph = await writableTestFont.getGlyph("E")
    source2 = glyph.sources[2]
    source2.customData["fontra.development.status"] = 2

    await writableTestFont.putGlyph("E", glyph, [ord("E")])

    roundTrippedGlyph = await writableTestFont.getGlyph("E")

    statusCodes = [
        source.customData.get("fontra.development.status")
        for source in roundTrippedGlyph.sources
    ]

    assert statusCodes == [4, 3, 2, None, None]


async def test_read_glyph_locked(testFont):
    glyphName = "space"
    glyph = await testFont.getGlyph(glyphName)

    assert glyph.customData.get("fontra.glyph.locked") is True


async def test_write_glyph_locked(writableTestFont):
    glyphName = "space"
    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)
    glyph.customData["fontra.glyph.locked"] = True

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    savedGlyph = await writableTestFont.getGlyph(glyphName)

    assert glyph.customData.get("fontra.glyph.locked") == savedGlyph.customData.get(
        "fontra.glyph.locked"
    )


async def test_readGlyphNote(testFont):
    glyph = await testFont.getGlyph("space")
    assert glyph.customData.get("fontra.glyph.note") == "This is a glyph note"


async def test_readGlyphNote_None(testFont):
    glyph = await testFont.getGlyph("A")
    assert glyph.customData.get("fontra.glyph.note") is None


async def test_writeGlyphNote(writableTestFont):
    glyphName = "space"
    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)
    glyph.customData["fontra.glyph.note"] = "A glyph note"

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    savedGlyph = await writableTestFont.getGlyph(glyphName)
    assert savedGlyph.customData.get("fontra.glyph.note") == "A glyph note"


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


async def test_getBackgroundImage(testFont):
    glyphName = "C"
    glyph = await testFont.getGlyph(glyphName)
    for layerName, layer in glyph.layers.items():
        bgImage = layer.glyph.backgroundImage
        if bgImage is not None:
            break

    imageData = await testFont.getBackgroundImage(bgImage.identifier)
    assert len(imageData.data) == 60979
    assert imageData.data[:4] == b"\x89PNG"


async def test_putBackgroundImage(writableTestFont):
    glyph = await writableTestFont.getGlyph("C")
    for layerName, layer in glyph.layers.items():
        bgImage = layer.glyph.backgroundImage
        if bgImage is not None:
            break

    imageData = await writableTestFont.getBackgroundImage(bgImage.identifier)
    assert len(imageData.data) == 60979
    assert imageData.data[:4] == b"\x89PNG"

    glyphName = "D"
    imageIdentifier = str(uuid.uuid4())
    await writableTestFont.putBackgroundImage(imageIdentifier, imageData)
    glyph2 = deepcopy(glyph)
    glyph2.layers[layerName].glyph.backgroundImage.identifier = imageIdentifier
    await writableTestFont.putGlyph(glyphName, glyph2, [ord("D")])

    imageData2 = await writableTestFont.getBackgroundImage(imageIdentifier)

    assert imageData2 == imageData


async def test_putGlyph_with_backgroundImage_new_font(testFont, tmpdir):
    tmpdir = pathlib.Path(tmpdir)
    newFont = DesignspaceBackend.createFromPath(tmpdir / "test.designspace")

    await newFont.putAxes(await testFont.getAxes())

    glyph = await testFont.getGlyph("C")

    await newFont.putGlyph("C", glyph, [ord("C")])
    glyph2 = await newFont.getGlyph("C")
    assert glyph == glyph2
    for layer in glyph2.layers.values():
        if layer.glyph.backgroundImage is not None:
            assert layer.glyph.backgroundImage.color.red == 0.84399
            break
    else:
        assert 0, "expected backgroundImage"


async def test_putBackgroundImage_JPEG(writableTestFont):
    glyph = await writableTestFont.getGlyph("C")
    for layerName, layer in glyph.layers.items():
        bgImage = layer.glyph.backgroundImage
        if bgImage is not None:
            break

    imageDataPNG = await writableTestFont.getBackgroundImage(bgImage.identifier)
    imageDataJPEG = convertImageData(imageDataPNG, ImageType.JPEG)
    assert imageDataJPEG.type == ImageType.JPEG

    glyphName = "D"
    imageIdentifier = str(uuid.uuid4())
    bgImage = BackgroundImage(identifier=imageIdentifier)

    glyphD = await writableTestFont.getGlyph(glyphName)
    firstLayerName = list(glyphD.layers.keys())[0]
    layer = glyphD.layers[firstLayerName]
    layer.glyph.backgroundImage = bgImage

    await writableTestFont.putGlyph(glyphName, glyphD, [ord("D")])
    await writableTestFont.putBackgroundImage(imageIdentifier, imageDataJPEG)

    imageRoundtripped = await writableTestFont.getBackgroundImage(imageIdentifier)
    assert imageRoundtripped.type == ImageType.PNG


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
    "sourceFont, fileName, initialExpectedFileNames, expectedFileNames, referenceUFO",
    [
        (
            getTestFont(),
            "Test.designspace",
            ["Test.designspace"],
            [
                "Test.designspace",
                "Test_BoldCondensed.ufo",
                "Test_BoldWide.ufo",
                "Test_LightCondensed.ufo",
                "Test_LightWide.ufo",
            ],
            "Test_LightWide.ufo",
        ),
        (
            getFontSingleUFO(),
            "Test_Regular.ufo",
            ["Test_Regular.ufo"],
            ["Test_Regular.ufo"],
            "Test_Regular.ufo",
        ),
    ],
)
async def test_newFileSystemBackend(
    tmpdir,
    sourceFont,
    fileName,
    initialExpectedFileNames,
    expectedFileNames,
    referenceUFO,
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

    assert expectedFileNames == fileNamesFromDir(tmpdir)

    assert (tmpdir / referenceUFO).exists(), fileNamesFromDir(tmpdir)

    assert ["A_.glif", "contents.plist"] == fileNamesFromDir(
        tmpdir / referenceUFO / "glyphs"
    )

    assert [
        "fontinfo.plist",
        "glyphs",
        "layercontents.plist",
        "metainfo.plist",
    ] == fileNamesFromDir(tmpdir / referenceUFO)

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
    ] == fileNamesFromDir(tmpdir / "Test_LightCondensed.ufo")


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


getSourcesTestData = [
    {
        "location": {"italic": 0.0, "weight": 150.0, "width": 0.0},
        "name": "LightCondensed",
        "lineMetricsHorizontalLayout": {
            "ascender": {"value": 700, "zone": 16},
            "capHeight": {"value": 700, "zone": 16},
            "descender": {"value": -200, "zone": -16},
            "xHeight": {"value": 500, "zone": 16},
            "baseline": {"value": 0, "zone": -16},
        },
        "guidelines": [
            {"name": "Guideline Cap Height", "y": 700},
            {"name": "Guideline Left", "x": 60, "angle": 90},
            {"name": "Guideline Baseline Overshoot", "y": -10},
        ],
        "customData": {
            "openTypeOS2TypoAscender": 700,
            "openTypeOS2TypoDescender": -200,
        },
    },
    {
        "location": {"italic": 0.0, "weight": 850.0, "width": 0.0},
        "name": "BoldCondensed",
        "lineMetricsHorizontalLayout": {
            "ascender": {"value": 800, "zone": 16},
            "capHeight": {"value": 800, "zone": 16},
            "descender": {"value": -200, "zone": -16},
            "xHeight": {"value": 500, "zone": 16},
            "baseline": {"value": 0, "zone": -16},
        },
    },
    {
        "location": {"italic": 0.0, "weight": 150.0, "width": 1000.0},
        "name": "LightWide",
        "lineMetricsHorizontalLayout": {
            "ascender": {"value": 700, "zone": 16},
            "capHeight": {"value": 700, "zone": 16},
            "descender": {"value": -200, "zone": -16},
            "xHeight": {"value": 500, "zone": 16},
            "baseline": {"value": 0, "zone": -16},
        },
    },
    {
        "location": {"italic": 0.0, "weight": 850.0, "width": 1000.0},
        "name": "BoldWide",
        "lineMetricsHorizontalLayout": {
            "ascender": {"value": 800, "zone": 16},
            "capHeight": {"value": 800, "zone": 16},
            "descender": {"value": -200, "zone": -16},
            "xHeight": {"value": 500, "zone": 16},
            "baseline": {"value": 0, "zone": -16},
        },
    },
    {
        "location": {"italic": 0.0, "weight": 595.0, "width": 0.0},
        "name": "support.crossbar",
        "isSparse": True,
    },
    {
        "location": {"italic": 0.0, "weight": 595.0, "width": 1000.0},
        "name": "support.S.wide",
        "isSparse": True,
    },
    {
        "location": {"italic": 0.0, "weight": 595.0, "width": 569.078},
        "name": "support.S.middle",
        "isSparse": True,
    },
    {
        "location": {"italic": 1.0, "weight": 150.0, "width": 0.0},
        "name": "LightCondensedItalic",
        "lineMetricsHorizontalLayout": {
            "ascender": {"value": 750, "zone": 16},
            "capHeight": {"value": 750, "zone": 16},
            "descender": {"value": -250, "zone": -16},
            "xHeight": {"value": 500, "zone": 16},
            "baseline": {"value": 0, "zone": -16},
        },
    },
]


async def test_getSources(testFont):
    sources = await testFont.getSources()
    sources = unstructure(sources)
    sourcesList = list(sources.values())  # ignore UUIDs
    assert sourcesList == getSourcesTestData


async def test_putSources(writableTestFont):
    sources = deepcopy(await writableTestFont.getSources())
    testSource = sources["light-condensed"]

    assert testSource.lineMetricsHorizontalLayout["ascender"].value == 700
    assert testSource.lineMetricsHorizontalLayout["ascender"].zone == 16
    testSource.lineMetricsHorizontalLayout["ascender"].value = 800
    testSource.lineMetricsHorizontalLayout["ascender"].zone = 10
    assert testSource.guidelines[0].y == 700
    testSource.guidelines[0].y = 750

    await writableTestFont.putSources(sources)

    reopenedBackend = getFileSystemBackend(writableTestFont.dsDoc.path)
    reopenedSources = await reopenedBackend.getSources()
    testSource = reopenedSources["light-condensed"]
    assert testSource.lineMetricsHorizontalLayout["ascender"].value == 800
    assert testSource.lineMetricsHorizontalLayout["ascender"].zone == 10
    assert testSource.guidelines[0].y == 750
    assert sources == reopenedSources


async def test_putSources_delete_revive(writableTestFont):
    originalSources = await writableTestFont.getSources()
    originalGlyph = await writableTestFont.getGlyph("E")
    assert [source.name for source in originalGlyph.sources] == [
        "LightCondensed",
        "BoldCondensed",
        "LightWide",
        "BoldWide",
        "support.crossbar",
    ]
    assert {layerName for layerName in originalGlyph.layers} == {
        "MutatorSansLightCondensed/foreground",
        "MutatorSansLightCondensed/support.crossbar",
        "MutatorSansBoldCondensed/foreground",
        "MutatorSansLightWide/foreground",
        "MutatorSansBoldWide/foreground",
    }

    changedSources = deepcopy(originalSources)
    del changedSources["bold-wide"]

    await writableTestFont.putSources(changedSources)

    changedGlyph = await writableTestFont.getGlyph("E")
    assert changedGlyph != originalGlyph
    assert [source.name for source in changedGlyph.sources] == [
        "LightCondensed",
        "BoldCondensed",
        "LightWide",
        "support.crossbar",
    ]
    assert {layerName for layerName in changedGlyph.layers} == {
        "MutatorSansLightCondensed/foreground",
        "MutatorSansLightCondensed/support.crossbar",
        "MutatorSansBoldCondensed/foreground",
        "MutatorSansLightWide/foreground",
    }

    await writableTestFont.putSources(originalSources)

    revivedGlyph = await writableTestFont.getGlyph("E")
    assert revivedGlyph == originalGlyph


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
        CrossAxisMapping(
            description="Default mapping",
            groupDescription="Mappings group one",
            inputLocation={"Diagonal": 0.0},
            outputLocation={"Horizontal": 0.0, "Vertical": 0.0},
        ),
        CrossAxisMapping(
            groupDescription="Mappings group one",
            inputLocation={"Diagonal": 25.0},
            outputLocation={"Horizontal": 0.0, "Vertical": 33.0},
        ),
        CrossAxisMapping(
            groupDescription="Mappings group one",
            inputLocation={"Diagonal": 75.0},
            outputLocation={"Horizontal": 100.0, "Vertical": 67.0},
        ),
        CrossAxisMapping(
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


async def test_putFeatures(writableTestFont):
    featureText = "# dummy feature data"

    async with aclosing(writableTestFont):
        await writableTestFont.putFeatures(OpenTypeFeatures(text=featureText))

    reopenedBackend = getFileSystemBackend(writableTestFont.dsDoc.path)
    features = await reopenedBackend.getFeatures()
    assert features.text == featureText


async def test_getFeatures(testFont):
    features = await testFont.getFeatures()
    assert "# Included feature text" in features.text


async def test_glyphDependencies(testFont) -> None:
    assert isinstance(testFont, DesignspaceBackend)
    deps = await testFont.glyphDependencies
    assert set(deps.usedBy) == {
        "A",
        "acute",
        "dieresis",
        "O",
        "period",
        "dot",
        "comma",
        "varcotest2",
        "varcotest1",
    }
    assert set(deps.madeOf) == {
        "Aacute",
        "Adieresis",
        "Q",
        "colon",
        "dieresis",
        "nestedcomponents",
        "quotedblbase",
        "quotedblleft",
        "quotedblright",
        "quotesinglbase",
        "semicolon",
        "varcotest1",
    }


async def test_glyphDependencies_new_font(tmpdir) -> None:
    tmpdir = pathlib.Path(tmpdir)
    destPath = tmpdir / "Test.designspace"
    font = newFileSystemBackend(destPath)
    assert isinstance(font, DesignspaceBackend)
    deps = await font.glyphDependencies
    assert deps.usedBy == {}
    assert deps.madeOf == {}


async def test_write_designspace_after_first_implicit_source_issue_1468(
    tmpdir, testFontSingleUFO
) -> None:
    tmpdir = pathlib.Path(tmpdir)
    destPath = tmpdir / "Test.designspace"
    font = newFileSystemBackend(destPath)

    glyph = await testFontSingleUFO.getGlyph("A")
    await font.putGlyph("A", glyph, [])

    dsDoc = DesignSpaceDocument.fromfile(destPath)
    assert dsDoc.sources


async def test_putFontInfo_no_sources_issue_1465(tmpdir, testFontSingleUFO):
    tmpdir = pathlib.Path(tmpdir)
    destPath = tmpdir / "Test.designspace"
    font = newFileSystemBackend(destPath)
    info = FontInfo(familyName="Testing")
    await font.putFontInfo(info)
    glyph = await testFontSingleUFO.getGlyph("A")
    await font.putGlyph("A", glyph, [])

    reopenedBackend = getFileSystemBackend(destPath)
    reopenedInfo = await reopenedBackend.getFontInfo()
    assert reopenedInfo.familyName == "Testing"


async def test_putFontInfoCustomData(writableTestFont):
    info = FontInfo(
        familyName="Testing",
        customData={"openTypeNameUniqueID": "This is Unique Font ID"},
    )
    async with aclosing(writableTestFont):
        await writableTestFont.putFontInfo(info)

    reopenedBackend = getFileSystemBackend(writableTestFont.dsDoc.path)
    reopenedInfo = await reopenedBackend.getFontInfo()
    assert reopenedInfo.customData == info.customData


async def test_putFontInfoDeleteDescription(writableTestFont):
    info = await writableTestFont.getFontInfo()
    info.description = "Some description"
    # First add info.description
    async with aclosing(writableTestFont):
        await writableTestFont.putFontInfo(info)

    # Then delete, and later look if it still exists.
    del info.description
    await writableTestFont.putFontInfo(info)

    reopenedBackend = getFileSystemBackend(writableTestFont.dsDoc.path)
    reopenedInfo = await reopenedBackend.getFontInfo()
    assert reopenedInfo == info


async def test_lineMetricsVerticalLayout(tmpdir):
    tmpdir = pathlib.Path(tmpdir)
    fontPath = tmpdir / "test.designspace"
    font = newFileSystemBackend(fontPath)

    sources = {
        "testsource": FontSource(
            name="Regular",
            lineMetricsVerticalLayout={
                "ascender": LineMetric(value=500),
                "descender": LineMetric(value=500),
            },
        )
    }
    await font.putSources(sources)

    reopenedFont = getFileSystemBackend(fontPath)
    reopenedSources = await reopenedFont.getSources()
    assert (
        reopenedSources["testsource"].lineMetricsVerticalLayout
        == sources["testsource"].lineMetricsVerticalLayout
    )


async def test_glyphMetricsVerticalLayout(writableTestFont):
    glyph = await writableTestFont.getGlyph("A")

    for layer in glyph.layers.values():
        layer.glyph.verticalOrigin = 880
        layer.glyph.yAdvance = 1000

    await writableTestFont.putGlyph("A", glyph, [ord("A")])

    reopenedFont = getFileSystemBackend(writableTestFont.dsDoc.path)

    reopenedGlyph = await reopenedFont.getGlyph("A")
    assert glyph == reopenedGlyph


async def test_kerning_read_write(writableTestFont):
    kerning = await writableTestFont.getKerning()

    assert len(kerning["kern"].sourceIdentifiers) == 5
    kerning["kern"].values["A"]["J"] = [None, -25, -30, -15, None]
    kerning["kern"].groups["public.kern1.@MMK_L_A"].append("X")

    await writableTestFont.putKerning(kerning)

    reopenedFont = getFileSystemBackend(writableTestFont.dsDoc.path)
    reopenedKerning = await reopenedFont.getKerning()
    assert reopenedKerning["kern"].values["A"]["J"] == [None, -25, -30, -15, None]
    assert reopenedKerning["kern"].groups["public.kern1.@MMK_L_A"] == [
        "A",
        "Aacute",
        "Adieresis",
        "X",
    ]


async def test_roundtrip_single_UFO(testFontSingleUFO, tmpdir):
    tmpdir = pathlib.Path(tmpdir)
    outPath = tmpdir / "roundtripped.ufo"
    outBackend = newFileSystemBackend(outPath)
    await copyFont(testFontSingleUFO, outBackend)
    reopenedBackend = getFileSystemBackend(outPath)
    assert await testFontSingleUFO.getGlyph("A") == await reopenedBackend.getGlyph("A")
    assert await testFontSingleUFO.getGlyph("Q") == await reopenedBackend.getGlyph("Q")
    assert await testFontSingleUFO.getGlyphMap() == await reopenedBackend.getGlyphMap()
    assert await testFontSingleUFO.getFontInfo() == await reopenedBackend.getFontInfo()
    assert await testFontSingleUFO.getKerning() == await reopenedBackend.getKerning()
    assert await testFontSingleUFO.getSources() == await reopenedBackend.getSources()


@pytest.mark.parametrize("suffix", [".ufo", ".designspace"])
async def test_null_output(tmpdir, suffix):
    tmpdir = pathlib.Path(tmpdir)
    outPath = tmpdir / ("null" + suffix)
    outBackend = newFileSystemBackend(outPath)
    inputBackend = NullBackend()
    async with aclosing(outBackend):
        await copyFont(inputBackend, outBackend)


@pytest.mark.parametrize("suffix", [".ufo", ".designspace"])
async def test_empty_layers_have_contents_plist(tmpdir, suffix, testFont):
    tmpdir = pathlib.Path(tmpdir)
    outPath = tmpdir / ("test" + suffix)

    sources = await testFont.getSources()

    outBackend = newFileSystemBackend(outPath)
    await outBackend.putSources(sources)

    for ufoPath in tmpdir.glob("*.ufo"):
        for glyphsDir in ufoPath.glob("glyphs*"):
            assert (glyphsDir / "contents.plist").exists()


def fileNamesFromDir(path):
    return sorted(p.name for p in path.iterdir())


def unpackSources(sources):
    return [
        {k: getattr(s, k) for k in ["location", "styleName", "filename", "layerName"]}
        for s in sources
    ]
