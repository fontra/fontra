import pytest

from fontra.core.classes import Axes, CrossAxisMapping, FontAxis
from fontra.core.crossaxismapper import CrossAxisMapper


def newTestAxis(name):
    return FontAxis(
        name=name, label=name, tag=name[:4], minValue=0, defaultValue=0, maxValue=100
    )


axes = Axes(
    axes=[
        newTestAxis("Diagonal"),
        newTestAxis("Horizontal"),
        newTestAxis("Vertical"),
    ],
    mappings=[
        CrossAxisMapping(
            inputLocation={"Diagonal": 0},
            outputLocation={"Horizontal": 0, "Vertical": 0},
        ),
        CrossAxisMapping(
            inputLocation={"Diagonal": 25},
            outputLocation={"Horizontal": 0, "Vertical": 33},
        ),
        CrossAxisMapping(
            inputLocation={"Diagonal": 75},
            outputLocation={"Horizontal": 100, "Vertical": 67},
        ),
        CrossAxisMapping(
            inputLocation={"Diagonal": 100},
            outputLocation={"Horizontal": 100, "Vertical": 100},
        ),
    ],
)


testData = [
    (
        {},
        {"Diagonal": 0, "Horizontal": 0, "Vertical": 0},
    ),
    (
        {"Diagonal": 0},
        {"Diagonal": 0, "Horizontal": 0, "Vertical": 0},
    ),
    (
        {"Diagonal": 12.5},
        {"Diagonal": 12.5, "Horizontal": 0, "Vertical": 16.5},
    ),
    (
        {"Diagonal": 12.5, "Horizontal": 10, "Vertical": 10},
        {"Diagonal": 12.5, "Horizontal": 10, "Vertical": 26.5},
    ),
    (
        {"Diagonal": 12.5, "Horizontal": 10, "Vertical": 100},
        {"Diagonal": 12.5, "Horizontal": 10, "Vertical": 100},
    ),
    (
        {"Diagonal": 25},
        {"Diagonal": 25, "Horizontal": 0, "Vertical": 33},
    ),
    (
        {"Diagonal": 50},
        {"Diagonal": 50, "Horizontal": 50, "Vertical": 50},
    ),
    (
        {"Diagonal": 75},
        {"Diagonal": 75, "Horizontal": 100, "Vertical": 67},
    ),
    (
        {"Diagonal": 100},
        {"Diagonal": 100, "Horizontal": 100, "Vertical": 100},
    ),
]


@pytest.mark.parametrize("inputLocation, outputLocation", testData)
def test_crossAxisMappings(inputLocation, outputLocation) -> None:
    mapper = CrossAxisMapper(axes.axes, axes.mappings)
    assert mapper.mapLocation(inputLocation) == outputLocation


def test_empty_mappings() -> None:
    mapper = CrossAxisMapper(axes.axes, [])
    loc: dict[str, float] = {"a": 12, "b": 31}
    assert mapper.mapLocation(loc) == loc


def test_output_at_default() -> None:
    axes = [newTestAxis("a"), newTestAxis("b")]
    mappings = [
        CrossAxisMapping(
            inputLocation={"a": 100, "b": 100},
            outputLocation={"a": 0, "b": 100},
        ),
        CrossAxisMapping(
            inputLocation={"a": 100, "b": 1e-18},  # tiny but not zero
            outputLocation={"a": 0, "b": 0},
        ),
    ]

    mapper = CrossAxisMapper(axes, mappings)

    assert mapper.mapLocation({}) == {"a": 0, "b": 0}
    assert mapper.mapLocation({"a": 50}) == {"a": 50, "b": 0}
    assert mapper.mapLocation({"a": 100}) == {"a": 100, "b": 0}
    assert mapper.mapLocation({"b": 50}) == {"a": 0, "b": 50}
    assert mapper.mapLocation({"b": 100}) == {"a": 0, "b": 100}

    # Test that b wins, setting a to 0
    assert mapper.mapLocation({"a": 100, "b": 1}) == {"a": 0, "b": 1}
    assert mapper.mapLocation({"a": 10, "b": 50}) == {"a": 0, "b": 50}
    assert mapper.mapLocation({"a": 50, "b": 50}) == {"a": 0, "b": 50}
    assert mapper.mapLocation({"a": 50, "b": 100}) == {"a": 0, "b": 100}


def test_invalid_mappings() -> None:
    mappings = [
        CrossAxisMapping(
            inputLocation={},
            outputLocation={},
        ),
        CrossAxisMapping(
            inputLocation={},
            outputLocation={},
        ),
    ]

    mapper = CrossAxisMapper(axes.axes, mappings)

    loc: dict[str, float] = {"a": 12, "b": 31}
    assert mapper.mapLocation(loc) == loc
