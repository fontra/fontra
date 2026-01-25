import {
  pointInConvexPolygon,
  rectIntersectsPolygon,
} from "@fontra/core/convex-hull.js";
import { getSuggestedGlyphName } from "@fontra/core/glyph-data.js";
import { loaderSpinner } from "@fontra/core/loader-spinner.js";
import {
  centeredRect,
  insetRect,
  isEmptyRect,
  normalizeRect,
  offsetRect,
  pointInRect,
  rectFromPoints,
  rectToPoints,
  sectRect,
  unionRect,
} from "@fontra/core/rectangle.js";
import { difference, isEqualSet, union, updateSet } from "@fontra/core/set-ops.js";
import { applyKerning } from "@fontra/core/shaper.js";
import { decomposedToTransform } from "@fontra/core/transform.js";
import {
  consolidateCalls,
  enumerate,
  parseSelection,
  range,
  reversed,
  valueInRange,
} from "@fontra/core/utils.js";
import * as vector from "@fontra/core/vector.js";

export class SceneModel {
  constructor(
    fontController,
    sceneSettingsController,
    isPointInPath,
    visualizationLayersSettings
  ) {
    this.fontController = fontController;
    this.sceneSettingsController = sceneSettingsController;
    this.sceneSettings = sceneSettingsController.model;
    this.isPointInPath = isPointInPath;
    this.visualizationLayersSettings = visualizationLayersSettings;
    this.hoveredGlyph = undefined;
    this._glyphLocations = {}; // glyph name -> glyph location
    this.longestLineLength = 0;
    this.usedGlyphNames = new Set();
    this.cachedGlyphNames = new Set();
    this.updateSceneCancelSignal = {};

    this.sceneSettingsController.addKeyListener(
      ["characterLines", "align", "applyKerning", "selectedGlyph", "editLayerName"],
      (event) => {
        this.updateScene();
      }
    );

    this.sceneSettingsController.addKeyListener(
      ["fontLocationSourceMapped", "glyphLocation"],
      (event) => {
        this._resetKerningInstance();
        this._syncGlyphLocations();
        this.updateScene();
      }
    );

    this.fontController.addChangeListener(
      { kerning: null },
      () => this._resetKerningInstance(),
      true,
      true
    );

    this.sceneSettingsController.addKeyListener(
      "selectedGlyphName",
      (event) => {
        this.sceneSettings.selection = new Set();
        this._syncLocationFromGlyphName();
      },
      true
    );
  }

  get characterLines() {
    return this.sceneSettings.characterLines;
  }

  get selectedGlyph() {
    return this.sceneSettings.selectedGlyph;
  }

  get positionedLines() {
    return this.sceneSettings.positionedLines;
  }

  get selection() {
    return this.sceneSettings.selection;
  }

  set selection(selection) {
    this.sceneSettings.selection = selection;
  }

  get hoverSelection() {
    return this.sceneSettings.hoverSelection;
  }

  set hoverSelection(hoverSelection) {
    this.sceneSettings.hoverSelection = hoverSelection;
  }

  getSelectedPositionedGlyph() {
    return this.getPositionedGlyphFromSelection(this.selectedGlyph);
  }

  getHoveredPositionedGlyph() {
    return this.getPositionedGlyphFromSelection(this.hoveredGlyph);
  }

  getPositionedGlyphFromSelection(glyphSelection) {
    if (!glyphSelection) {
      return undefined;
    }
    return this.positionedLines[glyphSelection.lineIndex]?.glyphs[
      glyphSelection.glyphIndex
    ];
  }

  getSelectedGlyphName() {
    return this.getSelectedPositionedGlyph()?.glyphName;
  }

  isSelectedGlyphLocked() {
    return !!this.getSelectedPositionedGlyph()?.varGlyph?.glyph.customData[
      "fontra.glyph.locked"
    ];
  }

  async getSelectedVariableGlyphController() {
    if (!this.selectedGlyph) {
      return undefined;
    }
    return await this.fontController.getGlyph(this.getSelectedGlyphName());
  }

  _getSelectedStaticGlyphController() {
    return this.getSelectedPositionedGlyph()?.glyph;
  }

  async getSelectedStaticGlyphController() {
    return await this.getGlyphInstance(
      this.sceneSettings.selectedGlyphName,
      this.sceneSettings.editLayerName
    );
  }

  _resetKerningInstance() {
    delete this._kerningInstance;
  }

  async getKerningInstance(kernTag) {
    if (!this._kerningInstance) {
      const controller = await this.fontController.getKerningController(kernTag);
      if (controller) {
        this._kerningInstance = controller.instantiate(
          this.sceneSettings.fontLocationSourceMapped
        );
      } else {
        this._kerningInstance = { getGlyphPairValue: (leftGlyph, rightGlyph) => null };
      }
    }
    return this._kerningInstance;
  }

  getGlyphLocations(filterShownGlyphs = false) {
    let glyphLocations;
    if (filterShownGlyphs) {
      glyphLocations = {};
      for (const positionedLine of this.positionedLines) {
        for (const glyphInfo of positionedLine.glyphs) {
          if (
            !glyphLocations[glyphInfo.glyphName] &&
            this._glyphLocations[glyphInfo.glyphName]
          ) {
            const glyphLocation = this._glyphLocations[glyphInfo.glyphName];
            if (Object.keys(glyphLocation).length) {
              glyphLocations[glyphInfo.glyphName] =
                this._glyphLocations[glyphInfo.glyphName];
            }
          }
        }
      }
    } else {
      glyphLocations = this._glyphLocations;
    }
    return glyphLocations;
  }

  _syncGlyphLocations() {
    const glyphLocation = this.sceneSettings.glyphLocation;

    const glyphName = this.sceneSettings.selectedGlyphName;
    if (glyphName !== undefined) {
      if (Object.keys(glyphLocation).length) {
        this._glyphLocations[glyphName] = glyphLocation;
      } else {
        delete this._glyphLocations[glyphName];
      }
    }
  }

  _syncLocationFromGlyphName() {
    const glyphName = this.sceneSettings.selectedGlyphName;
    this.sceneSettings.glyphLocation = { ...this._glyphLocations[glyphName] };
  }

  setGlyphLocations(glyphLocations) {
    this._glyphLocations = glyphLocations || {};
  }

  updateGlyphLocations(glyphLocations) {
    this._glyphLocations = { ...this._glyphLocations, ...glyphLocations };
  }

  getTextHorizontalExtents() {
    switch (this.sceneSettings.align) {
      case "left":
        return [0, this.longestLineLength];
      case "center":
        return [-this.longestLineLength / 2, this.longestLineLength / 2];
      case "right":
        return [-this.longestLineLength, 0];
    }
  }

  updateCharacterLinesCharacterMapping() {
    // Call this when the cmap changed: previously missing characters may now be
    // available, but may have a different glyph name, or a character may no longer
    // be available, in which case we set the isUndefined flag
    this.sceneSettings.characterLines = this.characterLines.map((line) =>
      line.map((glyphInfo) => {
        const glyphName = glyphInfo.character
          ? this.fontController.characterMap[glyphInfo.character.codePointAt(0)]
          : undefined;
        if (glyphInfo.isUndefined && glyphName) {
          glyphInfo = { ...glyphInfo, glyphName, isUndefined: false };
        } else if (!glyphName) {
          glyphInfo = { ...glyphInfo, isUndefined: true };
        }
        return glyphInfo;
      })
    );
  }

  async updateBackgroundGlyphs() {
    this.backgroundLayerGlyphs = [];
    this.editingLayerGlyphs = [];
    const glyphName = await this.getSelectedGlyphName();
    if (!glyphName) {
      return;
    }
    const varGlyph = await this.fontController.getGlyph(glyphName);
    if (!varGlyph) {
      return;
    }
    this.backgroundLayerGlyphs = await this._setupBackgroundGlyphs(
      glyphName,
      varGlyph,
      this.sceneSettings.backgroundLayers,
      this.sceneSettings.editingLayers
    );
    this.editingLayerGlyphs = await this._setupBackgroundGlyphs(
      glyphName,
      varGlyph,
      this.sceneSettings.editingLayers,
      {}
    );
  }

  async _setupBackgroundGlyphs(glyphName, varGlyph, layers, skipLayers) {
    const layerGlyphs = [];
    for (const [layerName, sourceLocationString] of Object.entries(layers)) {
      if (layerName in skipLayers) {
        continue;
      }
      let layerGlyph;
      if (varGlyph.layers.hasOwnProperty(layerName)) {
        // Proper layer glyph
        let sourceIndex =
          varGlyph.getSourceIndexForSourceLocationString(sourceLocationString) || 0;
        layerGlyph = await this.fontController.getLayerGlyphController(
          glyphName,
          layerName,
          sourceIndex
        );
      } else if (this.fontController.sources.hasOwnProperty(layerName)) {
        // Virtual layer glyph
        const location = this.fontController.sources[layerName].location;
        layerGlyph = await this.fontController.getGlyphInstance(
          glyphName,
          location,
          undefined
        );
      }
      if (layerGlyph) {
        layerGlyphs.push(layerGlyph);
      }
    }
    return layerGlyphs;
  }

  async updateScene() {
    this.updateSceneCancelSignal.shouldCancel = true;
    const cancelSignal = {};
    this.updateSceneCancelSignal = cancelSignal;

    this.updateBackgroundGlyphs();

    this.fontSourceInstance = this.fontController.fontSourcesInstancer.instantiate(
      this.sceneSettings.fontLocationSourceMapped
    );

    // const startTime = performance.now();
    const result = await this.buildScene(cancelSignal);
    // const elapsed = performance.now() - startTime;
    // console.log("buildScene", elapsed);

    if (cancelSignal.shouldCancel) {
      return;
    }

    this.longestLineLength = result.longestLineLength;
    this.sceneSettings.positionedLines = result.positionedLines;

    const usedGlyphNames = getUsedGlyphNames(this.fontController, this.positionedLines);
    const cachedGlyphNames = difference(
      this.fontController.getCachedGlyphNames(),
      usedGlyphNames
    );

    this._adjustSubscriptions(usedGlyphNames, this.usedGlyphNames, true);
    this._adjustSubscriptions(cachedGlyphNames, this.cachedGlyphNames, false);

    this.usedGlyphNames = usedGlyphNames;
    this.cachedGlyphNames = cachedGlyphNames;
  }

  _adjustSubscriptions(currentGlyphNames, previousGlyphNames, wantLiveChanges) {
    if (isEqualSet(currentGlyphNames, previousGlyphNames)) {
      return;
    }
    const unsubscribeGlyphNames = difference(previousGlyphNames, currentGlyphNames);
    const subscribeGlyphNames = difference(currentGlyphNames, previousGlyphNames);
    if (unsubscribeGlyphNames.size) {
      this.fontController.unsubscribeChanges(
        makeGlyphNamesPattern(unsubscribeGlyphNames),
        wantLiveChanges
      );
    }
    if (subscribeGlyphNames.size) {
      this.fontController.subscribeChanges(
        makeGlyphNamesPattern(subscribeGlyphNames),
        wantLiveChanges
      );
    }
  }

  getGlyphSubscriptionPatterns() {
    return {
      subscriptionPattern: makeGlyphNamesPattern(this.cachedGlyphNames),
      liveSubscriptionPattern: makeGlyphNamesPattern(this.usedGlyphNames),
    };
  }

  async buildScene(cancelSignal) {
    const fontController = this.fontController;

    const characterLines = this.characterLines;
    const {
      lineIndex: selectedLineIndex,
      glyphIndex: selectedGlyphIndex,
      isEditing: selectedGlyphIsEditing,
    } = this.selectedGlyph || {};
    const editLayerName = this.sceneSettings.editLayerName;

    let y = 0;
    const lineDistance = 1.1 * fontController.unitsPerEm; // TODO make factor user-configurable
    const positionedLines = [];
    let longestLineLength = 0;

    const neededGlyphs = [
      ...new Set(
        characterLines
          .map((characterLine) => characterLine.map((glyphInfo) => glyphInfo.glyphName))
          .flat()
      ),
    ];
    if (!fontController.areGlyphsCached(neededGlyphs)) {
      // Pre-load the needed glyphs. loadGlyphs() does this in parallel
      // if possible, so can be a lot faster than requesting the glyphs
      // sequentially.
      await loaderSpinner(fontController.loadGlyphs(neededGlyphs));
    }

    if (cancelSignal.shouldCancel) {
      return;
    }

    const kerningInstance = this.sceneSettings.applyKerning
      ? await this.getKerningInstance("kern")
      : null;
    const shaper = await fontController.getShaper();
    const lineSetter = new LineSetter(
      fontController,
      shaper,
      (glyphName, layerName) => this.getGlyphInstance(glyphName, layerName),
      kerningInstance ? (g1, g2) => kerningInstance.getGlyphPairValue(g1, g2) : null,
      this.sceneSettings.align,
      cancelSignal
    );

    for (const [lineIndex, characterLine] of enumerate(characterLines)) {
      const positionedLine = await lineSetter.setLine(
        { x: 0, y },
        characterLine,
        lineIndex == selectedLineIndex ? selectedGlyphIndex : undefined,
        selectedGlyphIsEditing,
        editLayerName
      );

      if (!positionedLine) {
        return;
      }

      longestLineLength = Math.max(longestLineLength, positionedLine.endPoint.x);

      y -= lineDistance;
      positionedLines.push(positionedLine);
    }

    return { longestLineLength, positionedLines };
  }

  getLocationForGlyph(glyphName) {
    return {
      ...this.sceneSettings.fontLocationSourceMapped,
      ...this._glyphLocations[glyphName],
    };
  }

  async getGlyphInstance(glyphName, layerName) {
    return await this.fontController.getGlyphInstance(
      glyphName,
      this.getLocationForGlyph(glyphName),
      layerName
    );
  }

  selectionAtPoint(
    point,
    size,
    currentSelection,
    currentHoverSelection,
    preferTCenter
  ) {
    if (!this.selectedGlyph?.isEditing) {
      return { selection: new Set() };
    }

    let selection;

    // First we'll see if the clicked point falls within the current selection
    selection = this._selectionAtPoint(point, size, currentSelection);

    if (selection.selection?.size) {
      return selection;
    }

    // If not, search all items
    selection = this._selectionAtPoint(point, size, undefined);
    if (selection.selection?.size) {
      return selection;
    }

    // Then, look for segment selection (they should *not* participate in the
    // "prefer if it's in the current selection" logic)
    selection = this.segmentSelectionAtPoint(point, size);
    if (selection.pathHit) {
      return selection;
    }

    // Then, look for components (ditto)
    const componentSelection = this.componentSelectionAtPoint(
      point,
      size,
      currentSelection ? union(currentSelection, currentHoverSelection) : undefined,
      preferTCenter
    );
    if (componentSelection.size) {
      return { selection: componentSelection };
    }

    // Lastly, look for background images
    const backgroundImageSelection = this.backgroundImageSelectionAtPoint(point);
    return { selection: backgroundImageSelection };
  }

  _selectionAtPoint(point, size, currentSelection) {
    const parsedCurrentSelection = currentSelection
      ? parseSelection(currentSelection)
      : undefined;

    const pointSelection = this.pointSelectionAtPoint(
      point,
      size,
      parsedCurrentSelection
    );
    if (pointSelection.size) {
      return { selection: pointSelection };
    }

    const anchorSelection = this.anchorSelectionAtPoint(
      point,
      size,
      parsedCurrentSelection
    );
    if (anchorSelection.size) {
      return { selection: anchorSelection };
    }

    const guidelineSelection = this.guidelineSelectionAtPoint(
      point,
      size,
      parsedCurrentSelection
    );
    if (guidelineSelection.size) {
      return { selection: guidelineSelection };
    }

    // TODO: Font Guidelines
    // const fontGuidelineSelection = this.fontGuidelineSelectionAtPoint(point, size);
    // if (fontGuidelineSelection.size) {
    //   return { selection: fontGuidelineSelection };
    // }

    return {};
  }

  pointSelectionAtPoint(point, size, parsedCurrentSelection) {
    const positionedGlyph = this.getSelectedPositionedGlyph();
    if (!positionedGlyph) {
      return new Set();
    }

    const glyphPoint = {
      x: point.x - positionedGlyph.x,
      y: point.y - positionedGlyph.y,
    };

    let pointIndex;
    if (parsedCurrentSelection) {
      pointIndex = positionedGlyph.glyph.path.pointIndexNearPointFromPointIndices(
        glyphPoint,
        size,
        parsedCurrentSelection.point || []
      );
    } else {
      pointIndex = positionedGlyph.glyph.path.pointIndexNearPoint(glyphPoint, size);
    }
    if (pointIndex !== undefined) {
      return new Set([`point/${pointIndex}`]);
    }

    return new Set();
  }

  segmentSelectionAtPoint(point, size) {
    const pathHit = this.pathHitAtPoint(point, size);
    if (
      pathHit.segment?.parentPoints.every(
        (point) => vector.distance(pathHit, point) > size
      )
    ) {
      const selection = new Set(
        [
          pathHit.segment.parentPointIndices[0],
          pathHit.segment.parentPointIndices.at(-1),
        ].map((i) => `point/${i}`)
      );
      return { selection, pathHit };
    }
    return { selection: new Set() };
  }

  componentSelectionAtPoint(point, size, currentSelection, preferTCenter) {
    const positionedGlyph = this.getSelectedPositionedGlyph();
    if (!positionedGlyph) {
      return new Set();
    }

    let currentSelectedComponentIndices;
    if (currentSelection) {
      const { component, componentOrigin, componentTCenter } =
        parseSelection(currentSelection);
      currentSelectedComponentIndices = new Set([
        ...(component || []),
        ...(componentOrigin || []),
        ...(componentTCenter || []),
      ]);
    }
    const components = positionedGlyph.glyph.components;
    const x = point.x - positionedGlyph.x;
    const y = point.y - positionedGlyph.y;
    const selRect = centeredRect(x, y, size);
    const componentHullMatches = [];
    for (let i = components.length - 1; i >= 0; i--) {
      const component = components[i];
      if (currentSelectedComponentIndices?.has(i)) {
        const compo = component.compo;
        const originMatch = pointInRect(
          compo.transformation.translateX,
          compo.transformation.translateY,
          selRect
        );
        const tCenterMatch = pointInRect(
          compo.transformation.translateX + compo.transformation.tCenterX,
          compo.transformation.translateY + compo.transformation.tCenterY,
          selRect
        );
        if (originMatch || tCenterMatch) {
          const selection = new Set([]);
          if (originMatch && (!tCenterMatch || !preferTCenter)) {
            selection.add(`componentOrigin/${i}`);
          }
          if (tCenterMatch && (!originMatch || preferTCenter)) {
            selection.add(`componentTCenter/${i}`);
          }
          return selection;
        }
      }
      if (
        pointInRect(x, y, component.controlBounds) &&
        this.isPointInPath(component.path2d, x, y)
      ) {
        componentHullMatches.push({ index: i, component: component });
      }
    }
    switch (componentHullMatches.length) {
      case 0:
        return new Set();
      case 1:
        return new Set([`component/${componentHullMatches[0].index}`]);
    }
    // If we have multiple matches, take the first that has an actual
    // point inside the path, and not just inside the hull
    for (const match of componentHullMatches) {
      if (this.isPointInPath(match.component.path2d, x, y)) {
        return new Set([`component/${match.index}`]);
      }
    }
    // Else, fall back to the first match
    return new Set([`component/${componentHullMatches[0].index}`]);
  }

  anchorSelectionAtPoint(point, size, parsedCurrentSelection) {
    const positionedGlyph = this.getSelectedPositionedGlyph();
    if (!positionedGlyph) {
      return new Set();
    }

    const anchors = positionedGlyph.glyph.anchors;
    const x = point.x - positionedGlyph.x;
    const y = point.y - positionedGlyph.y;
    const selRect = centeredRect(x, y, size);
    const indices = parsedCurrentSelection
      ? parsedCurrentSelection.anchor || []
      : [...range(anchors.length)];
    for (const i of reversed(indices)) {
      const anchor = anchors[i];
      if (anchor && pointInRect(anchor.x, anchor.y, selRect)) {
        return new Set([`anchor/${i}`]);
      }
    }
    return new Set([]);
  }

  guidelineSelectionAtPoint(point, size, parsedCurrentSelection) {
    if (!this.visualizationLayersSettings.model["fontra.guidelines"]) {
      // If guidelines are hidden, don't allow selection
      return new Set();
    }
    const positionedGlyph = this.getSelectedPositionedGlyph();
    if (!positionedGlyph) {
      return new Set();
    }

    const guidelines = positionedGlyph.glyph.guidelines;
    const x = point.x - positionedGlyph.x;
    const y = point.y - positionedGlyph.y;
    const indices = parsedCurrentSelection
      ? parsedCurrentSelection.guideline || []
      : [...range(guidelines.length)];
    for (const i of reversed(indices)) {
      const guideline = guidelines[i];
      if (!guideline) {
        continue;
      }
      const angle = (guideline.angle * Math.PI) / 180;
      const distance = Math.abs(
        Math.cos(angle) * (guideline.y - y) - Math.sin(angle) * (guideline.x - x)
      );
      if (distance < size / 2) {
        return new Set([`guideline/${i}`]);
      }
    }
    return new Set([]);
  }

  // TODO: Font Guidelines
  //fontGuidelineSelectionAtPoint(point, size) {
  // }

  backgroundImageSelectionAtPoint(point) {
    return this._backgroundImageSelectionAtPointOrRect(point);
  }

  backgroundImageSelectionAtRect(selRect) {
    return this._backgroundImageSelectionAtPointOrRect(undefined, selRect);
  }

  _backgroundImageSelectionAtPointOrRect(point = undefined, selRect = undefined) {
    if (
      !this.visualizationLayersSettings.model["fontra.background-image"] ||
      this.sceneSettings.backgroundImagesAreLocked
    ) {
      // If background images are hidden or locked, don't allow selection
      return new Set();
    }
    // TODO: If background images are locked don't allow selection

    const positionedGlyph = this.getSelectedPositionedGlyph();
    if (!positionedGlyph) {
      return new Set();
    }

    if (point) {
      const x = point.x - positionedGlyph.x;
      const y = point.y - positionedGlyph.y;
      selRect = centeredRect(x, y, 0);
    }

    if (!selRect) {
      return new Set();
    }

    const backgroundImage = positionedGlyph.glyph.backgroundImage;
    if (!backgroundImage) {
      return new Set();
    }

    const affine = decomposedToTransform(backgroundImage.transformation);
    const backgroundImageBounds = this.fontController.getBackgroundImageBounds(
      backgroundImage.identifier
    );
    if (!backgroundImageBounds) {
      return new Set();
    }
    const rectPoly = rectToPoints(backgroundImageBounds);
    const polygon = rectPoly.map((point) => affine.transformPointObject(point));

    if (
      pointInConvexPolygon(selRect.xMin, selRect.yMin, polygon) ||
      rectIntersectsPolygon(selRect, polygon)
    ) {
      return new Set(["backgroundImage/0"]);
    }

    return new Set();
  }

  selectionAtRect(selRect, pointFilterFunc) {
    const selection = new Set();
    if (!this.selectedGlyph?.isEditing) {
      return selection;
    }
    const positionedGlyph = this.getSelectedPositionedGlyph();
    if (!positionedGlyph) {
      return selection;
    }
    selRect = offsetRect(selRect, -positionedGlyph.x, -positionedGlyph.y);
    for (const hit of positionedGlyph.glyph.path.iterPointsInRect(selRect)) {
      if (!pointFilterFunc || pointFilterFunc(hit)) {
        selection.add(`point/${hit.pointIndex}`);
      }
    }
    const components = positionedGlyph.glyph.components;
    for (let i = 0; i < components.length; i++) {
      if (components[i].intersectsRect(selRect)) {
        selection.add(`component/${i}`);
      }
    }

    const backgroundImageSelection = this.backgroundImageSelectionAtRect(selRect);
    if (backgroundImageSelection.size) {
      // As long as we don't have multiple background images,
      // we can just add a single selection
      selection.add("backgroundImage/0");
    }

    return selection;
  }

  pathHitAtPoint(point, size) {
    if (!this.selectedGlyph?.isEditing) {
      return {};
    }
    const positionedGlyph = this.getSelectedPositionedGlyph();
    if (!positionedGlyph) {
      return {};
    }
    const glyphPoint = {
      x: point.x - positionedGlyph.x,
      y: point.y - positionedGlyph.y,
    };
    return positionedGlyph.glyph.pathHitTester.hitTest(glyphPoint, size / 2);
  }

  glyphAtPoint(point, skipEditingGlyph = true) {
    const matches = [];
    for (let i = this.positionedLines.length - 1; i >= 0; i--) {
      const positionedLine = this.positionedLines[i];
      if (
        !positionedLine.bounds ||
        !pointInRect(point.x, point.y, positionedLine.bounds)
      ) {
        continue;
      }
      for (let j = positionedLine.glyphs.length - 1; j >= 0; j--) {
        const positionedGlyph = positionedLine.glyphs[j];
        if (
          !positionedGlyph.bounds ||
          !pointInRect(point.x, point.y, positionedGlyph.bounds)
        ) {
          continue;
        }
        if (
          positionedGlyph.isEmpty ||
          pointInConvexPolygon(
            point.x - positionedGlyph.x,
            point.y - positionedGlyph.y,
            positionedGlyph.glyph.convexHull
          )
        ) {
          if (
            !skipEditingGlyph ||
            !this.selectedGlyph?.isEditing ||
            this.selectedGlyph.lineIndex != i ||
            this.selectedGlyph.glyphIndex != j
          ) {
            matches.push([i, j]);
          }
        }
      }
    }
    let foundGlyph = undefined;
    if (matches.length == 1) {
      const [i, j] = matches[0];
      foundGlyph = { lineIndex: i, glyphIndex: j };
    } else if (matches.length > 1) {
      // The target point is inside the convex hull of multiple glyphs.
      // We prefer the glyph that has the point properly inside, and if
      // that doesn't resolve it we take the glyph with the smallest
      // convex hull area, as that's the one most likely to be hard to
      // hit otherwise.
      // These heuristics should help selecting the glyph intended by the
      // user, regardless of its order in the string.
      const decoratedMatches = matches.map(([i, j]) => {
        const positionedGlyph = this.positionedLines[i].glyphs[j];
        return {
          i: i,
          j: j,
          inside: this.isPointInPath(
            positionedGlyph.glyph.flattenedPath2d,
            point.x - positionedGlyph.x,
            point.y - positionedGlyph.y
          ),
          area: positionedGlyph.glyph.convexHullArea,
        };
      });
      decoratedMatches.sort((a, b) => b.inside - a.inside || a.area - b.area);
      const { i, j } = decoratedMatches[0];
      foundGlyph = { lineIndex: i, glyphIndex: j };
    }
    return foundGlyph;
  }

  lineAtPoint(point) {
    if (!this.positionedLines.length) {
      return;
    }

    const ascender = this.ascender;
    const descender = this.descender;

    for (const [lineIndex, line] of enumerate(this.positionedLines)) {
      if (!line.glyphs.length) {
        continue;
      }
      const firstGlyph = line.glyphs[0];
      const lastGlyph = line.glyphs.at(-1);
      const lastGlyphRight = lastGlyph.x + lastGlyph.glyph.xAdvance;

      const metricsBox = {
        xMin: line.bounds ? Math.min(firstGlyph.x, line.bounds.xMin) : firstGlyph.x,
        yMin: firstGlyph.y + descender,
        xMax: line.bounds ? Math.max(lastGlyphRight, line.bounds.xMax) : lastGlyphRight,
        yMax: firstGlyph.y + ascender,
      };
      if (!pointInRect(point.x, point.y, metricsBox)) {
        continue;
      }

      return { lineIndex, line };
    }
  }

  sidebearingAtPoint(point, size, previousLineIndex, previousGlyphIndex) {
    const glyphHit = this.glyphAtPoint(point);
    let lineIndex;
    let glyphsToTry;

    if (glyphHit) {
      lineIndex = glyphHit.lineIndex;
      glyphsToTry = [
        [
          glyphHit.glyphIndex,
          this.positionedLines[lineIndex].glyphs[glyphHit.glyphIndex],
        ],
      ];
    } else {
      const lineHit = this.lineAtPoint(point);
      if (!lineHit) {
        return;
      }
      lineIndex = lineHit.lineIndex;
      glyphsToTry = enumerate(lineHit.line.glyphs);
    }

    const matches = [];

    for (const [glyphIndex, positionedGlyph] of glyphsToTry) {
      const glyph = positionedGlyph.glyph;

      const xLeft = positionedGlyph.x;
      const xRight = positionedGlyph.x + glyph.xAdvance;

      const xLeftSB = xLeft + (glyph.leftMargin || 0);
      const xRightSB = xRight - (glyph.rightMargin || 0);

      const [leftZone1, leftZone2] = sorted([xLeft, xLeftSB]);
      const [rightZone1, rightZone2] = sorted([xRight, xRightSB]);

      const middle = (xLeft + xRight) / 2;

      const leftExtra = glyph.leftMargin > 0 ? 0 : size;
      const rightExtra = glyph.rightMargin > 0 ? 0 : size;

      const zonesOverlap = leftZone2 > rightZone1;

      if (
        !zonesOverlap &&
        valueInRange(rightZone1 - size, point.x, rightZone2 + rightExtra)
      ) {
        matches.push({ lineIndex, glyphIndex, metric: "right" });
      } else if (
        !zonesOverlap &&
        valueInRange(leftZone1 - leftExtra, point.x, leftZone2 + size)
      ) {
        matches.push({ lineIndex, glyphIndex, metric: "left" });
      } else if (glyphHit) {
        matches.push({ lineIndex, glyphIndex, metric: "shape" });
      } else if (valueInRange(middle, point.x, xRight)) {
        matches.push({ lineIndex, glyphIndex, metric: "right" });
      } else if (valueInRange(xLeft, point.x, middle)) {
        matches.push({ lineIndex, glyphIndex, metric: "left" });
      }
    }

    if (!matches.length) {
      return;
    }

    const match =
      matches.find(
        (match) =>
          match.lineIndex === previousLineIndex &&
          match.glyphIndex === previousGlyphIndex
      ) || matches[0];

    return match;
  }

  kerningAtPoint(point, size) {
    const result = this.lineAtPoint(point);
    if (!result) {
      return;
    }
    const { lineIndex, line } = result;

    for (let glyphIndex = 1; glyphIndex < line.glyphs.length; glyphIndex++) {
      const positionedGlyph = line.glyphs[glyphIndex];
      const leftPos = positionedGlyph.x;
      const kernRange = [leftPos - positionedGlyph.kernValue, leftPos].sort(
        (a, b) => a - b
      );
      if (valueInRange(kernRange[0] - size, point.x, kernRange[1] + size)) {
        return { lineIndex, glyphIndex };
      }
    }
  }

  get ascender() {
    const lineMetrics = this.fontSourceInstance?.lineMetricsHorizontalLayout;
    return lineMetrics?.ascender?.value || this.fontController.unitsPerEm * 0.8;
  }

  get descender() {
    const lineMetrics = this.fontSourceInstance?.lineMetricsHorizontalLayout;
    return lineMetrics?.descender?.value || this.fontController.unitsPerEm * -0.2;
  }

  getSceneBounds() {
    let bounds = undefined;
    for (const line of this.positionedLines) {
      for (const glyph of line.glyphs) {
        if (!bounds) {
          bounds = glyph.bounds;
        } else if (glyph.bounds) {
          bounds = unionRect(bounds, glyph.bounds);
        }
      }
    }
    return bounds;
  }

  getSelectionBounds() {
    if (!this.selectedGlyph) {
      return this.getSceneBounds();
    }

    let bounds;

    if (this.selectedGlyph?.isEditing && this.selection.size) {
      const positionedGlyph = this.getSelectedPositionedGlyph();
      const [x, y] = [positionedGlyph.x, positionedGlyph.y];
      const instance = this._getSelectedStaticGlyphController();

      bounds = instance.getSelectionBounds(
        this.selection,
        this.fontController.getBackgroundImageBoundsFunc
      );
      if (bounds) {
        bounds = offsetRect(bounds, x, y);
      }
    }

    if (!bounds) {
      const positionedGlyph = this.getSelectedPositionedGlyph();
      bounds = positionedGlyph.bounds;
    }

    if (!bounds) {
      bounds = this.getSceneBounds();
    }

    return bounds;
  }
}

function getUsedGlyphNames(fontController, positionedLines) {
  const usedGlyphNames = new Set();
  for (const line of positionedLines) {
    for (const glyph of line.glyphs) {
      usedGlyphNames.add(glyph.glyph.name);
      updateSet(
        usedGlyphNames,
        fontController.iterGlyphsMadeOfRecursively(glyph.glyph.name)
      );
    }
  }
  return usedGlyphNames;
}

function makeGlyphNamesPattern(glyphNames) {
  const glyphsObj = {};
  for (const glyphName of glyphNames) {
    glyphsObj[glyphName] = null;
  }
  return { glyphs: glyphsObj };
}

function sorted(v) {
  v = [...v];
  v.sort((a, b) => a - b);
  return v;
}

class LineSetter {
  constructor(
    fontController,
    shaper,
    getGlyphInstanceFunc,
    kerningPairFunc,
    align,
    cancelSignal
  ) {
    this.fontController = fontController;
    this.shaper = shaper;
    this.getGlyphInstanceFunc = getGlyphInstanceFunc;
    this.kerningPairFunc = kerningPairFunc;
    this.align = align;
    this.cancelSignal = cancelSignal;
    this.glyphInstances = {};
  }

  async setLine(
    origin,
    characterLine,
    selectedGlyphIndex,
    selectedGlyphIsEditing,
    editLayerName
  ) {
    const fontController = this.fontController;
    const glyphs = [];

    let { x, y } = origin;

    const text = characterLine
      .map(
        (characterInfo) =>
          characterInfo.character ??
          this.shaper.getPUACharacter(characterInfo.glyphName)
      )
      .join("");

    let shapedGlyphs = this.shaper.shape(text, null, null, this.glyphInstances);
    let needsReshape = false;
    for (const glyphInfo of shapedGlyphs) {
      if (
        !(glyphInfo.gn in this.glyphInstances) &&
        glyphInfo.gn in fontController.glyphMap
      ) {
        this.glyphInstances[glyphInfo.gn] = await this.getGlyphInstanceFunc(
          glyphInfo.gn
        );
        needsReshape = true;
      }
    }

    if (needsReshape) {
      shapedGlyphs = this.shaper.shape(text, null, null, this.glyphInstances);
    }

    if (this.kerningPairFunc) {
      applyKerning(shapedGlyphs, this.kerningPairFunc);
    }

    for (const [glyphIndex, glyphInfo] of enumerate(shapedGlyphs)) {
      let codePoint = text.codePointAt(glyphInfo.cl);
      if (this.shaper.getPUAGlyphName(codePoint)) {
        codePoint = undefined;
      }
      const glyphName =
        glyphInfo.g != 0 ? glyphInfo.gn : getSuggestedGlyphName(codePoint);

      const isSelectedGlyph = glyphIndex == selectedGlyphIndex;

      const thisGlyphEditLayerName =
        editLayerName && isSelectedGlyph ? editLayerName : undefined;

      const varGlyph = await fontController.getGlyph(glyphName);
      let glyphInstance = thisGlyphEditLayerName
        ? await this.getGlyphInstanceFunc(glyphName, thisGlyphEditLayerName)
        : this.glyphInstances[glyphName];

      if (this.cancelSignal.shouldCancel) {
        return;
      }

      const isUndefined = !glyphInstance;
      if (isUndefined) {
        glyphInstance = fontController.getDummyGlyphInstanceController(glyphName);
      }

      const kernValue =
        glyphInfo.flags & 0x01
          ? shapedGlyphs[glyphIndex - 1].ax - glyphs.at(-1).glyph.xAdvance
          : 0;

      glyphs.push({
        x: x + glyphInfo.dx,
        y: y + glyphInfo.dy,
        kernValue,
        glyph: glyphInstance,
        varGlyph,
        glyphName: isUndefined
          ? this.shaper.getPUAGlyphName(codePoint) ?? glyphName
          : glyphName,
        character: isUndefined && codePoint ? String.fromCodePoint(codePoint) : null,
        isUndefined,
        isSelected: isSelectedGlyph,
        isEditing: !!(isSelectedGlyph && selectedGlyphIsEditing),
        isEmpty: !glyphInstance.controlBounds,
      });

      x += glyphInfo.ax;
      y += glyphInfo.ay;
    }

    let offset = 0;

    switch (this.align) {
      case "center":
        offset = -x / 2;
        break;
      case "right":
        offset = -x;
        break;
    }

    if (offset) {
      glyphs.forEach((item) => {
        item.x += offset;
      });
    }

    // TODO: use font's ascender/descender values
    addBoundingBoxes(
      glyphs,
      -0.2 * fontController.unitsPerEm,
      0.8 * fontController.unitsPerEm
    );

    const bounds = unionRect(...glyphs.map((glyph) => glyph.bounds));

    return { bounds, glyphs, origin, endPoint: { x, y: origin.y } };
  }
}

function addBoundingBoxes(glyphs, descender, ascender) {
  glyphs.forEach((item) => {
    let bounds = item.glyph.controlBounds;
    if (!bounds || isEmptyRect(bounds) || item.glyph.isEmptyIsh) {
      // Empty glyph, make up box based on advance so it can still be clickable/hoverable
      // If the advance is very small, add a bit of extra space on both sides so it'll be
      // clickable even with a zero advance width
      const extraSpace = item.glyph.xAdvance < 30 ? 20 : 0;
      bounds = insetRect(
        normalizeRect({
          xMin: 0,
          yMin: descender,
          xMax: item.glyph.xAdvance,
          yMax: ascender,
        }),
        -extraSpace,
        0
      );
      item.isEmpty = true;
    }
    item.bounds = offsetRect(bounds, item.x, item.y);
    item.unpositionedBounds = bounds;
  });
}
