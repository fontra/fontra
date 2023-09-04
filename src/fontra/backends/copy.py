import argparse
import asyncio
import logging
import pathlib
import shutil

from . import getFileSystemBackend, newFileSystemBackend

logger = logging.getLogger(__name__)


async def copy(sourceBackend, destBackend, *, numTasks=8):
    await destBackend.putGlobalAxes(await sourceBackend.getGlobalAxes())
    glyphMap = await sourceBackend.getGlyphMap()
    glyphNamesToCopy = sorted(glyphMap)

    # Needed for rcjk backend, but is a bug there
    # _ = await destBackend.getGlyphMap()

    tasks = [
        asyncio.create_task(
            copyGlyphs(sourceBackend, destBackend, glyphMap, glyphNamesToCopy)
        )
        for i in range(numTasks)
    ]
    done, pending = await asyncio.wait(tasks)
    # await asyncio.sleep(4)
    assert not pending


async def copyGlyphs(sourceBackend, destBackend, glyphMap, glyphNamesToCopy):
    while glyphNamesToCopy:
        glyphName = glyphNamesToCopy.pop(0)
        logger.info(f"reading {glyphName}")
        glyph = await sourceBackend.getGlyph(glyphName)
        logger.info(f"writing {glyphName}")
        error = await destBackend.putGlyph(glyphName, glyph, glyphMap[glyphName])
        if error:
            # FIXME: putGlyph should always raise, and not return some error string
            # This may be unique to the rcjk backend, though.
            raise ValueError(error)


async def mainAsync():
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("destination")
    parser.add_argument("--overwrite", type=bool, default=False)

    args = parser.parse_args()

    sourcePath = pathlib.Path(args.source)
    assert sourcePath.exists()
    destPath = pathlib.Path(args.destination)
    if args:
        if destPath.is_dir():
            shutil.rmtree(destPath)
        elif destPath.exists():
            destPath.unlink()
    elif destPath.exists():
        raise argparse.ArgumentError("the destination file already exists")

    sourceBackend = getFileSystemBackend(sourcePath)
    destBackend = newFileSystemBackend(destPath)

    await copy(sourceBackend, destBackend)


def main():
    asyncio.run(mainAsync())


if __name__ == "__main__":
    main()
