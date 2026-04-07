import argparse
import logging
import pathlib
from importlib import resources
from importlib.metadata import entry_points
from os import PathLike, fspath
from types import SimpleNamespace
from typing import Any

from aiohttp import web

from ..backends import getFileSystemBackend
from ..core.fonthandler import FontHandler
from ..core.protocols import ExportManager, ProjectManager, ProjectOpenListener

logger = logging.getLogger(__name__)


fileExtensions = {
    f".{ep.name}" for ep in entry_points(group="fontra.filesystem.backends")
}


class FileSystemProjectManagerFactory:
    @staticmethod
    def addArguments(parser: argparse.ArgumentParser) -> None:
        parser.add_argument(
            "path",
            type=existingFolderOrFontFile,
            help="A path to an folder containing font files, or a path to a "
            "single font file. Alternatively you can pass the special value "
            "'-' to bypass the landing page, and use a full OS FS path as part "
            "of the view URL.",
        )
        parser.add_argument("--max-folder-depth", type=int, default=3)
        parser.add_argument("--read-only", action="store_true")

    @staticmethod
    def getProjectManager(arguments: SimpleNamespace) -> ProjectManager:
        return FileSystemProjectManager(
            rootPath=arguments.path,
            maxFolderDepth=arguments.max_folder_depth,
            readOnly=arguments.read_only,
        )


def existingFolderOrFontFile(path):
    if path == "-":
        return None
    path = pathlib.Path(path).resolve()
    ext = path.suffix.lower()
    if ext not in fileExtensions and not path.is_dir():
        raise argparse.ArgumentError(None, "invalid path")
    return path


class FileSystemProjectManager:
    def __init__(
        self,
        rootPath: pathlib.Path | None = None,
        maxFolderDepth: int = 3,
        readOnly: bool = False,
        exportManager: ExportManager | None = None,
        projectOpenListener: ProjectOpenListener | None = None,
    ):
        self.rootPath = rootPath
        self.singleFilePath = None
        self.maxFolderDepth = maxFolderDepth
        self.readOnly = readOnly
        if self.rootPath is not None and self.rootPath.suffix.lower() in fileExtensions:
            self.singleFilePath = self.rootPath
            self.rootPath = self.rootPath.parent
        self.fontHandlers: dict[str, FontHandler] = {}
        self.exportManager = exportManager
        self.projectOpenListener = projectOpenListener

    async def aclose(self) -> None:
        for fontHandler in self.fontHandlers.values():
            await fontHandler.aclose()

    async def authorize(self, request: web.Request) -> str:
        return "yes"  # arbitrary non-false string token

    async def rootDocumentHandler(self, request: web.Request) -> web.Response:
        htmlPath = resources.files("fontra") / "client" / "landing.html"
        html = htmlPath.read_bytes()
        return web.Response(body=html, content_type="text/html")

    async def projectAvailable(self, projectIdentifier: str, token: str) -> bool:
        return bool(self._getProjectPath(projectIdentifier))

    async def getRemoteSubject(self, projectIdentifier: str, token: str) -> FontHandler:
        fontHandler = self.fontHandlers.get(projectIdentifier)
        if fontHandler is None:
            projectPath = self._getProjectPath(projectIdentifier)
            if projectPath is None:
                raise FileNotFoundError(projectPath)
            backend = getFileSystemBackend(projectPath)

            async def closeFontHandler():
                logger.info(f"closing FontHandler for '{projectIdentifier}'")
                del self.fontHandlers[projectIdentifier]
                assert fontHandler is not None
                await fontHandler.aclose()
                if self.projectOpenListener is not None:
                    self.projectOpenListener.projectClosed(projectIdentifier)

            logger.info(f"new FontHandler for '{projectIdentifier}'")
            fontHandler = FontHandler(
                backend=backend,
                projectIdentifier=fspath(projectPath),
                metaInfoProvider=self,
                exportManager=self.exportManager,
                readOnly=self.readOnly,
                allConnectionsClosedCallback=closeFontHandler,
            )
            await fontHandler.startTasks()
            self.fontHandlers[projectIdentifier] = fontHandler
            if self.projectOpenListener is not None:
                self.projectOpenListener.projectOpened(projectIdentifier)
        return fontHandler

    def _getProjectPath(self, path: str) -> PathLike | None:
        if self.rootPath is None:
            projectPath = pathlib.Path(path)
            if not projectPath.is_absolute():
                projectPath = "/" / projectPath
        else:
            projectPath = self.rootPath.joinpath(*path.split("/"))

        if projectPath.suffix.lower() in fileExtensions and projectPath.exists():
            return projectPath
        return None

    async def getProjectList(self, token: str) -> list[str]:
        if self.rootPath is None:
            return []
        projectPaths = []
        rootItems = self.rootPath.parts
        if self.singleFilePath is not None:
            paths = [self.singleFilePath]
        else:
            paths = sorted(
                _iterFolder(self.rootPath, fileExtensions, self.maxFolderDepth)
            )
        for projectPath in paths:
            projectItems = projectPath.parts
            assert projectItems[: len(rootItems)] == rootItems
            projectPaths.append("/".join(projectItems[len(rootItems) :]))
        return projectPaths

    def setupWebRoutes(self, server):
        pass

    async def getMetaInfo(
        self, projectIdentifier: str, authorizationToken: str
    ) -> dict[str, Any]:
        return {
            "projectName": projectIdentifier.split("/")[-1],
            "projectIdentifier": projectIdentifier,
        }

    async def putMetaInfo(
        self, projectIdentifier: str, metaInfo: dict[str, Any], authorizationToken: str
    ) -> None:
        pass


def _iterFolder(folderPath, extensions, maxDepth=3):
    if maxDepth is not None and maxDepth <= 0:
        return
    try:
        for childPath in folderPath.iterdir():
            if childPath.suffix.lower() in extensions:
                yield childPath
            elif childPath.is_dir():
                yield from _iterFolder(
                    childPath,
                    extensions,
                    maxDepth - 1 if maxDepth is not None else None,
                )
    except PermissionError:
        logger.info(f"Skipping {str(folderPath)!r} (no permission)")
