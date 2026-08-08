import pytest

from fontra.core.path import PackedPath, PackedPathPointPen
from fontra.core.pathops import excludePath, intersectPath, subtractPath, unionPath


def buildRectPath(x, y, w, h):
    pen = PackedPathPointPen()
    pen.beginPath()
    pen.addPoint((x, y), "line")
    pen.addPoint((x, y + h), "line")
    pen.addPoint((x + w, y + h), "line")
    pen.addPoint((x + w, y), "line")
    pen.endPath()
    return pen.getPath()


rect1 = buildRectPath(0, 0, 100, 100)
rect2 = buildRectPath(50, 50, 100, 100)
twoRects = PackedPath()
twoRects.appendPath(rect1)
twoRects.appendPath(rect2)

pathopsTestCases = [
    (
        unionPath,
        twoRects,
        None,
        [
            {
                "points": [
                    {"x": 0.0, "y": 0.0},
                    {"x": 0.0, "y": 100.0},
                    {"x": 50.0, "y": 100.0},
                    {"x": 50.0, "y": 150.0},
                    {"x": 150.0, "y": 150.0},
                    {"x": 150.0, "y": 50.0},
                    {"x": 100.0, "y": 50.0},
                    {"x": 100.0, "y": 0.0},
                ],
                "isClosed": True,
            },
        ],
    ),
    (
        subtractPath,
        rect1,
        rect2,
        [
            {
                "isClosed": True,
                "points": [
                    {"x": 0.0, "y": 0.0},
                    {"x": 0.0, "y": 100.0},
                    {"x": 50.0, "y": 100.0},
                    {"x": 50.0, "y": 50.0},
                    {"x": 100.0, "y": 50.0},
                    {"x": 100.0, "y": 0.0},
                ],
            }
        ],
    ),
    (
        intersectPath,
        rect1,
        rect2,
        [
            {
                "points": [
                    {"x": 50.0, "y": 50.0},
                    {"x": 50.0, "y": 100.0},
                    {"x": 100.0, "y": 100.0},
                    {"x": 100.0, "y": 50.0},
                ],
                "isClosed": True,
            }
        ],
    ),
    (
        excludePath,
        rect1,
        rect2,
        [
            {
                "points": [
                    {"x": 0.0, "y": 0.0},
                    {"x": 0.0, "y": 100.0},
                    {"x": 50.0, "y": 100.0},
                    {"x": 50.0, "y": 50.0},
                    {"x": 100.0, "y": 50.0},
                    {"x": 100.0, "y": 0.0},
                ],
                "isClosed": True,
            },
            {
                "points": [
                    {"x": 100.0, "y": 50.0},
                    {"x": 100.0, "y": 100.0},
                    {"x": 50.0, "y": 100.0},
                    {"x": 50.0, "y": 150.0},
                    {"x": 150.0, "y": 150.0},
                    {"x": 150.0, "y": 50.0},
                ],
                "isClosed": True,
            },
        ],
    ),
]


@pytest.mark.parametrize("opFunc, path1, path2, expectedPath", pathopsTestCases)
def test_pathops(opFunc, path1, path2, expectedPath):
    if path2 is None:
        result = opFunc(path1)
    else:
        result = opFunc(path1, path2)
    assert result.unpackedContours() == expectedPath
