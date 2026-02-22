import { recordChanges } from "@fontra/core/change-recorder.js";
import { ChangeCollector } from "@fontra/core/changes.js";
import { UndoStack, reverseUndoRecord } from "@fontra/core/font-controller.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { isDisjoint, symmetricDifference, union } from "@fontra/core/set-ops.js";
import {
  arrowKeyDeltas,
  assert,
  capitalizeFirstLetter,
  range,
  round,
  throttleCalls,
  updateObject,
} from "@fontra/core/utils.js";
import { MenuItemDivider } from "@fontra/web-components/menu-panel.js";
import { dialog } from "@fontra/web-components/modal-dialog.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { equalGlyphSelection } from "./scene-controller.js";
import {
  glyphSelector,
  registerVisualizationLayerDefinition,
  strokeLine,
} from "./visualization-layer-definitions.js";

export class MetricsTool {
  identifier = "metrics-tool";
  subTools = [SidebearingTool, KerningTool];
}

class MetricsBaseTool extends BaseTool {
  constructor(editor) {
    super(editor);
    this.fontController = editor.fontController;

    this.handleContainer = document.querySelector("#metric-handle-container");
    assert(this.handleContainer);

    this.sceneSettingsController.addKeyListener("characterLines", (event) => {
      if (event.senderInfo?.senderID !== this) {
        const positionedLines = this.sceneSettings.positionedLines;
        this.metricSelection = this.metricSelection.filter(
          (selector) => positionedLines[selector.lineIndex]?.glyphs[selector.glyphIndex]
        );
      }
    });

    this.sceneSettingsController.addKeyListener(
      ["viewBox", "positionedLines"],
      (event) => {
        this.handles.forEach((handle) => {
          this._updateHandle(handle);
        });
        this.getPinPointDelta(); // updates this._prevousMetricCenter
      }
    );

    this.undoStack = new UndoStack();
  }

  updateScrollAdjustBehavior() {
    this.sceneController.scrollAdjustBehavior = this.getScrollAdjustBehavior();
  }

  getScrollAdjustBehavior() {
    return {
      behavior: "tool-pin-point",
      getPinPointDelta: () => this.getPinPointDelta(),
    };
  }

  getPinPointDelta() {
    let deltaX = 0;
    const selector = this._draggingSelector || this.metricSelection.at(-1);
    const currentCenter = this.getPositionedMetricCenter(selector);
    if (currentCenter != undefined) {
      if (this._prevousMetricCenter == undefined) {
        this._prevousMetricCenter = currentCenter;
      }
      deltaX = currentCenter - this._prevousMetricCenter;
    }
    this._prevousMetricCenter = currentCenter;
    return deltaX;
  }

  getPositionedMetricCenter(selector) {
    assert(false, "superclass must implement");
  }

  selectorToId(selector) {
    assert(false, "superclass must implement");
  }

  metricAtPoint(point, size, previousLineIndex, previousGlyphIndex) {
    assert(false, "superclass must implement");
  }

  setCursor() {
    assert(false, "superclass must implement");
  }

  getStepValue() {
    assert(false, "superclass must implement");
  }

  removeAllHandles() {
    this.handles.forEach((handle) => handle.remove());
  }

  get selectedHandles() {
    return this.handles.filter((handle) => handle.selected);
  }

  get metricSelection() {
    return this.selectedHandles.map((handle) => handle.selectedSelector);
  }

  set metricSelection(selection) {
    this.removeAllHandles();
    for (const selector of selection) {
      this.addHandle(selector, true);
    }
  }

  metricAtEvent(event) {
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(event);
    const size = sceneController.mouseClickMargin;

    return this.metricAtPoint(
      point,
      size,
      this.hoveredMetric?.lineIndex,
      this.hoveredMetric?.glyphIndex
    );
  }

  handleHover(event) {
    if (event.type != "mousemove") {
      return;
    }

    const hoveredMetric = this.metricAtEvent(event);

    if (!equalGlyphSelection(this.hoveredMetric, hoveredMetric)) {
      this.hoveredMetric = hoveredMetric;

      const hoveredHandleId = hoveredMetric ? this.selectorToId(hoveredMetric) : null;

      this.handles.forEach((handle) => {
        if (handle.id !== hoveredHandleId && !handle.selected) {
          handle.remove();
        } else {
          handle.updateHover(null);
        }
      });

      if (hoveredMetric) {
        const handle = document.getElementById(hoveredHandleId);
        if (!handle) {
          this.addHandle(hoveredMetric);
        } else {
          handle.updateHover(hoveredMetric);
        }
      }
      this.setCursor();
    }
  }

  async *generateDeltasFromEventStream(eventStream, initialEvent) {
    const magnification = this.canvasController.magnification;
    const initialX = initialEvent.x / magnification;

    for await (const event of eventStream) {
      this.updateScrollAdjustBehavior();

      if (event.x == undefined && event.pageX == undefined) {
        yield { deltaX: null, event };
        continue;
      }

      const currentX = event.x / magnification;
      const step = this.getStepValue(event);
      const deltaX = Math.round((currentX - initialX) / step) * step;

      yield { deltaX, event };
    }
  }

  async _prepareDrag(eventStream, initialEvent) {
    const hoveredMetric = this.metricAtEvent(initialEvent);
    this.hoveredMetric = hoveredMetric;

    if (!hoveredMetric) {
      if (!event.shiftKey) {
        this.removeAllHandles();
      }
      return;
    }

    this._selectHandle(hoveredMetric, event.shiftKey);

    this._prevousMetricCenter = this.getPositionedMetricCenter(
      this.metricSelection.at(-1)
    );

    return (await shouldInitiateDrag(eventStream, initialEvent)) ? hoveredMetric : null;
  }

  _selectHandle(selector, shiftKey) {
    const handleId = this.selectorToId(selector);
    const selectedHandle = document.getElementById(handleId);
    if (!selectedHandle) {
      // Shouldn't happen, but does (rarely), some glitchy async timing thing
      return;
    }

    const shouldDeselect = !selectedHandle.hasSelection(selector);

    if (shiftKey) {
      selectedHandle.toggleSelection(selector);
    } else {
      this.handles.forEach((handle) => {
        if (handle.id === handleId) {
          selectedHandle.toggleSelection(selector, true);
        } else if (shouldDeselect) {
          handle.remove();
        }
      });
    }
  }

  activate() {
    super.activate();
    this.sceneSettings.selectedGlyph = null;
    this.sceneController.hoveredGlyph = null;
    if (this._selectionState?.characterLines === this.sceneSettings.characterLines) {
      this.metricSelection = this._selectionState.selectors;
    }

    this.setCursor();
  }

  deactivate() {
    super.deactivate();
    this._selectionState = {
      characterLines: this.sceneSettings.characterLines,
      selectors: this.metricSelection,
    };
    delete this.hoveredMetric;
    this.removeAllHandles();
  }

  getPositionedGlyph(selector) {
    if (!selector) {
      return undefined;
    }
    const { lineIndex, glyphIndex } = selector;
    return this.sceneSettings.positionedLines[lineIndex]?.glyphs[glyphIndex];
  }

  getUndoRedoLabel(isRedo) {
    const info = this.undoStack.getTopUndoRedoRecord(isRedo)?.info;
    return (
      (isRedo ? translate("action.redo") : translate("action.undo")) +
      (info ? " " + info.label : "")
    );
  }

  canUndoRedo(isRedo) {
    return !!this.undoStack.getTopUndoRedoRecord(isRedo)?.info;
  }

  async doUndoRedo(isRedo) {
    let undoRecord = this.undoStack.popUndoRedoRecord(isRedo);
    if (!undoRecord) {
      return;
    }
    if (isRedo) {
      undoRecord = reverseUndoRecord(undoRecord);
    }

    this._prevousMetricCenter = this.getPositionedMetricCenter(
      undoRecord.info.metricSelection.at(-1)
    );

    this.updateScrollAdjustBehavior();

    this.fontController.applyChange(undoRecord.rollbackChange);

    const error = await this.fontController.editFinal(
      undoRecord.rollbackChange,
      undoRecord.change,
      undoRecord.info.label,
      true
    );

    this.fontController.notifyEditListeners("editFinal", this);

    this.sceneSettingsController.setItem(
      "characterLines",
      undoRecord.info.characterLines,
      {
        senderID: this,
      }
    );
    this.sceneSettings.fontLocationSourceMapped = undoRecord.info.location;
    this.metricSelection = undoRecord.info.metricSelection;
  }

  pushUndoItem(changes, undoLabel) {
    const undoRecord = {
      change: changes.change,
      rollbackChange: changes.rollbackChange,
      info: {
        label: undoLabel,
        characterLines: this.sceneSettings.characterLines,
        location: this.sceneSettings.fontLocationSourceMapped,
        metricSelection: this.metricSelection,
      },
    };

    this.undoStack.pushUndoRecord(undoRecord);
  }

  handleKeyDown(event) {
    if (event.key !== "Tab") {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();

    const currentSelector = this.metricSelection.at(-1);
    if (!currentSelector) {
      return;
    }

    const nextSelector = this.nextSelector(currentSelector, event.shiftKey ? -1 : 1);
    if (nextSelector) {
      this.metricSelection = [nextSelector];
      this._prevousMetricCenter = this.getPositionedMetricCenter(nextSelector);
    }
  }

  nextSelector(selector, direction) {
    assert(false, "superclass must implement");
  }

  nextGlyph(lineIndex, glyphIndex, direction) {
    const positionedLines = this.sceneSettings.positionedLines;

    if (positionedLines[lineIndex].glyphs[glyphIndex + direction]) {
      glyphIndex += direction;
      return { lineIndex, glyphIndex };
    }

    do {
      lineIndex += direction;
    } while (positionedLines[lineIndex]?.glyphs.length === 0);

    if (positionedLines[lineIndex]) {
      return {
        lineIndex,
        glyphIndex: direction === 1 ? 0 : positionedLines[lineIndex].glyphs.length - 1,
      };
    }
  }
}

let theSidebearingTool; // global singleton

function sidebearingVisualizationSelector(forTool) {
  return (visContext, layer) => {
    if (forTool === theSidebearingTool?.isActive) {
      return glyphSelector("notediting")(visContext, layer);
    } else {
      return [];
    }
  };
}

const sidebearingVisualizationDefinition = {
  identifier: "fontra.sidebearings.unselected",
  name: "sidebar.user-settings.glyph.sidebearings",
  selectionFunc: sidebearingVisualizationSelector(false),
  userSwitchable: true,
  defaultOn: false,
  zIndex: 190,
  screenParameters: { strokeWidth: 1, extent: 16 },
  colors: { strokeColor: "#0004" },
  colorsDarkMode: { strokeColor: "#FFF6" },
  draw: _drawMiniSideBearings,
};

registerVisualizationLayerDefinition(sidebearingVisualizationDefinition);

registerVisualizationLayerDefinition({
  ...sidebearingVisualizationDefinition,
  identifier: "fontra.sidebearings-tool",
  name: "sidebar.user-settings.glyph.sidebearings-tool",
  selectionFunc: sidebearingVisualizationSelector(true),
  defaultOn: true,
});

registerVisualizationLayerDefinition({
  ...sidebearingVisualizationDefinition,
  identifier: "fontra.sidebearings",
  name: "sidebar.selection-info.sidebearings",
  selectionFunc: glyphSelector("editing"),
});

function _drawMiniSideBearings(
  context,
  positionedGlyph,
  parameters,
  model,
  controller
) {
  const glyph = positionedGlyph.glyph;
  context.strokeStyle = parameters.strokeColor;
  context.lineWidth = parameters.strokeWidth;
  const extent = parameters.extent;
  strokeLine(context, 0, -extent, 0, extent);
  strokeLine(context, glyph.xAdvance, -extent, glyph.xAdvance, extent);
  if (extent < glyph.xAdvance / 2) {
    strokeLine(context, 0, 0, extent, 0);
    strokeLine(context, glyph.xAdvance, 0, glyph.xAdvance - extent, 0);
  } else {
    strokeLine(context, 0, 0, glyph.xAdvance, 0);
  }
}

class SidebearingTool extends MetricsBaseTool {
  iconPath = "/images/sidebearingtool.svg";
  identifier = "sidebearing-tool";

  constructor(editor) {
    super(editor);

    assert(!theSidebearingTool);
    theSidebearingTool = this;
  }

  selectorToId(selector) {
    return sidebearingSelectorToId(selector);
  }

  metricAtPoint(point, size, previousLineIndex, previousGlyphIndex) {
    return this.sceneModel.sidebearingAtPoint(
      point,
      size,
      previousLineIndex,
      previousGlyphIndex
    );
  }

  addHandle(selector, select = false) {
    const handle = new SidebearingHandle(selector);
    this._updateHandle(handle);
    this.handleContainer.appendChild(handle);
    handle.toggleSelection(selector, select);
  }

  _updateHandle(sidebearingHandle) {
    const { lineIndex, glyphIndex } = sidebearingHandle.selector;
    const positionedGlyph =
      this.sceneModel.positionedLines[lineIndex]?.glyphs[glyphIndex];
    if (!positionedGlyph) {
      return;
    }

    sidebearingHandle.update(positionedGlyph, this.canvasController);
  }

  getPositionedMetricCenter(selector) {
    const positionedGlyph = this.getPositionedGlyph(selector);
    if (!positionedGlyph) {
      return undefined;
    }
    const selection = metricSelectionSet(selector);
    return (
      positionedGlyph.x +
      (selection.has("left") || selection.has("shape")
        ? positionedGlyph.glyph.xAdvance /
          (selection.has("right") || selection.has("shape") ? 2 : 1)
        : 0)
    );
  }

  get handles() {
    return [...this.handleContainer.querySelectorAll("sidebearing-handle")];
  }

  get hoveredHandle() {
    return this.handleContainer.querySelector("sidebearing-handle.hovered");
  }

  setCursor() {
    const cursorMap = {
      left: "w-resize",
      right: "e-resize",
      shape: "ew-resize",
    };

    this.canvasController.canvas.style.cursor =
      cursorMap[this.hoveredMetric?.metric] || null;
  }

  getStepValue(event) {
    return event.shiftKey ? 10 : 1;
  }

  async handleDrag(eventStream, initialEvent) {
    this.canvasController.canvas.focus();

    const selector = await this._prepareDrag(eventStream, initialEvent);
    if (!selector) {
      return;
    }

    const editContext = await this.getEditContext();
    if (!editContext) {
      return;
    }

    const handleId = this.selectorToId(selector);
    const metricHandle = document.getElementById(handleId);

    // Move dragging handle on top, so it'll be the last item in the selection list,
    // which is important for the undo scroll position, when dragging multiple handles
    metricHandle.parentElement.appendChild(metricHandle);

    this._draggingSelector = metricHandle.selectedSelector;
    this._prevousMetricCenter = this.getPositionedMetricCenter(this._draggingSelector);

    const undoLabel = "edit sidebearings";
    const changes = await editContext.editContinuous(
      this.generateDeltasFromEventStream(eventStream, initialEvent),
      undoLabel,
      selector.metric === "left"
    );
    delete this._draggingSelector;

    this.pushUndoItem(changes, undoLabel);
  }

  async handleArrowKeys(event) {
    let [deltaX, deltaY] = arrowKeyDeltas[event.key];
    if (deltaY) {
      return;
    }

    deltaX *= this.getStepValue(event);

    const editContext = await this.getEditContext();
    if (!editContext) {
      return;
    }

    this.updateScrollAdjustBehavior();

    const undoLabel = "edit sidebearings";
    const changes = await editContext.edit(deltaX, undoLabel, event);
    this.pushUndoItem(changes, undoLabel);
  }

  async getEditContext() {
    const leftGlyphNames = new Set();
    const rightGlyphNames = new Set();

    this.selectedHandles.forEach((handle) => {
      const glyphName = this.getPositionedGlyph(handle.selector)?.glyphName;
      if (!glyphName) {
        return;
      }
      const metricSelection = handle.metricSelection;
      if (metricSelection.has("left") || metricSelection.has("shape")) {
        leftGlyphNames.add(glyphName);
      }
      if (metricSelection.has("right") || metricSelection.has("shape")) {
        rightGlyphNames.add(glyphName);
      }
    });

    const allGlyphNames = union(leftGlyphNames, rightGlyphNames);

    const sidebearingSelectors = [];
    const notAtSourceGlyphs = new Set();

    for (const glyphName of allGlyphNames) {
      const varGlyph = await this.fontController.getGlyph(glyphName);
      if (!varGlyph) {
        continue;
      }
      const sourceIndex = varGlyph.getSourceIndex(
        this.sceneModel.getLocationForGlyph(glyphName)
      );
      if (sourceIndex == undefined) {
        notAtSourceGlyphs.add(glyphName);
        continue;
      }
      const layerName = varGlyph.sources[sourceIndex].layerName;
      const sidebearing =
        (leftGlyphNames.has(glyphName) ? "L" : "") +
        (rightGlyphNames.has(glyphName) ? "R" : "");

      sidebearingSelectors.push({
        glyphName,
        sidebearing,
        layerName,
      });
    }

    if (notAtSourceGlyphs.size) {
      this.showDialogLocationNotAtSource([...notAtSourceGlyphs].sort());
      return;
    }

    if (sidebearingSelectors.length) {
      return new SidebearingEditContext(this.fontController, sidebearingSelectors);
    }
  }

  nextSelector(selector, direction) {
    let selection = metricSelectionSet(selector);
    if (selection.has("left") && selection.has("right")) {
      selection = new Set(["shape"]);
    }

    const order = ["left", "shape", "right"];
    const [current] = selection;
    const index = order.indexOf(current) + direction;

    if (index >= 0 && index < order.length) {
      return { ...selector, metric: order[index] };
    } else {
      const nextGlyph = this.nextGlyph(
        selector.lineIndex,
        selector.glyphIndex,
        direction
      );
      if (nextGlyph) {
        return {
          ...nextGlyph,
          metric: direction === 1 ? "left" : "right",
        };
      }
    }
  }

  async showDialogLocationNotAtSource(glyphNames) {
    const glyphName = this.sceneSettings.selectedGlyphName;
    const result = await dialog(
      translate("dialog.cant-edit-sidebearings.title"),
      translate(
        "dialog.cant-edit-glyph.content.location-not-at-source-for-glyphs",
        glyphNames.join(", ")
      ),
      [
        {
          title: translate("dialog.cancel"),
          resultValue: "cancel",
          isCancelButton: true,
        },
        {
          title: translate("sources.button.go-to-nearest-source"),
          resultValue: "goToNearestSource",
          isDefaultButton: true,
        },
      ]
    );
    if (result === "goToNearestSource") {
      this.editor.goToNearestSource();
    }
  }
}

export class SidebearingEditContext {
  // TODO: move to its own module

  constructor(fontController, sidebearingSelectors) {
    assert(sidebearingSelectors.length > 0);
    this.fontController = fontController;
    this.sidebearingSelectors = sidebearingSelectors;

    this._throttledEditIncremental = throttleCalls(async (change) => {
      this.fontController.editIncremental(change);
    }, 50);
    this._throttledEditIncrementalTimeoutID = null;
  }

  async edit(deltaX, undoLabel, event) {
    return await this.editContinuous([{ deltaX, event }], undoLabel);
  }

  async editContinuous(valuesIterator, undoLabel, isLeftSidebearingDrag = false) {
    const font = { glyphs: {} };
    const initialValues = {};
    for (const { glyphName, layerName } of this.sidebearingSelectors) {
      const varGlyphController = await this.fontController.getGlyph(glyphName);
      const varGlyph = varGlyphController.glyph;
      font.glyphs[glyphName] = varGlyph;
      const layerGlyph = varGlyph.layers[layerName].glyph;
      initialValues[glyphName] = {
        xAdvance: layerGlyph.xAdvance,
        reference: layerGlyph.getMoveReference(),
      };
    }

    let firstChanges;
    let lastChanges;
    let lastDeltaX;

    for await (const { deltaX, event } of valuesIterator) {
      const newDeltaX = deltaX === null ? lastDeltaX : deltaX;
      lastDeltaX = newDeltaX;
      const leftDeltaX =
        event.altKey && !isLeftSidebearingDrag ? -newDeltaX : newDeltaX;
      const rightDeltaX =
        event.altKey && isLeftSidebearingDrag ? -newDeltaX : newDeltaX;
      lastChanges = recordChanges(font, (font) => {
        for (const { glyphName, layerName, sidebearing } of this.sidebearingSelectors) {
          const varGlyph = font.glyphs[glyphName];
          const layerGlyph = varGlyph.layers[layerName].glyph;

          switch (sidebearing) {
            case "L": {
              const clampedDeltaX = Math.min(
                leftDeltaX,
                initialValues[glyphName].xAdvance
              );
              layerGlyph.xAdvance = initialValues[glyphName].xAdvance - clampedDeltaX;
              layerGlyph.moveWithReference(
                initialValues[glyphName].reference,
                -clampedDeltaX,
                0
              );
              break;
            }
            case "R": {
              layerGlyph.xAdvance = Math.max(
                initialValues[glyphName].xAdvance + rightDeltaX,
                0
              );
              break;
            }
            case "LR": {
              let clampedDeltaX = 2 * rightDeltaX;

              if (event.altKey) {
                clampedDeltaX = Math.max(
                  2 * rightDeltaX,
                  -initialValues[glyphName].xAdvance
                );
                layerGlyph.xAdvance = initialValues[glyphName].xAdvance + clampedDeltaX;
              } else {
                layerGlyph.xAdvance = initialValues[glyphName].xAdvance;
              }

              layerGlyph.moveWithReference(
                initialValues[glyphName].reference,
                clampedDeltaX / 2,
                0
              );
              break;
            }
          }
        }
      });

      if (!firstChanges) {
        firstChanges = lastChanges;
      }

      this._editIncremental(lastChanges.change, true);
    }
    this._editIncremental(lastChanges.change, false);

    const finalChanges = ChangeCollector.fromChanges(
      lastChanges.change,
      firstChanges.rollbackChange
    );

    await this.fontController.editFinal(
      finalChanges.change,
      finalChanges.rollbackChange,
      undoLabel,
      false
    );

    this.fontController.notifyEditListeners("editFinal", this);

    return finalChanges;
  }

  async _editIncremental(change, mayDrop = false) {
    // Hm, not nice this is needed
    for (const { glyphName } of this.sidebearingSelectors) {
      await this.fontController.glyphChanged(glyphName, { senderID: this });
    }

    // If mayDrop is true, the call is not guaranteed to be broadcast, and is throttled
    // at a maximum number of changes per second, to prevent flooding the network
    if (mayDrop) {
      this._throttledEditIncrementalTimeoutID = this._throttledEditIncremental(change);
    } else {
      clearTimeout(this._throttledEditIncrementalTimeoutID);
      this.fontController.editIncremental(change);
    }

    this.fontController.notifyEditListeners("editIncremental", this);
  }
}

class BaseMetricHandle extends HTMLElement {
  _forwardEventToCanvas(event) {
    const canvas = document.querySelector("#edit-canvas");

    event.preventDefault();
    event.stopImmediatePropagation();
    const newEvent = new event.constructor(event.type, event);
    canvas.dispatchEvent(newEvent);
  }
}

class SidebearingHandle extends BaseMetricHandle {
  constructor(selector) {
    super();

    this._selection = new Set();

    this.advanceElement = html.div({ class: "advance" }, ["advance"]);
    this.leftSidebearingElement = html.div({ class: "left-sidebearing" }, ["left"]);
    this.rightSidebearingElement = html.div({ class: "right-sidebearing" }, ["right"]);

    this.appendChild(this.leftSidebearingElement);
    this.appendChild(this.rightSidebearingElement);
    this.appendChild(this.advanceElement);

    this.id = sidebearingSelectorToId(selector);

    this.addEventListener("mousedown", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("wheel", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("contextmenu", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("mouseenter", (event) => this.classList.add("hovered"));
    this.addEventListener("mouseleave", (event) => this.classList.remove("hovered"));

    this.updateHover(selector);
  }

  update(positionedGlyph, canvasController) {
    const { x: left, y: top } = canvasController.canvasPoint({
      x: positionedGlyph.x,
      y: positionedGlyph.y,
    });

    const { x: right } = canvasController.canvasPoint({
      x: positionedGlyph.x + positionedGlyph.glyph.xAdvance,
      y: positionedGlyph.y,
    });

    this.leftSidebearingElement.style.left = `${left}px`;
    this.leftSidebearingElement.style.top = `${top}px`;

    this.rightSidebearingElement.style.left = `${right}px`;
    this.rightSidebearingElement.style.top = `${top}px`;

    this.advanceElement.style.left = `${(left + right) / 2}px`;
    this.advanceElement.style.top = `${top}px`;

    this.advanceElement.innerText = formatMetricValue(positionedGlyph.glyph.xAdvance);
    this.leftSidebearingElement.innerText = formatMetricValue(
      positionedGlyph.glyph.leftMargin,
      "\u00A0"
    );
    this.leftSidebearingElement.classList.toggle(
      "positive",
      positionedGlyph.glyph.leftMargin > 0
    );
    this.leftSidebearingElement.classList.toggle(
      "negative",
      positionedGlyph.glyph.leftMargin < 0
    );

    this.rightSidebearingElement.innerText = formatMetricValue(
      positionedGlyph.glyph.rightMargin,
      "\u00A0"
    );
    this.rightSidebearingElement.classList.toggle(
      "positive",
      positionedGlyph.glyph.rightMargin > 0
    );
    this.rightSidebearingElement.classList.toggle(
      "negative",
      positionedGlyph.glyph.rightMargin < 0
    );
  }

  updateHover(selector) {
    this.selector = selector || this.selector;

    const [metric] = selector ? metricSelectionSet(selector) : [""];

    this.leftSidebearingElement.classList.toggle(
      "hovered",
      metric === "left" || metric == "shape"
    );
    this.rightSidebearingElement.classList.toggle(
      "hovered",
      metric === "right" || metric == "shape"
    );
  }

  get selected() {
    return this._selection.size > 0;
  }

  hasSelection(selector) {
    assert(
      this.selector.lineIndex === selector.lineIndex &&
        this.selector.glyphIndex === selector.glyphIndex
    );
    return !isDisjoint(metricSelectionSet(selector), this._selection);
  }

  toggleSelection(selector, onOff = undefined) {
    assert(
      this.selector.lineIndex === selector.lineIndex &&
        this.selector.glyphIndex === selector.glyphIndex
    );

    const newSelection = metricSelectionSet(selector);

    if (onOff === undefined) {
      this._selection = symmetricDifference(this._selection, newSelection);
    } else if (onOff) {
      this._selection = isDisjoint(this._selection, newSelection)
        ? newSelection
        : union(this._selection, newSelection);
    } else {
      this._selection = new Set();
    }

    this.leftSidebearingElement.classList.toggle(
      "selected",
      this._selection.has("left") || this._selection.has("shape")
    );
    this.rightSidebearingElement.classList.toggle(
      "selected",
      this._selection.has("right") || this._selection.has("shape")
    );
  }

  get metricSelection() {
    return this._selection;
  }

  get selectedSelector() {
    return {
      ...this.selector,
      metric: [...this._selection].sort().join(",") || this.selector.metric,
    };
  }
}

customElements.define("sidebearing-handle", SidebearingHandle);

let theKerningTool; // global singleton

function kerningVisualizationSelector(forTool) {
  return (visContext, layer) => {
    if (forTool === theKerningTool?.isActive) {
      return glyphSelector("all")(visContext, layer);
    } else {
      return [];
    }
  };
}

const kernVisualizationDefinition = {
  identifier: "fontra.kerning-indicators",
  name: "sidebar.user-settings.glyph.kerning",
  selectionFunc: kerningVisualizationSelector(false),
  userSwitchable: true,
  defaultOn: false,
  zIndex: 190,
  colors: { negativeKernColor: "#F1175933", positiveKernColor: "#1759F133" },
  colorsDarkMode: { negativeKernColor: "#FF336655", positiveKernColor: "#3366FF55" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    if (!positionedGlyph.kernValue) {
      return;
    }
    context.fillStyle =
      positionedGlyph.kernValue > 0
        ? parameters.positiveKernColor
        : parameters.negativeKernColor;

    const ascender = model.ascender;
    const descender = model.descender;
    context.fillRect(0, descender, -positionedGlyph.kernValue, ascender - descender);
  },
};

registerVisualizationLayerDefinition(kernVisualizationDefinition);
registerVisualizationLayerDefinition({
  ...kernVisualizationDefinition,
  identifier: "fontra.kerning-indicators-tool",
  name: "sidebar.user-settings.glyph.kerning-tool",
  selectionFunc: kerningVisualizationSelector(true),
  defaultOn: true,
});

class KerningTool extends MetricsBaseTool {
  iconPath = "/images/kerningtool.svg";
  identifier = "kerning-tool";

  constructor(editor) {
    super(editor);

    this.kerningController = null;

    this.sceneSettingsController.addKeyListener("featureSettings", (event) => {
      if (
        this.sceneSettings.featureSettings["kern-emulated"] == false &&
        this.sceneController.selectedTool === this
      ) {
        this.editor.setSelectedTool("pointer-tool");
      }
    });

    this.fontController.addChangeListener(
      { kerning: null },
      (change, isExternalChange) => {
        if (isExternalChange) {
          this.undoStack.clear();
          this.fontController.getKerningController("kern").then((kerningController) => {
            this.kerningController = kerningController;
          });
        }
      },
      false
    );

    assert(!theKerningTool);
    theKerningTool = this;
  }

  selectorToId(selector) {
    return kerningSelectorToId(selector);
  }

  metricAtPoint(point, size, previousLineIndex, previousGlyphIndex) {
    return this.sceneModel.kerningAtPoint(point, size);
  }

  getStepValue(event) {
    return event.altKey ? (event.shiftKey ? 50 : 5) : event.shiftKey ? 10 : 1;
  }

  async handleDrag(eventStream, initialEvent) {
    this.canvasController.canvas.focus();

    const selector = await this._prepareDrag(eventStream, initialEvent);
    if (!selector) {
      return;
    }

    const { editContext, values } = this.getEditContext();
    if (!editContext) {
      return;
    }

    this._draggingSelector = selector;
    this._prevousMetricCenter = this.getPositionedMetricCenter(this._draggingSelector);

    async function* generateValues(genDeltas, values) {
      for await (const { deltaX, event } of genDeltas) {
        if (deltaX === null) {
          // possible modifier changed event
          continue;
        }
        yield { values: values.map((v) => v + deltaX), event };
      }
    }

    const undoLabel = "edit kerning";
    const changes = await editContext.editContinuous(
      generateValues(
        this.generateDeltasFromEventStream(eventStream, initialEvent),
        values
      ),
      undoLabel
    );
    delete this._draggingSelector;

    this.pushUndoItem(changes, undoLabel);
  }

  async handleArrowKeys(event) {
    let [deltaX, deltaY] = arrowKeyDeltas[event.key];
    if (deltaY) {
      return;
    }

    deltaX *= this.getStepValue(event);

    const { editContext, values } = this.getEditContext();
    if (!editContext) {
      return;
    }

    this.updateScrollAdjustBehavior();

    const newValues = values.map((v) => v + deltaX);
    const undoLabel = "edit kerning";
    const changes = await editContext.edit(newValues, undoLabel, event);
    this.pushUndoItem(changes, undoLabel);
  }

  getEditContext(wantValues = true) {
    const sourceIdentifier = this.getSourceIdentifier();
    if (!sourceIdentifier && wantValues) {
      this.showDialogLocationNotAtSource();
      return {};
    }

    const pairSelectors = [];
    const values = [];
    for (const handle of this.selectedHandles) {
      const { leftName, rightName } = this.getPairNamesFromSelector(handle.selector);
      pairSelectors.push({ leftName, rightName, sourceIdentifier });
      if (wantValues) {
        values.push(
          this.kerningController.getPairValueForSource(
            leftName,
            rightName,
            sourceIdentifier
          ) || 0
        );
      }
    }

    if (!pairSelectors.length) {
      return {};
    }

    const editContext = this.kerningController.getEditContext(pairSelectors);

    return { editContext, values };
  }

  getGlyphNamesFromSelector(selector) {
    const { lineIndex, glyphIndex } = selector;
    assert(glyphIndex > 0);
    const glyphs = this.sceneModel.positionedLines[lineIndex].glyphs;
    const leftGlyph = glyphs[glyphIndex - 1].glyphName;
    const rightGlyph = glyphs[glyphIndex].glyphName;
    return { leftGlyph, rightGlyph };
  }

  getPairNamesFromSelector(selector) {
    const { leftGlyph, rightGlyph } = this.getGlyphNamesFromSelector(selector);
    return this.kerningController.getPairNames(
      leftGlyph,
      rightGlyph,
      this.getSourceIdentifier()
    );
  }

  async showDialogLocationNotAtSource() {
    const glyphName = this.sceneSettings.selectedGlyphName;
    const result = await dialog(
      translate("dialog.cant-edit-kerning.title"),
      translate("dialog.cant-edit-glyph.content.location-not-at-source"),
      [
        {
          title: translate("dialog.cancel"),
          resultValue: "cancel",
          isCancelButton: true,
        },
        {
          title: translate("sources.button.go-to-nearest-source"),
          resultValue: "goToNearestSource",
          isDefaultButton: true,
        },
      ]
    );
    if (result === "goToNearestSource") {
      this.editor.goToNearestSource(false);
    }
  }

  getSourceIdentifier() {
    return this.fontController.fontSourcesInstancer.getSourceIdentifierForLocation(
      this.sceneSettings.fontLocationSourceMapped,
      false
    );
  }

  addHandle(selector, select = false) {
    const handle = new KerningHandle(selector);
    this._updateHandle(handle);
    this.handleContainer.appendChild(handle);
    handle.toggleSelection(selector, select);
  }

  _updateHandle(kerningHandle) {
    const { lineIndex, glyphIndex } = kerningHandle.selector;
    const positionedGlyph =
      this.sceneModel.positionedLines[lineIndex]?.glyphs[glyphIndex];
    if (!positionedGlyph) {
      return;
    }

    const { leftName, rightName } = this.getPairNamesFromSelector(
      kerningHandle.selector
    );
    kerningHandle.update(positionedGlyph, leftName, rightName, this.canvasController);
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = this.hoveredMetric ? "ew-resize" : null;
  }

  activate() {
    super.activate();

    if (this.sceneSettings.featureSettings["kern-emulated"] == false) {
      this.sceneSettings.featureSettings = updateObject(
        this.sceneSettings.featureSettings,
        "kern-emulated",
        undefined
      );
    }

    this.fontController.getKerningController("kern").then((kerningController) => {
      this.kerningController = kerningController;
    });
  }

  get handles() {
    return [...this.handleContainer.querySelectorAll("kerning-handle")];
  }

  get hoveredHandle() {
    return this.handleContainer.querySelector("kerning-handle.hovered");
  }

  canDelete() {
    return !!this.selectedHandles.length;
  }

  async doDelete(event) {
    await this.deleteSelectedKerningPairs(event.altKey);
  }

  async deleteSelectedKerningPairs(forThisSource) {
    const { editContext, values } = this.getEditContext(forThisSource);
    if (!editContext) {
      return;
    }

    this.updateScrollAdjustBehavior();

    const undoLabel = getDeleteKerningPairLabel(
      this.selectedHandles.length,
      forThisSource
    );
    let changes;
    if (forThisSource) {
      const newValues = new Array(values.length).fill(null);
      changes = await editContext.edit(newValues, undoLabel, null);
    } else {
      changes = await editContext.delete(undoLabel);
    }
    this.pushUndoItem(changes, undoLabel);
  }

  getPositionedMetricCenter(selector) {
    const positionedGlyph = this.getPositionedGlyph(selector);
    if (!positionedGlyph) {
      return undefined;
    }
    return positionedGlyph.x - positionedGlyph.kernValue / 2;
  }

  getContextMenuItems() {
    const contextMenuItems = [];
    const selector = this.hoveredHandle?.selector || this.hoveredMetric;

    if (!selector) {
      return contextMenuItems;
    }

    if (!this.hoveredHandle?.selected) {
      this._selectHandle(selector, false);
    }

    const { leftGlyph, rightGlyph } = this.getGlyphNamesFromSelector(selector);
    const { leftName, rightName } = this.getPairNamesFromSelector(selector);

    const leftIsGroup = leftName.startsWith("@");
    const rightIsGroup = rightName.startsWith("@");

    const sourceIdentifier = this.getSourceIdentifier();

    const exceptions = [];

    for (const forThisSource of [true, false]) {
      if (forThisSource && !sourceIdentifier) {
        continue;
      }
      contextMenuItems.push({
        title: capitalizeFirstLetter(
          getDeleteKerningPairLabel(this.selectedHandles.length, forThisSource)
        ),
        callback: (event) => this.deleteSelectedKerningPairs(forThisSource),
      });

      {
      }

      if (leftIsGroup || rightIsGroup) {
        exceptions.push({});
        exceptions.push({
          leftException: leftGlyph,
          rightException: rightGlyph,
          sourceIdentifier: forThisSource ? sourceIdentifier : undefined,
        });
      }

      if (leftIsGroup && rightIsGroup) {
        exceptions.push({
          leftException: leftGlyph,
          rightException: rightName,
          sourceIdentifier,
        });
        exceptions.push({
          leftException: leftName,
          rightException: rightGlyph,
          sourceIdentifier,
        });
      }
    }

    for (const { leftException, rightException, sourceIdentifier } of exceptions) {
      if (!leftException) {
        contextMenuItems.push(MenuItemDivider);
      } else {
        const suffix = sourceIdentifier ? "for this source" : "for all sources";
        const label = `make kerning exception ${leftException} ${rightException} ${suffix}`;
        contextMenuItems.push({
          title: capitalizeFirstLetter(label),
          callback: (event) =>
            this.makeKerningException(
              leftName,
              rightName,
              leftException,
              rightException,
              sourceIdentifier,
              label
            ),
        });
      }
    }

    return contextMenuItems;
  }

  async makeKerningException(
    leftNameExisting,
    rightNameExisting,
    leftNameNew,
    rightNameNew,
    sourceIdentifier,
    undoLabel
  ) {
    const sourceIdentifiers = this.kerningController.sourceIdentifiers;
    const index = sourceIdentifier ? sourceIdentifiers.indexOf(sourceIdentifier) : -1;

    const sourceIndices = index >= 0 ? [index] : [...range(sourceIdentifiers.length)];

    const existingExceptionValues = this.kerningController.getPairValues(
      leftNameNew,
      rightNameNew
    );

    const values = existingExceptionValues
      ? [...existingExceptionValues]
      : Array(sourceIdentifiers.length).fill(null);

    while (values.length < sourceIdentifiers.length) {
      values.push(null);
    }

    const existingGroupValues = this.kerningController.getPairValues(
      leftNameExisting,
      rightNameExisting
    );

    for (const i of sourceIndices) {
      if (values[i] == null /* nullish */) {
        values[i] = existingGroupValues?.[i] ?? 0;
      }
    }

    const pairSelectors = sourceIdentifiers.map((sourceIdentifier) => ({
      sourceIdentifier,
      leftName: leftNameNew,
      rightName: rightNameNew,
    }));

    const editContext = this.kerningController.getEditContext(pairSelectors);

    const changes = await editContext.edit(values, undoLabel);

    this.pushUndoItem(changes, undoLabel);
  }

  nextSelector(selector, direction) {
    const positionedLines = this.sceneSettings.positionedLines;

    do {
      selector = this.nextGlyph(selector.lineIndex, selector.glyphIndex, direction);
    } while (
      selector &&
      (selector.glyphIndex === 0 ||
        selector.glyphIndex >= positionedLines[selector.lineIndex].glyphs.length)
    );

    return selector;
  }
}

class KerningHandle extends BaseMetricHandle {
  constructor(selector) {
    super();

    this.selector = selector;

    this.valueElement = html.div({
      class: "value",
      // ondblclick: (event) => ...edit value...,
    });
    this.leftNameElement = html.div({ class: "left-name" });
    this.rightNameElement = html.div({ class: "right-name" });

    this.appendChild(this.valueElement);
    this.appendChild(this.leftNameElement);
    this.appendChild(this.rightNameElement);

    this.id = kerningSelectorToId(selector);

    this.addEventListener("mousedown", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("wheel", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("contextmenu", (event) => this._forwardEventToCanvas(event));
    this.addEventListener("mouseenter", (event) => this.classList.add("hovered"));
    this.addEventListener("mouseleave", (event) => this.classList.remove("hovered"));
  }

  update(positionedGlyph, leftName, rightName, canvasController) {
    const { x, y } = canvasController.canvasPoint({
      x: positionedGlyph.x - positionedGlyph.kernValue / 2,
      y: positionedGlyph.y,
    });
    this.style.left = `${x}px`;
    this.style.top = `${y}px`;

    this.classList.toggle("positive", positionedGlyph.kernValue > 0);
    this.classList.toggle("negative", positionedGlyph.kernValue < 0);

    this.valueElement.innerText = formatMetricValue(positionedGlyph.kernValue);

    this.leftNameElement.innerText = leftName;
    this.leftNameElement.classList.toggle("group", leftName.startsWith("@"));
    this.rightNameElement.innerText = rightName;
    this.rightNameElement.classList.toggle("group", rightName.startsWith("@"));
  }

  updateHover(selector) {
    // nothing to do for kern handle
  }

  get selected() {
    return this.classList.contains("selected");
  }

  hasSelection(selector) {
    assert(
      this.selector.lineIndex === selector.lineIndex &&
        this.selector.glyphIndex === selector.glyphIndex
    );
    return this.selected;
  }

  toggleSelection(selector, onOff = undefined) {
    assert(
      this.selector.lineIndex === selector.lineIndex &&
        this.selector.glyphIndex === selector.glyphIndex
    );
    this.classList.toggle("selected", onOff);
  }

  get selectedSelector() {
    return this.selector;
  }
}

customElements.define("kerning-handle", KerningHandle);

function formatMetricValue(n, fallback = "-") {
  if (n == null) {
    return fallback;
  }
  n = round(n, 1);
  return n == undefined ? "\u00A0" : n.toString();
}

function kerningSelectorToId(kerningSelector) {
  const { lineIndex, glyphIndex } = kerningSelector;
  return `kerning-selector-${lineIndex}/${glyphIndex}`;
}

function sidebearingSelectorToId(kerningSelector) {
  const { lineIndex, glyphIndex } = kerningSelector;
  return `sidebearing-selector-${lineIndex}/${glyphIndex}`;
}

function metricSelectionSet(selector) {
  return new Set(selector.metric.split(","));
}

function getDeleteKerningPairLabel(numPairs, forThisSource) {
  const suffix = forThisSource ? "for this source" : "for all sources";
  const plural_s = numPairs > 1 ? "s" : "";
  return `delete kerning pair${plural_s} ${suffix}`;
}
