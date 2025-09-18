from copy import deepcopy
from typing import (
    Any,
    Callable,
    Generator,
    Mapping,
    MutableMapping,
    MutableSequence,
    Sequence,
)

from .classes import classCastFuncs, classSchema, structure
from .path import PackedPath


def setItem(subject, key, item, *, itemCast=None):
    if itemCast is not None:
        item = itemCast(item) if item is not None else item
    if isinstance(subject, (MutableMapping, MutableSequence)):
        subject[key] = item
    else:
        setattr(subject, key, item)


def delAttr(subject, key, *, itemCast=None):
    if isinstance(subject, Sequence):
        raise TypeError("can't call delattr on list")
    elif isinstance(subject, MutableMapping):
        del subject[key]
    else:
        delattr(subject, key)


def delItems(subject, index, deleteCount=1, itemCast=None):
    spliceItems(subject, index, deleteCount)


def insertItems(subject, index, *items, itemCast=None):
    spliceItems(subject, index, 0, *items, itemCast=itemCast)


def spliceItems(subject, index, deleteCount, *items, itemCast=None):
    if itemCast is not None:
        items = [itemCast(item) for item in items]
    assert subject is not None, items
    subject[index : index + deleteCount] = items


baseChangeFunctions: dict[str, Callable[..., None]] = {
    "=": setItem,
    "d": delAttr,
    "-": delItems,
    "+": insertItems,
    ":": spliceItems,
}


# TODO: Refactor. These don't really belong here,
# and should ideally be registered from outside
changeFunctions: dict[str, Callable[..., None]] = {
    **baseChangeFunctions,
    "=xy": lambda path, pointIndex, x, y: path.setPointPosition(pointIndex, x, y),
    "appendPath": lambda path, newPath: path.appendPath(structure(newPath, PackedPath)),
    "deleteNTrailingContours": lambda path, numContours: path.deleteNTrailingContours(
        numContours
    ),
    "insertContour": lambda path, contourIndex, contour: path.insertContour(
        contourIndex, contour
    ),
    "deleteContour": lambda path, contourIndex: path.deleteContour(contourIndex),
    "deletePoint": lambda path, contourIndex, contourPointIndex: path.deletePoint(
        contourIndex, contourPointIndex
    ),
    "insertPoint": lambda path, contourIndex, contourPointIndex, point: path.insertPoint(
        contourIndex, contourPointIndex, point
    ),
    "moveAllWithFirstPoint": lambda path, x, y: path.moveAllWithFirstPoint(x, y),
}

#
# A "change" object is a simple JS object containing several
# keys.
#
# "p": an array of path items, eg. ["glyphs", "Aring"]
# Optional: can be omitted if empty.
#
# "f": function name, to be looked up in the changeFunctions dict
# Optional: can be omitted if the change has children
#
# "a": "arguments", an array of arguments for the change function
# Optional: if omitted, defaults to an empty array
#
# "c": Array of child changes. Optional.
#


def applyChange(subject, change):
    """Apply `change` to `subject`."""
    _applyChange(subject, change)


def _applyChange(subject: Any, change: dict[str, Any], *, itemCast=None) -> None:
    path = change.get("p", [])
    functionName = change.get("f")
    children = change.get("c", [])

    for pathElement in path:
        itemCast = None
        if isinstance(subject, (Mapping, Sequence)):
            subject = subject[pathElement]
        else:
            itemCast = getItemCast(subject, pathElement, "subtype")
            subject = getattr(subject, pathElement)

    if functionName is not None:
        changeFunc: Callable[..., None] = changeFunctions[functionName]
        args = deepcopy(change.get("a", []))
        if functionName in baseChangeFunctions:
            if itemCast is None and args:
                itemCast = getItemCast(subject, args[0], "type")
            changeFunc(subject, *args, itemCast=itemCast)
        else:
            changeFunc(subject, *args)

    for subChange in children:
        _applyChange(subject, subChange, itemCast=itemCast)


def getItemCast(subject, attrName, fieldKey):
    classFields = classSchema.get(type(subject))
    if classFields is not None:
        fieldDef = classFields[attrName]
        subtype = fieldDef.get(fieldKey)
        if subtype is not None:
            return classCastFuncs.get(subtype)
    return None


_MISSING = object()
wildcard = "__WILDCARD__"  # A unique object would be better, but JSON.


def matchChangePattern(
    change: dict[str, Any], matchPattern: dict[str | int, Any]
) -> bool:
    """Return `True` or `False`, depending on whether the `change` matches
    the `matchPattern`.

    A `matchPattern` is tree in the form of a dict, where keys are change path
    elements, and values are either nested pattern dicts or `None`, to indicate
    a leaf node.
    """
    node = matchPattern
    for pathElement in change.get("p", []):
        childNode = node.get(pathElement, _MISSING)
        if childNode is _MISSING:
            childNode = node.get(wildcard, _MISSING)
        if childNode is _MISSING:
            return False
        if childNode is None:
            # leaf node
            return True
        node = childNode

    if change.get("f") in baseChangeFunctions:
        args = change.get("a")
        if args and args[0] in node:
            return True

    for childChange in change.get("c", []):
        if matchChangePattern(childChange, node):
            return True

    return False


def filterChangePattern(
    change: dict[str, Any], matchPattern: dict[str | int, Any], inverse: bool = False
) -> dict[str, Any] | None:
    """Return a subset of the `change` according to the `matchPattern`, or `None`
    if the `change` doesn't match `matchPattern` at all. If there is a match,
    all parts of the change that do not match are not included in the returned
    change object.

    A `matchPattern` is tree in the form of a dict, where keys are change path
    elements, and values are either nested pattern dicts or `None`, to indicate
    a leaf node.

    If `inverse` is True, `matchPattern` is used to exclude the change items
    that match from the return value.
    """
    node = matchPattern
    for pathElement in change.get("p", []):
        childNode = node.get(pathElement, _MISSING)
        if childNode is _MISSING:
            return change if inverse else None
        if childNode is None:
            # leaf node
            return None if inverse else change
        node = childNode

    matchedRootChange = False
    if change.get("f") in baseChangeFunctions:
        args = change.get("a")
        if args and node.get(args[0], _MISSING) is None:
            matchedRootChange = True

    filteredChildren = []
    for childChange in change.get("c", []):
        childChange = filterChangePattern(childChange, node, inverse)
        if childChange is not None:
            filteredChildren.append(childChange)

    result = {**change, "c": filteredChildren}
    if inverse == matchedRootChange:
        # inverse  matchedRootChange
        # -------  -------  -------
        # False    False    -> don't include root change in result
        # False    True     -> do include root change in result
        # True     False    -> do include root change in result
        # True     True     -> don't include root change in result
        result.pop("f", None)
        result.pop("a", None)

    return _normalizeChange(result)


def _normalizeChange(change: dict[str, Any]) -> dict[str, Any] | None:
    children = change.get("c", ())

    result: dict[str, Any] | None

    if "f" not in change and len(children) == 1:
        # Turn only child into root change
        result = {**children[0]}
        # Prefix child path with original root path
        result["p"] = change.get("p", []) + result.get("p", [])
    else:
        result = {**change}

    if not result.get("p"):
        # Remove empty path
        result.pop("p", None)

    if not result.get("c"):
        # Remove empty children list
        result.pop("c", None)

    if len(result) == 1 and "p" in result:
        # Nothing left but a path: no-op change
        result.pop("p", None)

    if not result:
        result = None

    return result


def patternFromPath(matchPath: list) -> dict[str | int, Any]:
    """Given a list of path elements, return a pattern dict."""
    pattern = {}
    if matchPath:
        pattern[matchPath[0]] = (
            None if len(matchPath) == 1 else patternFromPath(matchPath[1:])
        )
    return pattern


def patternUnion(
    patternA: dict[str | int, Any], patternB: dict[str | int, Any]
) -> dict[str | int, Any]:
    """Return a pattern which is the union of `patternA` and `patternB`:
    the result will match everything from `patternA` and `patternB`.
    """
    result = {**patternA}
    for key, valueB in patternB.items():
        valueA = patternA.get(key, _MISSING)
        if valueA is _MISSING or valueB is None:
            result[key] = valueB
        elif valueA is not None:
            result[key] = patternUnion(valueA, valueB)
        else:
            # valueA is None -- patternA already matches a prefix of
            # patternB: nothing to do
            pass
    return result


def patternDifference(
    patternA: dict[str | int, Any], patternB: dict[str | int, Any]
) -> dict[str | int, Any]:
    """Return a pattern which is `patternA` minus `patternB`: the result will
    only match the items from `patternA` that are not included in `patternB`.
    """
    result = {**patternA}
    for key, valueB in patternB.items():
        valueA = patternA.get(key, _MISSING)
        if valueA is _MISSING:
            pass
        elif valueB is None:
            del result[key]
        elif valueA is None:
            pass
        else:
            result[key] = patternDifference(valueA, valueB)
            if not result[key]:
                del result[key]
    return result


def patternIntersect(
    patternA: dict[str | int, Any], patternB: dict[str | int, Any]
) -> dict[str | int, Any]:
    """Return the intersection of `patternA` and `patternB`. The resulting pattern
    will only match items that are included in both patterns.
    """
    result = {}
    for key, valueA in patternA.items():
        valueB = patternB.get(key, _MISSING)
        if valueB is _MISSING:
            continue
        if valueA is None:
            result[key] = valueB
        elif valueB is None:
            result[key] = valueA
        else:
            childResult = patternIntersect(valueA, valueB)
            if childResult:
                result[key] = childResult
    return result


def collectChangePaths(change: dict[str, Any], depth: int) -> list[tuple]:
    """Return a list of unique paths of the specified `depth` that the `change`
    includes. The order of the list is determined by the path occurrences
    in the change."""
    # Remove duplicates, but maintain order
    return list(dict.fromkeys(_iterateChangePaths(change, depth)))


def _iterateChangePaths(
    change: dict[str, Any], depth: int, prefix: tuple = ()
) -> Generator[tuple, None, None]:
    path = prefix + tuple(change.get("p", ()))
    if len(path) >= depth:
        yield path[:depth]
        return
    for childChange in change.get("c", []):
        yield from _iterateChangePaths(childChange, depth, path)
