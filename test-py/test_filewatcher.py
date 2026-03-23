import asyncio
import pathlib
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
