import pytest

from fontra.core.classes import AxisValueLabel, DiscreteFontAxis, FontAxis
from fontra.core.varutils import (
    locationToTuple,
    makeSparseNormalizedLocation,
    mapAxesFromUserSpaceToSourceSpace,
    unnormalizeLocation,
)

testAxes = [
    FontAxis(
        name="NoMapping",
        tag="noma",
        label="NoMapping",
        minValue=200,
        defaultValue=400,
        maxValue=700,
        valueLabels=[AxisValueLabel(name="Regular", value=200)],
    ),
    FontAxis(
        name="Weight",
        tag="wght",
        label="Weight",
        minValue=200,
        defaultValue=400,
        maxValue=700,
        mapping=[[200, 0], [400, 10], [500, 20], [700, 30]],
        valueLabels=[AxisValueLabel(name="Regular", value=200)],
    ),
    DiscreteFontAxis(
        name="Italic",
        tag="ital",
        label="Italic",
        values=[20, 30],
        defaultValue=20,
        mapping=[[20, 0], [30, 1]],
    ),
]

expectedAxesSourceSpace = [
    FontAxis(
        name="NoMapping",
        tag="noma",
        label="NoMapping",
        minValue=200,
        defaultValue=400,
        maxValue=700,
        valueLabels=[AxisValueLabel(name="Regular", value=200)],
    ),
    FontAxis(
        name="Weight",
        tag="wght",
        label="Weight",
        minValue=0,
        defaultValue=10,
        maxValue=30,
    ),
    DiscreteFontAxis(
        name="Italic",
        tag="ital",
        label="Italic",
        values=[0, 1],
        defaultValue=0,
    ),
]


def test_mapAxesFromUserSpaceToSourceSpace():
    axesSourceSpace = mapAxesFromUserSpaceToSourceSpace(testAxes)
    assert expectedAxesSourceSpace == axesSourceSpace


@pytest.mark.parametrize(
    "location, expectedLocTuple",
    [
        ({}, ()),
        ({"Weight": 400}, (("Weight", 400),)),
        ({"Weight": 400, "A": 4}, (("A", 4), ("Weight", 400))),
    ],
)
def test_locationToTuple(location, expectedLocTuple):
    locTuple = locationToTuple(location)
    assert expectedLocTuple == locTuple


@pytest.mark.parametrize(
    "location, expectedSparseLocation",
    [
        ({}, {}),
        ({"Weight": 0}, {}),
        ({"Weight": 0, "Width": 0.5}, {"Width": 0.5}),
    ],
)
def test_makeSparseNormalizedLocation(location, expectedSparseLocation):
    sparseLocation = makeSparseNormalizedLocation(location)
    assert expectedSparseLocation == sparseLocation


@pytest.mark.parametrize(
    "normalizedLocation, expectedLocation",
    [
        ({}, {}),
        ({"Weight": -2}, {"Weight": 200}),
        ({"Weight": -1}, {"Weight": 200}),
        ({"Weight": -0.5}, {"Weight": 300}),
        ({"Weight": 0}, {"Weight": 400}),
        ({"Weight": 0.5}, {"Weight": 550}),
        ({"Weight": 1}, {"Weight": 700}),
        ({"Weight": 2}, {"Weight": 700}),
    ],
)
def test_unnormalizeLocation(normalizedLocation, expectedLocation):
    location = unnormalizeLocation(normalizedLocation, testAxes[:2])
    assert expectedLocation == location
