from __future__ import annotations

import errno
import json
import logging
import socket
import sys
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import partial
from http.cookies import SimpleCookie
from importlib import resources

try:
    from importlib.resources.abc import Traversable
except ImportError:
    # < 3.11
    from importlib.abc import Traversable
from importlib.metadata import entry_points
from typing import Any, Optional

from aiohttp import WSCloseCode, web

from .protocols import ProjectManager
from .remote import RemoteObjectConnection, RemoteObjectConnectionException
from .serverutils import apiFunctions
from .subprocess import shutdownProcessPool

logger = logging.getLogger(__name__)


# mimetypes.guess_type() is unreliable as it depends on system configuration
mimeTypes = {
    "css": "text/css",
    "csv": "text/csv",
    "html": "text/html",
    "ico": "image/x-icon",
    "js": "application/javascript",
    "json": "application/json",
    "svg": "image/svg+xml",
    "txt": "text/plain",
    "woff2": "font/woff2",
}


@dataclass(kw_only=True)
class FontraServer:
    host: str
    httpPort: int
    projectManager: ProjectManager
    launchWebBrowser: bool = False
    versionToken: Optional[str] = None
    cookieMaxAge: int = 7 * 24 * 60 * 60
    allowedFileExtensions: frozenset[str] = frozenset(mimeTypes.keys())

    def setup(self) -> None:
        self.startupTime = datetime.now(timezone.utc).replace(microsecond=0)
        self.httpApp = web.Application()
        self.projectManager.setupWebRoutes(self)
        routes = []
        routes.append(web.get("/", self.rootDocumentHandler))
        routes.append(web.get("/websocket", self.websocketHandler))
        routes.append(web.get("/projectlist", self.projectListHandler))
        routes.append(web.get("/serverinfo", self.serverInfoHandler))
        routes.append(web.post("/api/{function:.*}", self.webAPIHandler))
        routes.append(web.get("/.*/-/.*", self.viewRedirectHandler))
        for ep in entry_points(group="fontra.views"):
            routes.append(
                web.get(
                    f"/{{path:{ep.name}.html}}",
                    partial(self.staticContentHandler, ep.value),
                )
            )
        for ep in entry_points(group="fontra.webcontent"):
            routes.append(
                web.get(
                    f"/{ep.name}/{{path:.*}}",
                    partial(self.staticContentHandler, ep.value),
                )
            )
        routes.append(
            web.get("/{path:.*}", partial(self.staticContentHandler, "fontra.client"))
        )
        self.httpApp.add_routes(routes)
        if self.launchWebBrowser:
            self.httpApp.on_startup.append(self.launchWebBrowserCallback)
        self.httpApp.on_shutdown.append(self.closeActiveWebsockets)
        self.httpApp.on_shutdown.append(self.closeProjectManager)
        self.httpApp.on_shutdown.append(self.shutdownProcessPool)
        self._activeWebsockets: set = set()

    def run(self, showLaunchBanner: bool = True) -> None:
        host = self.host
        httpPort = self.httpPort
        if showLaunchBanner:
            navigating = "Navigating to:" if self.launchWebBrowser else "Navigate to:  "
            pad = " " * (22 - len(str(httpPort)) - len(host))
            print("+---------------------------------------------------+")
            print("|                                                   |")
            print("|      Fontra!                                      |")
            print("|                                                   |")
            print(f"|      {navigating}                               |")
            print(f"|      http://{host}:{httpPort}/{pad}              |")
            print("|                                                   |")
            print("+---------------------------------------------------+")
        web.run_app(self.httpApp, host=host, port=httpPort)

    async def launchWebBrowserCallback(self, httpApp: web.Application) -> None:
        import asyncio
        import webbrowser

        # Create async task with a delay, so the aiohttp startup won't
        # wait for this, and gets a chance to fail before the browser
        # is launched.

        async def _launcher():
            await asyncio.sleep(0.1)
            webbrowser.open(f"http://{self.host}:{self.httpPort}/")

        asyncio.create_task(_launcher())

    async def closeActiveWebsockets(self, httpApp: web.Application) -> None:
        for websocket in list(self._activeWebsockets):
            await websocket.close(
                code=WSCloseCode.GOING_AWAY, message="Server shutdown"
            )

    async def closeProjectManager(self, httpApp: web.Application) -> None:
        await self.projectManager.aclose()

    async def shutdownProcessPool(self, httpApp: web.Application) -> None:
        shutdownProcessPool()

    async def websocketHandler(self, request: web.Request) -> web.WebSocketResponse:
        projectIdentifier = request.query.get("project")
        if projectIdentifier is None:
            raise web.HTTPNotFound()

        remote = request.headers.get("X-FORWARDED-FOR", request.remote)
        logger.info(f"incoming connection from {remote} for {projectIdentifier!r}")

        cookies = SimpleCookie()
        cookies.load(request.headers.get("Cookie", ""))
        cookieValues = {k: v.value for k, v in cookies.items()}
        token = cookieValues.get("fontra-authorization-token", "")

        websocket = web.WebSocketResponse(heartbeat=55, max_msg_size=0x2000000)
        await websocket.prepare(request)
        self._activeWebsockets.add(websocket)
        try:
            subject = await self.getSubject(websocket, projectIdentifier, token)
        except RemoteObjectConnectionException as e:
            logger.info("refused websocket request: %s", e)
            await websocket.close()
        except Exception as e:
            logger.error("error while handling incoming websocket messages: %r", e)
            traceback.print_exc()
            await websocket.close()
        else:
            connection = RemoteObjectConnection(
                websocket, projectIdentifier, subject, True
            )
            async with subject.useConnection(connection):
                await connection.handleConnection()
        finally:
            self._activeWebsockets.discard(websocket)

        return websocket

    async def getSubject(
        self, websocket: web.WebSocketResponse, projectIdentifier: str, token: str
    ) -> Any:
        subject = await self.projectManager.getRemoteSubject(projectIdentifier, token)
        if subject is None:
            raise RemoteObjectConnectionException("unauthorized")
        return subject

    async def projectListHandler(self, request: web.Request) -> web.Response:
        authToken = await self.projectManager.authorize(request)
        if not authToken:
            raise web.HTTPUnauthorized()
        projectList = await self.projectManager.getProjectList(authToken)
        return web.Response(
            text=json.dumps(projectList), content_type="application/json"
        )

    async def serverInfoHandler(self, request: web.Request) -> web.Response:
        from .. import __version__ as fontraVersion

        authToken = await self.projectManager.authorize(request)
        if not authToken:
            raise web.HTTPUnauthorized()
        info = sys.version_info
        pythonVersion = f"{info.major}.{info.minor}.{info.micro}"
        if info.releaselevel != "final":
            pythonVersion += info.releaselevel
        serverInfo = {
            "Fontra version": fontraVersion,
            "Python version": pythonVersion,
            "Startup time": self.startupTime.isoformat(),
            "View plugins": ", ".join(
                ep.name for ep in entry_points(group="fontra.views")
            ),
            "Project manager": self.projectManager.__class__.__name__,
        }
        extensions = sorted(getattr(self.projectManager, "extensions", ()))
        if extensions:
            serverInfo["Supported file extensions"] = ", ".join(extensions)
        return web.Response(
            text=json.dumps(serverInfo), content_type="application/json"
        )

    async def webAPIHandler(self, request: web.Request) -> web.Response:
        authToken = await self.projectManager.authorize(request)
        if not authToken:
            raise web.HTTPUnauthorized()

        functionName = request.match_info["function"]
        function = apiFunctions.get(functionName)
        if function is None:
            raise web.HTTPNotFound()
        kwargs = await request.json()
        try:
            returnValue = function(**kwargs)
        except Exception as e:
            traceback.print_exc()
            result = {"error": repr(e)}
        else:
            result = {"returnValue": returnValue}
        return web.Response(text=json.dumps(result), content_type="application/json")

    async def staticContentHandler(
        self, packageName: str, request: web.Request
    ) -> web.Response:
        ifModSince = request.if_modified_since
        if ifModSince is not None and ifModSince >= self.startupTime:
            raise web.HTTPNotModified()

        pathItems = [""] + request.match_info["path"].split("/")
        modulePath = packageName + ".".join(pathItems[:-1])
        resourceName = pathItems[-1]
        try:
            data = getResourcePath(modulePath, resourceName).read_bytes()
        except (FileNotFoundError, IsADirectoryError, ModuleNotFoundError):
            raise web.HTTPNotFound()
        ext = resourceName.rsplit(".", 1)[-1].lower()
        if ext not in self.allowedFileExtensions:
            raise web.HTTPNotFound()
        contentType = mimeTypes.get(resourceName.rsplit(".")[-1], "")
        response = web.Response(body=data, content_type=contentType)
        response.last_modified = self.startupTime
        return response

    async def notFoundHandler(self, request: web.Request) -> web.Response:
        return web.HTTPNotFound()

    async def rootDocumentHandler(self, request: web.Request) -> web.Response:
        response = await self.projectManager.projectPageHandler(request)
        return response

    # Support pre-2025 paths
    async def viewRedirectHandler(self, request: web.Request) -> web.Response:
        raise web.HTTPFound(request.path.replace("/-/", ".html?project="))


def getResourcePath(modulePath: str, resourceName: str) -> Traversable:
    moduleParts = modulePath.split(".")
    moduleRoot = resources.files(moduleParts[0])
    resourcePath = moduleRoot
    for pathItem in [*moduleParts[1:], resourceName]:
        resourcePath = resourcePath.joinpath(pathItem)
    return resourcePath


def splitVersionToken(fileName: str) -> tuple[str, str | None]:
    parts = fileName.rsplit(".", 2)
    if len(parts) == 3:
        fileName, versionToken, ext = parts
        return f"{fileName}.{ext}", versionToken
    return fileName, None


def findFreeTCPPort(startPort: int = 8000) -> int:
    port = startPort
    while True:
        tcp = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            tcp.bind(("", port))
        except OSError as e:
            if e.errno != errno.EADDRINUSE:
                raise
            port += 1
        else:
            break
        finally:
            tcp.close()
    return port
