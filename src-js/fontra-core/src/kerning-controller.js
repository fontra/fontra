import { recordChanges } from "./change-recorder.js";
import { ChangeCollector } from "./changes.js";
import { DiscreteVariationModel } from "./discrete-variation-model.js";
import { assert, enumerate, longestCommonPrefix, throttleCalls, zip } from "./utils.js";

export class KerningController {
  constructor(kernTag, kernData, fontController) {
    this.kernTag = kernTag;
    this.kernData = kernData;
    this.fontController = fontController;
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
      (sourceIdentifier) => this.fontController.sources[sourceIdentifier].location
    );
    this.model = new DiscreteVariationModel(
      locations,
      this.fontController.fontAxesSourceSpace
    );

    this._pairFunctions = {};
  }

  get sourceIdentifiers() {
    return this.kernData.sourceIdentifiers;
  }

  get values() {
    return this.kernData.values;
  }

  instantiate(location) {
    return new KerningInstance(this, location);
  }

  getPairValueForSource(leftName, rightName, sourceIdentifier) {
    const index = this.sourceIdentifiers.indexOf(sourceIdentifier);
    assert(index >= 0);
    return this.getPairValues(leftName, rightName)?.[index];
  }

  getPairValues(leftName, rightName) {
    return this.kernData.values[leftName]?.[rightName];
  }

  _getPairFunction(leftName, rightName) {
    let pairFunction = this._pairFunctions[leftName]?.[rightName];
    if (pairFunction === undefined) {
      let sourceValues = this.getPairValues(leftName, rightName);
      if (sourceValues === undefined) {
        // We don't have kerning for this pair
        pairFunction = null;
      } else {
        // Replace missing values with zeros
        sourceValues = sourceValues.map((v) => (v == null ? 0 : v));
        const deltas = this.model.getDeltas(sourceValues);
        pairFunction = (location) =>
          this.model.interpolateFromDeltas(location, deltas).instance;
      }
      if (!this._pairFunctions[leftName]) {
        this._pairFunctions[leftName] = {};
      }
      this._pairFunctions[leftName][rightName] = pairFunction;
    }
    return pairFunction;
  }

  getGlyphPairValue(leftGlyph, rightGlyph, location) {
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

  getEditContext(pairSelectors) {
    return new KerningEditContext(this, pairSelectors);
  }
}

class KerningInstance {
  constructor(controller, location) {
    this.controller = controller;
    this.location = location;
    this.valueCache = {};
  }

  getGlyphPairValue(leftGlyph, rightGlyph) {
    let value = this.valueCache[leftGlyph]?.[rightGlyph];
    if (value === undefined) {
      value = this.controller.getGlyphPairValue(leftGlyph, rightGlyph, this.location);
      if (!this.valueCache[leftGlyph]) {
        this.valueCache[leftGlyph] = {};
      }
      this.valueCache[leftGlyph][rightGlyph] = value;
    }
    return value;
  }
}

class KerningEditContext {
  constructor(kerningController, pairSelectors) {
    assert(pairSelectors.length > 0);
    this.kerningController = kerningController;
    this.fontController = kerningController.fontController;
    this.pairSelectors = pairSelectors;
    this._throttledEditIncremental = throttleCalls(async (change) => {
      this.fontController.editIncremental(change);
    }, 50);
    this._throttledEditIncrementalTimeoutID = null;
  }

  async _editIncremental(change, mayDrop = false) {
    // If mayDrop is true, the call is not guaranteed to be broadcast, and is throttled
    // at a maximum number of changes per second, to prevent flooding the network
    if (mayDrop) {
      this._throttledEditIncrementalTimeoutID = this._throttledEditIncremental(change);
    } else {
      clearTimeout(this._throttledEditIncrementalTimeoutID);
      this.fontController.editIncremental(change);
    }
  }

  async edit(valuesIterator, undoLabel) {
    const fontController = this.kerningController.fontController;
    const basePath = ["kerning", this.kerningController.kernTag, "values"];

    let initialChanges = recordChanges(this.kerningController.values, (values) => {
      for (const { leftName, rightName } of this.pairSelectors) {
        if (!values[leftName]) {
          values[leftName] = {};
        }
        if (!values[leftName][rightName]) {
          values[leftName][rightName] = Array(
            this.kerningController.sourceIdentifiers.length
          ).fill(null);
        }
      }
    });

    if (initialChanges.hasChange) {
      initialChanges = initialChanges.prefixed(basePath);
    }

    if (initialChanges.hasChange) {
      await fontController.editIncremental(initialChanges.change);
    }

    const sourceIndices = {};
    for (const [i, sourceIdentifier] of enumerate(
      this.kerningController.sourceIdentifiers
    )) {
      sourceIndices[sourceIdentifier] = i;
    }

    let firstChanges;
    let lastChanges;
    for (const newValues of valuesIterator) {
      assert(newValues.length === this.pairSelectors.length);
      lastChanges = recordChanges(this.kerningController.values, (values) => {
        for (const [{ sourceIdentifier, leftName, rightName }, newValue] of zip(
          this.pairSelectors,
          newValues
        )) {
          const index = sourceIndices[sourceIdentifier];
          assert(index !== undefined);
          values[leftName][rightName][index] = newValue;
        }
      });
      lastChanges = lastChanges.prefixed(basePath);
      if (!firstChanges) {
        firstChanges = lastChanges;
      }
      await this._editIncremental(lastChanges.change, true); // may drop
    }
    await this._editIncremental(lastChanges.change, false);

    const finalForwardChanges = initialChanges.concat(lastChanges);
    const finalRollbackChanges = initialChanges.concat(firstChanges);
    const finalChanges = ChangeCollector.fromChanges(
      finalForwardChanges.change,
      finalRollbackChanges.rollbackChange
    );
    await fontController.editFinal(
      finalChanges.change,
      finalChanges.rollbackChange,
      undoLabel,
      false
    );

    return finalChanges;
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
