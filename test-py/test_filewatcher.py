import asyncio
import os
import pathlib
import shutil
from contextlib import aclosing

from watchfiles import Change

from fontra.backends.filewatcher import FileWatcher


async def test_filewatcher_basic(tmpdir):
    testDir_1 = pathlib.Path(tmpdir) / "folder_to_watch_1"
    testDir_1.mkdir()

    testDir_2 = pathlib.Path(tmpdir) / "folder_to_watch_2"
    testDir_2.mkdir()

    pathToBeDeleted = testDir_1 / "deleting.txt"
    pathToBeDeleted.write_text("deleting")

    pathToBeDeletedUnwatched = testDir_1 / "deleting_2.txt"
    pathToBeDeletedUnwatched.write_text("deleting unwatched")

    collectedChanges = []

    async def callback(changes):
        for changeType, path in changes:
            name = "/".join(pathlib.Path(path).parts[-2:])
            collectedChanges.append((name, changeType))

    await asyncio.sleep(0.1)

    watcher = FileWatcher(callback)

    delay = 0.15

    async with aclosing(watcher):
        watcher.setPaths([testDir_1])

        await asyncio.sleep(delay)
        path = testDir_1 / "testing.txt"
        path.write_text("hello")
        await asyncio.sleep(delay)
        path.unlink()
        pathToBeDeleted.unlink()
        await asyncio.sleep(delay)

        watcher.addPaths([testDir_2])
        await asyncio.sleep(delay)
        path = testDir_2 / "testing2.txt"
        path.write_text("hey")
        await asyncio.sleep(delay)

        watcher.removePaths([testDir_1])
        await asyncio.sleep(delay)
        pathToBeDeletedUnwatched.unlink()
        await asyncio.sleep(delay)

    assert sorted(
        [
            ("folder_to_watch_1/testing.txt", Change.added),
            ("folder_to_watch_1/deleting.txt", Change.deleted),
            ("folder_to_watch_1/testing.txt", Change.deleted),
            ("folder_to_watch_2/testing2.txt", Change.added),
        ]
    ) == sorted(collectedChanges)


async def test_filewatcher_ignoreNextChange(tmp_path):
    testDir = tmp_path / "folder_to_watch"
    testDir.mkdir()

    testPath = testDir / "testing.txt"
    testPath.write_text("testing")

    testSwapPath = tmp_path / "testing_swap.txt"

    collectedChanges = []

    async def callback(changes):
        for changeType, path in changes:
            path = pathlib.Path(path)
            name = "/".join(path.parts[-2:])
            collectedChanges.append((name, path.read_text()))

    await asyncio.sleep(0.1)

    watcher = FileWatcher(callback)

    delay = 0.15

    async with aclosing(watcher):
        watcher.setPaths([testDir])
        await asyncio.sleep(delay)

        # we expect a change
        testPath.write_text("hello")
        await asyncio.sleep(delay)

        testPath.write_text("hello2")
        # this should cause the next event (caused by the *previous* write)
        # to be ignored
        watcher.ignoreNextChange(testPath)
        await asyncio.sleep(delay)

        # Cause a file changed event, but with the same mtime, to emulate
        # OneDrive and iCloud shared folder behavior
        shutil.copy2(testPath, testSwapPath)  # keeps mtime
        os.replace(testSwapPath, testPath)  # also keeps mtime

        await asyncio.sleep(delay)

    assert [
        ("folder_to_watch/testing.txt", "hello"),
    ] == collectedChanges
