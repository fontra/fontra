import logging
from dataclasses import dataclass, field

from fontTools.varLib.models import (
    VariationModel,
    VariationModelError,
    normalizeLocation,
    normalizeValue,
)

from .classes import CrossAxisMapping, DiscreteFontAxis, FontAxis
from .varutils import clamp, makeSparseNormalizedLocation, unnormalizeLocation

logger = logging.getLogger(__name__)


@dataclass
class CrossAxisMapper:
    fontAxesSourceSpace: list[FontAxis | DiscreteFontAxis] = field(default_factory=list)
    mappings: list[CrossAxisMapping] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.mappings:
            self.model = None
            return

        # Ignore discrete axes for now
        self._axes = [
            axis for axis in self.fontAxesSourceSpace if isinstance(axis, FontAxis)
        ]
        self._axesTriples = {
            axis.name: (axis.minValue, axis.defaultValue, axis.maxValue)
            for axis in self._axes
        }
        axisNames = [axis.name for axis in self._axes]

        inputLocations = []
        outputLocations = []

        for mapping in self.mappings:
            # Input locations must be maximally sparse
            inputLocations.append(
                makeSparseNormalizedLocation(
                    normalizeLocation(mapping.inputLocation, self._axesTriples)
                )
            )
            # Output locations do NOT have to be maximally sparse, as a normalized axis value
            # of 0 is a valid output value, and is distinct from a *missing* output value
            outputLocations.append(
                normalizeLocationSparse(mapping.outputLocation, self._axes)
            )

        # If base-master is missing, insert it at zero location.
        if not any(all(v == 0 for v in loc.values()) for loc in inputLocations):
            inputLocations.insert(0, {})
            outputLocations.insert(0, {})

        assert len(inputLocations) == len(outputLocations)

        try:
            self.model = VariationModel(inputLocations, axisNames)
        except VariationModelError as e:
            self.model = None
            logger.warning(f"Can't create VariationModel for CrossAxisMapping: {e!r}")
            return

        self.deltas = {}

        for axisName in axisNames:
            sourceValues = []

            for vo, vi in zip(outputLocations, inputLocations):
                v = vo.get(axisName)
                if v is None:
                    sourceValues.append(0)
                    continue

                sourceValues.append(v - (vi.get(axisName, 0)))

            self.deltas[axisName] = self.model.getDeltas(sourceValues)

    def mapLocation(self, sourceLocation: dict[str, float]) -> dict[str, float]:
        if self.model is None:
            return sourceLocation

        normalizedLocation = normalizeLocation(sourceLocation, self._axesTriples)

        mappedLocation = self._mapNormalizedLocation(normalizedLocation)

        return unnormalizeLocation(mappedLocation, self._axes)

    def _mapNormalizedLocation(self, location: dict[str, float]) -> dict[str, float]:
        assert self.model is not None

        mappedLocation = {}

        for axisName, axisValue in location.items():
            if axisName not in self.deltas:
                mappedLocation[axisName] = axisValue
                continue

            value = self.model.interpolateFromDeltas(location, self.deltas[axisName])

            mappedLocation[axisName] = axisValue + value

        return mappedLocation


def normalizeLocationSparse(location: dict[str, float], axisList: list[FontAxis]):
    # Normalizes location based on axis min/default/max values from axes.
    # 1. Does *not* fill in missing values.
    # 2. Ensures there are no values for axes not in `axisList`
    out = {}
    for axis in axisList:
        v = location.get(axis.name)
        if v is None:
            continue

        out[axis.name] = normalizeValue(
            v,
            (
                axis.minValue,
                clamp(axis.defaultValue, axis.minValue, axis.maxValue),
                clamp(axis.maxValue, axis.minValue, axis.maxValue),
            ),
        )

    return out
