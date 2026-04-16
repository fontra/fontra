from types import SimpleNamespace

import linesweeper
from fontTools.pens.pointPen import (
    GuessSmoothPointPen,
    PointToSegmentPen,
    SegmentToPointPen,
)

from .path import PackedPathPointPen


def fontraPathToBezPath(fontraPath):
    def draw(pen):
        fontraPath.drawPoints(PointToSegmentPen(pen))

    paths = linesweeper.BezPath.from_drawable(SimpleNamespace(draw=draw))
    if not paths:
        return linesweeper.BezPath()

    [path, *rest] = paths
    for p in rest:
        for el in p.elements():
            path.push(el)

    return path


def bezPathToFontraPath(bezPath):
    pen = PackedPathPointPen()
    for path in bezPath:
        path.draw(SegmentToPointPen(GuessSmoothPointPen(pen)))

    return pen.getPath()


def _pathOperation(pathA, pathB, pathOperation):
    bezPathA = fontraPathToBezPath(pathA)
    bezPathB = fontraPathToBezPath(pathB)

    bezPath = linesweeper.binary_op(
        bezPathA,
        bezPathB,
        "nonzero",
        pathOperation,
    )

    return bezPathToFontraPath(bezPath)


def unionPath(path):
    bezPath = fontraPathToBezPath(path)
    bezPathSimplifed = linesweeper.simplify([bezPath])
    return bezPathToFontraPath(bezPathSimplifed)


def subtractPath(pathA, pathB):
    return _pathOperation(pathA, pathB, "difference")


def intersectPath(pathA, pathB):
    return _pathOperation(pathA, pathB, "intersection")


def excludePath(pathA, pathB):
    return _pathOperation(pathA, pathB, "xor")
