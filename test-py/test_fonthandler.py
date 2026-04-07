import asyncio
import logging
import pathlib
import shutil
from contextlib import aclosing

import pytest

from fontra.backends.designspace import DesignspaceBackend
from fontra.core.fonthandler import FontHandler
from fontra.filesystem.projectmanager import FileSystemProjectManager

mutatorSansDir = pathlib.Path(__file__).resolve().parent / "data" / "mutatorsans"

dsFileName = "MutatorSans.designspace"
mutatorFiles = [
    dsFileName,
    "MutatorSans.designspace",
    "MutatorSansBoldCondensed.ufo",
    "MutatorSansBoldWide.ufo",
    "MutatorSansLightCondensed.ufo",
    "MutatorSansLightCondensedItalic.ufo",
    "MutatorSansLightWide.ufo",
    "MutatorSans_features.fea",
]


@pytest.fixture(scope="session")
def testFontPath(tmp_path_factory):
    tmpDir = tmp_path_factory.mktemp("font")
    for fn in mutatorFiles:
        srcPath = mutatorSansDir / fn
        dstPath = tmpDir / fn
        if srcPath.is_dir():
            shutil.copytree(srcPath, dstPath)
        else:
            shutil.copy(srcPath, dstPath)
    return tmpDir / dsFileName


@pytest.fixture
async def testFontHandler(testFontPath):
    assert testFontPath.exists(), testFontPath
    backend = DesignspaceBackend.fromPath(testFontPath)
    return FontHandler(
        backend=backend,
        projectIdentifier="dummy",
        metaInfoProvider=FileSystemProjectManager(),
    )


class MockRemoteObjectConnection:
    pass


@pytest.mark.asyncio
async def test_fontHandler_basic(testFontHandler):
    async with aclosing(testFontHandler):
        await testFontHandler.startTasks()
        glyph = await testFontHandler.getGlyph(
            "A", connection=MockRemoteObjectConnection()
        )

    layerName, layer = firstLayerItem(glyph)
    assert "light-condensed" == layerName
    assert 32 == len(layer.glyph.path.coordinates)
    assert 20 == layer.glyph.path.coordinates[0]


@pytest.mark.asyncio
async def test_fontHandler_externalChange(testFontHandler):
    async with aclosing(testFontHandler):
        await testFontHandler.startTasks()
        glyph = await testFontHandler.getGlyph("A")
        layerName, layer = firstLayerItem(glyph)
        assert 20 == layer.glyph.path.coordinates[0]
        fontInfo = await testFontHandler.getFontInfo()
        assert "License same as MutatorMath" in fontInfo.copyright

        dsDoc = testFontHandler.backend.dsDoc
        ufoPath = pathlib.Path(dsDoc.sources[0].path)
        glifPath = ufoPath / "glyphs" / "A_.glif"
        glifData = glifPath.read_text()
        glifData = glifData.replace('x="20"', 'x="-100"')
        glifPath.write_text(glifData)

        fontInfoPath = ufoPath / "fontinfo.plist"
        fontInfoData = fontInfoPath.read_text()
        fontInfoData = fontInfoData.replace("License same as MutatorMath", "-----")
        fontInfoPath.write_text(fontInfoData)

        # We should see the "before", as it's cached
        glyph = await testFontHandler.getGlyph("A")
        layerName, layer = firstLayerItem(glyph)
        assert 20 == layer.glyph.path.coordinates[0]
        fontInfo = await testFontHandler.getFontInfo()
        assert "License same as MutatorMath" in fontInfo.copyright

        await asyncio.sleep(0.3)

        # We should see the "after", because the external change
        # watcher cleared the cache
        glyph = await testFontHandler.getGlyph("A")
        layerName, layer = firstLayerItem(glyph)
        assert -100 == layer.glyph.path.coordinates[0]
        fontInfo = await testFontHandler.getFontInfo()
        assert "License same as MutatorMath" not in fontInfo.copyright


@pytest.mark.asyncio
async def test_fontHandler_editGlyph(testFontHandler):
    async with aclosing(testFontHandler):
        await testFontHandler.startTasks()
        glyph = await testFontHandler.getGlyph(
            "A", connection=MockRemoteObjectConnection()
        )
        layerName, layer = firstLayerItem(glyph)
        assert 0 == layer.glyph.path.coordinates[1]

        change = {
            "p": ["glyphs", "A", "layers", layerName, "glyph", "path"],
            "f": "=xy",
            "a": [0, 20, 55],
        }
        rollbackChange = {
            "p": ["glyphs", "A", "layers", layerName, "glyph", "path"],
            "f": "=xy",
            "a": [0, 20, 0],
        }

        await testFontHandler.editFinal(
            change,
            rollbackChange,
            "Test edit",
            False,
            connection=MockRemoteObjectConnection(),
        )

        glyph = await testFontHandler.getGlyph(
            "A", connection=MockRemoteObjectConnection()
        )
        layerName, layer = firstLayerItem(glyph)
        assert [20, 55] == layer.glyph.path.coordinates[:2]

        # give the write queue the opportunity to complete
        await testFontHandler.finishWriting()

        dsDoc = testFontHandler.backend.dsDoc
        ufoPath = pathlib.Path(dsDoc.sources[0].path)
        glifPath = ufoPath / "glyphs" / "A_.glif"
        glifData = glifPath.read_text()
        expectedLine = """<point x="20" y="55" type="line"/>"""
        assert expectedLine in glifData

    # give the event loop a moment to clean up
    await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_fontHandler_editGlyph_delete_layer(testFontHandler):
    async with aclosing(testFontHandler):
        await testFontHandler.startTasks()
        glyph = await testFontHandler.getGlyph(
            "A", connection=MockRemoteObjectConnection()
        )

        sourceIndex = 3
        source = glyph.sources[sourceIndex]
        layerName = source.layerName

        dsDoc = testFontHandler.backend.dsDoc
        ufoPath = pathlib.Path(dsDoc.sources[3].path)
        glifPath = ufoPath / "glyphs" / "A_.glif"
        assert glifPath.exists()

        change = {
            "p": ["glyphs", "A"],
            "c": [
                {"p": ["sources"], "f": "-", "a": [sourceIndex]},
                {"p": ["layers"], "f": "d", "a": [layerName]},
            ],
        }
        rollbackChange = {}  # dummy

        await testFontHandler.editFinal(
            change,
            rollbackChange,
            "Test edit",
            False,
            connection=MockRemoteObjectConnection(),
        )

        # give the write queue the opportunity to complete
        await testFontHandler.finishWriting()

        assert not glifPath.exists()

    # give the event loop a moment to clean up
    await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_fontHandler_getData(testFontHandler):
    async with aclosing(testFontHandler):
        await testFontHandler.startTasks()
        unitsPerEm = await testFontHandler.getData("unitsPerEm")
        assert 1000 == unitsPerEm


@pytest.mark.asyncio
async def test_fontHandler_setData(testFontHandler, caplog):
    caplog.set_level(logging.INFO)
    async with aclosing(testFontHandler):
        await testFontHandler.startTasks()
        glyphMap = await testFontHandler.getData("glyphMap")
        assert [65, 97] == glyphMap["A"]
        change = {
            "p": ["glyphMap"],
            "f": "=",
            "a": ["A", [97]],
        }
        rollbackChange = {
            "p": ["glyphMap"],
            "f": "=",
            "a": ["A", [65, 97]],
        }
        await testFontHandler.editFinal(
            change,
            rollbackChange,
            "Test edit",
            False,
            connection=MockRemoteObjectConnection(),
        )

        glyphMap = await testFontHandler.getData("glyphMap")
        assert [97] == glyphMap["A"]
    assert "write to backend -- _putData glyphMap" == caplog.records[0].message


@pytest.mark.asyncio
async def test_fontHandler_setData_unitsPerEm(testFontHandler, caplog):
    caplog.set_level(logging.INFO)
    async with aclosing(testFontHandler):
        await testFontHandler.startTasks()
        unitsPerEm = await testFontHandler.getData("unitsPerEm")
        assert 1000 == unitsPerEm
        change = {
            "f": "=",
            "a": ["unitsPerEm", 2000],
        }
        rollbackChange = {
            "f": "=",
            "a": ["unitsPerEm", 1000],
        }
        await testFontHandler.editFinal(
            change,
            rollbackChange,
            "Test edit",
            False,
            connection=MockRemoteObjectConnection(),
        )

        unitsPerEm = await testFontHandler.getData("unitsPerEm")
        assert 2000 == unitsPerEm

    assert 2000 == await testFontHandler.backend.getUnitsPerEm()
    assert "write to backend -- _putData unitsPerEm" == caplog.records[0].message


@pytest.mark.asyncio
async def test_fontHandler_new_glyph(testFontHandler):
    async with aclosing(testFontHandler):
        await testFontHandler.startTasks()

        newGlyphName = "testglyph"

        dsDoc = testFontHandler.backend.dsDoc
        ufoPath = pathlib.Path(dsDoc.sources[0].path)
        glifPath = ufoPath / "glyphs" / f"{newGlyphName}.glif"
        assert not glifPath.exists()

        newGlyph = {
            "name": newGlyphName,
            "axes": [],
            "sources": [
                {
                    "location": {},
                    "name": "LightCondensed",
                    "layerName": "LightCondensed/foreground",
                }
            ],
            "layers": {
                "LightCondensed/foreground": {
                    "glyph": {
                        "xAdvance": 170,
                        "yAdvance": None,
                        "verticalOrigin": None,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "components": [],
                    },
                },
            },
        }

        glyph = await testFontHandler.getGlyph(newGlyphName)
        assert glyph is None
        change = {
            "p": ["glyphs"],
            "f": "=",
            "a": [newGlyphName, newGlyph],
        }
        rollbackChange = {
            "p": ["glyphs"],
            "f": "-",
            "a": [newGlyphName, 1000],
        }

        await testFontHandler.editFinal(
            change,
            rollbackChange,
            "Test edit",
            False,
            connection=MockRemoteObjectConnection(),
        )

        await testFontHandler.finishWriting()
        assert glifPath.exists()


async def test_getBackgroundImage(testFontHandler):
    glyph = await testFontHandler.getGlyph("C")
    bgImage = None
    for layer in glyph.layers.values():
        if layer.glyph.backgroundImage is not None:
            bgImage = layer.glyph.backgroundImage
    assert bgImage is not None

    imageData = await testFontHandler.getBackgroundImage(bgImage.identifier)

    assert imageData["type"] == "png"
    assert len(imageData["data"]) == 81308
    assert isinstance(imageData["data"], str)


async def test_getFeatures(testFontHandler):
    features = await testFontHandler.getFeatures(
        connection=MockRemoteObjectConnection()
    )
    assert features.language == "fea"


async def test_getKerning(testFontHandler):
    kerning = await testFontHandler.getKerning(connection=MockRemoteObjectConnection())
    assert "kern" in kerning


def firstLayerItem(glyph):
    return next(iter(glyph.layers.items()))
