import pathlib
import subprocess

import pytest
from fontTools.ufoLib import UFOReaderWriter
from test_backends_designspace import fileNamesFromDir

from fontra.backends import UnknownFileType, getFileSystemBackend, newFileSystemBackend
from fontra.backends.copy import copyFont

mutatorDSPath = (
    pathlib.Path(__file__).resolve().parent
    / "data"
    / "mutatorsans"
    / "MutatorSans.designspace"
)


@pytest.mark.parametrize("glyphNames", [None, ["A", "C", "period"]])
async def test_copyFont(tmpdir, glyphNames):
    tmpdir = pathlib.Path(tmpdir)
    destPath = tmpdir / "MutatorCopy.designspace"
    sourceFont = getFileSystemBackend(mutatorDSPath)
    sourceGlyphNames = sorted(await sourceFont.getGlyphMap())
    destFont = newFileSystemBackend(destPath)
    await copyFont(sourceFont, destFont, glyphNames=glyphNames)
    assert [
        "MutatorCopy.designspace",
        "MutatorCopy_BoldCondensed.ufo",
        "MutatorCopy_BoldWide.ufo",
        "MutatorCopy_LightCondensed.ufo",
        "MutatorCopy_LightCondensedItalic.ufo",
        "MutatorCopy_LightWide.ufo",
    ] == fileNamesFromDir(tmpdir)

    reopenedFont = getFileSystemBackend(destPath)
    reopenedGlyphNames = sorted(await reopenedFont.getGlyphMap())
    if glyphNames is None:
        glyphNames = sourceGlyphNames
    assert glyphNames == reopenedGlyphNames


def test_fontra_copy(tmpdir):
    tmpdir = pathlib.Path(tmpdir)
    destPath = tmpdir / "MutatorCopy.designspace"
    subprocess.run(["fontra-copy", mutatorDSPath, destPath])
    assert [
        "MutatorCopy.designspace",
        "MutatorCopy_BoldCondensed.ufo",
        "MutatorCopy_BoldWide.ufo",
        "MutatorCopy_LightCondensed.ufo",
        "MutatorCopy_LightCondensedItalic.ufo",
        "MutatorCopy_LightWide.ufo",
    ] == fileNamesFromDir(tmpdir)


def test_fontra_copy_missing_source(tmpdir):
    tmpdir = pathlib.Path(tmpdir)
    destPath = tmpdir / "MutatorCopy.designspace"
    result = subprocess.run(
        ["fontra-copy", tmpdir / "Missing.fontra", destPath],
        capture_output=True,
        text=True,
    )
    assert "the source file does not exist" in result.stderr


def test_fontra_copy_source_dest_match(tmpdir):
    tmpdir = pathlib.Path(tmpdir)
    result = subprocess.run(
        ["fontra-copy", mutatorDSPath, mutatorDSPath],
        capture_output=True,
        text=True,
    )
    assert (
        "the destination file must be different from the source file" in result.stderr
    )


def test_newFileSystemBackend_unknown_filetype():
    with pytest.raises(
        UnknownFileType, match="Can't find backend for files with extension"
    ):
        _ = newFileSystemBackend("test.someunknownextension")


def test_fontra_copy_ufo_rtl_kerning(tmpdir):
    # Round-tripping UFO LTR/RTL kerning via Fontra
    sourcePath = (
        pathlib.Path(__file__).resolve().parent
        / "data"
        / "right-to-left-kerning-ufo"
        / "right-to-left-kerning.ufo"
    )

    destPath = tmpdir / sourcePath.name

    result = subprocess.run(
        ["fontra-copy", sourcePath, destPath],
        capture_output=True,
        text=True,
    )

    if result.returncode:
        print(result.stderr)
        print(result.stdout)
        assert 0, f"subprocess error {result.returncode}"

    sourceReader = UFOReaderWriter(sourcePath)
    destReader = UFOReaderWriter(destPath)

    assert sourceReader.readGroups() == destReader.readGroups()
    assert sourceReader.readKerning() == destReader.readKerning()
