import asyncio
import base64
import functools
import logging
import traceback
from collections import UserDict, defaultdict
from contextlib import asynccontextmanager
from copy import deepcopy
from dataclasses import dataclass
from functools import cached_property
from typing import Any, AsyncGenerator, Awaitable, Callable, Optional

from .changes import (
    applyChange,
    collectChangePaths,
    filterChangePattern,
    matchChangePattern,
    patternDifference,
    patternFromPath,
    patternIntersect,
    patternUnion,
)
from .classes import Font, FontInfo, FontSource, ImageData, VariableGlyph
from .lrucache import LRUCache
from .protocols import (
    ExportManager,
    MetaInfoProvider,
    ReadableFontBackend,
    WatchableFontBackend,
    WritableFontBackend,
)

logger = logging.getLogger(__name__)


CHANGES_PATTERN_KEY = "changes-match-pattern"
LIVE_CHANGES_PATTERN_KEY = "live-changes-match-pattern"


def remoteMethod(method):
    method.fontraRemoteMethod = True
    return method


@dataclass(kw_only=True)
class FontHandler:
    backend: ReadableFontBackend
    projectIdentifier: str
    metaInfoProvider: MetaInfoProvider
    exportManager: ExportManager | None = None
    readOnly: bool = False
    dummyEditor: bool = False  # allow editing in read-only mode, don't write to backend
    allConnectionsClosedCallback: Optional[Callable[[], Awaitable[Any]]] = None

    def __post_init__(self):
        if self.writableBackend is None:
            self.readOnly = True
        self.connections = set()
        self.clientData = defaultdict(dict)
        self.localData = LRUCache()
        self._dataScheduledForWriting = {}
        self.glyphMap = {}

    @cached_property
    def writableBackend(self) -> WritableFontBackend | None:
        return self.backend if isinstance(self.backend, WritableFontBackend) else None

    async def startTasks(self) -> None:
        if hasattr(self.backend, "startOptionalBackgroundTasks"):
            self.backend.startOptionalBackgroundTasks()

        if isinstance(self.backend, WatchableFontBackend):
            await self.backend.watchExternalChanges(self.processExternalChanges)

        self._processWritesError: Exception | None = None
        self._processWritesEvent = asyncio.Event()
        self._processWritesTask = scheduleTaskAndLogException(self.processWrites())
        self._processWritesTask.add_done_callback(self._processWritesTaskDone)
        self._writingInProgressEvent = asyncio.Event()
        self._writingInProgressEvent.set()

    async def aclose(self) -> None:
        await self.backend.aclose()
        if hasattr(self, "_watcherTask"):
            self._watcherTask.cancel()
        if hasattr(self, "_processWritesTask"):
            await self.finishWriting()  # shield for cancel?
            self._processWritesTask.cancel()

    async def processExternalChanges(self, reloadPattern) -> None:
        if reloadPattern is not None and "glyphMap" in reloadPattern:
            del reloadPattern["glyphMap"]
            glyphMapChange = computeGlyphMapChange(
                self.glyphMap, await self.backend.getGlyphMap()
            )
            if glyphMapChange:
                await self.updateLocalDataWithExternalChange(glyphMapChange)
                await self.broadcastChange(glyphMapChange, None, False, False)

        if reloadPattern or reloadPattern is None:
            await self.reloadData(reloadPattern)

    def _processWritesTaskDone(self, task) -> None:
        # Signal that the write-"thread" is no longer running
        self._dataScheduledForWriting = None

    async def finishWriting(self) -> None:
        if self._processWritesError is not None:
            raise self._processWritesError
        await self._writingInProgressEvent.wait()
        if self._processWritesError is not None:
            raise self._processWritesError

    async def processWrites(self) -> None:
        while True:
            await self._processWritesEvent.wait()
            try:
                await self._processWritesOneCycle()
            except Exception as e:
                self._processWritesError = e
                raise
            finally:
                self._processWritesEvent.clear()
                self._writingInProgressEvent.set()

    async def _processWritesOneCycle(self) -> None:
        writeFunc: Callable[
            [], Awaitable[None]
        ]  # inferencing with partial() goes wrong
        while self._dataScheduledForWriting:
            writeKey, (writeFunc, connection, reloadPattern) = popFirstItem(
                self._dataScheduledForWriting
            )
            logger.info(f"write to backend -- {funcName(writeFunc)} {writeKey}")
            try:
                await writeFunc()
            except Exception as e:
                logger.error("exception while writing data: %r", e)
                traceback.print_exc()
                await self.reloadData(reloadPattern)
                if connection is not None:
                    await connection.proxy.messageFromServer(
                        "The data could not be saved due to an error.",
                        f"The edit has been reverted.\n\n{e!r}",
                    )
                else:
                    # No connection to inform, let's error
                    raise
            await asyncio.sleep(0)

    @asynccontextmanager
    async def useConnection(self, connection) -> AsyncGenerator[None, None]:
        self.connections.add(connection)
        try:
            yield
        finally:
            self.connections.remove(connection)
            if not self.connections and self.allConnectionsClosedCallback is not None:
                await self.allConnectionsClosedCallback()

    @remoteMethod
    async def isReadOnly(self, *, connection=None) -> bool:
        return self.readOnly and not self.dummyEditor

    @remoteMethod
    async def getBackEndInfo(self, *, connection=None) -> dict:
        features = {}
        for key, methodName in [
            ("find-glyphs-that-use-glyph", "findGlyphsThatUseGlyph"),
            ("background-image", "putBackgroundImage"),
        ]:
            features[key] = hasattr(self.backend, methodName)
        projectManagerFeatures = {}
        if self.exportManager is not None:
            projectManagerFeatures["export-as"] = (
                self.exportManager.getSupportedExportFormats()
            )
        return dict(
            name=self.backend.__class__.__name__,
            features=features,
            projectManagerFeatures=projectManagerFeatures,
        )

    @remoteMethod
    async def getGlyph(
        self, glyphName: str, *, connection=None
    ) -> VariableGlyph | None:
        glyph = self.localData.get(("glyphs", glyphName))
        if glyph is None:
            glyph = await self._getGlyph(glyphName)
            self.localData[("glyphs", glyphName)] = glyph
        return glyph

    def _getGlyph(self, glyphName) -> Awaitable[VariableGlyph | None]:
        return asyncio.create_task(self._getGlyphFromBackend(glyphName))

    async def _getGlyphFromBackend(self, glyphName) -> VariableGlyph | None:
        return await self.backend.getGlyph(glyphName)

    async def getData(self, key: str, connection=None) -> Any:
        data = self.localData.get(key)
        if data is None:
            data = await self._getData(key, connection)
            self.localData[key] = data
        return data

    async def _getData(self, key: str, connection=None) -> Any:
        value: Any

        match key:
            case "fontInfo":
                value = await self.backend.getFontInfo()
            case "sources":
                value = await self.backend.getSources()
            case "axes":
                value = await self.backend.getAxes()
            case "glyphMap":
                value = await self.backend.getGlyphMap()
            case "customData":
                value = await self.backend.getCustomData()
            case "unitsPerEm":
                value = await self.backend.getUnitsPerEm()
            case "features":
                value = await self.backend.getFeatures()
            case "kerning":
                value = await self.backend.getKerning()
            case "metaInfo":
                value = await self.metaInfoProvider.getMetaInfo(
                    self.projectIdentifier, connection.authorizationToken
                )
            case _:
                raise KeyError(key)

        return value

    async def _putData(self, key: str, value: Any, connection=None) -> None:
        assert self.writableBackend is not None
        match key:
            case "fontInfo":
                await self.writableBackend.putFontInfo(value)
            case "sources":
                await self.writableBackend.putSources(value)
            case "axes":
                await self.writableBackend.putAxes(value)
            case "glyphMap":
                await self.writableBackend.putGlyphMap(value)
            case "customData":
                await self.writableBackend.putCustomData(value)
            case "unitsPerEm":
                await self.writableBackend.putUnitsPerEm(value)
            case "features":
                await self.writableBackend.putFeatures(value)
            case "kerning":
                await self.writableBackend.putKerning(value)
            case "metaInfo":
                await self.metaInfoProvider.putMetaInfo(
                    self.projectIdentifier, value, connection.authorizationToken
                )
            case _:
                raise KeyError(key)

    @remoteMethod
    async def getGlyphMap(self, *, connection=None):
        self.glyphMap = await self.getData("glyphMap")
        return self.glyphMap

    @remoteMethod
    async def getFontInfo(self, *, connection=None) -> FontInfo:
        return await self.getData("fontInfo")

    @remoteMethod
    async def getSources(self, *, connection=None) -> dict[str, FontSource]:
        return await self.getData("sources")

    @remoteMethod
    async def getAxes(self, *, connection=None):
        return await self.getData("axes")

    @remoteMethod
    async def getUnitsPerEm(self, *, connection=None):
        return await self.getData("unitsPerEm")

    @remoteMethod
    async def getFeatures(self, *, connection=None):
        return await self.getData("features")

    @remoteMethod
    async def getKerning(self, *, connection=None):
        return await self.getData("kerning")

    @remoteMethod
    async def getCustomData(self, *, connection=None):
        return await self.getData("customData")

    @remoteMethod
    async def getMetaInfo(self, *, connection=None):
        return await self.getData("metaInfo", connection=connection)

    @remoteMethod
    async def getBackgroundImage(
        self, imageIdentifier: str, *, connection=None
    ) -> dict | None:
        if not hasattr(self.backend, "getBackgroundImage"):
            return None
        imageData = await self.backend.getBackgroundImage(imageIdentifier)
        if imageData is None:
            return None
        return dict(
            type=imageData.type, data=base64.b64encode(imageData.data).decode("ascii")
        )

    @remoteMethod
    async def getShaperFontData(self, *, connection=None) -> dict | None:
        shaperFontData = await self.backend.getShaperFontData()
        if shaperFontData is None:
            return None
        return dict(
            type=shaperFontData.glyphOrderSorting,
            data=base64.b64encode(shaperFontData.data).decode("ascii"),
        )

    def _getClientData(self, connection, key, default=None):
        return self.clientData[connection.clientUUID].get(key, default)

    def _setClientData(self, connection, key, value):
        self.clientData[connection.clientUUID][key] = value

    @remoteMethod
    async def putBackgroundImage(
        self, imageIdentifier: str, data: dict, *, connection
    ) -> None:
        if not hasattr(self.backend, "putBackgroundImage"):
            logger.warning("Backend doesn't support writing of background images")
            return
        await self.backend.putBackgroundImage(
            imageIdentifier,
            ImageData(type=data["type"], data=base64.b64decode(data["data"])),
        )

    @remoteMethod
    async def findGlyphsThatUseGlyph(self, glyphName: str, *, connection) -> list[str]:
        if hasattr(self.backend, "findGlyphsThatUseGlyph"):
            return await self.backend.findGlyphsThatUseGlyph(glyphName)
        return []

    @remoteMethod
    async def subscribeChanges(self, pathOrPattern, wantLiveChanges, *, connection):
        pattern = _ensurePattern(pathOrPattern)
        self._adjustMatchPattern(patternUnion, pattern, wantLiveChanges, connection)

    @remoteMethod
    async def unsubscribeChanges(self, pathOrPattern, wantLiveChanges, *, connection):
        pattern = _ensurePattern(pathOrPattern)
        self._adjustMatchPattern(
            patternDifference, pattern, wantLiveChanges, connection
        )

    def _adjustMatchPattern(self, func, pathOrPattern, wantLiveChanges, connection):
        key = LIVE_CHANGES_PATTERN_KEY if wantLiveChanges else CHANGES_PATTERN_KEY
        matchPattern = self._getClientData(connection, key, {})
        self._setClientData(connection, key, func(matchPattern, pathOrPattern))

    @remoteMethod
    async def editIncremental(self, liveChange, *, connection) -> None:
        await self.broadcastChange(liveChange, connection, True, False)

    @remoteMethod
    async def editFinal(
        self, finalChange, rollbackChange, editLabel, broadcast=False, *, connection
    ) -> None:
        # TODO: use finalChange, rollbackChange, editLabel for history recording
        # TODO: locking/checking
        await self.updateLocalDataAndWriteToBackend(finalChange, connection)
        # return {"error": "computer says no"}
        await self.broadcastChange(finalChange, connection, False, not broadcast)

    async def broadcastChange(
        self, change, sourceConnection, isLiveChange, finishesLiveChange
    ):
        # If `finishesLiveChange` is True, the same change has already been sent as a live
        # change, therefore we must *only* send it to the non-live observers.
        if finishesLiveChange:
            assert not isLiveChange
            matchPatternKeys = [CHANGES_PATTERN_KEY]
        elif isLiveChange:
            matchPatternKeys = [LIVE_CHANGES_PATTERN_KEY]
        else:
            matchPatternKeys = [LIVE_CHANGES_PATTERN_KEY, CHANGES_PATTERN_KEY]

        connections = [
            connection
            for connection in self.connections
            if connection != sourceConnection
            and any(
                matchChangePattern(change, self._getClientData(connection, k, {}))
                for k in matchPatternKeys
            )
        ]

        for connection in connections:
            scheduleTaskAndLogException(
                connection.proxy.externalChange(change, isLiveChange)
            )

    async def updateLocalDataWithExternalChange(self, change):
        await self._updateLocalDataAndWriteToBackend(change, None, True)

    async def updateLocalDataAndWriteToBackend(self, change, sourceConnection):
        await self._updateLocalDataAndWriteToBackend(change, sourceConnection, False)

    async def _updateLocalDataAndWriteToBackend(
        self, change, sourceConnection, isExternalChange
    ):
        if isExternalChange:
            # The change is coming from the backend:
            # - Only apply the change to data we already have
            # - Loading it from the backend would give as the already
            #   changed data, for which the change isn't valid
            # So: filter the change based on the data we have
            localPattern = self._getLocalDataPattern()
            change = filterChangePattern(change, localPattern)
            if change is None:
                return

        rootKeys, rootObject = await self._prepareRootObject(change)
        applyChange(rootObject, change)
        await self._updateLocalData(
            rootKeys,
            rootObject,
            sourceConnection,
            not isExternalChange and not self.readOnly,
        )

    def _getLocalDataPattern(self):
        localPattern = {}
        for key in self.localData:
            if isinstance(key, tuple):
                rootKey, subKey = key
                subPattern = localPattern.setdefault(rootKey, {})
                subPattern[subKey] = None
            else:
                localPattern[key] = None
        return localPattern

    async def _prepareRootObject(self, change):
        rootObject = Font()
        rootKeys = [p[0] for p in collectChangePaths(change, 1)]
        for rootKey in rootKeys:
            if rootKey == "glyphs":
                glyphNames = [
                    glyphName
                    for key, glyphName in collectChangePaths(change, 2)
                    if key == "glyphs"
                ]
                glyphSet = {
                    glyphName: await self.getGlyph(glyphName)
                    for glyphName in glyphNames
                }
                glyphSet = DictSetDelTracker(glyphSet)
                rootObject.glyphs = glyphSet
            else:
                setattr(rootObject, rootKey, await self.getData(rootKey))

        rootObject._trackAssignedAttributeNames()
        return rootKeys, rootObject

    async def _updateLocalData(
        self, rootKeys, rootObject, sourceConnection, writeToBackEnd
    ) -> None:
        writeFunc: Callable[
            [], Awaitable[None]
        ]  # inferencing with partial() goes wrong
        for rootKey in rootKeys + sorted(rootObject._assignedAttributeNames):
            if rootKey == "glyphs":
                glyphSet = rootObject.glyphs
                glyphMap = await self.getData("glyphMap")
                for glyphName in sorted(glyphSet.keys()):
                    writeKey = ("glyphs", glyphName)
                    if glyphName in glyphSet.newKeys:
                        self.localData[writeKey] = glyphSet[glyphName]
                    if not writeToBackEnd:
                        continue
                    assert self.writableBackend is not None
                    writeFunc = functools.partial(
                        self.writableBackend.putGlyph,
                        glyphName,
                        deepcopy(glyphSet[glyphName]),
                        glyphMap.get(glyphName, []),
                    )
                    await self.scheduleDataWrite(writeKey, writeFunc, sourceConnection)
                for glyphName in sorted(glyphSet.deletedKeys):
                    writeKey = ("glyphs", glyphName)
                    _ = self.localData.pop(writeKey, None)
                    if not writeToBackEnd:
                        continue
                    assert self.writableBackend is not None
                    writeFunc = functools.partial(
                        self.writableBackend.deleteGlyph, glyphName
                    )
                    # When deleting a glyph goes wrong, the glyphMap should *also* be reloaded
                    reloadPattern = {"glyphMap": None} | _writeKeyToPattern(writeKey)
                    await self.scheduleDataWrite(
                        writeKey,
                        writeFunc,
                        sourceConnection,
                        reloadPattern=reloadPattern,
                    )
            else:
                if rootKey in rootObject._assignedAttributeNames:
                    self.localData[rootKey] = getattr(rootObject, rootKey)
                if not writeToBackEnd:
                    continue
                assert self.writableBackend is not None
                writeFunc = functools.partial(
                    self._putData,
                    rootKey,
                    deepcopy(self.localData[rootKey]),
                    sourceConnection,
                )
                await self.scheduleDataWrite(rootKey, writeFunc, sourceConnection)

    async def scheduleDataWrite(
        self, writeKey, writeFunc, connection, reloadPattern=None
    ):
        if self._dataScheduledForWriting is None:
            # The write-"thread" is no longer running
            await self.reloadData(_writeKeyToPattern(writeKey))
            await connection.proxy.messageFromServer(
                "The data could not be saved.",
                "The edit has been reverted.\n\n"  # no trailing comma
                "The Fontra server got itself into trouble, please contact an admin.",
            )
            return
        shouldSignal = not self._dataScheduledForWriting
        if reloadPattern is None:
            reloadPattern = _writeKeyToPattern(writeKey)
        self._dataScheduledForWriting[writeKey] = (writeFunc, connection, reloadPattern)
        if shouldSignal:
            self._processWritesEvent.set()  # write: go!
            self._writingInProgressEvent.clear()

    async def reloadData(self, reloadPattern):
        if reloadPattern is None:
            # A reloadPattern being None means: reload everything
            self.localData.clear()
        else:
            # Drop local data to ensure it gets reloaded from the backend
            for rootKey, value in reloadPattern.items():
                if rootKey == "glyphs":
                    if value is None:
                        value = sorted(self.glyphMap)
                    for glyphName in value:
                        self.localData.pop(("glyphs", glyphName), None)
                else:
                    self.localData.pop(rootKey, None)

        connections = []
        for connection in self.connections:
            subscribePattern = self._getCombinedSubscribePattern(connection)
            connReloadPattern = (
                patternIntersect(subscribePattern, reloadPattern)
                if reloadPattern
                else None
            )
            if connReloadPattern or connReloadPattern is None:
                connections.append((connection, connReloadPattern))

        if not connections:
            return

        logger.info(
            f"broadcasting external changes to {len(connections)} "
            f"clients: {reloadPattern if reloadPattern is not None else 'reload everything'}"
        )

        await asyncio.gather(
            *[
                connection.proxy.reloadData(connReloadPattern)
                for connection, connReloadPattern in connections
            ]
        )

    def _getCombinedSubscribePattern(self, connection):
        patternA, patternB = [
            self._getClientData(connection, key, {})
            for key in [LIVE_CHANGES_PATTERN_KEY, CHANGES_PATTERN_KEY]
        ]
        return patternUnion(patternA, patternB)

    @remoteMethod
    async def exportAs(self, options: dict, *, connection):
        if self.exportManager is not None and hasattr(self.exportManager, "exportAs"):
            return await self.exportManager.exportAs(self.projectIdentifier, options)


def popFirstItem(d):
    key = next(iter(d))
    return (key, d.pop(key))


_tasks = set()


def taskDoneCallback(task):
    if not task.cancelled() and task.exception() is not None:
        logger.error(f"exception in asyncio task {task}", exc_info=task.exception())
    _tasks.discard(task)


def scheduleTaskAndLogException(awaitable):
    # AKA fire-and-forget
    task = asyncio.create_task(awaitable)
    task.add_done_callback(taskDoneCallback)
    _tasks.add(task)  # Prevent task from being GC'ed before it is done
    return task


def _writeKeyToPattern(writeKey):
    if not isinstance(writeKey, tuple):
        writeKey = (writeKey,)
    return patternFromPath(writeKey)


def _ensurePattern(pathOrPattern):
    return (
        patternFromPath(pathOrPattern)
        if isinstance(pathOrPattern, list)
        else pathOrPattern
    )


class DictSetDelTracker(UserDict):
    def __init__(self, data):
        super().__init__()
        self.data = data  # no copy
        self.newKeys = set()
        self.deletedKeys = set()

    def __setitem__(self, key, value):
        isNewItem = key not in self
        super().__setitem__(key, value)
        if isNewItem:
            self.newKeys.add(key)
            self.deletedKeys.discard(key)

    def __delitem__(self, key):
        _ = self.pop(key, None)
        self.deletedKeys.add(key)
        self.newKeys.discard(key)


def computeGlyphMapChange(glyphMapA, glyphMapB):
    itemsA = sorted(glyphMapA.items())
    itemsB = sorted(glyphMapB.items())

    indexA = 0
    indexB = 0

    diffGlyphNames = set()

    while True:
        if indexA >= len(itemsA):
            diffGlyphNames.update(item[0] for item in itemsB[indexB:])
            break

        if indexB >= len(itemsB):
            diffGlyphNames.update(item[0] for item in itemsA[indexA:])
            break

        itemA = itemsA[indexA]
        itemB = itemsB[indexB]

        if itemA == itemB:
            indexA += 1
            indexB += 1
        elif itemA < itemB:
            diffGlyphNames.add(itemA[0])
            indexA += 1
        else:
            # itemA > itemB
            diffGlyphNames.add(itemB[0])
            indexB += 1

    glyphMapUpdates = {}

    for glyphName in diffGlyphNames:
        glyphMapUpdates[glyphName] = glyphMapB.get(glyphName)

    return makeGlyphMapChange(glyphMapUpdates)


def makeGlyphMapChange(glyphMapUpdates):
    if not glyphMapUpdates:
        return None

    changes = [
        {"f": "=", "a": [glyphName, codePoints]}
        for glyphName, codePoints in glyphMapUpdates.items()
        if codePoints is not None
    ] + [
        {"f": "d", "a": [glyphName]}
        for glyphName, codePoints in glyphMapUpdates.items()
        if codePoints is None
    ]

    glyphMapChange = {"p": ["glyphMap"]}
    if len(changes) == 1:
        glyphMapChange.update(changes[0])
    else:
        glyphMapChange["c"] = changes

    return glyphMapChange


def funcName(f, fallback="unknown"):
    if hasattr(f, "func"):
        f = f.func
    try:
        return f.__name__
    except AttributeError:
        return fallback
