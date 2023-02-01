import {
  applyChange,
  collectChangePaths,
  consolidateChanges,
  filterChangePattern,
  matchChangePath,
} from './changes.js';
import { getGlyphMapProxy, makeCharacterMapFromGlyphMap } from './cmap.js';
import {
  StaticGlyphController,
  VariableGlyphController,
} from './glyph-controller.js';
import { LRUCache } from './lru-cache.js';
import { StaticGlyph, VariableGlyph } from './var-glyph.js';
import { locationToString } from './var-model.js';
import { throttleCalls } from './utils.js';

const GLYPH_CACHE_SIZE = 1000;

export class FontController {
  constructor(font, location) {
    this.font = font;
    this.location = location;
    this._glyphsPromiseCache = new LRUCache(GLYPH_CACHE_SIZE); // glyph name -> var-glyph promise
    this._glyphInstancePromiseCache = new LRUCache(GLYPH_CACHE_SIZE); // instance cache key -> instance promise
    this._glyphInstancePromiseCacheKeys = {}; // glyphName -> Set(instance cache keys)
    this._editListeners = new Set();
    this.glyphUsedBy = {}; // Loaded glyphs only: this is for updating the scene
    this.glyphMadeOf = {};
    this.ensureInitialized = new Promise((resolve, reject) => {
      this._resolveInitialized = resolve;
    });
    this.undoStacks = {}; // glyph name -> undo stack
    this._rootObject = {};
  }

  async initialize() {
    const glyphMap = await this.font.getGlyphMap();
    this.characterMap = makeCharacterMapFromGlyphMap(glyphMap, false);
    this._rootObject['glyphMap'] = getGlyphMapProxy(
      glyphMap,
      this.characterMap
    );
    this._rootObject['axes'] = await this.font.getGlobalAxes();
    this._rootObject['unitsPerEm'] = await this.font.getUnitsPerEm();
    this._rootObject['lib'] = await this.font.getFontLib();
    this._resolveInitialized();
  }

  subscribeChanges(change, wantLiveChanges) {
    this.font.subscribeChanges(change, wantLiveChanges);
  }

  unsubscribeChanges(change, wantLiveChanges) {
    this.font.unsubscribeChanges(change, wantLiveChanges);
  }

  getRootKeys() {
    return Object.keys(this._rootObject);
  }

  get glyphMap() {
    return this._rootObject['glyphMap'];
  }

  get globalAxes() {
    return this._rootObject['axes'];
  }

  get unitsPerEm() {
    return this._rootObject['unitsPerEm'];
  }

  get fontLib() {
    return this._rootObject['lib'];
  }

  getCachedGlyphNames() {
    return this._glyphsPromiseCache.keys();
  }

  codePointForGlyph(glyphName) {
    const characterMap = this.characterMap;
    for (const codePoint of this.glyphMap[glyphName] || []) {
      if (characterMap[codePoint] === glyphName) {
        return codePoint;
      }
    }
    return undefined;
  }

  async getSuggestedGlyphName(codePoint) {
    return await this.font.getSuggestedGlyphName(codePoint);
  }

  async getUnicodeFromGlyphName(glyphName) {
    return await this.font.getUnicodeFromGlyphName(glyphName);
  }

  hasGlyph(glyphName) {
    return glyphName in this.glyphMap;
  }

  getGlyph(glyphName) {
    if (!this.hasGlyph(glyphName)) {
      return Promise.resolve(null);
    }
    let glyphPromise = this._glyphsPromiseCache.get(glyphName);
    if (glyphPromise === undefined) {
      glyphPromise = this._getGlyph(glyphName);
      const purgedGlyphName = this._glyphsPromiseCache.put(
        glyphName,
        glyphPromise
      );
      // if (purgedGlyphName) {
      //   console.log("purging", purgedGlyphName);
      //   this.font.unloadGlyph(purgedGlyphName);
      // }
      // console.log("LRU size", this._glyphsPromiseCache.map.size);
    }
    return glyphPromise;
  }

  async _getGlyph(glyphName) {
    let glyph = await this.font.getGlyph(glyphName);
    if (glyph !== null) {
      glyph = VariableGlyph.fromObject(glyph);
      glyph = new VariableGlyphController(glyph, this.globalAxes);
      this.updateGlyphDependencies(glyph);
    }
    return glyph;
  }

  updateGlyphDependencies(glyph) {
    const glyphName = glyph.name;
    // Zap previous used-by data for this glyph, if any
    for (const componentName of this.glyphMadeOf[glyphName] || []) {
      if (this.glyphUsedBy[componentName]) {
        this.glyphUsedBy[componentName].delete(glyphName);
      }
    }
    const componentNames = glyph.getAllComponentNames();
    this.glyphMadeOf[glyphName] = componentNames;
    for (const componentName of componentNames) {
      if (!this.glyphUsedBy[componentName]) {
        this.glyphUsedBy[componentName] = new Set();
      }
      this.glyphUsedBy[componentName].add(glyphName);
    }
  }

  async newGlyph(glyphName, codePoint, templateInstance) {
    if (this.glyphMap[glyphName]) {
      throw new Error(`assert -- glyph "${glyphName}" already exists`);
    }
    if (codePoint && typeof codePoint != 'number') {
      throw new Error(
        `assert -- codePoint must be an integer or falsey, got ${typeof codePoint}`
      );
    }
    const sourceName = '<default>'; // TODO: get from backend (via namedLocations?)

    const glyph = VariableGlyph.fromObject({
      name: glyphName,
      sources: [{ name: sourceName, location: {}, layerName: sourceName }],
      layers: [{ name: sourceName, glyph: structuredClone(templateInstance) }],
    });
    const glyphController = new VariableGlyphController(glyph, this.globalAxes);
    this._glyphsPromiseCache.put(glyphName, Promise.resolve(glyphController));

    const codePoints = typeof codePoint == 'number' ? [codePoint] : [];
    this.glyphMap[glyphName] = codePoints;

    await this.glyphChanged(glyphName);

    const change = {
      c: [
        { p: ['glyphs'], f: '=', a: [glyphName, glyph] },
        { p: ['glyphMap'], f: '=', a: [glyphName, codePoints] },
      ],
    };
    const rollbackChange = {
      c: [
        { p: ['glyphs'], f: 'd', a: [glyphName] },
        { p: ['glyphMap'], f: 'd', a: [glyphName] },
      ],
    };
    const error = await this.font.editFinal(
      change,
      rollbackChange,
      `new glyph "${glyphName}"`,
      true
    );
    // TODO handle error
    this.notifyEditListeners('editFinal', this);
  }

  async glyphChanged(glyphName) {
    const glyphNames = [glyphName, ...this.iterGlyphUsedBy(glyphName)];
    for (const glyphName of glyphNames) {
      this._purgeInstanceCache(glyphName);
    }
    for (const glyphName of glyphNames) {
      const varGlyph = await this.getGlyph(glyphName);
      varGlyph.clearDeltasCache();
    }
  }

  async getGlyphInstance(glyphName, location, instanceCacheKey) {
    if (!this.hasGlyph(glyphName)) {
      return Promise.resolve(null);
    }
    // instanceCacheKey must be unique for glyphName + location
    if (instanceCacheKey === undefined) {
      instanceCacheKey = glyphName + locationToString(location);
    }
    let instancePromise = this._glyphInstancePromiseCache.get(instanceCacheKey);
    if (instancePromise === undefined) {
      instancePromise = this._getGlyphInstance(
        glyphName,
        location,
        instanceCacheKey
      );
      const deletedItem = this._glyphInstancePromiseCache.put(
        instanceCacheKey,
        instancePromise
      );
      if (deletedItem !== undefined) {
        const chacheGlyphName = (await deletedItem.value)?.name;
        this._glyphInstancePromiseCacheKeys[chacheGlyphName]?.delete(
          instanceCacheKey
        );
      }
      if (this._glyphInstancePromiseCacheKeys[glyphName] === undefined) {
        this._glyphInstancePromiseCacheKeys[glyphName] = new Set();
      }
      this._glyphInstancePromiseCacheKeys[glyphName].add(instanceCacheKey);
    }
    return await instancePromise;
  }

  async _getGlyphInstance(glyphName, location) {
    const varGlyph = await this.getGlyph(glyphName);
    const getGlyphFunc = this.getGlyph.bind(this);
    const instanceController = await varGlyph.instantiateController(
      location,
      getGlyphFunc
    );
    return instanceController;
  }

  getDummyGlyphInstanceController(glyphName = '<dummy>') {
    const dummyGlyph = StaticGlyph.fromObject({
      xAdvance: this.unitsPerEm / 2,
    });
    return new StaticGlyphController(glyphName, dummyGlyph, undefined);
  }

  async getSourceIndex(glyphName, location) {
    const glyph = await this.getGlyph(glyphName);
    return glyph?.getSourceIndex(location);
  }

  addEditListener(listener) {
    this._editListeners.add(listener);
  }

  removeEditListener(listener) {
    this._editListeners.delete(listener);
  }

  async notifyEditListeners(editMethodName, senderID, ...args) {
    for (const listener of this._editListeners) {
      await listener(editMethodName, senderID, ...args);
    }
  }

  async getGlyphEditContext(glyphController, senderID) {
    if (!glyphController.canEdit) {
      // log warning here, or should the caller do that?
      return null;
    }
    const editContext = new GlyphEditContext(this, glyphController, senderID);
    await editContext.setup();
    return editContext;
  }

  async applyChange(change, isExternalChange) {
    const cachedPattern = this.getCachedDataPattern();
    change = filterChangePattern(change, cachedPattern);

    const glyphNames = collectGlyphNames(change);
    const glyphSet = {};
    for (const glyphName of glyphNames) {
      glyphSet[glyphName] = (await this.getGlyph(glyphName)).glyph;
    }
    this._rootObject['glyphs'] = glyphSet;
    applyChange(this._rootObject, change);
    delete this._rootObject['glyphs'];
    for (const glyphName of glyphNames) {
      this.glyphChanged(glyphName);
      if (isExternalChange) {
        // The undo stack is local, so any external change invalidates it
        delete this.undoStacks[glyphName];
      }
    }
  }

  getCachedDataPattern() {
    const cachedPattern = {};
    for (const rootKey of Object.keys(this._rootObject)) {
      cachedPattern[rootKey] = null;
    }
    const glyphsPattern = {};
    for (const glyphName of this.getCachedGlyphNames()) {
      glyphsPattern[glyphName] = null;
    }
    cachedPattern['glyphs'] = glyphsPattern;
    return cachedPattern;
  }

  *iterGlyphMadeOf(glyphName) {
    for (const dependantGlyphName of this.glyphMadeOf[glyphName] || []) {
      yield dependantGlyphName;
      for (const deeperGlyphName of this.iterGlyphMadeOf(dependantGlyphName)) {
        yield deeperGlyphName;
      }
    }
  }

  *iterGlyphUsedBy(glyphName) {
    for (const dependantGlyphName of this.glyphUsedBy[glyphName] || []) {
      yield dependantGlyphName;
      for (const deeperGlyphName of this.iterGlyphUsedBy(dependantGlyphName)) {
        yield deeperGlyphName;
      }
    }
  }

  _purgeGlyphCache(glyphName) {
    this._glyphsPromiseCache.delete(glyphName);
    this._purgeInstanceCache(glyphName);
    for (const dependantName of this.glyphUsedBy[glyphName] || []) {
      this._purgeGlyphCache(dependantName);
    }
  }

  _purgeInstanceCache(glyphName) {
    for (const instanceCacheKey of this._glyphInstancePromiseCacheKeys[
      glyphName
    ] || []) {
      this._glyphInstancePromiseCache.delete(instanceCacheKey);
    }
    delete this._glyphInstancePromiseCacheKeys[glyphName];
  }

  async reloadGlyphs(glyphNames) {
    for (const glyphName of glyphNames) {
      this._purgeGlyphCache(glyphName);
      // The undo stack is local, so any external change invalidates it
      delete this.undoStacks[glyphName];
    }
  }

  pushUndoRecord(change, rollbackChange, undoInfo) {
    const glyphNames = collectGlyphNames(change);
    const rbgn = collectGlyphNames(rollbackChange);
    if (
      glyphNames.length !== 1 ||
      rbgn.length !== 1 ||
      glyphNames[0] !== rbgn[0]
    ) {
      throw new Error('assertion -- change inconsistency for glyph undo');
    }
    const glyphName = glyphNames[0];
    if (this.undoStacks[glyphName] === undefined) {
      this.undoStacks[glyphName] = new UndoStack();
    }
    const undoRecord = {
      change: change,
      rollbackChange: rollbackChange,
      info: undoInfo,
    };
    this.undoStacks[glyphName].pushUndoRecord(undoRecord);
  }

  getUndoRedoInfo(glyphName, isRedo) {
    return this.undoStacks[glyphName]?.getTopUndoRedoRecord(isRedo)?.info;
  }

  async undoRedoGlyph(glyphName, isRedo) {
    let undoRecord = this.undoStacks[glyphName]?.popUndoRedoRecord(isRedo);
    if (undoRecord === undefined) {
      return;
    }
    if (isRedo) {
      undoRecord = reverseUndoRecord(undoRecord);
    }
    // Hmmm, would be nice to have this abstracted more
    await this.applyChange(undoRecord.rollbackChange);
    const error = await this.font.editFinal(
      undoRecord.rollbackChange,
      undoRecord.change,
      undoRecord.info.label,
      true
    );
    // TODO handle error
    // Do not call this.notifyEditListeners() right away, but next time through the event loop;
    // It's a bit messy, but our caller sets the selection based on our return value; but the
    // edit listeners need that new selection. TODO: think of a better solution...
    setTimeout(() => this.notifyEditListeners('editFinal', this), 0);
    return undoRecord['info'];
  }
}

function reverseUndoRecord(undoRecord) {
  return {
    change: undoRecord.rollbackChange,
    rollbackChange: undoRecord.change,
    info: reverseUndoInfo(undoRecord.info),
  };
}

function reverseUndoInfo(undoInfo) {
  const map = {
    redoSelection: 'undoSelection',
    undoSelection: 'redoSelection',
  };
  const revUndoInfo = {};
  for (const [k, v] of Object.entries(undoInfo)) {
    revUndoInfo[map[k] || k] = v;
  }
  return revUndoInfo;
}

class GlyphEditContext {
  constructor(fontController, glyphController, senderID) {
    this.fontController = fontController;
    this.glyphController = glyphController;
    this.instance = glyphController.instance;
    this.senderID = senderID;
    this.throttledEditIncremental = throttleCalls(async (change) => {
      fontController.font.editIncremental(change);
    }, 50);
    this._throttledEditIncrementalTimeoutID = null;
  }

  async setup() {
    const varGlyph = await this.fontController.getGlyph(
      this.glyphController.name
    );
    const layerIndex = varGlyph.getLayerIndex(
      varGlyph.sources[this.glyphController.sourceIndex].layerName
    );
    this.baseChangePath = [
      'glyphs',
      this.glyphController.name,
      'layers',
      layerIndex,
      'glyph',
    ];
    await this.fontController.notifyEditListeners('editBegin', this.senderID);
  }

  async editIncremental(change, mayDrop = false) {
    // If mayDrop is true, the call is not guaranteed to be broadcast, and is throttled
    // at a maximum number of changes per second, to prevent flooding the network
    await this.fontController.glyphChanged(this.glyphController.name);
    change = consolidateChanges(change, this.baseChangePath);
    if (mayDrop) {
      this._throttledEditIncrementalTimeoutID =
        this.throttledEditIncremental(change);
    } else {
      clearTimeout(this._throttledEditIncrementalTimeoutID);
      this.fontController.font.editIncremental(change);
    }
    await this.fontController.notifyEditListeners(
      'editIncremental',
      this.senderID
    );
  }

  async editFinal(change, rollback, undoInfo, broadcast = false) {
    if (broadcast) {
      await this.fontController.glyphChanged(this.glyphController.name);
    }
    change = consolidateChanges(change, this.baseChangePath);
    rollback = consolidateChanges(rollback, this.baseChangePath);
    const error = await this.fontController.font.editFinal(
      change,
      rollback,
      undoInfo.label,
      broadcast
    );
    // TODO: handle error, rollback
    await this.fontController.notifyEditListeners('editFinal', this.senderID);
    await this.fontController.notifyEditListeners('editEnd', this.senderID);
    this.fontController.pushUndoRecord(change, rollback, undoInfo);
  }

  async editCancel() {
    await this.fontController.glyphChanged(this.glyphController.name);
    await this.fontController.notifyEditListeners('editEnd', this.senderID);
  }
}

class UndoStack {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
  }

  pushUndoRecord(undoRecord) {
    this.undoStack.push(undoRecord);
    this.redoStack = [];
  }

  getTopUndoRedoRecord(isRedo) {
    const stack = !isRedo ? this.undoStack : this.redoStack;
    if (stack.length) {
      return stack[stack.length - 1];
    }
  }

  popUndoRedoRecord(isRedo) {
    if (!isRedo) {
      return _popUndoRedoRecord(this.undoStack, this.redoStack);
    } else {
      return _popUndoRedoRecord(this.redoStack, this.undoStack);
    }
  }
}

function _popUndoRedoRecord(popStack, pushStack) {
  if (!popStack.length) {
    return undefined;
  }
  const [undoRecord] = popStack.splice(-1, 1);
  pushStack.push(undoRecord);
  return undoRecord;
}

function collectGlyphNames(change) {
  return collectChangePaths(change, 2)
    .filter((item) => item[0] === 'glyphs' && item[1] !== undefined)
    .map((item) => item[1]);
}
