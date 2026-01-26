import { recordChanges } from "./change-recorder.js";
import {
  applyChange,
  consolidateChanges,
  filterChangePattern,
  iterChanges,
  matchChangePattern,
} from "./changes.js";
import { getClassSchema } from "./classes.js";
import { getGlyphMapProxy, makeCharacterMapFromGlyphMap } from "./cmap.js";
import { CrossAxisMapping } from "./cross-axis-mapping.js";
import { FontSourcesInstancer } from "./font-sources-instancer.js";
import { StaticGlyphController, VariableGlyphController } from "./glyph-controller.js";
import { KerningController } from "./kerning-controller.js";
import { LRUCache } from "./lru-cache.js";
import { setPopFirst } from "./set-ops.js";
import { getShaper } from "./shaper.js";
import { TaskPool } from "./task-pool.js";
import {
  assert,
  chain,
  colorizeImage,
  getCharFromCodePoint,
  mapObject,
  mapObjectKeys,
  mapObjectValues,
  normalizeGuidelines,
  parseDataURL,
  sleepAsync,
  throttleCalls,
  uniqueID,
} from "./utils.js";
import { StaticGlyph, VariableGlyph } from "./var-glyph.js";
import {
  locationToName,
  locationToString,
  makeSparseLocation,
  mapAxesFromUserSpaceToSourceSpace,
  mapBackward,
  mapForward,
} from "./var-model.js";
/**
 * @import { RemoteFont, FontSource } from 'remotefont';
 * */

const GLYPH_CACHE_SIZE = 2000;
const BACKGROUND_IMAGE_CACHE_SIZE = 100;
const NUM_TASKS = 12;

export class FontController {
  /**
   * @param {RemoteFont} font
   */
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
    this.readOnly = true;
  }

  async initialize(initListener = true) {
    this._instanceRequestQueue = new InstanceRequestQueue(this);
    this._backgroundImageCache = new LRUCache(BACKGROUND_IMAGE_CACHE_SIZE);
    const glyphMap = await this.font.getGlyphMap();
    this.characterMap = makeCharacterMapFromGlyphMap(glyphMap, false);
    this._rootObject = {};
    this._rootObject.glyphMap = getGlyphMapProxy(glyphMap, this.characterMap);
    this._rootObject.axes = ensureDenseAxes(await this.font.getAxes());
    this._rootObject.sources = ensureDenseSources(await this.font.getSources());
    this._rootObject.unitsPerEm = await this.font.getUnitsPerEm();
    this._rootObject.customData = await this.font.getCustomData();
    this._rootObject.metaInfo = await this.font.getMetaInfo();
    this._rootClassDef = (await getClassSchema())["Font"];
    this.backendInfo = await this.font.getBackEndInfo();
    this.readOnly = await this.font.isReadOnly();

    if (initListener) {
      this.addChangeListener(
        { axes: null, sources: null },
        (change, isExternalChange) => {
          this._purgeCachesRelatedToAxesAndSourcesChanges();
        },
        false,
        true // immediate
      );
    }

    this._resolveInitialized();
  }

  subscribeChanges(pathOrPattern, wantLiveChanges) {
    this.font.subscribeChanges(pathOrPattern, wantLiveChanges);
  }

  unsubscribeChanges(pathOrPattern, wantLiveChanges) {
    this.font.unsubscribeChanges(pathOrPattern, wantLiveChanges);
  }

  getRootKeys() {
    return Object.keys(this._rootObject);
  }

  getRootSubscriptionPattern() {
    return Object.fromEntries(this.getRootKeys().map((key) => [key, null]));
  }

  get glyphMap() {
    return this._rootObject.glyphMap;
  }

  get axes() {
    return this._rootObject.axes;
  }

  get fontAxes() {
    return this._rootObject.axes.axes;
  }

  get fontAxesSourceSpace() {
    if (!this._fontAxesSourceSpace) {
      this._fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(this.fontAxes);
    }
    return this._fontAxesSourceSpace;
  }

  get sources() {
    return this._rootObject.sources;
  }

  get unitsPerEm() {
    return this._rootObject.unitsPerEm;
  }

  get customData() {
    return this._rootObject.customData;
  }

  get metaInfo() {
    return this._rootObject.metaInfo;
  }

  async getData(key) {
    if (!this._rootObject[key]) {
      const methods = {
        fontInfo: "getFontInfo",
        features: "getFeatures",
        kerning: "getKerning",
      };
      const methodName = methods[key];
      if (!methodName) {
        throw Error(`unknown data key: ${key}`);
      }
      this._rootObject[key] = await this.font[methodName]();
    }
    return this._rootObject[key];
  }

  async getFontInfo() {
    return await this.getData("fontInfo");
  }

  async getFeatures() {
    return await this.getData("features");
  }

  async getKerning() {
    return await this.getData("kerning");
  }

  async getSources() {
    // backwards compat, this.sources is the same
    return this._rootObject.sources;
  }

  getSortedSourceIdentifiers(skipSparseSources = false) {
    const defaultSourceLocation = this.fontSourcesInstancer.defaultSourceLocation;

    const sortFunc = (identifierA, identifierB) => {
      for (const axis of this.fontAxesSourceSpace) {
        const [valueA, valueB] = [identifierA, identifierB].map(
          (identifier) =>
            ({
              ...defaultSourceLocation,
              ...this.sources[identifier].location,
            })[axis.name]
        );

        if (valueA === valueB) {
          continue;
        }

        return valueA < valueB ? -1 : 0;
      }
      return 0;
    };

    return Object.keys(this.sources)
      .filter(
        (sourceIdentifier) =>
          !(skipSparseSources && this.sources[sourceIdentifier].isSparse)
      )
      .sort(sortFunc);
  }

  getBackgroundImage(imageIdentifier) {
    // This returns a promise for the requested background image
    const cacheEntry = this._getBackgroundImageCacheEntry(imageIdentifier);
    return cacheEntry.imagePromise;
  }

  getBackgroundImageColorized(imageIdentifier, color) {
    // This returns a promise for the requested colorized background image
    if (!color) {
      return this.getBackgroundImage(imageIdentifier);
    }
    const cacheEntry = this._getBackgroundImageCacheEntry(imageIdentifier);
    if (cacheEntry.color !== color) {
      cacheEntry.color = color;
      cacheEntry.imageColorizedPromise = new Promise((resolve, reject) => {
        cacheEntry.imagePromise.then((image) => {
          if (image) {
            colorizeImage(image, color).then((image) => {
              cacheEntry.imageColorized = image;
              resolve(image);
            });
          } else {
            resolve(null);
          }
        });
      });
    }
    return cacheEntry.imageColorizedPromise;
  }

  _getBackgroundImageCacheEntry(imageIdentifier) {
    let cacheEntry = this._backgroundImageCache.get(imageIdentifier);
    if (!cacheEntry) {
      cacheEntry = this._cacheBackgroundImageFromIdentifier(imageIdentifier);
    }
    return cacheEntry;
  }

  getBackgroundImageCached(imageIdentifier, onLoad = null) {
    /*
     * Return the requested image if it is available in cache, else return
     * `undefined`.
     *
     * If the image is not available in cache, and the `onLoad` callback argument
     * is given, the image is requested, and `onLoad` will be called when it is
     * available, with the image as argument.
     */
    const cacheEntry = this._backgroundImageCache.get(imageIdentifier);
    if (!cacheEntry && onLoad) {
      this.getBackgroundImage(imageIdentifier).then((image) => onLoad(image));
    }
    return cacheEntry?.image;
  }

  getBackgroundImageColorizedCached(imageIdentifier, color, onLoad = null) {
    if (!color) {
      return this.getBackgroundImageCached(imageIdentifier, onLoad);
    }
    const cacheEntry = this._backgroundImageCache.get(imageIdentifier);
    if ((!cacheEntry?.imageColorizedPromise || cacheEntry.color !== color) && onLoad) {
      this.getBackgroundImageColorized(imageIdentifier, color).then((image) =>
        onLoad(image)
      );
    }
    return cacheEntry?.imageColorized;
  }

  _cacheBackgroundImageFromIdentifier(imageIdentifier) {
    return this._cacheBackgroundImageFromDataURLPromise(
      imageIdentifier,
      this._loadBackgroundImageData(imageIdentifier)
    );
  }

  async _loadBackgroundImageData(imageIdentifier) {
    const imageData = await this.font.getBackgroundImage(imageIdentifier);
    return imageData ? `data:image/${imageData.type};base64,${imageData.data}` : null;
  }

  _cacheBackgroundImageFromDataURLPromise(imageIdentifier, imageDataURLPromise) {
    const imagePromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = (event) => {
        cacheEntry.image = image;
        resolve(image);
      };
      imageDataURLPromise.then((imageDataURL) => {
        if (imageDataURL) {
          image.src = imageDataURL;
        } else {
          resolve(null);
        }
      });
    });

    const cacheEntry = { imagePromise, image: null };

    this._backgroundImageCache.put(imageIdentifier, cacheEntry);

    return cacheEntry;
  }

  getBackgroundImageBounds(imageIdentifier) {
    const image = this.getBackgroundImageCached(imageIdentifier);
    if (!image) {
      return undefined;
    }
    return { xMin: 0, yMin: 0, xMax: image.width, yMax: image.height };
  }

  get getBackgroundImageBoundsFunc() {
    return this.getBackgroundImageBounds.bind(this);
  }

  async putBackgroundImageData(imageIdentifier, imageDataURL) {
    const { type, data } = parseDataURL(imageDataURL);
    assert(type === "image/png" || type === "image/jpeg");
    const imageType = type.split("/")[1];

    this._cacheBackgroundImageFromDataURLPromise(
      imageIdentifier,
      Promise.resolve(imageDataURL)
    );

    await this.font.putBackgroundImage(imageIdentifier, {
      type: imageType,
      data,
    });
  }

  async getShaperFontData() {
    const shaperFontData = await this.font.getShaperFontData();
    if (!shaperFontData) {
      return {};
    }
    const blob = await (
      await fetch(`data:font/opentype;base64,${shaperFontData.data}`)
    ).blob();

    return {
      glyphOrderSorting: shaperFontData.glyphOrderSorting,
      fontData: await blob.arrayBuffer(),
    };
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
    return new VariableGlyphController(glyph, this);
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

  async newGlyph(
    glyphName,
    codePoint,
    varGlyph = null,
    defaultLayerGlyph = null,
    undoLabel = null
  ) {
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

    let glyph;

    if (varGlyph) {
      glyph = VariableGlyph.fromObject(varGlyph);
      glyph.name = glyphName;
      assert(!defaultLayerGlyph, "can't pass defaultLayerGlyph when passing varGlyph");
    } else {
      glyph = this.makeVariableGlyphFromSingleStaticGlyph(
        glyphName,
        defaultLayerGlyph || StaticGlyph.fromObject({ xAdvance: 500 })
      );
    }

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
    return await varGlyph.getLayerGlyphController(layerName, sourceIndex, getGlyphFunc);
  }

  requestGlyphInstance(glyphName, sourceLocation) {
    // Request a glyph instance. This returns { requestID, instancePromise }.
    // The `requestID` can be used to cancel the request (if it is still queued)
    // using the `cancelGlyphInstanceRequest()` method.
    // You must await `instancePromise` to get the instance. This will resolve to
    // `null` if the request was cancelled.
    return this._instanceRequestQueue.requestGlyphInstance(glyphName, sourceLocation);
  }

  cancelGlyphInstanceRequest(requestID) {
    return this._instanceRequestQueue.cancelGlyphInstanceRequest(requestID);
  }

  async getGlyphInstance(glyphName, sourceLocation, layerName) {
    if (!this.hasGlyph(glyphName)) {
      return Promise.resolve(null);
    }
    // instanceCacheKey must be unique for glyphName + sourceLocation + layerName
    const instanceCacheKey =
      glyphName + locationToString(sourceLocation) + (layerName || "");

    let instancePromise = this._glyphInstancePromiseCache.get(instanceCacheKey);
    if (instancePromise === undefined) {
      instancePromise = this._getGlyphInstance(glyphName, sourceLocation, layerName);
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

  async _getGlyphInstance(glyphName, sourceLocation, layerName) {
    const varGlyph = await this.getGlyph(glyphName);
    if (!varGlyph) {
      return null;
    }
    const getGlyphFunc = this.getGlyph.bind(this);
    const instanceController = await varGlyph.instantiateController(
      sourceLocation,
      layerName,
      getGlyphFunc
    );
    return instanceController;
  }

  getDummyGlyphInstanceController(glyphName = "<dummy>") {
    const dummyGlyph = StaticGlyph.fromObject({ xAdvance: this.unitsPerEm / 2 });
    return new StaticGlyphController(glyphName, dummyGlyph, undefined);
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

  addChangeListener(
    matchPattern,
    listener,
    wantLiveChanges = false,
    immediate = false
  ) {
    if (wantLiveChanges) {
      this._changeListenersLive.push({ matchPattern, listener, immediate });
    } else {
      this._changeListeners.push({ matchPattern, listener, immediate });
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
      if (!change || matchChangePattern(change, listenerInfo.matchPattern)) {
        if (listenerInfo.immediate) {
          listenerInfo.listener(change, isExternalChange);
        } else {
          setTimeout(() => listenerInfo.listener(change, isExternalChange), 0);
        }
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

  async performEdit(editLabel, rootKey, editFunc, senderID) {
    // This is a convenience for non-continuous non-glyph changes
    const root = { [rootKey]: await this.getData(rootKey) };
    const changes = recordChanges(root, editFunc);
    await this.postChange(changes.change, changes.rollbackChange, editLabel, senderID);
    return changes;
  }

  async postChange(change, rollbackChange, editLabel, senderID) {
    const error = await this.editFinal(change, rollbackChange, editLabel, true);
    // TODO handle error
    this.notifyEditListeners("editFinal", senderID);
  }

  async applyChange(change, isExternalChange) {
    if (!isExternalChange && this.readOnly) {
      console.log("can't edit font in read-only mode");
      return;
    }

    const cachedPattern = this.getCachedDataPattern();
    change = filterChangePattern(change, cachedPattern);
    if (!change) {
      return;
    }

    const glyphNames = collectGlyphNames(change);
    const glyphSet = await this.getMultipleGlyphs(glyphNames);
    const glyphSetTracker = objectPropertyTracker(glyphSet);

    this._rootObject["glyphs"] = glyphSetTracker.proxy;
    applyChange(this._rootObject, change, this._rootClassDef);
    delete this._rootObject["glyphs"];

    for (const glyphName of glyphSetTracker.addedProperties) {
      this._glyphsPromiseCache.put(
        glyphName,
        Promise.resolve(this.makeVariableGlyphController(glyphSet[glyphName]))
      );
    }

    for (const glyphName of glyphSetTracker.deletedProperties) {
      this._glyphsPromiseCache.delete(glyphName);
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

  async findGlyphsThatUseGlyph(glyphName) {
    // Ask the backend about which glyphs use glyph `glyphName` as a component, non-recursively.
    return await this.font.findGlyphsThatUseGlyph(glyphName);
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

  async _purgeCachesRelatedToAxesAndSourcesChanges() {
    delete this._crossAxisMapping;
    delete this._fontSourcesInstancer;
    delete this._kerningControllerPromises;
    delete this._fontAxesSourceSpace;

    this._glyphInstancePromiseCache.clear();

    for (const varGlyphPromise of this._glyphsPromiseCache.values()) {
      const varGlyph = await varGlyphPromise;
      varGlyph.clearCaches();
    }
  }

  async reloadEverything() {
    delete this._crossAxisMapping;
    this._glyphsPromiseCache.clear();
    this._glyphInstancePromiseCache.clear();
    this._glyphInstancePromiseCacheKeys = {};
    await this.initialize(false);
    this.notifyChangeListeners(null, false, true);
  }

  async reloadGlyphs(glyphNames) {
    for (const glyphName of glyphNames) {
      if (!this.glyphMap[glyphName]) {
        // Hmm, glyph deletion caused an error in the backend, now the
        // glyphMap needs to be reloaded, too. We're running into a
        // weird timing problem, and this sleepAsync() resolves that.
        await sleepAsync(0);
      }
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
      glyphInfo["character"] = getCharFromCodePoint(codePoint);
    }
    return glyphInfo;
  }

  mapUserLocationToSourceLocation(userLocation) {
    return mapForward(userLocation, this.fontAxes);
  }

  mapSourceLocationToUserLocation(sourceLocation) {
    return mapBackward(sourceLocation, this.fontAxes);
  }

  get crossAxisMapping() {
    if (!this._crossAxisMapping) {
      this._crossAxisMapping = new CrossAxisMapping(
        this.fontAxesSourceSpace,
        this.axes.mappings
      );
    }
    return this._crossAxisMapping;
  }

  get fontSourcesInstancer() {
    if (!this._fontSourcesInstancer) {
      this._fontSourcesInstancer = new FontSourcesInstancer(
        this.fontAxesSourceSpace,
        this.sources
      );
    }
    return this._fontSourcesInstancer;
  }

  async getKerningController(kernTag) {
    if (!this._kerningControllerPromises) {
      this._kerningControllerPromises = {};
    }
    let kerningControllerPromise = this._kerningControllerPromises[kernTag];
    if (kerningControllerPromise === undefined) {
      kerningControllerPromise = this._getKerningController(kernTag);
      this._kerningControllerPromises[kernTag] = kerningControllerPromise;
    }
    return await kerningControllerPromise;
  }

  async _getKerningController(kernTag) {
    // Do not inline: the this.getKerning() call must be part of the promise
    return new KerningController(kernTag, await this.getKerning(), this);
  }

  getShaper() {
    if (!this._shaperPromise) {
      this._shaperPromise = this._getShaper();
    }
    return this._shaperPromise;
  }

  async _getShaper() {
    const { glyphOrderSorting, fontData } = await this.getShaperFontData();
    const characterMap = this.characterMap;
    const glyphOrder = Object.keys(this.glyphMap);
    if (glyphOrderSorting == "sorted") {
      glyphOrder.sort();
    }
    return getShaper(fontData, (codePoint) => characterMap[codePoint], glyphOrder);
  }

  get defaultSourceLocation() {
    return this.fontSourcesInstancer.defaultSourceLocation;
  }

  get defaultSourceIdentifier() {
    return this.fontSourcesInstancer.defaultSourceIdentifier;
  }

  mapSourceLocationToMappedSourceLocation(sourceLocation) {
    return { ...this.crossAxisMapping.mapLocation(sourceLocation) };
  }

  mapMappedSourceLocationToSourceLocation(mappedSourceLocation) {
    return { ...this.crossAxisMapping.unmapLocation(mappedSourceLocation) };
  }

  async exportAs(options) {
    return await this.font.exportAs(options);
  }

  async getMultipleGlyphs(glyphNames) {
    const glyphs = {};
    for (const glyphName of glyphNames) {
      const glyph = await this.getGlyph(glyphName);
      if (glyph) {
        glyphs[glyphName] = glyph.glyph;
      }
    }
    return glyphs;
  }

  getSourceLocations() {
    return Object.fromEntries(
      Object.entries(this.sources).map(([sourceIdentifier, source]) => [
        sourceIdentifier,
        source.location,
      ])
    );
  }

  async collectBackgroundImageData(...glyphs) {
    const backgroundImageData = {};

    for (const glyph of glyphs) {
      for (const layer of Object.values(glyph.layers)) {
        if (layer.glyph.backgroundImage) {
          const backgroundImage = await this.getBackgroundImage(
            layer.glyph.backgroundImage.identifier
          );
          backgroundImageData[layer.glyph.backgroundImage.identifier] =
            backgroundImage.src;
        }
      }
    }

    return backgroundImageData;
  }

  async writeBackgroundImages(backgroundImageData) {
    if (!backgroundImageData || !this.backendInfo.features["background-image"]) {
      return;
    }

    for (const [identifier, data] of Object.entries(backgroundImageData)) {
      await this.putBackgroundImageData(identifier, data);
    }
  }

  makeVariableGlyphFromSingleStaticGlyph(glyphName, glyph) {
    const sourceIdentifier = this.defaultSourceIdentifier;
    const layerName = sourceIdentifier || "default";
    const sourceName = this.sources[sourceIdentifier] ? "" : layerName;
    return VariableGlyph.fromObject({
      name: glyphName,
      sources: [
        {
          name: sourceName,
          location: {},
          layerName: layerName,
          locationBase: sourceIdentifier,
        },
      ],
      layers: {
        [layerName]: { glyph },
      },
    });
  }

  adjustVariableGlyphsFromClipboard(glyphs, sourceLocations, backgroundImageData) {
    // 1. Try to map original locationBase to ours, or fall back to concrete location
    // 2. Create new unique identifiers for background images

    const locationBaseMapping = mapObject(
      sourceLocations,
      ([oldIdentifier, location]) => [
        oldIdentifier,
        this.fontSourcesInstancer.getSourceIdentifierForLocation(location),
      ]
    );

    const backgroundImageMapping =
      makeBackgroundImageIdentifierMapping(backgroundImageData);

    glyphs = glyphs.map((glyph) =>
      this._adjustVariableGlyphFromClipboard(
        glyph,
        sourceLocations,
        locationBaseMapping,
        backgroundImageMapping
      )
    );

    backgroundImageData = remapBackgroundImageData(
      backgroundImageData,
      backgroundImageMapping
    );

    return { glyphs, backgroundImageData };
  }

  _adjustVariableGlyphFromClipboard(
    glyph,
    sourceLocations,
    locationBaseMapping,
    backgroundImageMapping
  ) {
    const layerNameMapping = {};

    const defaultSourceName = this.defaultSourceIdentifier
      ? this.sources[this.defaultSourceIdentifier].name
      : "default";

    const newSources = glyph.sources.map((source) => {
      if (source.locationBase) {
        const locationBase = locationBaseMapping[source.locationBase];

        const location = locationBase
          ? source.location
          : { ...sourceLocations[source.locationBase], ...source.location };

        const name = locationBase
          ? source.name
          : source.name ||
            locationToName(
              makeSparseLocation(location, this.fontAxesSourceSpace),
              defaultSourceName
            );

        const layerName =
          source.layerName == source.locationBase && locationBase
            ? locationBase
            : source.layerName;

        layerNameMapping[source.layerName] = layerName;

        source = { ...source, locationBase, location, name, layerName };
      }
      return source;
    });

    return VariableGlyph.fromObject({
      ...glyph,
      sources: newSources,
      layers: mapObject(glyph.layers, ([layerName, layer]) => [
        layerNameMapping[layerName] || layerName,
        {
          ...layer,
          glyph: adjustStaticGlyphFromClipboard(layer.glyph, backgroundImageMapping),
        },
      ]),
    });
  }

  adjustStaticGlyphsFromClipboard(glyphs, backgroundImageData) {
    const backgroundImageMapping =
      makeBackgroundImageIdentifierMapping(backgroundImageData);

    glyphs = glyphs.map((glyph) =>
      adjustStaticGlyphFromClipboard(glyph, backgroundImageMapping)
    );

    backgroundImageData = remapBackgroundImageData(
      backgroundImageData,
      backgroundImageMapping
    );

    return { glyphs, backgroundImageData };
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
  const glyphNames = new Set();

  for (const { path, change: thisChange } of iterChanges(change)) {
    if (path.length >= 1 && path[0] == "glyphs") {
      if (path.length == 1) {
        glyphNames.add(thisChange.a[0]);
      } else {
        glyphNames.add(path[1]);
      }
    }
  }

  return [...glyphNames].sort();
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

function ensureDenseAxes(axes) {
  return { ...axes, axes: axes.axes || [], mappings: axes.mappings || [] };
}

/**
 * @param {Record<string, FontSource>} sources
 * @returns {Record<string, FontSource>}
 */
function ensureDenseSources(sources) {
  return mapObjectValues(sources, (source) => ensureDenseSource(source));
}

export function ensureDenseSource(source) {
  return {
    ...source,
    location: source.location || {},
    lineMetricsHorizontalLayout: mapObjectValues(
      source.lineMetricsHorizontalLayout || {},
      (metric) => {
        return { value: metric.value, zone: metric.zone || 0 };
      }
    ),
    lineMetricsVerticalLayout: mapObjectValues(
      source.lineMetricsVerticalLayout || {},
      (metric) => {
        return { value: metric.value, zone: metric.zone || 0 };
      }
    ),
    guidelines: normalizeGuidelines(source.guidelines || []),
    customData: source.customData || {},
  };
}

class InstanceRequestQueue {
  constructor(fontController) {
    this.fontController = fontController;
    this.taskPool = new TaskPool(NUM_TASKS);
    this.requests = new Map(); // requestID -> resolveInstancePromise
  }

  requestGlyphInstance(glyphName, sourceLocation) {
    const requestID = uniqueID();

    let resolveInstancePromise;
    const instancePromise = new Promise((resolve) => {
      resolveInstancePromise = resolve;
    });

    this.requests.set(requestID, resolveInstancePromise);

    this.taskPool.schedule(async () => {
      const resolveInstancePromise = this.requests.get(requestID);
      if (!resolveInstancePromise) {
        // The request got cancelled in the meantime
        return;
      }
      this.requests.delete(requestID);
      const instance = await this.fontController.getGlyphInstance(
        glyphName,
        sourceLocation
      );
      resolveInstancePromise(instance);
    });

    return {
      requestID,
      instancePromise: instancePromise,
    };
  }

  cancelGlyphInstanceRequest(requestID) {
    const resolveInstancePromise = this.requests.get(requestID);
    if (resolveInstancePromise) {
      resolveInstancePromise(null);
      this.requests.delete(requestID);
    }
  }
}

function makeBackgroundImageIdentifierMapping(backgroundImageData) {
  return mapObject(backgroundImageData || {}, ([identifier, data]) => [
    identifier,
    crypto.randomUUID(),
  ]);
}

function adjustStaticGlyphFromClipboard(glyph, backgroundImageMapping) {
  if (!glyph.backgroundImage) {
    return glyph;
  }

  const backgroundImage = glyph.backgroundImage;
  const identifier = backgroundImage?.identifier;

  return StaticGlyph.fromObject({
    ...glyph,
    backgroundImage: backgroundImage
      ? {
          ...backgroundImage,
          identifier: backgroundImageMapping[identifier] || identifier,
        }
      : undefined,
  });
}

function remapBackgroundImageData(backgroundImageData, backgroundImageMapping) {
  return backgroundImageData
    ? mapObjectKeys(
        backgroundImageData,
        (identifier) => backgroundImageMapping[identifier] || identifier
      )
    : undefined;
}
