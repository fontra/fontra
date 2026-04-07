import { recordChanges } from "./change-recorder.js";
import { ChangeCollector, iterChanges, wildcard } from "./changes.js";
import { DiscreteVariationModel } from "./discrete-variation-model.js";
import { assert, enumerate, isObjectEmpty, throttleCalls, zip } from "./utils.js";

export class KerningController {
  constructor(kernTag, kerning, fontController) {
    this.kernTag = kernTag;
    this.kerning = kerning;
    this.fontController = fontController;

    this.fontController.addChangeListener?.(
      { kerning: { [wildcard]: { sourceIdentifiers: null } } },
      (change, isExternalChange) => {
        this.clearCaches();
      },
      false,
      true // immediate
    );

    this.fontController.addChangeListener?.(
      { kerning: { [wildcard]: { values: null } } },
      (change, isExternalChange) => {
        if (!change) {
          // reload all
          this._pairFunctions = {};
        } else {
          for (const [leftName, rightName] of getKernPairsFromChange(change)) {
            this.clearPairCache(leftName, rightName);
          }
        }
      },
      false,
      true // immediate
    );

    this._setup();
  }

  get kernData() {
    return (
      this.kerning[this.kernTag] || {
        groupsSide1: {},
        groupsSide2: {},
        values: {},
        sourceIdentifiers: [],
      }
    );
  }

  clearCaches() {
    this._setup();
  }

  _setup() {
    this._updatePairGroupMappings();
    this._pairFunctions = {};
  }

  get model() {
    return this.fontController.fontSourcesInstancer.model;
  }

  getNonSparseSourceIdentifiers() {
    return this.fontController.fontSourcesInstancer.getNonSparseSourceIdentifiers();
  }

  _updatePairGroupMappings() {
    this.leftPairGroupMapping = makeGlyphGroupMapping(this.kernData.groupsSide1);
    this.rightPairGroupMapping = makeGlyphGroupMapping(this.kernData.groupsSide2);
  }

  get sourceIdentifiers() {
    return this.kernData.sourceIdentifiers;
  }

  get sourceIdentifierIndexMapping() {
    const mapping = {};
    for (const [i, sourceIdentifier] of enumerate(this.sourceIdentifiers)) {
      mapping[sourceIdentifier] = i;
    }
    return mapping;
  }

  get values() {
    return this.kernData.values;
  }

  instantiate(location) {
    const sourceIdentifier =
      this.fontController.fontSourcesInstancer.getSourceIdentifierForLocation(
        location,
        false
      );

    return new KerningInstance(this, location, sourceIdentifier);
  }

  getPairValueForSource(leftName, rightName, sourceIdentifier) {
    /*
     * For the return value, we distinquish between:
     * - undefined: there exists no kerning data for this pair
     * - null: there exists kerning data for this pair, but at *this* source
     *   the value is `null``
     */
    const values = this.getPairValues(leftName, rightName);
    if (!values) {
      return undefined;
    }
    const index = this.sourceIdentifiers.indexOf(sourceIdentifier);
    if (index < 0) {
      return undefined;
    }
    const value = values[index];
    // The values array may be too short, turn undefined into null
    return value === undefined ? null : value;
  }

  getPairValues(leftName, rightName) {
    return this.kernData.values[leftName]?.[rightName];
  }

  clearPairCache(leftName, rightName) {
    if (this._pairFunctions[leftName]?.[rightName] !== undefined) {
      delete this._pairFunctions[leftName][rightName];
    }
  }

  getPairFunction(leftName, rightName) {
    let pairFunction = this._pairFunctions[leftName]?.[rightName];
    if (pairFunction === undefined) {
      pairFunction = this._getPairFunction(leftName, rightName);
      if (!this._pairFunctions[leftName]) {
        this._pairFunctions[leftName] = {};
      }
      this._pairFunctions[leftName][rightName] = pairFunction;
    }
    return pairFunction;
  }

  _getPairFunction(leftName, rightName) {
    if (!this.kernData.values[leftName]?.[rightName]) {
      // We don't have kerning for this exact pair
      return null;
    } else {
      const finalSourceValues = Array(this.sourceIdentifiers.length).fill(null);
      const namesWithFallbacks = [
        ...this._getPairNamesWithFallbacks(leftName, rightName),
      ];

      namesWithFallbacks
        .map(([leftName, rightName]) => this.getPairValues(leftName, rightName))
        .filter((sourceValues) => !!sourceValues)
        .forEach((sourceValues) => {
          for (let i = 0; i < finalSourceValues.length; i++) {
            if (finalSourceValues[i] != undefined) {
              continue;
            }
            const value = sourceValues[i];
            if (value != undefined) {
              finalSourceValues[i] = value;
            }
          }
        });

      const mapping = this.sourceIdentifierIndexMapping;
      const mappedSourceValues = this.getNonSparseSourceIdentifiers().map(
        (sourceIdentifier) => finalSourceValues[mapping[sourceIdentifier]] ?? 0
      );
      const deltas = this.model.getDeltas(mappedSourceValues);
      return (location) => this.model.interpolateFromDeltas(location, deltas).instance;
    }
  }

  _getPairNamesWithFallbacks(leftName, rightName) {
    const namesWithFallbacks = [[leftName, rightName]];

    const leftGroup = !leftName.startsWith("@")
      ? addGroupPrefix(this.leftPairGroupMapping[leftName])
      : null;
    const rightGroup = !rightName.startsWith("@")
      ? addGroupPrefix(this.rightPairGroupMapping[rightName])
      : null;

    if (leftGroup) {
      namesWithFallbacks.push([leftGroup, rightName]);
    }
    if (rightGroup) {
      namesWithFallbacks.push([leftName, rightGroup]);
    }
    if (leftGroup && rightGroup) {
      namesWithFallbacks.push([leftGroup, rightGroup]);
    }

    return namesWithFallbacks;
  }

  getPairNames(leftGlyph, rightGlyph, sourceIdentifier) {
    const index = sourceIdentifier
      ? this.sourceIdentifiers.indexOf(sourceIdentifier)
      : -1;

    const pairsToTry = this.getPairsToTry(leftGlyph, rightGlyph);

    for (const [leftName, rightName] of pairsToTry) {
      const sourceValues = this.getPairValues(leftName, rightName);
      if (sourceValues && (index < 0 || sourceValues[index] != null)) {
        return { leftName, rightName };
      }
    }

    const [leftName, rightName] = pairsToTry.at(-1);
    return { leftName, rightName };
  }

  getPairsToTry(leftGlyph, rightGlyph) {
    const leftGroup = addGroupPrefix(this.leftPairGroupMapping[leftGlyph]);
    const rightGroup = addGroupPrefix(this.rightPairGroupMapping[rightGlyph]);
    return [
      [leftGlyph, rightGlyph],
      [leftGlyph, rightGroup],
      [leftGroup, rightGlyph],
      [leftGroup, rightGroup],
    ].filter(([leftName, rightName]) => leftName && rightName);
  }

  getGlyphPairValue(leftGlyph, rightGlyph, location, sourceIdentifier = null) {
    return sourceIdentifier && this.sourceIdentifiers.includes(sourceIdentifier)
      ? this.getGlyphPairValueForSource(leftGlyph, rightGlyph, sourceIdentifier)
      : this.getGlyphPairValueForLocation(leftGlyph, rightGlyph, location);
  }

  getGlyphPairValueForSource(leftGlyph, rightGlyph, sourceIdentifier) {
    assert(sourceIdentifier);
    const pairsToTry = this.getPairsToTry(leftGlyph, rightGlyph);
    let value = null;

    for (const [leftName, rightName] of pairsToTry) {
      const sourceValue = this.getPairValueForSource(
        leftName,
        rightName,
        sourceIdentifier
      );
      if (sourceValue != undefined /* nullish! */) {
        value = sourceValue;
        break;
      }
    }

    return value;
  }

  getGlyphPairValueForLocation(leftGlyph, rightGlyph, location) {
    const pairsToTry = this.getPairsToTry(leftGlyph, rightGlyph);
    let value = null;

    for (const [leftName, rightName] of pairsToTry) {
      const pairFunction = this.getPairFunction(leftName, rightName);

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

  async editGroupSide1(glyphName, groupName) {
    await this._editGroup(glyphName, groupName.trim(), "groupsSide1");
  }

  async editGroupSide2(glyphName, groupName) {
    await this._editGroup(glyphName, groupName.trim(), "groupsSide2");
  }

  async _editGroup(glyphName, newGroupName, groupsProperty) {
    const senderID = null;
    await this.fontController.performEdit(
      `edit kerning ${groupsProperty}`,
      "kerning",
      (root) => {
        const kerningTable = root.kerning[this.kernTag];
        const groups = kerningTable[groupsProperty];
        assert(groups);

        for (const groupName of Object.keys(groups)) {
          if (groupName === newGroupName) {
            continue;
          }
          const group = groups[groupName];
          if (group.includes(glyphName)) {
            groups[groupName] = group.filter(
              (glyphNameInGroup) => glyphNameInGroup !== glyphName
            );
            if (!groups[groupName].length) {
              delete groups[groupName];
            }
          }
        }

        if (newGroupName) {
          if (groups[newGroupName]) {
            const group = groups[newGroupName];
            if (!group.includes(glyphName)) {
              const index = groups[newGroupName].findIndex(
                (glyphNameInGroup) => glyphName < glyphNameInGroup
              );
              if (index >= 0) {
                group.splice(index, 0, glyphName);
              } else {
                group.push(glyphName);
              }
            }
          } else {
            groups[newGroupName] = [glyphName];
          }
        } else {
          // The glyph is not part of any group anymore
        }
        this._updatePairGroupMappings();
      },
      senderID
    );
  }

  insertInterpolatedSource(sourceIdentifier, location) {
    const font = { kerning: this.kerning };

    const changes = recordChanges(font, (font) => {
      this._insertInterpolatedSource(sourceIdentifier, location, font);
    });
    this.clearCaches();
    return changes;
  }

  _insertInterpolatedSource(sourceIdentifier, location, font) {
    const kernData = font.kerning[this.kernTag];

    assert(!kernData.sourceIdentifiers.includes(sourceIdentifier));
    const index = kernData.sourceIdentifiers.length;

    for (const [leftName, valueDict] of Object.entries(kernData.values)) {
      for (const [rightName, values] of Object.entries(valueDict)) {
        // Make a copy of values, and ensure it has the correct length
        const newValues = values.slice(0, index);
        while (newValues.length < index) {
          newValues.push(null);
        }

        // If the pair is sparse, ie. if not all sources have a non-null value,
        // then we try to avoid inserting an interpolated value if this pair
        // is an exception for a group-based pair. If the group fallback is the
        // same as the interpolated value, we assume the exception is not needed
        // at this location.
        const isSparse = newValues.some((v) => v == null);

        const namesWithFallbacks = isSparse
          ? [...this._getPairNamesWithFallbacks(leftName, rightName)]
          : [[leftName, rightName]];

        const interpolatedValueWithFallbacks = namesWithFallbacks
          .map(([leftName, rightName]) =>
            this.getPairFunction(leftName, rightName)?.(location)
          )
          .filter((v) => v != undefined);

        const interpolatedValue =
          !isSparse ||
          interpolatedValueWithFallbacks[0] != interpolatedValueWithFallbacks[1]
            ? Math.round(interpolatedValueWithFallbacks[0])
            : null;

        newValues.push(interpolatedValue);
        kernData.values[leftName][rightName] = newValues;
      }
    }

    kernData.sourceIdentifiers.push(sourceIdentifier);
  }

  deleteSource(sourceIdentifier) {
    const font = { kerning: this.kerning };

    const changes = recordChanges(font, (font) => {
      this._deleteSource(sourceIdentifier, font);
    });
    this.clearCaches();
    return changes;
  }

  _deleteSource(sourceIdentifier, font) {
    const kernData = font.kerning[this.kernTag];

    const index = kernData.sourceIdentifiers.indexOf(sourceIdentifier);
    if (index === -1) {
      // Unknown source identifier
      return;
    }

    for (const [leftName, valueDict] of Object.entries(kernData.values)) {
      for (const [rightName, values] of Object.entries(valueDict)) {
        // Make a copy of values
        const newValues = [...values];

        if (newValues.length > index) {
          newValues.splice(index, 1);
          kernData.values[leftName][rightName] = newValues;
        }
      }
    }

    kernData.sourceIdentifiers.splice(index, 1);
  }
}

class KerningInstance {
  constructor(controller, location, sourceIdentifier) {
    this.controller = controller;
    this.location = location;
    this.sourceIdentifier = sourceIdentifier; // may be undefined
    this.valueCache = {};
  }

  getGlyphPairValue(leftGlyph, rightGlyph) {
    let value = this.valueCache[leftGlyph]?.[rightGlyph];
    if (value === undefined) {
      value = this.controller.getGlyphPairValue(
        leftGlyph,
        rightGlyph,
        this.location,
        this.sourceIdentifier
      );
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

  async edit(values, undoLabel, event) {
    return await this.editContinuous([{ values, event }], undoLabel);
  }

  async editContinuous(valuesIterator, undoLabel) {
    const font = { kerning: this.kerningController.kerning };
    const fontController = this.kerningController.fontController;

    let initialChanges = recordChanges(font, (font) => {
      ensureKerningData(font.kerning, this.kerningController.kernTag);
      const kernData = font.kerning[this.kerningController.kernTag];

      const values = font.kerning[this.kerningController.kernTag].values;
      for (const { sourceIdentifier, leftName, rightName } of this.pairSelectors) {
        this.kerningController.clearPairCache(leftName, rightName);
        if (!kernData.sourceIdentifiers.includes(sourceIdentifier)) {
          kernData.sourceIdentifiers = [
            ...kernData.sourceIdentifiers,
            sourceIdentifier,
          ];
          this.kerningController.clearCaches();
        }
        if (!values[leftName]) {
          values[leftName] = {};
        }
        if (!values[leftName][rightName]) {
          values[leftName][rightName] = Array(
            this.kerningController.sourceIdentifiers.length
          ).fill(null);
        } else {
          if (
            values[leftName][rightName].length <
            this.kerningController.sourceIdentifiers.length
          ) {
            const n =
              this.kerningController.sourceIdentifiers.length -
              values[leftName][rightName].length;
            values[leftName][rightName] = [
              ...values[leftName][rightName],
              ...Array(n).fill(null),
            ];
          }
        }
      }
    });

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
    for await (const { values: newValues } of valuesIterator) {
      assert(newValues.length === this.pairSelectors.length);
      lastChanges = recordChanges(font, (font) => {
        const kernData = font.kerning[this.kerningController.kernTag];
        const values = kernData.values;
        for (const [{ sourceIdentifier, leftName, rightName }, newValue] of zip(
          this.pairSelectors,
          newValues
        )) {
          let index = sourceIndices[sourceIdentifier];
          assert(index != undefined);
          assert(values[leftName][rightName]);
          values[leftName][rightName][index] = newValue;
        }
      });
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

  async delete(undoLabel) {
    const font = { kerning: this.kerningController.kerning };
    let changes = recordChanges(font, (font) => {
      const values = font.kerning[this.kerningController.kernTag].values;
      for (const { leftName, rightName } of this.pairSelectors) {
        if (!values[leftName][rightName]) {
          continue;
        }
        delete values[leftName][rightName];
        if (isObjectEmpty(values[leftName])) {
          delete values[leftName];
        }
      }
    });

    await this.fontController.editFinal(
      changes.change,
      changes.rollbackChange,
      undoLabel,
      true
    );

    return changes;
  }
}

function makeGlyphGroupMapping(groups) {
  const mapping = {};
  for (const [groupName, glyphNames] of Object.entries(groups)) {
    glyphNames.forEach((glyphName) => {
      mapping[glyphName] = groupName;
    });
  }
  return mapping;
}

function ensureKerningData(kerning, kernTag) {
  if (!kerning[kernTag]) {
    // We don't have data yet for this kern tag
    kerning[kernTag] = {
      sourceIdentifiers: [],
      groupsSide1: {},
      groupsSide2: {},
      values: {},
    };
  }
}

function addGroupPrefix(groupName) {
  if (groupName) {
    groupName = "@" + groupName;
  }
  return groupName;
}

function getKernPairsFromChange(kerningChange) {
  assert(kerningChange, "invalid change object");
  const pairs = [];
  for (const { path, change } of iterChanges(kerningChange)) {
    pairs.push([path.at(-1), change.a?.[0]]);
  }
  return pairs;
}
