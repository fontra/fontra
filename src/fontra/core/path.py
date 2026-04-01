from __future__ import annotations

import logging
from copy import copy, deepcopy
from dataclasses import dataclass, field, replace
from enum import IntEnum
from typing import Optional, TypedDict

from fontTools.misc.roundTools import otRound
from fontTools.misc.transform import DecomposedTransform, Transform

logger = logging.getLogger(__name__)


class InterpolationError(Exception):
    pass


# Path, aka "unpacked path", but structured


class Point(TypedDict, total=False):
    x: float
    y: float
    type: str  # Py 3.11: NotRequired[str]
    smooth: bool  # Py 3.11: NotRequired[bool]
    attrs: dict  # Py 3.11: NotRequired[dict]


@dataclass
class Contour:
    points: list[Point] = field(default_factory=list)
    isClosed: bool = False


@dataclass
class Path:
    contours: list[Contour] = field(default_factory=list)

    def asPath(self) -> Path:
        return self

    def asPackedPath(self) -> PackedPath:
        from .classes import unstructure

        return PackedPath.fromUnpackedContours(unstructure(self.contours))

    def isEmpty(self) -> bool:
        return not self.contours

    def drawPoints(self, pen) -> None:
        raise NotImplementedError()

    def transformed(self, transform):
        raise NotImplementedError()


# Packed Path


@dataclass
class ContourInfo:
    endPoint: int
    isClosed: bool = False


class PointType(IntEnum):
    ON_CURVE = 0x00
    OFF_CURVE_QUAD = 0x01
    OFF_CURVE_CUBIC = 0x02
    ON_CURVE_SMOOTH = 0x08


@dataclass
class PackedPath:
    coordinates: list[float] = field(default_factory=list)
    pointTypes: list[PointType] = field(default_factory=list)
    contourInfo: list[ContourInfo] = field(default_factory=list)
    pointAttributes: Optional[list[dict | None]] = None

    @classmethod
    def fromUnpackedContours(cls, unpackedContours: list[dict]) -> PackedPath:
        coordinates = []
        pointTypes = []
        pointAttributes = []
        contourInfo = []
        packedContours = [_packContour(c) for c in unpackedContours]
        for packedContour in packedContours:
            coordinates.extend(packedContour["coordinates"])
            pointTypes.extend(packedContour["pointTypes"])
            pointAttributes.extend(packedContour["pointAttributes"])
            contourInfo.append(
                ContourInfo(
                    endPoint=len(pointTypes) - 1, isClosed=packedContour["isClosed"]
                )
            )
        return cls(
            coordinates=coordinates,
            pointTypes=pointTypes,
            contourInfo=contourInfo,
            pointAttributes=pointAttributes,
        )

    def __post_init__(self):
        if self.pointAttributes is not None:
            assert len(self.pointAttributes) == len(self.pointTypes)
            if not any(self.pointAttributes):
                self.pointAttributes = None

    def asPath(self) -> Path:
        from .classes import structure

        return Path(contours=structure(self.unpackedContours(), list[Contour]))

    def asPackedPath(self) -> PackedPath:
        return self

    def isEmpty(self) -> bool:
        return not self.contourInfo

    def appendPath(self, path: PackedPath) -> None:
        originalNumPoints = len(self.pointTypes)

        self.coordinates.extend(path.coordinates)
        self.pointTypes.extend(path.pointTypes)
        endPointOffset = (
            0 if not self.contourInfo else self.contourInfo[-1].endPoint + 1
        )
        self.contourInfo.extend(
            replace(contourInfo, endPoint=contourInfo.endPoint + endPointOffset)
            for contourInfo in path.contourInfo
        )

        pointAttributes = path.pointAttributes
        if self.pointAttributes is not None and pointAttributes is None:
            pointAttributes = [None] * len(path.pointTypes)
        elif self.pointAttributes is None and pointAttributes is not None:
            self.pointAttributes = [None] * originalNumPoints

        if self.pointAttributes is not None:
            assert pointAttributes is not None
            self.pointAttributes.extend(pointAttributes)

    def deleteNTrailingContours(self, numContours):
        # The opposite of appendPath, more or less
        if numContours <= 0:
            # Nothing to do
            return

        numContours = min(numContours, len(self.contourInfo))

        contourIndex = len(self.contourInfo) - numContours
        startPoint = self._getContourStartPoint(contourIndex)
        numPoints = len(self.pointTypes) - startPoint
        self._replacePoints(startPoint, numPoints, [], [], None)
        del self.contourInfo[contourIndex:]

    def transformed(self, transform: Transform) -> PackedPath:
        coordinates = self.coordinates
        newCoordinates = []
        for i in range(0, len(self.coordinates), 2):
            newCoordinates.extend(transform.transformPoint(coordinates[i : i + 2]))
        return replace(self, coordinates=newCoordinates)

    def rounded(self, roundFunc=otRound) -> PackedPath:
        return replace(self, coordinates=[roundFunc(v) for v in self.coordinates])

    def unpackedContours(self) -> list[dict]:
        unpackedContours = []
        coordinates = self.coordinates
        pointTypes = self.pointTypes
        pointAttributes = self.pointAttributes
        startIndex = 0
        for contourInfo in self.contourInfo:
            endIndex = contourInfo.endPoint + 1
            points = list(
                _iterPoints(
                    coordinates, pointTypes, pointAttributes, startIndex, endIndex
                )
            )
            unpackedContours.append(dict(points=points, isClosed=contourInfo.isClosed))
            startIndex = endIndex
        return unpackedContours

    def drawPoints(self, pen) -> None:
        startPoint = 0
        for contourInfo in self.contourInfo:
            endIndex = contourInfo.endPoint + 1
            coordinates = self.coordinates[startPoint * 2 : endIndex * 2]
            points = list(pairwise(coordinates))
            pointTypes = self.pointTypes[startPoint:endIndex]
            pointAttributes = (
                self.pointAttributes[startPoint:endIndex]
                if self.pointAttributes
                else [None] * len(pointTypes)
            )

            points, pointTypes, pointAttributes = fixSpuriousCubicOffCurvePoints(
                points, pointTypes, pointAttributes, contourInfo.isClosed
            )

            if not contourInfo.isClosed:
                # strip leading and trailing off-curve points, they cause
                # validation problems
                for index in [-1, 0]:
                    while pointTypes and pointTypes[index] in (
                        PointType.OFF_CURVE_QUAD,
                        PointType.OFF_CURVE_CUBIC,
                    ):
                        del points[index]
                        del pointTypes[index]
                        del pointAttributes[index]
            if not pointTypes:
                # Don't write empty contours
                continue
            assert len(points) == len(pointTypes) == len(pointAttributes)
            pen.beginPath()
            segmentType = (
                _pointToSegmentType.get(pointTypes[-1], "line")
                if contourInfo.isClosed
                else "move"
            )
            for point, pointType, attrs in zip(
                points, pointTypes, pointAttributes, strict=True
            ):
                isSmooth = False
                pointSegmentType = None
                if pointType == PointType.ON_CURVE:
                    pointSegmentType = segmentType
                elif pointType == PointType.ON_CURVE_SMOOTH:
                    pointSegmentType = segmentType
                    isSmooth = True

                name = None
                identifier = None
                if attrs:
                    name = attrs.get("name")
                    identifier = attrs.get("identifier")

                pen.addPoint(
                    point,
                    segmentType=pointSegmentType,
                    smooth=isSmooth,
                    name=name,
                    identifier=identifier,
                )
                segmentType = _pointToSegmentType.get(pointType, "line")
            pen.endPath()
            startPoint = endIndex

    def getControlBounds(self):
        if not self.coordinates:
            return None
        xMin, yMin = self.coordinates[:2]
        xMax, yMax = xMin, yMin
        for x, y in pairwise(self.coordinates[2:]):
            xMin = min(xMin, x)
            yMin = min(yMin, y)
            xMax = max(xMax, x)
            yMax = max(yMax, y)
        return xMin, yMin, xMax, yMax

    def setPointPosition(self, pointIndex: int, x: float, y: float) -> None:
        coords = self.coordinates
        i = pointIndex * 2
        coords[i] = x
        coords[i + 1] = y

    def deleteContour(self, contourIndex: int) -> None:
        contourIndex = self._normalizeContourIndex(contourIndex)
        contour = self.contourInfo[contourIndex]
        startPoint = self._getContourStartPoint(contourIndex)
        numPoints = contour.endPoint + 1 - startPoint
        self._replacePoints(startPoint, numPoints, [], [], None)
        del self.contourInfo[contourIndex]
        self._moveEndPoints(contourIndex, -numPoints)

    def insertContour(self, contourIndex: int, contour: dict) -> None:
        contourIndex = self._normalizeContourIndex(contourIndex, True)
        startPoint = self._getContourStartPoint(contourIndex)
        self._replacePoints(
            startPoint,
            0,
            contour["coordinates"],
            contour["pointTypes"],
            contour.get("pointAttributes"),
        )
        contourInfo = ContourInfo(endPoint=startPoint - 1, isClosed=contour["isClosed"])
        self.contourInfo.insert(contourIndex, contourInfo)
        self._moveEndPoints(contourIndex, len(contour["pointTypes"]))

    def deletePoint(self, contourIndex: int, contourPointIndex: int) -> None:
        contourIndex = self._normalizeContourIndex(contourIndex)
        pointIndex = self._getAbsolutePointIndex(contourIndex, contourPointIndex)
        self._replacePoints(pointIndex, 1, [], [], None)
        self._moveEndPoints(contourIndex, -1)

    def insertPoint(self, contourIndex: int, contourPointIndex: int, point: dict):
        contourIndex = self._normalizeContourIndex(contourIndex)
        pointIndex = self._getAbsolutePointIndex(contourIndex, contourPointIndex, True)
        pointType = packPointType(point.get("type"), point.get("smooth"))
        attrs = point.get("attrs")
        self._replacePoints(
            pointIndex,
            0,
            [point["x"], point["y"]],
            [pointType],
            [attrs] if attrs else None,
        )
        self._moveEndPoints(contourIndex, 1)

    def moveAllWithFirstPoint(self, firstPointX, firstPointY):
        coordinates = self.coordinates
        if not coordinates:
            return

        x, y = self.coordinates[:2]
        dx = firstPointX - x
        dy = firstPointY - y

        for i in range(0, len(self.coordinates), 2):
            coordinates[i] += dx
            coordinates[i + 1] += dy

    def _getContourStartPoint(self, contourIndex: int) -> int:
        return (
            0 if contourIndex == 0 else self.contourInfo[contourIndex - 1].endPoint + 1
        )

    def _getAbsolutePointIndex(
        self, contourIndex: int, contourPointIndex: int, forInsert: bool = False
    ) -> int:
        startPoint = self._getContourStartPoint(contourIndex)
        contour = self.contourInfo[contourIndex]
        numPoints = contour.endPoint + 1 - startPoint
        originalContourPointIndex = contourPointIndex
        if contourPointIndex < 0:
            contourPointIndex += numPoints
        if contourPointIndex < 0 or (
            contourPointIndex >= numPoints + (1 if forInsert else 0)
        ):
            raise IndexError(
                f"contourPointIndex out of bounds: {originalContourPointIndex}"
            )
        return startPoint + contourPointIndex

    def _normalizeContourIndex(self, contourIndex: int, forInsert: bool = False) -> int:
        originalContourIndex = contourIndex
        numContours = len(self.contourInfo)
        if contourIndex < 0:
            contourIndex += numContours
        bias = 1 if forInsert else 0
        if contourIndex < 0 or contourIndex >= numContours + bias:
            raise IndexError(f"contourIndex out of bounds: {originalContourIndex}")
        return contourIndex

    def _replacePoints(
        self,
        startPoint: int,
        numPoints: int,
        coordinates: list[float],
        pointTypes: list[PointType],
        pointAttributes: list[dict | None] | None,
    ):
        originalNumPoints = len(self.pointTypes)

        dblIndex = startPoint * 2
        self.coordinates[dblIndex : dblIndex + numPoints * 2] = coordinates
        self.pointTypes[startPoint : startPoint + numPoints] = pointTypes

        if self.pointAttributes is not None and pointAttributes is None:
            pointAttributes = [None] * len(pointTypes)
        elif self.pointAttributes is None and pointAttributes is not None:
            self.pointAttributes = [None] * originalNumPoints

        if self.pointAttributes is not None:
            assert pointAttributes is not None
            self.pointAttributes[startPoint : startPoint + numPoints] = deepcopy(
                pointAttributes
            )

    def _moveEndPoints(self, fromContourIndex: int, offset: int) -> None:
        for contourInfo in self.contourInfo[fromContourIndex:]:
            contourInfo.endPoint += offset

    def _ensureCompatibility(self, other: PackedPath) -> None:
        if self.contourInfo != other.contourInfo:
            # TODO: we should also compare self.pointTypes with other.pointTypes,
            # but ignoring the smooth flag
            # TODO: more specific exception
            raise InterpolationError("paths are not compatible")

    def __sub__(self, other: PackedPath) -> PackedPath:
        self._ensureCompatibility(other)
        coordinates = [v1 - v2 for v1, v2 in zip(self.coordinates, other.coordinates)]
        return PackedPath(
            coordinates,
            list(self.pointTypes),
            copyContourInfo(self.contourInfo),
            deepcopy(self.pointAttributes),
        )

    def __add__(self, other: PackedPath) -> PackedPath:
        self._ensureCompatibility(other)
        coordinates = [v1 + v2 for v1, v2 in zip(self.coordinates, other.coordinates)]
        return PackedPath(
            coordinates,
            list(self.pointTypes),
            copyContourInfo(self.contourInfo),
            deepcopy(self.pointAttributes),
        )

    def __mul__(self, scalar: float) -> PackedPath:
        coordinates = [v * scalar for v in self.coordinates]
        return PackedPath(
            coordinates,
            list(self.pointTypes),
            copyContourInfo(self.contourInfo),
            deepcopy(self.pointAttributes),
        )


def joinPaths(paths: list[PackedPath]) -> PackedPath:
    result = PackedPath()
    for path in paths:
        result.appendPath(path)
    return result


class PackedPathPointPen:
    def __init__(self):
        self.coordinates = []
        self.pointTypes = []
        self.pointAttributes = []
        self.contourInfo = []
        self.components = []
        self._currentContour = None

    def getPath(self) -> PackedPath:
        return PackedPath(
            self.coordinates,
            [PointType(tp) for tp in self.pointTypes],
            self.contourInfo,
            [attrs if attrs else None for attrs in self.pointAttributes],
        )

    def beginPath(self, **kwargs) -> None:
        self._currentContour = []

    def addPoint(
        self,
        pt,
        segmentType=None,
        smooth=False,
        name=None,
        identifier=None,
        *args,
        **kwargs,
    ) -> None:
        attrs = {}
        if name is not None:
            attrs["name"] = name
        if identifier is not None:
            attrs["identifier"] = identifier
        self._currentContour.append((pt, segmentType, smooth, attrs))

    def endPath(self) -> None:
        if not self._currentContour:
            return
        isClosed = self._currentContour[0][1] != "move"
        isQuadBlob = all(
            segmentType is None for _, segmentType, _, _ in self._currentContour
        )
        if isQuadBlob:
            self.pointTypes.extend(
                [PointType.OFF_CURVE_QUAD] * len(self._currentContour)
            )
            for pt, _, _, attrs in self._currentContour:
                self.coordinates.extend(pt)
                self.pointAttributes.append(attrs)
        else:
            pointTypes = []
            pointAttributes = []
            for pt, segmentType, smooth, attrs in self._currentContour:
                if segmentType is None:
                    pointTypes.append(PointType.OFF_CURVE_CUBIC)
                elif segmentType in {"move", "line", "curve", "qcurve"}:
                    pointTypes.append(
                        PointType.ON_CURVE_SMOOTH if smooth else PointType.ON_CURVE
                    )
                else:
                    raise TypeError(f"unexpected segment type: {segmentType}")
                pointAttributes.append(attrs)
                self.coordinates.extend(pt)
            assert len(pointTypes) == len(pointAttributes) == len(self._currentContour)
            # Fix the quad point types
            for i, (_, segmentType, _, _) in enumerate(self._currentContour):
                if segmentType == "qcurve":
                    stopIndex = i - len(pointTypes) if isClosed else -1
                    for j in range(i - 1, stopIndex, -1):
                        if pointTypes[j] != PointType.OFF_CURVE_CUBIC:
                            break
                        pointTypes[j] = PointType.OFF_CURVE_QUAD
            self.pointTypes.extend(pointTypes)
            self.pointAttributes.extend(pointAttributes)
        self.contourInfo.append(
            ContourInfo(endPoint=len(self.coordinates) // 2 - 1, isClosed=isClosed)
        )
        self._currentContour = None

    def addComponent(self, glyphName: str, transformation, **kwargs) -> None:
        from .classes import Component

        transformation = DecomposedTransform.fromTransform(transformation)
        self.components.append(Component(name=glyphName, transformation=transformation))

    def addVarComponent(
        self,
        glyphName: str,
        transformation: DecomposedTransform,
        location: dict,
        identifier=None,
        **kwargs,
    ) -> None:
        from .classes import Component

        transformation = copy(transformation)
        self.components.append(
            Component(name=glyphName, transformation=transformation, location=location)
        )


def copyContourInfo(contourInfo):
    return [ContourInfo(cont.endPoint, cont.isClosed) for cont in contourInfo]


_pointToSegmentType = {
    PointType.OFF_CURVE_CUBIC: "curve",
    PointType.OFF_CURVE_QUAD: "qcurve",
}


def pairwise(iterable):
    it = iter(iterable)
    return zip(it, it)


def _iterPoints(coordinates, pointTypes, pointAttributes, startIndex, endIndex):
    for i in range(startIndex, endIndex):
        point = dict(x=coordinates[i * 2], y=coordinates[i * 2 + 1])
        pointType = pointTypes[i]
        if pointType == PointType.OFF_CURVE_CUBIC:
            point["type"] = "cubic"
        elif pointType == PointType.OFF_CURVE_QUAD:
            point["type"] = "quad"
        elif pointType == PointType.ON_CURVE_SMOOTH:
            point["smooth"] = True
        if pointAttributes is not None:
            attrs = pointAttributes[i]
            if attrs:
                point["attrs"] = attrs
        yield point


def _packContour(unpackedContour):
    coordinates = []
    pointTypes = []
    pointAttributes = []
    for point in unpackedContour["points"]:
        coordinates.append(point["x"])
        coordinates.append(point["y"])
        pointTypes.append(packPointType(point.get("type"), point.get("smooth")))
        attrs = point.get("attrs")
        pointAttributes.append(attrs if attrs else None)
    return dict(
        coordinates=coordinates,
        pointTypes=pointTypes,
        pointAttributes=pointAttributes,
        isClosed=unpackedContour["isClosed"],
    )


def packPointType(type, smooth):
    if type:
        pointType = (
            PointType.OFF_CURVE_CUBIC if type == "cubic" else PointType.OFF_CURVE_QUAD
        )
    elif smooth:
        pointType = PointType.ON_CURVE_SMOOTH
    else:
        pointType = PointType.ON_CURVE
    return pointType


def fixSpuriousCubicOffCurvePoints(points, pointTypes, pointAttributes, isClosed):
    if not any(pointType == PointType.OFF_CURVE_CUBIC for pointType in pointTypes):
        return points, pointTypes, pointAttributes

    firstOnCurvePointIndex = findFirstOnCurvePointIndex(pointTypes)
    if firstOnCurvePointIndex is None:
        return points, pointTypes, pointAttributes

    startPoint = points[0]

    if isClosed and firstOnCurvePointIndex:
        points = shift(points, -firstOnCurvePointIndex)
        pointTypes = shift(pointTypes, -firstOnCurvePointIndex)
        pointAttributes = shift(pointAttributes, -firstOnCurvePointIndex)

    assert pointTypes[0] not in {PointType.OFF_CURVE_CUBIC, PointType.OFF_CURVE_QUAD}, (
        firstOnCurvePointIndex,
    )

    indicesToDelete = set()
    for i in range(1, len(pointTypes) - 1):
        if (
            pointTypes[i - 1] == PointType.OFF_CURVE_CUBIC
            and pointTypes[i] == PointType.OFF_CURVE_CUBIC
            and pointTypes[i + 1] == PointType.OFF_CURVE_CUBIC
        ):
            indicesToDelete.add(i)

    if indicesToDelete:
        for i in reversed(sorted(indicesToDelete)):
            del points[i]
            del pointTypes[i]
            del pointAttributes[i]

    if isClosed and firstOnCurvePointIndex and startPoint in points:
        shiftBy = points.index(startPoint)
        points = shift(points, -shiftBy)
        pointTypes = shift(pointTypes, -shiftBy)
        pointAttributes = shift(pointAttributes, -shiftBy)

    return points, pointTypes, pointAttributes


def shift(lst, N):
    if N == 0:
        return lst
    N = -N % len(lst)
    return lst[N:] + lst[:N]


def findFirstOnCurvePointIndex(pointTypes):
    for i, pointType in enumerate(pointTypes):
        if pointType not in {PointType.OFF_CURVE_CUBIC, PointType.OFF_CURVE_QUAD}:
            return i
    return None


#
# 1. A conceptual hack making an empty Path equal an empty PackedPath, so that
# cattrs can know to omit an empty path for a Union[PackedPath, Path] field,
# regardless of the actual path type.
# 2. A technical hack because we can't just override __eq__ as it is *generated*
# by @dataclass, and we want to use its implementation in all other cases.
#
def _add_eq_override(cls):
    original_eq = cls.__eq__

    def __eq__(self, other):
        if hasattr(other, "isEmpty") and self.isEmpty() and other.isEmpty():
            return True
        return original_eq(self, other)

    cls.__eq__ = __eq__


_add_eq_override(Path)
_add_eq_override(PackedPath)
