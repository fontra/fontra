from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from functools import partial
from http.cookies import SimpleCookie
from importlib import resources
from importlib.metadata import entry_points
import json
import logging
import mimetypes
import re
import traceback
from typing import Any, Optional
from urllib.parse import quote
from aiohttp import WSCloseCode, web
from .remote import RemoteObjectConnection, RemoteObjectConnectionException


logger = logging.getLogger(__name__)


@dataclass(kw_only=True)
class FontraServer:

    host: str
    httpPort: int
    projectManager: Any
    launchWebBrowser: bool = False
    versionToken: Optional[str] = None
    cookieMaxAge: int = 7 * 24 * 60 * 60
    allowedFileExtensions: frozenset[str] = frozenset(
        ["css", "html", "ico", "js", "svg", "woff2"]
    )

    def setup(self):
        self.startupTime = datetime.now(timezone.utc).replace(microsecond=0)
        self.httpApp = web.Application()
        self.viewEntryPoints = {
            ep.name: ep.value for ep in entry_points(group="fontra.views")
        }
        if hasattr(self.projectManager, "setupWebRoutes"):
            self.projectManager.setupWebRoutes(self)
        routes = []
        routes.append(web.get("/", self.rootDocumentHandler))
        routes.append(web.get("/websocket/{path:.*}", self.websocketHandler))
        routes.append(web.get("/projectlist", self.projectListHandler))
        for ep in entry_points(group="fontra.webcontent"):
            routes.append(
                web.get(
                    f"/{ep.name}/{{path:.*}}",
                    partial(self.staticContentHandler, ep.value),
                )
            )
        for viewName, viewPackage in self.viewEntryPoints.items():
            routes.append(
                web.get(
                    f"/{viewName}/-/{{path:.*}}",
                    partial(self.viewPathHandler, viewName),
                )
            )
            routes.append(
                web.get(
                    f"/{viewName}/{{path:.*}}",
                    partial(self.staticContentHandler, viewPackage),
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
        self._activeWebsockets = set()

    def run(self):
        host = self.host
        httpPort = self.httpPort
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

    async def launchWebBrowserCallback(self, httpApp):
        import asyncio, webbrowser

        # Create async task with a delay, so the aiohttp startup won't
        # wait for this, and gets a chance to fail before the browser
        # is launched.

        async def _launcher():
            await asyncio.sleep(0.1)
            webbrowser.open(f"http://{self.host}:{self.httpPort}/")

        asyncio.create_task(_launcher())

    async def closeActiveWebsockets(self, httpApp):
        for websocket in list(self._activeWebsockets):
            await websocket.close(
                code=WSCloseCode.GOING_AWAY, message="Server shutdown"
            )

    async def closeProjectManager(self, httpApp):
        await self.projectManager.close()

    async def websocketHandler(self, request):
        path = "/" + request.match_info["path"]
        logger.info(f"incoming connection: {path!r}")

        cookies = SimpleCookie()
        cookies.load(request.headers.get("Cookie", ""))
        cookies = {k: v.value for k, v in cookies.items()}
        token = cookies.get("fontra-authorization-token")

        websocket = web.WebSocketResponse()
        await websocket.prepare(request)
        self._activeWebsockets.add(websocket)
        try:
            subject = await self.getSubject(websocket, path, token)
        except RemoteObjectConnectionException as e:
            logger.info("refused websocket request: %s", e)
            await websocket.close()
        except Exception as e:
            logger.error("error while handling incoming websocket messages: %r", e)
            traceback.print_exc()
            await websocket.close()
        else:
            connection = RemoteObjectConnection(websocket, path, subject, True)
            with subject.useConnection(connection):
                await connection.handleConnection()
        finally:
            self._activeWebsockets.discard(websocket)

        return websocket

    async def getSubject(self, websocket, path, token):
        subject = await self.projectManager.getRemoteSubject(path, token)
        if subject is None:
            raise RemoteObjectConnectionException("unauthorized")
        return subject

    async def projectListHandler(self, request):
        authToken = await self.projectManager.authorize(request)
        if not authToken:
            return web.HTTPUnauthorized()
        projectList = await self.projectManager.getProjectList(authToken)
        return web.Response(
            text=json.dumps(projectList), content_type="application/json"
        )

    async def staticContentHandler(self, packageName, request):
        ifModSince = request.if_modified_since
        if ifModSince is not None and ifModSince >= self.startupTime:
            return web.HTTPNotModified()

        pathItems = [""] + request.match_info["path"].split("/")
        modulePath = packageName + ".".join(pathItems[:-1])
        resourceName = pathItems[-1]
        if self.versionToken is not None:
            resourceName, versionToken = splitVersionToken(resourceName)
            if versionToken is not None:
                if versionToken != self.versionToken:
                    return web.HTTPNotFound()
        try:
            data = getResourcePath(modulePath, resourceName).read_bytes()
        except (FileNotFoundError, IsADirectoryError, ModuleNotFoundError):
            return web.HTTPNotFound()
        ext = resourceName.rsplit(".", 1)[-1].lower()
        if ext not in self.allowedFileExtensions:
            return web.HTTPNotFound()
        contentType, _ = mimetypes.guess_type(resourceName)
        data = self._addVersionTokenToReferences(data, contentType)
        response = web.Response(body=data, content_type=contentType)
        response.last_modified = self.startupTime
        return response

    async def notFoundHandler(self, request):
        return web.HTTPNotFound()

    async def rootDocumentHandler(self, request):
        response = await self.projectManager.projectPageHandler(
            request, self._addVersionTokenToReferences
        )
        response.set_cookie("fontra-version-token", str(self.startupTime))
        return response

    async def viewPathHandler(self, viewName, request):
        authToken = await self.projectManager.authorize(request)
        if not authToken:
            qs = quote(request.path_qs, safe="")
            response = web.HTTPFound(f"/?ref={qs}")
            return response

        path = request.match_info["path"]
        if not await self.projectManager.projectAvailable(path, authToken):
            return web.HTTPNotFound()

        try:
            html = getResourcePath(
                self.viewEntryPoints[viewName], f"{viewName}.html"
            ).read_text()
        except (FileNotFoundError, ModuleNotFoundError):
            return web.HTTPNotFound()

        html = self._addVersionTokenToReferences(html, "text/html")

        response = web.Response(text=html, content_type="text/html")
        response.set_cookie("fontra-version-token", str(self.startupTime))
        return response

    def _addVersionTokenToReferences(self, data, contentType):
        if self.versionToken is None:
            return data
        extensionMapping = {
            "text/html": self.allowedFileExtensions,
            "text/css": ["woff2", "svg"],
            "application/javascript": ["js"],
        }
        extensions = extensionMapping.get(contentType)
        if extensions is not None:
            data = addVersionTokenToReferences(data, self.versionToken, extensions)
        return data


def addVersionTokenToReferences(data, versionToken, extensions):
    pattern = rf"""((['"])[./][./A-Za-z-]+)(\.({"|".join(extensions)})\2)"""
    repl = rf"\1.{versionToken}\3"
    if isinstance(data, bytes):
        data = re.sub(pattern, repl, data.decode("utf-8")).encode("utf-8")
    else:
        data = re.sub(pattern, repl, data)
    return data


def getResourcePath(modulePath, resourceName):
    moduleParts = modulePath.split(".")
    moduleRoot = resources.files(moduleParts[0])
    return moduleRoot.joinpath(*moduleParts[1:], resourceName)


def splitVersionToken(fileName):
    parts = fileName.rsplit(".", 2)
    if len(parts) == 3:
        fileName, versionToken, ext = parts
        return f"{fileName}.{ext}", versionToken
    return fileName, None
