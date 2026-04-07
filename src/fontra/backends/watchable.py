from dataclasses import dataclass, field
from os import PathLike
from typing import Any, Awaitable, Callable, Iterable

from .filewatcher import Change, FileWatcher


@dataclass
class WatchableBackend:
    fileWatcher: FileWatcher | None = None
    fileWatcherCallbacks: list[Callable[[Any], Awaitable[None]]] = field(
        default_factory=list
    )

    async def watchExternalChanges(
        self, callback: Callable[[Any], Awaitable[None]]
    ) -> None:
        if self.fileWatcher is None:
            self.fileWatcher = FileWatcher(self._fileWatcherCallback)
            self.fileWatcherWasInstalled()
        self.fileWatcherCallbacks.append(callback)

    async def fileWatcherProcessChanges(
        self, changes: set[tuple[Change, str]]
    ) -> dict[str, Any] | None:
        # Must override
        raise NotImplementedError

    def fileWatcherWasInstalled(self) -> None:
        # May overridable
        pass

    async def fileWatcherClose(self) -> None:
        if self.fileWatcher is not None:
            await self.fileWatcher.aclose()

    def fileWatcherSetPaths(self, paths: Iterable[PathLike | str]) -> None:
        if self.fileWatcher is not None:
            self.fileWatcher.setPaths(paths)

    def fileWatcherIgnoreNextChange(self, path) -> None:
        if self.fileWatcher is not None:
            self.fileWatcher.ignoreNextChange(path)

    async def fileWatcherNotifyCallbacks(self, reloadPattern):
        for callback in self.fileWatcherCallbacks:
            await callback(reloadPattern)

    async def _fileWatcherCallback(self, changes: set[tuple[Change, str]]) -> None:
        reloadPattern = await self.fileWatcherProcessChanges(changes)
        if reloadPattern or reloadPattern is None:
            await self.fileWatcherNotifyCallbacks(reloadPattern)
