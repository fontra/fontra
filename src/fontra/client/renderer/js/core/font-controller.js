import { applyChange, baseChangeFunctions, consolidateChanges } from "./changes.js";
import { StaticGlyphController, VariableGlyphController } from "./glyph-controller.js";
import { LRUCache } from "./lru-cache.js";
import { StaticGlyph, VariableGlyph } from "./var-glyph.js";
import { locationToString } from "./var-model.js";
import { throttleCalls } from "./utils.js";


const GLYPH_CACHE_SIZE = 1000;


export class FontController {

  constructor (font, location) {
    this.font = font;
    this.location = location;
    this._glyphsPromiseCache = new LRUCache(GLYPH_CACHE_SIZE);  // glyph name -> var-glyph promise
    this._glyphInstancePromiseCache = new LRUCache(GLYPH_CACHE_SIZE);  // instance cache key -> instance promise
    this._glyphInstancePromiseCacheKeys = {};  // glyphName -> Set(instance cache keys)
    this._editListeners = new Set();
    this.glyphUsedBy = {};  // Loaded glyphs only: this is for updating the scene
    this.glyphMadeOf = {};
    this.ensureInitialized = new Promise((resolve, reject) => {
      this._resolveInitialized = resolve;
    });
    this.undoStacks = {};  // glyph name -> undo stack
  }

  async initialize() {
    this.reverseCmap = await this.font.getReverseCmap();
    this.cmap = makeCmapFromReverseCmap(this.reverseCmap);
    this.globalAxes = await this.font.getGlobalAxes();
    this.unitsPerEm = await this.font.getUnitsPerEm();
    this.fontLib = await this.font.getFontLib();
    this._resolveInitialized();
  }

  codePointForGlyph(glyphName) {
    const reverseCmap = this.reverseCmap;
    const cmap = this.cmap;
    for (const codePoint of reverseCmap[glyphName] || []) {
      if (cmap[codePoint] === glyphName) {
        return codePoint;
      }
    }
    return undefined;
  }

  async hasGlyph(glyphName) {
    return glyphName in this.reverseCmap;
  }

  getGlyph(glyphName) {
    let glyphPromise = this._glyphsPromiseCache.get(glyphName);
    if (glyphPromise === undefined) {
      glyphPromise = this._getGlyph(glyphName);
      const purgedGlyphName = this._glyphsPromiseCache.put(glyphName, glyphPromise);
      // if (purgedGlyphName) {
      //   console.log("purging", purgedGlyphName);
      //   this.font.unloadGlyph(purgedGlyphName);
      // }
      // console.log("LRU size", this._glyphsPromiseCache.map.size);
    }
    return glyphPromise;
  }

  async _getGlyph(glyphName) {
    if (!await this.hasGlyph(glyphName)) {
      return null;
    }
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

  async glyphChanged(glyphName) {
    const glyphNames = [glyphName, ...this.iterGlyphUsedBy(glyphName)]
    for (const glyphName of glyphNames) {
      this._purgeInstanceCache(glyphName);
    }
    for (const glyphName of glyphNames) {
      const varGlyph = await this.getGlyph(glyphName);
      varGlyph.clearDeltasCache();
    }
  }

  async getGlyphInstance(glyphName, location, instanceCacheKey) {
    // instanceCacheKey must be unique for glyphName + location
    if (instanceCacheKey === undefined) {
      instanceCacheKey = glyphName + locationToString(location);
    }
    let instancePromise = this._glyphInstancePromiseCache.get(instanceCacheKey);
    if (instancePromise === undefined) {
      instancePromise = this._getGlyphInstance(glyphName, location, instanceCacheKey);
      const deletedItem = this._glyphInstancePromiseCache.put(instanceCacheKey, instancePromise);
      if (deletedItem !== undefined) {
        const chacheGlyphName = (await deletedItem.value)?.name;
        this._glyphInstancePromiseCacheKeys[chacheGlyphName]?.delete(instanceCacheKey);
      }
      if (this._glyphInstancePromiseCacheKeys[glyphName] === undefined) {
        this._glyphInstancePromiseCacheKeys[glyphName] = new Set();
      }
      this._glyphInstancePromiseCacheKeys[glyphName].add(instanceCacheKey);
    }
    return await instancePromise;
  }

  async _getGlyphInstance(glyphName, location) {
    if (!await this.hasGlyph(glyphName)) {
      return null;
    }
    const varGlyph = await this.getGlyph(glyphName);
    const getGlyphFunc = this.getGlyph.bind(this);
    const instanceController = await varGlyph.instantiateController(location, getGlyphFunc);
    return instanceController;
  }

  getDummyGlyphInstanceController() {
    return new StaticGlyphController("<dummy>", StaticGlyph.fromObject({"xAdvance": 0}), undefined);
  }

  async getSourceIndex(glyphName, location) {
    const glyph = await this.getGlyph(glyphName);
    return glyph.getSourceIndex(location);
  }

  async subscribeLiveGlyphChanges(glyphNames) {
    this.font.subscribeLiveGlyphChanges(glyphNames);
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

  async getGlyphEditContext(glyphController, senderID, undoInfo) {
    if (!glyphController.canEdit) {
      // log warning here, or should the caller do that?
      return null;
    }
    const editContext = new GlyphEditContext(this, glyphController, senderID, undoInfo);
    await editContext.setup();
    return editContext;
  }

  async applyChange(change, isExternalChange) {
    if (change.p[0] === "glyphs") {
      const glyphName = change.p[1];
      const glyphSet = {};
      const root = {"glyphs": glyphSet};
      glyphSet[glyphName] = (await this.getGlyph(glyphName)).glyph;
      applyChange(root, change, glyphChangeFunctions);
      this.glyphChanged(glyphName);
      if (isExternalChange) {
        // The undo stack is local, so any external change invalidates it
        delete this.undoStacks[glyphName];
      }
    }
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
    for (const instanceCacheKey of this._glyphInstancePromiseCacheKeys[glyphName] || []) {
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
    if (change.p[0] !== "glyphs" || rollbackChange.p[0] !== "glyphs") {
      // Doesn't currently happen, deal with it later.
      return;
    }
    const glyphName = change.p[1];
    if (rollbackChange.p[1] !== glyphName) {
      console.log("internal inconsistency: undo rollback doesn't match change");
    }
    if (this.undoStacks[glyphName] === undefined) {
      this.undoStacks[glyphName] = new UndoStack();
    }
    const undoRecord = {
      "change": change,
      "rollbackChange": rollbackChange,
      "info": undoInfo,
    }
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
    const error = await this.font.editAtomic(undoRecord.rollbackChange, undoRecord.change);
    // TODO handle error
    await this.notifyEditListeners("editAtomic", this, undoRecord.rollbackChange, undoRecord.change);
    return undoRecord["info"];
  }

}


function reverseUndoRecord(undoRecord) {
  return {
    "change": undoRecord.rollbackChange,
    "rollbackChange": undoRecord.change,
    "info": undoRecord.info,
  };
}


function makeCmapFromReverseCmap(reverseCmap) {
  const cmap = {};
  for (const [glyphName, codePoints] of Object.entries(reverseCmap)) {
    for (const codePoint of codePoints) {
      const mappedGlyphName = cmap[codePoint];
      if (mappedGlyphName !== undefined && glyphName > mappedGlyphName) {
        continue;
      }
      cmap[codePoint] = glyphName;
    }
  }
  return cmap;
}


export const glyphChangeFunctions = {
  "=xy": (path, pointIndex, x, y) => path.setPointPosition(pointIndex, x, y),
  ...baseChangeFunctions,
};


class GlyphEditContext {

  constructor(fontController, glyphController, senderID, undoInfo) {
    this.fontController = fontController;
    this.glyphController = glyphController;
    this.instance = glyphController.instance;
    this.senderID = senderID;
    this.undoInfo = undoInfo;
    this.throttledEditDo = throttleCalls(async change => {fontController.font.editDo(change)}, 50);
  }

  async setup() {
    const varGlyph = await this.fontController.getGlyph(this.glyphController.name);
    const layerIndex = varGlyph.getLayerIndex(varGlyph.sources[this.glyphController.sourceIndex].layerName);
    this.baseChangePath = ["glyphs", this.glyphController.name, "layers", layerIndex, "glyph"];
  }

  async editBegin() {
    /* await */ this.fontController.font.editBegin();
    await this.fontController.notifyEditListeners("editBegin", this.senderID);
  }

  async editSetRollback(rollback) {
    if (this.localRollback) {
      // Rollback was set before. This means that changes coming in now may not
      // cover the previous changes, so we need to make sure to start fresh.
      applyChange(this.glyphController.instance, this.localRollback, glyphChangeFunctions);
      await this.fontController.glyphChanged(this.glyphController.name);
      /* await */ this.fontController.font.editDo(this.rollback);
      await this.fontController.notifyEditListeners("editDo", this.senderID, this.rollback);
    }
    this.localRollback = rollback;
    this.rollback = consolidateChanges(rollback, this.baseChangePath);
    /* await */ this.fontController.font.editSetRollback(this.rollback);
    await this.fontController.notifyEditListeners("editSetRollback", this.senderID, this.rollback);
  }

  async editDo(change) {
    applyChange(this.glyphController.instance, change, glyphChangeFunctions);
    await this.fontController.glyphChanged(this.glyphController.name);
    change = consolidateChanges(change, this.baseChangePath);
    /* await */ this.throttledEditDo(change);
    await this.fontController.notifyEditListeners("editDo", this.senderID, change);
  }

  async editEnd(change) {
    applyChange(this.glyphController.instance, change, glyphChangeFunctions);
    await this.fontController.glyphChanged(this.glyphController.name);
    change = consolidateChanges(change, this.baseChangePath);
    const error = await this.fontController.font.editEnd(change);
    // TODO handle error
    await this.fontController.notifyEditListeners("editEnd", this.senderID, change);
    this.fontController.pushUndoRecord(change, this.rollback, this.undoInfo);
  }

  async editAtomic(change, rollback) {
    applyChange(this.glyphController.instance, change, glyphChangeFunctions);
    await this.fontController.glyphChanged(this.glyphController.name);
    change = consolidateChanges(change, this.baseChangePath);
    rollback = consolidateChanges(rollback, this.baseChangePath);
    const error = await this.fontController.font.editAtomic(change, rollback);
    // TODO: handle error, rollback
    await this.fontController.notifyEditListeners("editAtomic", this.senderID, change, rollback);
    this.fontController.pushUndoRecord(change, rollback, this.undoInfo);
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
