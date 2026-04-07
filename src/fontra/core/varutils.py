from dataclasses import dataclass, replace

from fontTools.varLib.models import piecewiseLinearMap

from .classes import DiscreteFontAxis, FontAxis


def mapAxesFromUserSpaceToSourceSpace(
    axes: list[FontAxis | DiscreteFontAxis],
) -> list[FontAxis | DiscreteFontAxis]:
    return [
        mapAxisFromUserSpaceToSourceSpace(axis) if axis.mapping else axis
        for axis in axes
    ]


def mapAxisFromUserSpaceToSourceSpace(
    axis: FontAxis | DiscreteFontAxis,
) -> FontAxis | DiscreteFontAxis:
    mapping = {a: b for a, b in axis.mapping}
    replacedFields: dict = {"valueLabels": [], "mapping": []}
    valueFields = ["defaultValue"]

    if isinstance(axis, FontAxis):
        valueFields.append("minValue")
        valueFields.append("maxValue")
    else:
        replacedFields["values"] = [piecewiseLinearMap(v, mapping) for v in axis.values]

    for name in valueFields:
        replacedFields[name] = piecewiseLinearMap(getattr(axis, name), mapping)

    return replace(axis, **replacedFields)


def locationToTuple(loc: dict[str, float]) -> tuple[tuple[str, float], ...]:
    return tuple(sorted(loc.items()))


def makeSparseNormalizedLocation(location: dict[str, float]) -> dict[str, float]:
    # location must be normalized
    return {name: value for name, value in location.items() if value}


def makeSparseLocation(location, defaultLocation):
    return {
        name: location[name]
        for name, value in defaultLocation.items()
        if location.get(name, value) != value
    }


def makeDenseLocation(location, defaultLocation):
    return {name: location.get(name, value) for name, value in defaultLocation.items()}


def subsetLocationKeep(location, axisNames):
    return {n: v for n, v in location.items() if n in axisNames}


def subsetLocationDrop(location, axisNames):
    return {n: v for n, v in location.items() if n not in axisNames}


def clamp(number, minimum, maximum):
    return max(min(number, maximum), minimum)


def unnormalizeValue(v, lower, dflt, upper):
    # The opposite of normalizeValue
    if v < 0:
        v = dflt + v * (dflt - lower)
    else:
        v = dflt + v * (upper - dflt)

    return clamp(v, lower, upper)


def unnormalizeLocation(location, axisList):
    # The opposite of normalizeLocation.
    # Does *not* take axis.mapping into account.
    out = {}
    for axis in axisList:
        v = location.get(axis.name)
        if v is not None:
            out[axis.name] = unnormalizeValue(
                v,
                axis.minValue,
                clamp(axis.defaultValue, axis.minValue, axis.maxValue),
                clamp(axis.maxValue, axis.minValue, axis.maxValue),
            )

    return out


@dataclass
class AxisRange:
    minValue: float | None = None
    maxValue: float | None = None

    def update(self, value):
        if self.minValue is None:
            self.minValue = value
            self.maxValue = value
        else:
            self.minValue = min(self.minValue, value)
            self.maxValue = max(self.maxValue, value)

    def updateRange(self, other):
        self.update(other.minValue)
        self.update(other.maxValue)

    def clipRange(self, minValue, maxValue):
        self.minValue = max(min(self.minValue, maxValue), minValue)
        self.maxValue = max(min(self.maxValue, maxValue), minValue)

    def clipValue(self, value):
        return max(min(value, self.maxValue), self.minValue)

    def contains(self, value):
        return self.minValue <= value <= self.maxValue

    def isEmpty(self):
        return self.minValue == self.maxValue
