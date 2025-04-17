import { DiscreteVariationModel } from "./discrete-variation-model.js";
import { longestCommonPrefix } from "./utils.js";

export class KerningController {
  constructor(kernData, fontAxesSourceSpace, fontSources) {
    this.kernData = kernData;
    this.fontAxesSourceSpace = fontAxesSourceSpace;
    this.fontSources = fontSources;
    this._setup();
  }

  _setup() {
    const leftPairNames = new Set(Object.keys(this.kernData.values));
    const rightPairNames = new Set();
    for (const leftPairName of leftPairNames) {
      for (const rightPairName of Object.keys(this.kernData.values[leftPairName])) {
        rightPairNames.add(rightPairName);
      }
    }
    const groupNames = new Set(Object.keys(this.kernData.groups));
    const leftPairGroupNames = [...leftPairNames].filter((n) => groupNames.has(n));
    const rightPairGroupNames = [...rightPairNames].filter((n) => groupNames.has(n));

    // TODO/FIXME:
    // 1. add default for when there are no group names,
    // 2. use heuristings if there's only one group name
    // Probably: fall back to "public.kern1" and "@MMK_L_" etc.
    this.leftPrefix = longestCommonPrefix(leftPairGroupNames);
    this.rightPrefix = longestCommonPrefix(rightPairGroupNames);

    this.leftPairGroupMapping = makeGlyphGroupMapping(
      leftPairGroupNames,
      this.kernData.groups
    );
    this.rightPairGroupMapping = makeGlyphGroupMapping(
      rightPairGroupNames,
      this.kernData.groups
    );

    const locations = this.kernData.sourceIdentifiers.map(
      (sourceIdentifier) => this.fontSources[sourceIdentifier].location
    );
    this.model = new DiscreteVariationModel(locations, this.fontAxesSourceSpace);
    this._pairFunctions = {};
  }

  instantiate(location) {
    return new KerningInstance(this, location);
  }

  _getPairFunction(leftName, rightName) {
    let pairFunction = this._pairFunctions[leftName]?.[rightName];
    if (pairFunction === undefined) {
      const sourceValues = this.kernData.values[leftName]?.[rightName];
      if (sourceValues === undefined) {
        // We don't have kerning for this pair
        pairFunction = null;
      } else {
        const { subModel, subValues } = this.model.getSubModel(sourceValues);
        const deltas = subModel.getDeltas(subValues);
        pairFunction = (location) =>
          subModel.interpolateFromDeltas(location, deltas).instance;
      }
      if (!this._pairFunctions[leftName]) {
        this._pairFunctions[leftName] = {};
      }
      this._pairFunctions[leftName][rightName] = pairFunction;
    }
    return pairFunction;
  }

  getPairValue(location, leftGlyph, rightGlyph) {
    const leftGroup = this.leftPairGroupMapping[leftGlyph];
    const rightGroup = this.rightPairGroupMapping[rightGlyph];
    const pairsToTry = [
      [leftGlyph, rightGlyph],
      [leftGlyph, rightGroup],
      [leftGroup, rightGlyph],
      [leftGroup, rightGroup],
    ];

    let value = null;

    for (const [leftName, rightName] of pairsToTry) {
      if (!leftName || !rightName) {
        continue;
      }

      const pairFunction = this._getPairFunction(leftName, rightName);

      if (pairFunction) {
        value = pairFunction(location);
        break;
      }
    }

    return value;
  }
}

class KerningInstance {
  constructor(controller, location) {
    this.controller = controller;
    this.location = location;
    this.valueCache = {};
  }

  getPairValue(leftGlyph, rightGlyph) {
    let value = this.valueCache[leftGlyph]?.[rightGlyph];
    if (value === undefined) {
      value = this.controller.getPairValue(this.location, leftGlyph, rightGlyph);
      if (!this.valueCache[leftGlyph]) {
        this.valueCache[leftGlyph] = {};
      }
      this.valueCache[leftGlyph][rightGlyph] = value;
    }
    return value;
  }
}

function makeGlyphGroupMapping(groupNames, groups) {
  const mapping = {};
  for (const groupName of groupNames) {
    groups[groupName].forEach((glyphName) => {
      mapping[glyphName] = groupName;
    });
  }
  return mapping;
}
