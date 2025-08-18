import { recordChanges } from "./change-recorder.js";
import { ChangeCollector, wildcard } from "./changes.js";
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
      }
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

    const locations = this.kernData.sourceIdentifiers.map(
      (sourceIdentifier) => this.fontController.sources[sourceIdentifier].location
    );
    this.model = new DiscreteVariationModel(
      locations,
      this.fontController.fontAxesSourceSpace
    );

    this._pairFunctions = {};
  }

  _updatePairGroupMappings() {
    this.leftPairGroupMapping = makeGlyphGroupMapping(this.kernData.groupsSide1);
    this.rightPairGroupMapping = makeGlyphGroupMapping(this.kernData.groupsSide2);
  }

  get sourceIdentifiers() {
    return this.kernData.sourceIdentifiers;
  }

  get values() {
    return this.kernData.values;
  }

  instantiate(location) {
    const sourceIdentifier =
      this.fontController.fontSourcesInstancer.getSourceIdentifierForLocation(location);

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
    if (this._pairFunctions[leftName]?.[rightName]) {
      delete this._pairFunctions[leftName][rightName];
    }
  }

  _getPairFunction(leftName, rightName) {
    let pairFunction = this._pairFunctions[leftName]?.[rightName];
    if (pairFunction === undefined) {
      let sourceValues = this.getPairValues(leftName, rightName);
      if (sourceValues === undefined) {
        // We don't have kerning for this pair
        pairFunction = null;
      } else {
        // Replace missing values with zeros and ensure there are enough values
        sourceValues = sourceValues.map((v) => (v == null ? 0 : v));
        while (sourceValues.length < this.sourceIdentifiers.length) {
          sourceValues.push(0);
        }
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

  getPairNames(leftGlyph, rightGlyph) {
    const pairsToTry = this.getPairsToTry(leftGlyph, rightGlyph);

    for (const [leftName, rightName] of pairsToTry) {
      const sourceValues = this.getPairValues(leftName, rightName);
      if (sourceValues) {
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
    const pairsToTry = this.getPairsToTry(leftGlyph, rightGlyph);

    let value = null;

    for (const [leftName, rightName] of pairsToTry) {
      if (sourceIdentifier && this.sourceIdentifiers.includes(sourceIdentifier)) {
        const sourceValue = this.getPairValueForSource(
          leftName,
          rightName,
          sourceIdentifier
        );
        if (sourceValue !== undefined) {
          value = sourceValue;
          break;
        }
      } else {
        const pairFunction = this._getPairFunction(leftName, rightName);

        if (pairFunction) {
          value = pairFunction(location);
          break;
        }
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
