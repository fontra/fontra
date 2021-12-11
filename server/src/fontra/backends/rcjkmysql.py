import asyncio
from urllib.parse import urlsplit, urlunsplit
import aiohttp
from fontTools.ufoLib.glifLib import readGlyphFromString
from .pen import PathBuilderPointPen
from .rcjkclient import Client


class ClientAsync(Client):
    def _connect(self):
        pass

    async def connect(self):
        self._session = aiohttp.ClientSession(connector=aiohttp.TCPConnector(verify_ssl=False))
        session = await self._session.__aenter__()
        assert session is self._session

        try:
            # check if there are robocjk apis available at the given host
            response = await self._api_call('ping')
            assert response['data'] == 'pong'
        except Exception as e:
            # invalid host
            raise ValueError(
                'Unable to call RoboCJK APIs at host: {} - Exception: {}'.format(
                    self._host, e))

        # obtain the auth token to prevent 401 error on first call
        await self.auth_token()

    async def close(self):
        await self._session.__aexit__(None, None, None)

    async def _api_call(self, view_name, params=None):
        url, data, headers = self._prepare_request(view_name, params)
        async with self._session.post(url, data=data, headers=headers) as response:
            if response.status == 401:
                # unauthorized - request a new auth token
                await self.auth_token()
                if self._auth_token:
                    # re-send previously unauthorized request
                    return await self._api_call(view_name, params)
            # read response json data and return dict
            response_data = await response.json()
        return response_data

    async def auth_token(self):
        """
        Get an authorization token for the current user.
        """
        params = {
            'username': self._username,
            'password': self._password,
        }
        response = await self._api_call('auth_token', params)
        # update auth token
        self._auth_token = response.get('data', {}).get('auth_token', self._auth_token)
        return response


class RCJKMySQLBackend:
    @classmethod
    async def fromURL(cls, url):
        self = cls()
        parsed = urlsplit(url)
        if parsed.scheme != "https":
            raise ValueError(f"invalid url: {url}")
        port = f":{parsed.port}" if parsed.port is not None else ""
        plainURL = f"{parsed.scheme}://{parsed.hostname}{port}/"
        path_parts = parsed.path.split("/")
        if len(path_parts) != 3:
            raise ValueError(f"invalid path: {path}")
        _, project_name, font_name = path_parts

        self.client = ClientAsync(
            host=plainURL,
            username=parsed.username,
            password=parsed.password,
        )
        await self.client.connect()

        self.project_uid = _get_uid_by_name(
            (await self.client.project_list())["data"], project_name
        )
        self.font_uid = _get_uid_by_name(
            (await self.client.font_list(self.project_uid))["data"], font_name
        )
        self._glyphMapping = None
        self._glyphDataCache = {}
        return self

    async def getGlyphNames(self):
        return sorted(await self.getReversedCmap())

    async def getReversedCmap(self):
        self._glyphMapping = {}
        revCmap = {}
        for typeCode, methodName in _glyphListMethods.items():
            method = getattr(self.client, methodName)
            response = await method(self.font_uid)
            for glyphInfo in response["data"]:
                unicode_hex = glyphInfo.get("unicode_hex")
                if unicode_hex:
                    unicodes = [int(unicode_hex, 16)]
                else:
                    unicodes = []
                revCmap[glyphInfo["name"]] = unicodes
                self._glyphMapping[glyphInfo["name"]] = (typeCode, glyphInfo["id"])
        return revCmap

    async def getGlyph(self, glyphName):
        typeCode, glyphID = self._glyphMapping[glyphName]
        glyphData = self._glyphDataCache.get((typeCode, glyphID))
        if glyphData is None:
            getMethodName = _getGlyphMethods[typeCode]
            method = getattr(self.client, getMethodName)
            response = await method(
                self.font_uid, glyphID, return_layers=True, return_related=True
            )
            glyphData = response["data"]
            self._glyphDataCache[(typeCode, glyphID)] = glyphData

        self._cacheBaseGlyphData(glyphData.get("made_of", ()))
        axisDefaults = {}
        for baseGlyphDict in glyphData.get("made_of", ()):
            axisDefaults.update(extractAxisDefaults(baseGlyphDict))

        layers = {l["group_name"]: l for l in glyphData.get("layers", ())}
        return serializeGlyph(glyphData["data"], layers, axisDefaults)

    def _cacheBaseGlyphData(self, baseGlyphs):
        for glyphDict in baseGlyphs:
            typeCode, glyphID = self._glyphMapping[glyphDict["name"]]
            assert typeCode == glyphDict["type_code"]
            assert glyphID == glyphDict["id"]
            self._glyphDataCache[(typeCode, glyphID)] = glyphDict
            # No need to recurse into glyphDict["made_of"], as getGlyph
            # does that for us.


def serializeGlyph(glifData, layers, axisDefaults):
    glyph = GLIFGlyph()
    pen = PathBuilderPointPen()
    readGlyphFromString(glifData, glyph, pen)

    defaultSourceDict = {
        "hAdvance": glyph.width,
    }
    defaultPath = pen.getPath()
    if defaultPath:
        defaultSourceDict["path"] = defaultPath

    defaultComponents = serializeComponents(
        glyph.lib.get("robocjk.deepComponents", ()), None, axisDefaults
    )
    components = defaultComponents or pen.components
    if components:
        defaultSourceDict["components"] = components
    componentNames = [c["name"] for c in components]

    sources = [
        {"location": {}, "source": defaultSourceDict},
    ]

    for varDict in glyph.lib.get("robocjk.variationGlyphs", ()):
        if not varDict.get("on", True):
            continue
        varSourceDict = {}
        layerName = varDict.get("layerName")
        hAdvance = 0
        if defaultPath and layerName and layerName in layers:
            varGlyph = GLIFGlyph()
            pen = PathBuilderPointPen()
            readGlyphFromString(layers[layerName]["data"], varGlyph, pen)
            hAdvance = varGlyph.width
            varPath = pen.getPath()
            if varPath:
                varSourceDict["path"] = varPath
        varComponents = serializeComponents(
            varDict.get("deepComponents", ()), componentNames, axisDefaults
        )
        varComponents = varComponents or pen.components
        if varComponents:
            varSourceDict["components"] = varComponents
        hAdvance = varDict["width"] if "width" in varDict else hAdvance
        varSourceDict["hAdvance"] = hAdvance
        sources.append({"location": varDict["location"], "source": varSourceDict})

    glyphDict = {
        "name": glyph.name,
        "unicodes": glyph.unicodes,
        "axes": glyph.lib["robocjk.axes"],
        "sources": sources,
    }
    return glyphDict


def serializeComponents(deepComponents, componentNames, axisDefaults):
    if componentNames is not None:
        assert len(deepComponents) == len(componentNames)
    components = []
    for index, deepCompoDict in enumerate(deepComponents):
        component = {}
        name = (
            deepCompoDict["name"] if "name" in deepCompoDict else componentNames[index]
        )
        component["name"] = name
        if deepCompoDict["coord"]:
            component["coord"] = cleanupCoord(
                deepCompoDict["coord"], axisDefaults[name]
            )
        component["transform"] = deepCompoDict["transform"]
        components.append(component)
    return components


def cleanupCoord(coord, axisDefaults):
    return {a: coord.get(a, v) for a, v in axisDefaults.items()}


class GLIFGlyph:
    unicodes = ()
    width = 0


_getGlyphMethods = {
    "AE": "atomic_element_get",
    "DC": "deep_component_get",
    "CG": "character_glyph_get",
}


_glyphListMethods = {
    "AE": "atomic_element_list",
    "DC": "deep_component_list",
    "CG": "character_glyph_list",
}


def _get_uid_by_name(items, name):
    for item in items:
        if item["name"] == name:
            return item["uid"]
    raise ValueError(f"item {name} not found")


def extractAxisDefaults(baseGlyphDict):
    axisDefaults = {}
    glyph = GLIFGlyph()
    readGlyphFromString(baseGlyphDict["data"], glyph)
    axisDefaults[glyph.name] = {
        a["name"]: a["defaultValue"] for a in glyph.lib.get("robocjk.axes", ())
    }

    # handle nested made_of glyphs
    for subGlyphDict in baseGlyphDict.get("made_of", ()):
        axisDefaults.update(extractAxisDefaults(subGlyphDict))

    return axisDefaults
