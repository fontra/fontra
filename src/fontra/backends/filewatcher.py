import asyncio
import hashlib
import logging
import os
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Iterable

from watchfiles import Change, awatch

logger = logging.getLogger(__name__)


@dataclass
class FileWatcher:
    callback: Callable[[set[tuple[Change, str]]], Awaitable[None]]
    paths: set[str] = field(init=False, default_factory=set)
    _stopEvent: asyncio.Event = field(init=False, default=asyncio.Event())
    _task: asyncio.Task | None = field(init=False, default=None)
    _ignorePaths: dict[str, set[float | None]] = field(
        init=False, default_factory=lambda: defaultdict(set)
    )
    _ignorePathHashes: dict[str, bytes | None] = field(init=False, default_factory=dict)

    async def aclose(self) -> None:
        if self._task is None:
            return
        self._stopEvent.set()
        self._task.cancel()

    def setPaths(self, paths: Iterable[os.PathLike | str]) -> None:
        fspaths = set([os.fspath(p) for p in paths])
        if self.paths != fspaths:
            self.paths = fspaths
            self._startWatching()

    def addPaths(self, paths: Iterable[os.PathLike | str]) -> None:
        self.paths.update([os.fspath(p) for p in paths])
        self._startWatching()

    def removePaths(self, paths: Iterable[os.PathLike | str]) -> None:
        for path in paths:
            self.paths.discard(os.fspath(path))
        self._startWatching()

    def ignoreNextChange(self, path: os.PathLike | str):
        path = os.fspath(path)
        mtime = os.stat(path).st_mtime if os.path.exists(path) else None
        self._ignorePaths[path].add(mtime)
        self._ignorePathHashes[path] = fileContentHash(path)

    def _startWatching(self) -> None:
        # Stop the current loop after a delay, so that it can process pending changes.
        # The delay relates to the `step` argument of `awatch`, which defaults to 50ms.
        self._setEventTask = asyncio.create_task(setEventAfterDelay(self._stopEvent))
        self._task = asyncio.create_task(self._watchFiles()) if self.paths else None

    async def _watchFiles(self) -> None:
        self._stopEvent = asyncio.Event()
        async for changes in awatch(*sorted(self.paths), stop_event=self._stopEvent):
            changes = cleanupWatchFilesChanges(changes)
            changes = self._filterIgnores(changes)
            if changes:
                try:
                    await self.callback(changes)
                except Exception:
                    logger.exception("exception in FileWatcher callback")

    def _filterIgnores(
        self, changes: set[tuple[Change, str]]
    ) -> set[tuple[Change, str]]:
        filteredChanges = set()

        for change, path in changes:
            # Can we ignore this changes based on a recorded modification time?
            mtimes = self._ignorePaths.get(path)
            if mtimes is not None:
                mtime = os.stat(path).st_mtime if os.path.exists(path) else None
                if mtime in mtimes:
                    mtimes.remove(mtime)
                    if not mtimes:
                        del self._ignorePaths[path]
                    continue

            # We still want to ignore the change if the contents didn't really change.
            contentHash = self._ignorePathHashes.pop(path, None)
            if contentHash is not None and contentHash == fileContentHash(path):
                continue

            filteredChanges.add((change, path))

        return filteredChanges


def cleanupWatchFilesChanges(
    changes: set[tuple[Change, str]],
) -> set[tuple[Change, str]]:
    # If a path is mentioned with more than one event type, we pick the most
    # appropriate one among them:
    # - if there is a delete event and the path does not exist: delete it is
    # - else: keep the lowest sorted event (order: added, modified, deleted)
    perPath = {}
    for change, path in sorted(changes):
        if path in perPath:
            if change == Change.deleted and not os.path.exists(path):
                # File doesn't exist, event to "deleted"
                perPath[path] = Change.deleted
            # else: keep the first event
        else:
            perPath[path] = change
    return {(change, path) for path, change in perPath.items()}


async def setEventAfterDelay(event, delay=0.1) -> None:
    await asyncio.sleep(delay)
    event.set()


def fileContentHash(path: str) -> bytes | None:
    if not os.path.isfile(path):
        return None

    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).digest()
