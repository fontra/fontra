import logging
import pathlib
from importlib.metadata import entry_points
from os import PathLike

from ..core.protocols import ReadableFontBackend, WritableFontBackend

logger = logging.getLogger(__name__)


class UnknownFileType(Exception):
    pass


def getFileSystemBackend(path: PathLike) -> ReadableFontBackend:
    return _getFileSystemBackend(path, False)


def newFileSystemBackend(path: PathLike) -> WritableFontBackend:
    return _getFileSystemBackend(path, True)


def _getFileSystemBackend(path: PathLike, create: bool) -> WritableFontBackend:
    logVerb = "creating" if create else "loading"

    path = pathlib.Path(path)

    if not create and not path.exists():
        raise FileNotFoundError(path)

    logger.info(f"{logVerb} project {path.name}...")
    fileType = path.suffix.lstrip(".").lower()
    backendEntryPoints = entry_points(group="fontra.filesystem.backends")
    try:
        entryPoint = backendEntryPoints[fileType]
    except KeyError:
        raise UnknownFileType(
            f"Can't find backend for files with extension '.{fileType}'"
        )
    backendClass = entryPoint.load()

    if create:
        if not hasattr(backendClass, "createFromPath"):
            raise ValueError(f"Creating a new .{fileType} file is not supported")
        backend = backendClass.createFromPath(path)
    else:
        backend = backendClass.fromPath(path)

    if create:
        assert isinstance(backend, WritableFontBackend)
    else:
        assert isinstance(backend, ReadableFontBackend)

    logger.info(f"done {logVerb} {path.name}")
    return backend
