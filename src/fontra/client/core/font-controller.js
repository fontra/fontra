import { getClassSchema } from "../core/classes.js";
import {
  applyChange,
  collectChangePaths,
  consolidateChanges,
  filterChangePattern,
  matchChangePattern,
} from "./changes.js";
import { getGlyphMapProxy, makeCharacterMapFromGlyphMap } from "./cmap.js";
import { StaticGlyphController, VariableGlyphController } from "./glyph-controller.js";
import { LRUCache } from "./lru-cache.js";
import { TaskPool } from "./task-pool.js";
import { chain, getCharFromUnicode, throttleCalls } from "./utils.js";
import { StaticGlyph, VariableGlyph } from "./var-glyph.js";
import { locationToString } from "./var-model.js";

const GLYPH_CACHE_SIZE = 2000;
const NUM_TASKS = 12;

export class FontController {
  constructor(font) {
    this.font = font;
    this._glyphsPromiseCache = new LRUCache(GLYPH_CACHE_SIZE); // glyph name -> var-glyph promise
    this._glyphInstancePromiseCache = new LRUCache(GLYPH_CACHE_SIZE); // instance cache key -> instance promise
    this._glyphInstancePromiseCacheKeys = {}; // glyphName -> Set(instance cache keys)
    this._editListeners = new Set();
    this._changeListeners = [];
    this._changeListenersLive = [];
    this._glyphChangeListeners = {};
    this.glyphUsedBy = {}; // Loaded glyphs only: this is for updating the scene
    this.glyphMadeOf = {};
    this.ensureInitialized = new Promise((resolve, reject) => {
      this._resolveInitialized = resolve;
    });
    this.undoStacks = {}; // glyph name -> undo stack
    this._rootObject = {};
    this.readOnly = true;
  }

  async initialize() {
    const glyphMap = await this.font.getGlyphMap();
    this.characterMap = makeCharacterMapFromGlyphMap(glyphMap, false);
    this._rootObject["glyphMap"] = getGlyphMapProxy(glyphMap, this.characterMap);
    this._rootObject["axes"] = await this.font.getGlobalAxes();
    this._rootObject["unitsPerEm"] = await this.font.getUnitsPerEm();
    this._rootObject["customData"] = await this.font.getCustomData();
    this._rootClassDef = (await getClassSchema())["Font"];
    this.backendInfo = await this.font.getBackEndInfo();
    this.readOnly = await this.font.isReadOnly();
    this.addChangeListener({ axes: null }, (change, isExternalChange) =>
      this._purgeInstanceCacheAndVarGlyphAttributeCache()
    );
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
    return this._rootObject["glyphMap"];
  }

  get globalAxes() {
    return this._rootObject["axes"];
  }

  get unitsPerEm() {
    return this._rootObject["unitsPerEm"];
  }

  get customData() {
    return this._rootObject["customData"];
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

  hasGlyph(glyphName) {
    return glyphName in this.glyphMap;
  }

  areGlyphsCached(glyphNames) {
    // Return true if all glyph names in the `glyphNames` array are cached,
    // even if they may not yet be fully loaded. Mainly useful to determine
    // whether loading the glyphs may result in significant loading time.
    // This does _not_ take the cache status of dependent glyphs into account.
    return !glyphNames.some((glyphName) => !this._glyphsPromiseCache.has(glyphName));
  }

  async loadGlyphs(glyphNames) {
    // Load all glyphs named in the glyphNames array, as well as
    // all of their dependencies (made-of). Return a promise that
    // will resolve once all requested glyphs have been loaded.
    // The loading will be done in parallel: this is much faster if
    // the server supports parallelism (for example fontra-rcjk).
    if (this._loadGlyphsTodo) {
      for (const glyphName of glyphNames) {
        if (!this._loadGlyphsDone.has(glyphName)) {
          this._loadGlyphsTodo.add(glyphName);
        }
      }
      return;
    }
    try {
      const done = new Set();
      const todo = new Set(glyphNames);
      this._loadGlyphsDone = done;
      this._loadGlyphsTodo = todo;

      const loadGlyph = async (glyphName) => {
        if (done.has(glyphName)) {
          return;
        }
        done.add(glyphName);

        await this.getGlyph(glyphName);

        for (const subGlyphName of this.iterGlyphsMadeOfRecursively(glyphName)) {
          todo.add(subGlyphName);
        }
      };

      const pool = new TaskPool(NUM_TASKS);

      const t = performance.now();
      let count = 0;
      while (todo.size) {
        while (todo.size) {
          const glyphName = setPopFirst(todo);
          count++;
          await pool.schedule(async () => await loadGlyph(glyphName));
        }
        await pool.wait();
      }
      const elapsed = performance.now() - t;
      // console.log("loadGlyphs", count, elapsed);
    } finally {
      delete this._loadGlyphsDone;
      delete this._loadGlyphsTodo;
    }
  }

  getGlyph(glyphName) {
    if (!this.hasGlyph(glyphName)) {
      return Promise.resolve(null);
    }
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
    let glyph = await this.font.getGlyph(glyphName);
    if (glyph !== null) {
      glyph = this.makeVariableGlyphController(VariableGlyph.fromObject(glyph));
      this.updateGlyphDependencies(glyph);
    }
    return glyph;
  }

  makeVariableGlyphController(glyph) {
    return new VariableGlyphController(glyph, this.globalAxes);
  }

  updateGlyphDependencies(glyph) {
    if (!glyph) {
      return;
    }
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

  async newGlyph(glyphName, codePoint, varGlyph, undoLabel = null) {
    if (this.readOnly) {
      console.log("can't create glyph in read-only mode");
      return;
    }
    if (this.glyphMap[glyphName]) {
      throw new Error(`assert -- glyph "${glyphName}" already exists`);
    }
    if (codePoint && typeof codePoint != "number") {
      throw new Error(
        `assert -- codePoint must be an integer or falsey, got ${typeof codePoint}`
      );
    }
    const sourceName = "<default>"; // TODO: get from backend (via namedLocations?)

    const glyph = VariableGlyph.fromObject(varGlyph);
    glyph.name = glyphName;
    const glyphController = this.makeVariableGlyphController(glyph);
    this._glyphsPromiseCache.put(glyphName, Promise.resolve(glyphController));

    const codePoints = typeof codePoint == "number" ? [codePoint] : [];
    this.glyphMap[glyphName] = codePoints;

    await this.glyphChanged(glyphName, { senderID: this });

    const change = {
      c: [
        { p: ["glyphs"], f: "=", a: [glyphName, glyph] },
        { p: ["glyphMap"], f: "=", a: [glyphName, codePoints] },
      ],
    };
    const rollbackChange = {
      c: [
        { p: ["glyphs"], f: "d", a: [glyphName] },
        { p: ["glyphMap"], f: "d", a: [glyphName] },
      ],
    };

    const undoInfo = { label: undoLabel || `new glyph "${glyphName}"` };
    const error = await this.editFinal(change, rollbackChange, undoInfo.label, true);
    // TODO handle error
    this.notifyEditListeners("editFinal", this);
    this.pushUndoRecordForGlyph(glyphName, change, rollbackChange, undoInfo);
  }

  async deleteGlyph(glyphName, undoLabel = null) {
    const codePoints = this.glyphMap[glyphName];
    if (!codePoints) {
      throw new Error(`assert -- glyph "${glyphName}" does not exists`);
    }
    const glyph = (await this.getGlyph(glyphName)).glyph;
    this._purgeGlyphCache(glyphName);
    delete this.glyphMap[glyphName];

    const change = {
      c: [
        { p: ["glyphs"], f: "d", a: [glyphName] },
        { p: ["glyphMap"], f: "d", a: [glyphName] },
      ],
    };
    const rollbackChange = {
      c: [
        { p: ["glyphs"], f: "=", a: [glyphName, glyph] },
        { p: ["glyphMap"], f: "=", a: [glyphName, codePoints] },
      ],
    };

    const undoInfo = { label: undoLabel || `delete glyph "${glyphName}"` };
    const error = await this.editFinal(change, rollbackChange, undoInfo.label, true);
    // TODO handle error
    this.notifyEditListeners("editFinal", this);
    this.pushUndoRecordForGlyph(glyphName, change, rollbackChange, undoInfo);
  }

  async glyphChanged(glyphName, senderInfo) {
    const glyphNames = [glyphName, ...this.iterGlyphsUsedByRecursively(glyphName)];
    for (const glyphName of glyphNames) {
      this._purgeInstanceCache(glyphName);
    }
    for (const glyphName of glyphNames) {
      const varGlyph = await this.getGlyph(glyphName);
      varGlyph?.clearCaches();
    }
    this.updateGlyphDependencies(await this.getGlyph(glyphName));

    const baseGlyphName = glyphName;
    for (const glyphName of glyphNames) {
      const event = { glyphName, ...senderInfo };
      if (glyphName !== baseGlyphName) {
        event.baseGlyphChanged = baseGlyphName;
      }
      const listeners = this._glyphChangeListeners[glyphName];
      if (listeners) {
        for (const listener of listeners) {
          listener(event);
        }
      }
    }
  }

  async getLayerGlyphController(glyphName, layerName, sourceIndex) {
    const varGlyph = await this.getGlyph(glyphName);
    if (!varGlyph) {
      return;
    }
    const getGlyphFunc = this.getGlyph.bind(this);
    return varGlyph.getLayerGlyphController(layerName, sourceIndex, getGlyphFunc);
  }

  async getGlyphInstance(glyphName, location, layerName) {
    if (!this.hasGlyph(glyphName)) {
      return Promise.resolve(null);
    }
    // instanceCacheKey must be unique for glyphName + location + layerName
    const instanceCacheKey = glyphName + locationToString(location) + (layerName || "");

    let instancePromise = this._glyphInstancePromiseCache.get(instanceCacheKey);
    if (instancePromise === undefined) {
      instancePromise = this._getGlyphInstance(glyphName, location, layerName);
      const deletedItem = this._glyphInstancePromiseCache.put(
        instanceCacheKey,
        instancePromise
      );
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

  async _getGlyphInstance(glyphName, location, layerName) {
    const varGlyph = await this.getGlyph(glyphName);
    if (!varGlyph) {
      return null;
    }
    const getGlyphFunc = this.getGlyph.bind(this);
    const instanceController = await varGlyph.instantiateController(
      location,
      layerName,
      getGlyphFunc
    );
    return instanceController;
  }

  getDummyGlyphInstanceController(glyphName = "<dummy>") {
    const dummyGlyph = StaticGlyph.fromObject({ xAdvance: this.unitsPerEm / 2 });
    return new StaticGlyphController(glyphName, dummyGlyph, undefined);
  }

  async getSourceIndex(glyphName, location) {
    const glyph = await this.getGlyph(glyphName);
    return glyph?.getSourceIndex(location);
  }

  addGlyphChangeListener(glyphName, listener) {
    if (!this._glyphChangeListeners[glyphName]) {
      this._glyphChangeListeners[glyphName] = [];
    }
    this._glyphChangeListeners[glyphName].push(listener);
  }

  removeGlyphChangeListener(glyphName, listener) {
    if (!this._glyphChangeListeners[glyphName]) {
      return;
    }
    this._glyphChangeListeners[glyphName] = this._glyphChangeListeners[
      glyphName
    ].filter((item) => item !== listener);
    if (!this._glyphChangeListeners[glyphName].length) {
      delete this._glyphChangeListeners[glyphName];
    }
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

  addChangeListener(matchPattern, listener, wantLiveChanges) {
    if (wantLiveChanges) {
      this._changeListenersLive.push({ matchPattern, listener });
    } else {
      this._changeListeners.push({ matchPattern, listener });
    }
  }

  removeChangeListener(matchPattern, listener, wantLiveChanges) {
    const filterFunc = (listenerInfo) =>
      listenerInfo.matchPattern !== matchPattern || listenerInfo.listener !== listener;
    if (wantLiveChanges) {
      this._changeListenersLive = this._changeListenersLive.filter(filterFunc);
    } else {
      this._changeListeners = this._changeListeners.filter(filterFunc);
    }
  }

  notifyChangeListeners(change, isLiveChange, isExternalChange = false) {
    const listeners = isLiveChange
      ? this._changeListenersLive
      : chain(this._changeListenersLive, this._changeListeners);
    for (const listenerInfo of listeners) {
      if (matchChangePattern(change, listenerInfo.matchPattern)) {
        setTimeout(() => listenerInfo.listener(change, isExternalChange), 0);
      }
    }
  }

  editIncremental(change) {
    if (this.readOnly) {
      console.log("can't edit font in read-only mode");
      return;
    }
    this.font.editIncremental(change);
    this.notifyChangeListeners(change, true);
  }

  async editFinal(finalChange, rollbackChange, editLabel, broadcast) {
    if (this.readOnly) {
      console.log("can't edit font in read-only mode");
      return;
    }
    const result = await this.font.editFinal(
      finalChange,
      rollbackChange,
      editLabel,
      broadcast
    );
    this.notifyChangeListeners(finalChange, false);
    return result;
  }

  async getGlyphEditContext(glyphName, baseChangePath, senderID) {
    const editContext = new GlyphEditContext(this, glyphName, baseChangePath, senderID);
    await editContext.setup();
    return editContext;
  }

  async applyChange(change, isExternalChange) {
    if (!isExternalChange && this.readOnly) {
      console.log("can't edit font in read-only mode");
      return;
    }
    const cachedPattern = this.getCachedDataPattern();

    const unmatched = filterChangePattern(change, cachedPattern, true);
    const glyphSetChange = unmatched
      ? filterChangePattern(unmatched, { glyphs: null })
      : null;
    change = filterChangePattern(change, cachedPattern);

    const glyphNames = collectGlyphNames(change);
    const glyphSet = {};
    for (const glyphName of glyphNames) {
      glyphSet[glyphName] = (await this.getGlyph(glyphName)).glyph;
    }

    this._rootObject["glyphs"] = glyphSet;
    applyChange(this._rootObject, change, this._rootClassDef);
    delete this._rootObject["glyphs"];

    if (glyphSetChange) {
      // Some glyphs got added and/or some glyphs got deleted, let's find out which.
      const glyphSet = {};
      const glyphSetTracker = objectPropertyTracker(glyphSet);
      applyChange(
        { glyphs: glyphSetTracker.proxy },
        glyphSetChange,
        this._rootClassDef
      );
      for (const glyphName of glyphSetTracker.addedProperties) {
        this._glyphsPromiseCache.put(
          glyphName,
          Promise.resolve(this.makeVariableGlyphController(glyphSet[glyphName]))
        );
        glyphNames.push(glyphName);
      }
      for (const glyphName of glyphSetTracker.deletedProperties) {
        this._glyphsPromiseCache.delete(glyphName);
        glyphNames.push(glyphName);
      }
    }

    for (const glyphName of glyphNames) {
      this.glyphChanged(glyphName, { senderID: this });
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
    cachedPattern["glyphs"] = glyphsPattern;
    return cachedPattern;
  }

  *iterGlyphsMadeOfRecursively(glyphName, seenGlyphNames = null) {
    // Yield the names of all glyphs that are used as a component in `glyphName`, recursively.
    if (!seenGlyphNames) {
      seenGlyphNames = new Set();
    } else if (seenGlyphNames.has(glyphName)) {
      // Avoid infinite recursion
      return;
    }
    seenGlyphNames.add(glyphName);
    for (const dependantGlyphName of this.glyphMadeOf[glyphName] || []) {
      yield dependantGlyphName;
      for (const deeperGlyphName of this.iterGlyphsMadeOfRecursively(
        dependantGlyphName,
        seenGlyphNames
      )) {
        yield deeperGlyphName;
      }
    }
  }

  *iterGlyphsUsedByRecursively(glyphName, seenGlyphNames = null) {
    // Yield the names of all *loaded* glyphs that use `glyphName` as a component, recursively.
    if (!seenGlyphNames) {
      seenGlyphNames = new Set();
    } else if (seenGlyphNames.has(glyphName)) {
      // Avoid infinite recursion
      return;
    }
    seenGlyphNames.add(glyphName);
    for (const dependantGlyphName of this.glyphUsedBy[glyphName] || []) {
      yield dependantGlyphName;
      for (const deeperGlyphName of this.iterGlyphsUsedByRecursively(
        dependantGlyphName,
        seenGlyphNames
      )) {
        yield deeperGlyphName;
      }
    }
  }

  async getGlyphsUsedBy(glyphName) {
    // Ask the backend about which glyphs use glyph `glyphName` as a component, non-recursively.
    return await this.font.getGlyphsUsedBy(glyphName);
  }

  _purgeGlyphCache(glyphName) {
    this._glyphsPromiseCache.delete(glyphName);
    this._purgeInstanceCache(glyphName);
    for (const dependantName of this.glyphUsedBy[glyphName] || []) {
      this._purgeGlyphCache(dependantName);
    }
  }

  _purgeInstanceCache(glyphName) {
    for (const instanceCacheKey of this._glyphInstancePromiseCacheKeys[glyphName] ||
      []) {
      this._glyphInstancePromiseCache.delete(instanceCacheKey);
    }
    delete this._glyphInstancePromiseCacheKeys[glyphName];
  }

  async _purgeInstanceCacheAndVarGlyphAttributeCache() {
    this._glyphInstancePromiseCache.clear();
    for (const varGlyphPromise of this._glyphsPromiseCache.values()) {
      const varGlyph = await varGlyphPromise;
      varGlyph.clearCaches();
    }
  }

  async reloadGlyphs(glyphNames) {
    for (const glyphName of glyphNames) {
      this._purgeGlyphCache(glyphName);
      // The undo stack is local, so any external change invalidates it
      delete this.undoStacks[glyphName];
      this.glyphChanged(glyphName, { senderID: this });
    }
  }

  pushUndoRecord(change, rollbackChange, undoInfo) {
    const glyphNames = collectGlyphNames(change);
    const rbgn = collectGlyphNames(rollbackChange);
    if (glyphNames.length !== 1 || rbgn.length !== 1 || glyphNames[0] !== rbgn[0]) {
      throw new Error("assertion -- change inconsistency for glyph undo");
    }
    this.pushUndoRecordForGlyph(glyphNames[0], change, rollbackChange, undoInfo);
  }

  pushUndoRecordForGlyph(glyphName, change, rollbackChange, undoInfo) {
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
    const error = await this.editFinal(
      undoRecord.rollbackChange,
      undoRecord.change,
      undoRecord.info.label,
      true
    );
    // TODO handle error
    // Do not call this.notifyEditListeners() right away, but next time through the event loop;
    // It's a bit messy, but our caller sets the selection based on our return value; but the
    // edit listeners need that new selection. TODO: think of a better solution...
    setTimeout(() => this.notifyEditListeners("editFinal", this), 0);
    return undoRecord["info"];
  }

  glyphInfoFromGlyphName(glyphName) {
    const glyphInfo = { glyphName: glyphName };
    const codePoint = this.codePointForGlyph(glyphName);
    if (codePoint !== undefined) {
      glyphInfo["character"] = getCharFromUnicode(codePoint);
    }
    return glyphInfo;
  }
}

export function reverseUndoRecord(undoRecord) {
  return {
    change: undoRecord.rollbackChange,
    rollbackChange: undoRecord.change,
    info: reverseUndoInfo(undoRecord.info),
  };
}

function reverseUndoInfo(undoInfo) {
  const map = {
    redoSelection: "undoSelection",
    undoSelection: "redoSelection",
  };
  const revUndoInfo = {};
  for (const [k, v] of Object.entries(undoInfo)) {
    revUndoInfo[map[k] || k] = v;
  }
  return revUndoInfo;
}

class GlyphEditContext {
  constructor(fontController, glyphName, baseChangePath, senderID) {
    this.fontController = fontController;
    this.glyphName = glyphName;
    this.baseChangePath = baseChangePath;
    this.senderID = senderID;
    this.throttledEditIncremental = throttleCalls(async (change) => {
      fontController.editIncremental(change);
    }, 50);
    this._throttledEditIncrementalTimeoutID = null;
  }

  async setup() {
    await this.fontController.notifyEditListeners("editBegin", this.senderID);
  }

  async editIncremental(change, mayDrop = false) {
    // If mayDrop is true, the call is not guaranteed to be broadcast, and is throttled
    // at a maximum number of changes per second, to prevent flooding the network
    await this.fontController.glyphChanged(this.glyphName, { senderID: this.senderID });
    change = consolidateChanges(change, this.baseChangePath);
    if (mayDrop) {
      this._throttledEditIncrementalTimeoutID = this.throttledEditIncremental(change);
    } else {
      clearTimeout(this._throttledEditIncrementalTimeoutID);
      this.fontController.editIncremental(change);
    }
    await this.fontController.notifyEditListeners("editIncremental", this.senderID);
  }

  async editFinal(change, rollback, undoInfo, broadcast = false) {
    if (broadcast) {
      await this.fontController.glyphChanged(this.glyphName, {
        senderID: this.senderID,
      });
    }
    change = consolidateChanges(change, this.baseChangePath);
    rollback = consolidateChanges(rollback, this.baseChangePath);
    const error = await this.fontController.editFinal(
      change,
      rollback,
      undoInfo.label,
      broadcast
    );
    // TODO: handle error, rollback
    await this.fontController.notifyEditListeners("editFinal", this.senderID);
    await this.fontController.notifyEditListeners("editEnd", this.senderID);
    this.fontController.pushUndoRecord(change, rollback, undoInfo);
  }

  async editCancel() {
    await this.fontController.glyphChanged(this.glyphName, { senderID: this.senderID });
    await this.fontController.notifyEditListeners("editEnd", this.senderID);
  }
}

export class UndoStack {
  constructor() {
    this.clear();
  }

  clear() {
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
    .filter((item) => item[0] === "glyphs" && item[1] !== undefined)
    .map((item) => item[1]);
}

function setPopFirst(set) {
  if (!set.size) {
    return;
  }
  let firstItem;
  for (firstItem of set) {
    break;
  }
  set.delete(firstItem);
  return firstItem;
}

function objectPropertyTracker(obj) {
  const addedProperties = new Set();
  const deletedProperties = new Set();

  const handler = {
    set(obj, prop, value) {
      deletedProperties.delete(prop);
      addedProperties.add(prop);
      obj[prop] = value;
      return true;
    },
    deleteProperty(glyphMap, prop) {
      addedProperties.delete(prop);
      deletedProperties.add(prop);
      delete obj[prop];
      return true;
    },
  };

  const proxy = new Proxy(obj, handler);
  return { proxy, addedProperties, deletedProperties };
}
