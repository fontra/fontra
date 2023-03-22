import { withSavedState } from "/core/utils.js";
import { mulScalar } from "/core/var-funcs.js";

export class VisualizationLayers {
  constructor(definitions, darkTheme) {
    this.definitions = definitions;
    this._darkTheme = darkTheme;
    this._scaleFactor = 1;
    this._visibleLayerIds = new Set(
      this.definitions
        .filter((layer) => !layer.userSwitchable || layer.defaultOn)
        .map((layer) => layer.identifier)
    );
    this.needsUpdate = true;
  }

  setNeedsUpdate() {
    if (!this.needsUpdate) {
      this.needsUpdate = true;
      setTimeout(() => this.buildLayers(), 0);
    }
  }

  get darkTheme() {
    return this._darkTheme;
  }

  set darkTheme(darkTheme) {
    this._darkTheme = darkTheme;
    this.setNeedsUpdate();
  }

  get scaleFactor() {
    return this._scaleFactor;
  }

  set scaleFactor(scaleFactor) {
    this._scaleFactor = scaleFactor;
    this.setNeedsUpdate();
  }

  get visibleLayerIds() {
    return this._visibleLayerIds;
  }

  set visibleLayerIds(visibleLayerIds) {
    this._visibleLayerIds = visibleLayerIds;
    this.setNeedsUpdate();
  }

  toggle(layerID, onOff) {
    if (onOff) {
      this._visibleLayerIds.add(layerID);
    } else {
      this._visibleLayerIds.delete(layerID);
    }
    this.setNeedsUpdate();
  }

  buildLayers() {
    if (!this.needsUpdate) {
      return;
    }
    this.needsUpdate = false;
    const layers = [];
    for (const layerDef of this.definitions) {
      if (!this.visibleLayerIds.has(layerDef.identifier)) {
        continue;
      }
      const parameters = {
        ...mulScalar(layerDef.screenParameters || {}, this.scaleFactor),
        ...(layerDef.glyphParameters || {}),
        ...(layerDef.colors || {}),
        ...(this.darkTheme && layerDef.colorsDarkMode ? layerDef.colorsDarkMode : {}),
      };
      const layer = {
        selectionMode: layerDef.selectionMode,
        selectionFilter: layerDef.selectionFilter,
        parameters: parameters,
        draw: layerDef.draw,
      };
      layers.push(layer);
    }
    this.layers = layers;
  }

  drawVisualizationLayers(model, controller) {
    if (this.needsUpdate) {
      this.buildLayers();
    }
    const glyphsBySelectionMode = getGlyphsBySelectionMode(model);
    const context = controller.context;
    for (const layer of this.layers) {
      const glyphs = layer.selectionFilter
        ? glyphsBySelectionMode[layer.selectionMode].filter(layer.selectionFilter)
        : glyphsBySelectionMode[layer.selectionMode];
      for (const positionedGlyph of glyphs) {
        withSavedState(context, () => {
          context.translate(positionedGlyph.x, positionedGlyph.y);
          layer.draw(context, positionedGlyph, layer.parameters, model, controller);
        });
      }
    }
  }
}

function getGlyphsBySelectionMode(model) {
  const selectedPositionedGlyph = model.getSelectedPositionedGlyph();
  const allPositionedGlyphs = model.positionedLines.flatMap((line) => line.glyphs);
  return {
    all: allPositionedGlyphs,
    unselected: allPositionedGlyphs.filter(
      (glyph) => glyph !== selectedPositionedGlyph
    ),
    hovered:
      model.hoveredGlyph && model.hoveredGlyph !== model.selectedGlyph
        ? [model.getHoveredPositionedGlyph()]
        : [],
    selected:
      model.selectedGlyph && !model.selectedGlyphIsEditing
        ? [model.getSelectedPositionedGlyph()]
        : [],
    editing: model.selectedGlyphIsEditing ? [model.getSelectedPositionedGlyph()] : [],
  };
}
