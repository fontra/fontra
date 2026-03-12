// avar-2-style Cross-Axis Mapping

import { zip } from "./utils.js";
import {
  VariationModel,
  makeSparseNormalizedLocation,
  normalizeLocation,
  normalizeLocationSparse,
  unnormalizeLocation,
} from "./var-model.js";

export class CrossAxisMapping {
  constructor(fontAxesSourceSpace, mappings) {
    this.fontAxesSourceSpace = fontAxesSourceSpace;
    this.mappings = mappings;
    if (mappings?.length) {
      this._setupModel();
    }
  }

  _setupModel() {
    const axisNames = this.fontAxesSourceSpace.map((axis) => axis.name);
    const inputLocations = [];
    const outputLocations = [];

    for (const { inputLocation, outputLocation } of this.mappings) {
      // Input locations must be maximally sparse
      inputLocations.push(
        makeSparseNormalizedLocation(
          normalizeLocation(inputLocation, this.fontAxesSourceSpace)
        )
      );
      // Output locations do NOT have to maximally sparse, as a normalized axis value
      // of 0 is a valid output value, and is distinct from a *missing* output value
      outputLocations.push(
        normalizeLocationSparse(outputLocation, this.fontAxesSourceSpace)
      );
    }

    // If base-master is missing, insert it at zero location.
    if (!inputLocations.some((loc) => Object.values(loc).every((v) => v === 0))) {
      inputLocations.splice(0, 0, {});
      outputLocations.splice(0, 0, {});
    }

    try {
      this.model = new VariationModel(inputLocations, axisNames);
    } catch (exc) {
      console.log(`Can't create VariationModel for CrossAxisMapping: ${exc}`);
      return;
    }

    this.deltas = {};

    for (const axisName of axisNames) {
      const sourceValues = [];

      for (const [vo, vi] of zip(outputLocations, inputLocations)) {
        const v = vo[axisName];
        if (v === undefined) {
          sourceValues.push(0);
          continue;
        }
        sourceValues.push(v - (vi[axisName] || 0));
      }

      this.deltas[axisName] = this.model.getDeltas(sourceValues);
    }
  }

  mapLocation(sourceLocation) {
    if (!this.model) {
      return sourceLocation;
    }
    const normalizedLocation = normalizeLocation(
      sourceLocation,
      this.fontAxesSourceSpace
    );

    const mappedLocation = this._mapNormalizedLocation(normalizedLocation);

    return unnormalizeLocation(mappedLocation, this.fontAxesSourceSpace);
  }

  _mapNormalizedLocation(location) {
    const mappedLocation = {};

    for (const [axisName, axisValue] of Object.entries(location)) {
      if (!(axisName in this.deltas)) {
        mappedLocation[axisName] = axisValue;
        continue;
      }
      const value = this.model.interpolateFromDeltas(location, this.deltas[axisName]);

      mappedLocation[axisName] = axisValue + value;
    }

    return mappedLocation;
  }

  unmapLocation(mappedSourceLocation) {
    if (!this.model) {
      return mappedSourceLocation;
    }
    // I know of no way to reverse the mapping operation, so we'll just return
    // the default location
    return {};
  }
}
