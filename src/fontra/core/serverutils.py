from . import clipboard, pathops
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
