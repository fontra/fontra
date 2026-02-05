import base64

from . import clipboard, pathops, shaperfont
from .classes import structure, unstructure
from .path import PackedPath

apiFunctions = {}


def api(func):
    apiFunctions[func.__name__] = func
    return func


@api
def parseClipboard(data):
    return unstructure(clipboard.parseClipboard(data))


@api
def unionPath(path):
    return unstructure(pathops.unionPath(structure(path, PackedPath)))


@api
def subtractPath(pathA, pathB):
    pathA = structure(pathA, PackedPath)
    pathB = structure(pathB, PackedPath)
    return unstructure(pathops.subtractPath(pathA, pathB))


@api
def intersectPath(pathA, pathB):
    pathA = structure(pathA, PackedPath)
    pathB = structure(pathB, PackedPath)
    return unstructure(pathops.intersectPath(pathA, pathB))


@api
def excludePath(pathA, pathB):
    pathA = structure(pathA, PackedPath)
    pathB = structure(pathB, PackedPath)
    return unstructure(pathops.excludePath(pathA, pathB))


@api
def buildShaperFont(unitsPerEm, glyphOrder, featureText, axes, rules):
    result = shaperfont.buildShaperFont(
        unitsPerEm, glyphOrder, featureText, axes, rules
    )
    fontData = result["fontData"]
    if fontData:
        fontData = base64.b64encode(fontData).decode("ascii")

    return {"fontData": fontData, "error": result["error"]}
