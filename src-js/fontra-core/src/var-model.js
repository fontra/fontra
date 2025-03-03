// Partial port of fontTools.varLib.models.VariationModel

import { VariationError } from "./errors.js";
import { isSuperset } from "./set-ops.js";
import { clamp, reversedEnumerate } from "./utils.js";
import { addItemwise, mulScalar, subItemwise } from "./var-funcs.js";

export class VariationModel {
  constructor(locations, axisOrder = null) {
    this.locations = locations;
    this.axisOrder = axisOrder || [];
    const locationsSet = new Set(locations.map((item) => locationToString(item)));
    if (locationsSet.size != locations.length) {
      console.log("locations:", locations);
      throw new VariationError("locations must be unique");
    }
    if (!locationsSet.has("{}")) {
      throw new VariationError("locations must contain default (missing base source)");
    }
    this.locations = sortedLocations(locations, axisOrder);
    // Mapping from user's master order to our master order
    const locationsStr = locations.map(locationToString);
    const thisLocationsStr = this.locations.map(locationToString);
    this.mapping = locationsStr.map((loc) => thisLocationsStr.indexOf(loc));
    this.reverseMapping = thisLocationsStr.map((loc) => locationsStr.indexOf(loc));

    this._computeMasterSupports();
  }

  _computeMasterSupports() {
    this.supports = [];
    const regions = this._locationsToRegions();
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      const locAxes = new Set(Object.keys(region));
      // Walk over previous masters now
      for (let j = 0; j < i; j++) {
        const prev_region = regions[j];
        // Master with extra axes do not participte
        if (!isSuperset(locAxes, Object.keys(prev_region))) {
          continue;
        }
        // If it's NOT in the current box, it does not participate
        let relevant = true;
        for (const [axis, [lower, peak, upper]] of Object.entries(region)) {
          if (
            prev_region[axis] === undefined ||
            !(
              prev_region[axis][1] === peak ||
              (lower < prev_region[axis][1] && prev_region[axis][1] < upper)
            )
          ) {
            relevant = false;
            break;
          }
        }
        if (!relevant) {
          continue;
        }

        // Split the box for new master; split in whatever direction
        // that has largest range ratio.
        //
        // For symmetry, we actually cut across multiple axes
        // if they have the largest, equal, ratio.
        // https://github.com/fonttools/fonttools/commit/7ee81c8821671157968b097f3e55309a1faa511e#commitcomment-31054804

        let bestAxes = {};
        let bestRatio = -1;
        for (const axis of Object.keys(prev_region)) {
          const val = prev_region[axis][1];
          // assert axis in region
          const [lower, locV, upper] = region[axis];
          let [newLower, newUpper] = [lower, upper];
          let ratio;
          if (val < locV) {
            newLower = val;
            ratio = (val - locV) / (lower - locV);
          } else if (locV < val) {
            newUpper = val;
            ratio = (val - locV) / (upper - locV);
          } else {
            // val == locV
            // Can't split box in this direction.
            continue;
          }
          if (ratio > bestRatio) {
            bestAxes = {};
            bestRatio = ratio;
          }
          if (ratio == bestRatio) {
            bestAxes[axis] = [newLower, locV, newUpper];
          }
        }

        for (const axis in bestAxes) {
          region[axis] = bestAxes[axis];
        }
      }
      this.supports.push(region);
    }
    this._computeDeltaWeights();
  }

  _locationsToRegions() {
    const locations = this.locations;
    // Compute min/max across each axis, use it as total range.
    const minV = {};
    const maxV = {};
    for (const l of locations) {
      for (const [k, v] of Object.entries(l)) {
        minV[k] = Math.min(v, objectGet(minV, k, v));
        maxV[k] = Math.max(v, objectGet(maxV, k, v));
      }
    }

    const regions = [];
    for (const loc of locations) {
      const region = {};
      for (const [axis, locV] of Object.entries(loc)) {
        if (locV > 0) {
          region[axis] = [0, locV, maxV[axis]];
        } else {
          region[axis] = [minV[axis], locV, 0];
        }
      }
      regions.push(region);
    }
    return regions;
  }

  _computeDeltaWeights() {
    this.deltaWeights = [];
    for (let i = 0; i < this.locations.length; i++) {
      const loc = this.locations[i];
      const deltaWeight = new Map();
      // Walk over previous masters now, populate deltaWeight
      for (let j = 0; j < i; j++) {
        const support = this.supports[j];
        const scalar = supportScalar(loc, support);
        if (scalar) {
          deltaWeight.set(j, scalar);
        }
      }
      this.deltaWeights.push(deltaWeight);
    }
  }

  getDeltas(masterValues) {
    if (masterValues.length !== this.deltaWeights.length) {
      throw new VariationError(
        "masterValues must have the same length as this.deltaWeights"
      );
    }
    const mapping = this.reverseMapping;
    const out = [];
    for (let i = 0; i < masterValues.length; i++) {
      let delta = masterValues[mapping[i]];
      const weights = this.deltaWeights[i];
      for (const [j, weight] of weights.entries()) {
        if (weight === 1) {
          delta = subItemwise(delta, out[j]);
        } else {
          delta = subItemwise(delta, mulScalar(out[j], weight));
        }
      }
      out.push(delta);
    }
    return out;
  }

  getScalars(loc) {
    return this.supports.map((support) => supportScalar(loc, support));
  }

  interpolateFromDeltas(loc, deltas) {
    const scalars = this.getScalars(loc);
    return interpolateFromDeltasAndScalars(deltas, scalars);
  }

  getSourceContributions(location) {
    // Return the contribution factor for source (master) values
    const contributions = this.getScalars(location);
    for (const [i, weights] of reversedEnumerate(this.deltaWeights)) {
      for (const [j, weight] of weights.entries()) {
        if (j >= i) {
          throw new Error("assert -- bad i/j indices");
        }
        contributions[j] -= contributions[i] * weight;
      }
    }
    return this.mapping.map((i) => contributions[i]);
  }

  getDefaultSourceIndex() {
    return this.reverseMapping[0];
  }
}

function sortedLocations(locations, axisOrder = null) {
  // decorate, sort, undecorate
  const decoratedLocations = getDecoratedMasterLocations(locations, axisOrder || []);
  decoratedLocations.sort((a, b) => deepCompare(a[0], b[0]));
  return decoratedLocations.map((item) => item[1]);
}

function getDecoratedMasterLocations(locations, axisOrder) {
  if (!locationsContainsBaseMaster(locations)) {
    throw new VariationError("Base master not found");
  }

  const axisPoints = {};
  for (const loc of locations) {
    const keys = Object.keys(loc);
    if (keys.length != 1) {
      continue;
    }
    const axis = keys[0];
    const value = loc[axis];
    if (axisPoints[axis] === undefined) {
      axisPoints[axis] = new Set([0.0]);
    }
    // assert (
    //   value not in axisPoints[axis]
    // ), 'Value "%s" in axisPoints["%s"] -->  %s' % (value, axis, axisPoints)
    axisPoints[axis].add(value);
  }

  const result = Array(locations.length);
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    const locEntries = Object.entries(loc);
    const rank = locEntries.length;
    const onPointAxes = [];
    for (const [axis, value] of locEntries) {
      if (axisPoints[axis] !== undefined && axisPoints[axis].has(value)) {
        onPointAxes.push(axis);
      }
    }
    const orderedAxes = axisOrder.filter((axis) => loc[axis] !== undefined);
    orderedAxes.push(
      ...Object.keys(loc)
        .sort()
        .filter((axis) => axisOrder.indexOf(axis) === -1)
    );
    const deco = [
      rank, // First, order by increasing rank
      -onPointAxes.length, // Next, by decreasing number of onPoint axes
      orderedAxes.map((axis) => {
        const index = axisOrder.indexOf(axis);
        return index != -1 ? index : 0x10000;
      }), // Next, by known axes
      orderedAxes, // Next, by all axes
      orderedAxes.map((axis) => Math.sign(loc[axis])), // Next, by signs of axis values
      orderedAxes.map((axis) => Math.abs(loc[axis])), // Next, by absolute value of axis values
    ];
    result[i] = [deco, locations[i]];
  }
  return result;
}

function locationsContainsBaseMaster(locations) {
  for (let i = 0; i < locations.length; i++) {
    if (Object.keys(locations[i]).length === 0) {
      return true;
    }
  }
  return false;
}

function objectGet(o, k, dflt) {
  const result = o[k];
  if (result === undefined) {
    return dflt;
  }
  return result;
}

function sorted(a) {
  const result = a.slice();
  result.sort();
  return result;
}

export function locationToString(loc) {
  const sortedLoc = {};
  for (const key of Object.keys(loc).sort()) {
    sortedLoc[key] = loc[key];
  }
  return JSON.stringify(sortedLoc);
}

export function normalizeValue(v, lower, dflt, upper) {
  // Normalizes value based on a min/default/max triple.
  if (!(lower <= dflt && dflt <= upper)) {
    throw new VariationError(
      `Invalid axis values, must be minimum, default, maximum: ${lower}, ${dflt}, ${upper}`
    );
  }
  v = clamp(v, lower, upper);
  if (v === dflt) {
    v = 0.0;
  } else if (v < dflt) {
    v = (v - dflt) / (dflt - lower);
  } else {
    v = (v - dflt) / (upper - dflt);
  }
  return v;
}

export function unnormalizeValue(v, lower, dflt, upper) {
  // The opposite of normalizeValue
  if (v < 0) {
    v = dflt + v * (dflt - lower);
  } else {
    v = dflt + v * (upper - dflt);
  }
  return clamp(v, lower, upper);
}

export function normalizeLocation(location, axisList) {
  // Normalizes location based on axis min/default/max values from axes.
  const out = {};
  for (const axis of axisList) {
    let v = location[axis.name];
    if (v === undefined) {
      v = axis.defaultValue;
    }
    out[axis.name] = normalizeValue(
      v,
      axis.minValue,
      clamp(axis.defaultValue, axis.minValue, axis.maxValue),
      clamp(axis.maxValue, axis.minValue, axis.maxValue)
    );
  }
  return out;
}

export function unnormalizeLocation(location, axisList) {
  // The opposite of normalizeLocation
  const out = {};
  for (const axis of axisList) {
    let v = location[axis.name];
    if (v === undefined) {
      v = axis.defaultValue;
    }
    out[axis.name] = unnormalizeValue(
      v,
      axis.minValue,
      clamp(axis.defaultValue, axis.minValue, axis.maxValue),
      clamp(axis.maxValue, axis.minValue, axis.maxValue)
    );
  }
  return out;
}

export function supportScalar(location, support, ot = true) {
  // Returns the scalar multiplier at location, for a master
  // with support.  If ot is True, then a peak value of zero
  // for support of an axis means "axis does not participate".  That
  // is how OpenType Variation Font technology works.
  let scalar = 1.0;
  for (const [axis, [lower, peak, upper]] of Object.entries(support)) {
    let v;
    if (ot) {
      // OpenType-specific case handling
      if (peak === 0.0) {
        continue;
      }
      if (lower > peak || peak > upper) {
        continue;
      }
      if (lower < 0.0 && upper > 0.0) {
        continue;
      }
      v = location[axis] || 0.0;
    } else {
      if (location[axis] === undefined) {
        throw new VariationError(`axes ${axis} not present in location`);
      }
      v = location[axis];
    }
    if (v === peak) {
      continue;
    }
    if (v <= lower || upper <= v) {
      scalar = 0.0;
      break;
    }
    if (v < peak) {
      scalar *= (v - lower) / (peak - lower);
    } else {
      // v > peak
      scalar *= (v - upper) / (peak - upper);
    }
  }
  return scalar;
}

function interpolateFromDeltasAndScalars(deltas, scalars) {
  if (deltas.length !== scalars.length) {
    throw new VariationError("deltas and scalars must have the same length");
  }
  let v = null;
  for (let i = 0; i < scalars.length; i++) {
    const scalar = scalars[i];
    if (!scalar) {
      continue;
    }
    const contribution = mulScalar(deltas[i], scalar);
    if (v === null) {
      v = contribution;
    } else {
      v = addItemwise(v, contribution);
    }
  }
  return v;
}

export function deepCompare(a, b) {
  if (typeof a !== typeof b) {
    throw new TypeError("can't compare objects");
  }
  if (typeof a === "string" || typeof a === "number") {
    if (a < b) {
      return -1;
    } else if (a === b) {
      return 0;
    } else {
      // a > b
      return 1;
    }
  } else {
    if (a.length === undefined || b.length === undefined) {
      throw new TypeError("can't compare objects");
    }
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i++) {
      const itemA = a[i];
      const itemB = b[i];
      if (itemA === undefined) {
        return -1;
      } else if (itemB === undefined) {
        return 1;
      } else {
        const result = deepCompare(itemA, itemB);
        if (result) {
          return result;
        }
      }
    }
    return 0;
  }
}

export function mapForward(location, axes) {
  return _mapSpace(location, axes, _fromEntries);
}

export function mapBackward(location, axes) {
  return _mapSpace(location, axes, _reverseFromEntries);
}

function _mapSpace(location, axes, mapFunc) {
  const mappedLocation = { ...location };
  const axesWithMap = {};

  for (const axis of axes) {
    if (axis.mapping && axis.name in location) {
      axesWithMap[axis.name] = axis;
    }
  }
  for (const axisName in axesWithMap) {
    const mapping = mapFunc(axesWithMap[axisName].mapping);
    mappedLocation[axisName] = piecewiseLinearMap(location[axisName], mapping);
  }
  return mappedLocation;
}

function _fromEntries(mappingArray) {
  if (!mappingArray) {
    return undefined;
  }
  return Object.fromEntries(mappingArray);
}

function _reverseFromEntries(mappingArray) {
  if (!mappingArray) {
    return undefined;
  }
  const mapping = {};
  for (const [value, key] of mappingArray) {
    mapping[key] = value;
  }
  return mapping;
}

export function piecewiseLinearMap(v, mapping) {
  if (!mapping) {
    return v;
  }
  const keys = Object.keys(mapping);
  if (!keys.length) {
    return v;
  }
  if (v in mapping) {
    return mapping[v];
  }
  let k = Math.min(...keys);
  if (v < k) {
    return v + mapping[k] - k;
  }
  k = Math.max(...keys);
  if (v > k) {
    return v + mapping[k] - k;
  }
  // Interpolate
  const a = Math.max(...keys.filter((k) => k < v)); // (k for k in keys if k < v)
  const b = Math.min(...keys.filter((k) => k > v)); // (k for k in keys if k > v)
  const va = mapping[a];
  const vb = mapping[b];
  return va + ((vb - va) * (v - a)) / (b - a);
}

export function makeSparseLocation(location, axisList) {
  // Return a subset of `location` that only contains values for axes
  // defined in `axisList`, and that are not equal to the default value
  // for the axis.
  return Object.fromEntries(
    axisList
      .filter(
        (axis) =>
          location[axis.name] !== undefined && location[axis.name] !== axis.defaultValue
      )
      .map((axis) => [axis.name, location[axis.name]])
  );
}

export function makeSparseNormalizedLocation(location) {
  // location must be normalized
  const sparseLocation = {};
  for (const [name, value] of Object.entries(location)) {
    if (value) {
      sparseLocation[name] = value;
    }
  }
  return sparseLocation;
}

export function mapAxesFromUserSpaceToSourceSpace(axes) {
  return axes.map((axis) => {
    const newAxis = { ...axis };
    if (axis.mapping) {
      newAxis.valueLabels = [];
      newAxis.mapping = [];
      const mappingDict = Object.fromEntries(axis.mapping);
      const properties = axis.values
        ? ["defaultValue"]
        : ["minValue", "defaultValue", "maxValue"];
      for (const prop of properties) {
        newAxis[prop] = piecewiseLinearMap(axis[prop], mappingDict);
      }
      if (axis.values) {
        axis.values.map((value) => piecewiseLinearMap(value, mappingDict));
      }
    }
    return newAxis;
  });
}

export function isLocationAtDefault(location, axes) {
  for (const axis of axes) {
    if (axis.name in location && location[axis.name] !== axis.defaultValue) {
      return false;
    }
  }
  return true;
}
