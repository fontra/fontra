import { ChangeCollector, applyChange, hasChange } from "../core/changes.js";
import { recordChanges } from "../core/change-recorder.js";
import { decomposeComponents } from "../core/glyph-controller.js";
import { MouseTracker } from "../core/mouse-tracker.js";
import { connectContours, splitPathAtPointIndices } from "../core/path-functions.js";
import { dialog } from "../core/ui-dialog.js";
import { normalizeLocation } from "../core/var-model.js";
import { packContour } from "../core/var-path.js";
import { lenientIsEqualSet, isEqualSet, isSuperset } from "../core/set-ops.js";
import {
  arrowKeyDeltas,
  hasShortcutModifierKey,
  parseSelection,
  reversed,
  tryFinally,
} from "../core/utils.js";
import { EditBehaviorFactory } from "./edit-behavior.js";

export class SceneController {
  constructor(sceneModel, canvasController) {
    this.sceneModel = sceneModel;
    this.canvasController = canvasController;

    this.mouseTracker = new MouseTracker({
      drag: async (eventStream, initialEvent) =>
        await this.handleDrag(eventStream, initialEvent),
      hover: (event) => this.handleHover(event),
      element: canvasController.canvas,
    });
    this._eventElement = document.createElement("div");

    this.sceneModel.fontController.addEditListener(
      async (...args) => await this.editListenerCallback(...args)
    );
    this.canvasController.canvas.addEventListener("keydown", (event) =>
      this.handleKeyDown(event)
    );
    this.selectedTool = undefined;
  }

  async editListenerCallback(editMethodName, senderID, ...args) {
    // console.log(editMethodName, senderID, ...args);
    switch (editMethodName) {
      case "editBegin":
        {
          const glyphController = this.sceneModel.getSelectedPositionedGlyph().glyph;
          this.sceneModel.ghostPath = glyphController.flattenedPath2d;
        }
        break;
      case "editEnd":
        delete this.sceneModel.ghostPath;
        break;
      case "editIncremental":
      case "editFinal":
        await this.sceneModel.updateScene();
        this.canvasController.setNeedsUpdate();
        break;
    }
  }

  setSelectedTool(tool) {
    this.selectedTool?.deactivate();
    this.selectedTool = tool;
    this.hoverSelection = new Set();
    this.selectedTool.activate();
    this.selectedTool.handleHover({});
  }

  handleKeyDown(event) {
    if (!hasShortcutModifierKey(event) && event.key in arrowKeyDeltas) {
      this.handleArrowKeys(event);
      event.preventDefault();
      return;
    }
  }

  async handleArrowKeys(event) {
    if (!this.sceneModel.selectedGlyphIsEditing || !this.selection.size) {
      return;
    }
    let [dx, dy] = arrowKeyDeltas[event.key];
    if (event.shiftKey) {
      dx *= 10;
      dy *= 10;
    }
    const delta = { x: dx, y: dy };
    await this.editInstance((sendIncrementalChange, instance) => {
      const behaviorFactory = new EditBehaviorFactory(instance, this.selection);
      const editBehavior = behaviorFactory.getBehavior(
        event.altKey ? "alternate" : "default"
      );
      const editChange = editBehavior.makeChangeForDelta(delta);
      applyChange(instance, editChange);

      let changes = ChangeCollector.fromChanges(
        editChange,
        editBehavior.rollbackChange
      );

      const connectDetector = this.getPathConnectDetector();
      if (connectDetector.shouldConnect()) {
        const connectChanges = recordChanges(instance, (instance) => {
          this.selection = connectContours(
            instance.path,
            connectDetector.connectSourcePointIndex,
            connectDetector.connectTargetPointIndex
          );
        });
        if (connectChanges.hasChange) {
          changes = changes.concat(connectChanges);
        }
      }

      return {
        changes: changes,
        undoLabel: "nudge selection",
        broadcast: true,
      };
    });
  }

  addEventListener(eventName, handler, options) {
    this._eventElement.addEventListener(eventName, handler, options);
  }

  _dispatchEvent(eventName, detail) {
    const event = new CustomEvent(eventName, {
      bubbles: false,
      detail: detail || this,
    });
    this._eventElement.dispatchEvent(event);
  }

  updateContextMenuState(event) {
    this.contextMenuState = {};
    if (!this.selectedGlyphIsEditing) {
      return;
    }
    const clickedSelection = this.sceneModel.selectionAtPoint(
      this.localPoint(event),
      this.mouseClickMargin
    );
    let relevantSelection;
    if (!clickedSelection.size) {
      // Clicked on nothing, ignore selection
      relevantSelection = clickedSelection;
    } else {
      if (!isSuperset(this.selection, clickedSelection)) {
        // Clicked on something that wasn't yet selected; select it
        this.selection = clickedSelection;
      } else {
        // Use the existing selection as context
      }
      relevantSelection = this.selection;
    }
    const { point: pointSelection, component: componentSelection } =
      parseSelection(relevantSelection);
    this.contextMenuState.pointSelection = pointSelection;
    this.contextMenuState.componentSelection = componentSelection;
  }

  getContextMenuItems(event) {
    const contextMenuItems = [
      {
        title: "Break Contour",
        enabled: () => this.contextMenuState.pointSelection?.length,
        callback: () => this.breakContour(),
      },
      {
        title: "Reverse Contour Direction",
        enabled: () => this.contextMenuState.pointSelection?.length,
        callback: () => this.reverseSelectedContoursDirection(),
      },
      {
        title: "Set Start Point",
        enabled: () => this.contextMenuState.pointSelection?.length,
        callback: () => this.setStartPoint(),
      },
      {
        title: () =>
          "Decompose Component" +
          (this.contextMenuState.componentSelection?.length === 1 ? "" : "s"),
        enabled: () => this.contextMenuState.componentSelection?.length,
        callback: () => this.decomposeSelectedComponents(),
      },
    ];
    return contextMenuItems;
  }

  getSelectedGlyphName() {
    return this.sceneModel.getSelectedGlyphName();
  }

  getSelectedGlyphState() {
    return this.sceneModel.getSelectedGlyphState();
  }

  setSelectedGlyphState(state) {
    this.sceneModel.setSelectedGlyphState(state);
    this.canvasController.setNeedsUpdate();
  }

  async handleDrag(eventStream, initialEvent) {
    if (this.selectedTool) {
      await this.selectedTool.handleDrag(eventStream, initialEvent);
    }
  }

  handleHover(event) {
    if (this.selectedTool) {
      this.selectedTool.handleHover(event);
    }
  }

  localPoint(event) {
    if (event.x !== undefined) {
      this._currentLocalPoint = this.canvasController.localPoint(event);
    }
    return this._currentLocalPoint || { x: 0, y: 0 };
  }

  selectedGlyphPoint(event) {
    // Return the event location in the selected-glyph coordinate system
    const canvasPoint = this.localPoint(event);
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    if (positionedGlyph === undefined) {
      return undefined;
    }
    return {
      x: canvasPoint.x - positionedGlyph.x,
      y: canvasPoint.y - positionedGlyph.y,
    };
  }

  get onePixelUnit() {
    return this.canvasController.onePixelUnit;
  }

  get mouseClickMargin() {
    return this.onePixelUnit * 10;
  }

  get selection() {
    return this.sceneModel.selection;
  }

  set selection(selection) {
    if (!lenientIsEqualSet(selection, this.selection)) {
      this.sceneModel.selection = selection || new Set();
      this.sceneModel.hoverSelection = new Set();
      this.canvasController.setNeedsUpdate();
      this._dispatchEvent("selectionChanged");
    }
  }

  get hoverSelection() {
    return this.sceneModel.hoverSelection;
  }

  set hoverSelection(selection) {
    if (!lenientIsEqualSet(selection, this.hoverSelection)) {
      this.sceneModel.hoverSelection = selection;
      this.canvasController.setNeedsUpdate();
    }
  }

  get hoveredGlyph() {
    return this.sceneModel.hoveredGlyph;
  }

  set hoveredGlyph(hoveredGlyph) {
    if (this.sceneModel.hoveredGlyph != hoveredGlyph) {
      this.sceneModel.hoveredGlyph = hoveredGlyph;
      this.canvasController.setNeedsUpdate();
    }
  }

  get selectedGlyph() {
    return this.sceneModel.selectedGlyph;
  }

  set selectedGlyph(selectedGlyph) {
    if (this.sceneModel.selectedGlyph != selectedGlyph) {
      this.sceneModel.selectedGlyph = selectedGlyph;
      this.sceneModel.selection = new Set();
      this.canvasController.setNeedsUpdate();
      this._dispatchEvent("selectedGlyphChanged");
    }
  }

  get selectedGlyphIsEditing() {
    return this.sceneModel.selectedGlyphIsEditing;
  }

  set selectedGlyphIsEditing(flag) {
    if (this.sceneModel.selectedGlyphIsEditing != flag) {
      this.sceneModel.selectedGlyphIsEditing = flag;
      this.canvasController.setNeedsUpdate();
      this._dispatchEvent("selectedGlyphIsEditingChanged");
    }
  }

  get selectionRect() {
    return this.sceneModel.selectionRect;
  }

  set selectionRect(selRect) {
    this.sceneModel.selectionRect = selRect;
    this.canvasController.setNeedsUpdate();
  }

  getGlyphLines() {
    return this.sceneModel.getGlyphLines();
  }

  async setGlyphLines(glyphLines) {
    await this.sceneModel.setGlyphLines(glyphLines);
    this.canvasController.setNeedsUpdate();
  }

  async setTextAlignment(align) {
    await this.sceneModel.setTextAlignment(align);
    this.canvasController.setNeedsUpdate();
  }

  getLocation() {
    return this.sceneModel.getLocation();
  }

  getGlobalLocation() {
    return this.sceneModel.getGlobalLocation();
  }

  getLocalLocations(filterShownGlyphs = false) {
    return this.sceneModel.getLocalLocations(filterShownGlyphs);
  }

  async setLocation(values) {
    await this.sceneModel.setLocation(values);
    this.canvasController.setNeedsUpdate();
  }

  async setGlobalAndLocalLocations(globalLocation, localLocations) {
    await this.sceneModel.setGlobalAndLocalLocations(globalLocation, localLocations);
    this.canvasController.setNeedsUpdate();
  }

  updateLocalLocations(localLocations) {
    this.sceneModel.updateLocalLocations(localLocations);
  }

  getSelectedSource() {
    return this.sceneModel.getSelectedSource();
  }

  async setSelectedSource(sourceIndex) {
    await this.sceneModel.setSelectedSource(sourceIndex);
    this.canvasController.setNeedsUpdate();
  }

  getAxisInfo() {
    return this.sceneModel.getAxisInfo();
  }

  getSourcesInfo() {
    return this.sceneModel.getSourcesInfo();
  }

  getSceneBounds() {
    return this.sceneModel.getSceneBounds();
  }

  cancelEditing(reason) {
    if (this._glyphEditingDonePromise) {
      this._cancelGlyphEditing = reason;
    }
    return this._glyphEditingDonePromise;
  }

  async editInstance(editFunc, senderID) {
    if (this._glyphEditingDonePromise) {
      throw new Error("can't call editInstance() while it's still running");
    }
    let editingDone;
    this._glyphEditingDonePromise = new Promise((resolve) => {
      editingDone = resolve;
    });
    await tryFinally(
      async () => {
        return await this._editInstance(editFunc, senderID);
      },
      () => {
        editingDone();
        delete this._glyphEditingDonePromise;
        delete this._cancelGlyphEditing;
      }
    );
  }

  async _editInstance(editFunc, senderID) {
    const glyphController = this.sceneModel.getSelectedPositionedGlyph().glyph;
    if (!glyphController.canEdit) {
      // TODO: add options to dialog:
      // - go to closest source
      // - insert new source here
      // - cancel
      const result = await dialog(
        `Can’t edit glyph “${this.getSelectedGlyphName()}”`,
        "Location is not at a source.",
        [{ title: "Okay", resultValue: "ok" }],
        2500 /* auto dismiss after a timeout */
      );
      return;
    }
    const editContext = await this.sceneModel.fontController.getGlyphEditContext(
      glyphController,
      senderID || this
    );
    const sendIncrementalChange = async (change, mayDrop = false) => {
      if (change && hasChange(change)) {
        await editContext.editIncremental(change, mayDrop);
      }
    };
    const initialSelection = this.selection;
    // editContext.editBegin();
    let result;
    try {
      result = await editFunc(sendIncrementalChange, editContext.instance);
    } catch (error) {
      this.selection = initialSelection;
      editContext.editCancel();
      throw error;
    }

    const {
      changes: changes,
      selection: newSelection, // Optional
      undoLabel: undoLabel,
      broadcast: broadcast,
    } = result || {};

    if (changes && changes.hasChange) {
      if (newSelection) {
        this.selection = newSelection;
      }
      const undoInfo = {
        label: undoLabel,
        undoSelection: initialSelection,
        redoSelection: this.selection,
        location: this.getLocation(),
      };
      if (!this._cancelGlyphEditing) {
        editContext.editFinal(
          changes.change,
          changes.rollbackChange,
          undoInfo,
          broadcast
        );
      } else {
        applyChange(editContext.instance, changes.rollbackChange);
        await editContext.editIncremental(changes.rollbackChange, false);
        editContext.editCancel();
        dialog(
          "The glyph could not be saved.",
          `The edit has been reverted.\n\n${this._cancelGlyphEditing}`,
          [{ title: "Okay", resultValue: "ok" }]
        );
      }
    } else {
      this.selection = initialSelection;
      editContext.editCancel();
    }
  }

  getSelectionBox() {
    return this.sceneModel.getSelectionBox();
  }

  getUndoRedoInfo(isRedo) {
    const glyphName = this.getSelectedGlyphName();
    if (glyphName === undefined) {
      return;
    }
    return this.sceneModel.fontController.getUndoRedoInfo(glyphName, isRedo);
  }

  async doUndoRedo(isRedo) {
    const glyphName = this.getSelectedGlyphName();
    if (glyphName === undefined) {
      return;
    }
    const undoInfo = await this.sceneModel.fontController.undoRedoGlyph(
      glyphName,
      isRedo
    );
    if (undoInfo !== undefined) {
      this.selection = undoInfo.undoSelection;
      if (undoInfo.location) {
        await this.setLocation(undoInfo.location);
      }
      await this.sceneModel.updateScene();
      this.canvasController.setNeedsUpdate();
    }
    return undoInfo !== undefined;
  }

  async doDelete() {
    await this.editInstance((sendIncrementalChange, instance) => {
      const { point: pointSelection } = parseSelection(this.selection);

      const changes = recordChanges(instance, (instance) => {
        const path = instance.path;
        const selectedContours = getSelectedContours(path, pointSelection);

        for (const pointIndex of reversed(pointSelection)) {
          const [contourIndex, contourPointIndex] =
            path.getContourAndPointIndex(pointIndex);
          const numContourPoints = path.getNumPointsOfContour(contourIndex);
          console.log(pointIndex);

          if (numContourPoints > 1) {
            if (selectedContours.length > 1) {
              path.deleteContour(contourIndex);
            } else {
              path.deletePoint(contourIndex, contourPointIndex);
            }
          } else {
            path.deleteContour(contourIndex);
          }
        }
      });
      return {
        changes: changes,
        selection: new Set(),
        undoLabel: "Delete Selection",
        broadcast: true,
      };
    });
  }

  async reverseSelectedContoursDirection() {
    await this.editInstance((sendIncrementalChange, instance) => {
      const path = instance.path;
      const { point: pointSelection } = parseSelection(this.selection);
      const selectedContours = getSelectedContours(path, pointSelection);
      const newSelection = reversePointSelection(path, pointSelection);

      const changes = recordChanges(instance, (instance) => {
        for (const contourIndex of selectedContours) {
          const contour = path.getUnpackedContour(contourIndex);
          contour.points.reverse();
          if (contour.isClosed) {
            const [lastPoint] = contour.points.splice(-1, 1);
            contour.points.splice(0, 0, lastPoint);
          }
          const packedContour = packContour(contour);
          instance.path.deleteContour(contourIndex);
          instance.path.insertContour(contourIndex, packedContour);
        }
      });
      return {
        changes: changes,
        selection: newSelection,
        undoLabel: "Reverse Contour Direction",
        broadcast: true,
      };
    });
  }

  async setStartPoint() {
    await this.editInstance((sendIncrementalChange, instance) => {
      const path = instance.path;
      const { point: pointSelection } = parseSelection(this.selection);
      const contourToPointMap = new Map();
      for (const pointIndex of pointSelection) {
        const contourIndex = path.getContourIndex(pointIndex);
        const contourStartPoint = path.getAbsolutePointIndex(contourIndex, 0);
        if (contourToPointMap.has(contourIndex)) {
          continue;
        }
        contourToPointMap.set(contourIndex, pointIndex - contourStartPoint);
      }
      const newSelection = new Set();

      const changes = recordChanges(instance, (instance) => {
        contourToPointMap.forEach((contourPointIndex, contourIndex) => {
          if (contourPointIndex === 0) {
            // Already start point
            newSelection.add(`point/${path.getAbsolutePointIndex(contourIndex, 0)}`);
            return;
          }
          if (!path.contourInfo[contourIndex].isClosed) {
            // Open path, ignore
            return;
          }
          const contour = path.getUnpackedContour(contourIndex);
          const head = contour.points.splice(0, contourPointIndex);
          contour.points.push(...head);
          instance.path.deleteContour(contourIndex);
          instance.path.insertContour(contourIndex, packContour(contour));
          newSelection.add(`point/${path.getAbsolutePointIndex(contourIndex, 0)}`);
        });
      });

      return {
        changes: changes,
        selection: newSelection,
        undoLabel: "Set Start Point",
        broadcast: true,
      };
    });
  }

  async breakContour() {
    await this.editInstance(async (sendIncrementalChange, instance) => {
      let numSplits;
      const { point: pointIndices } = parseSelection(this.selection);
      const changes = recordChanges(instance, (instance) => {
        numSplits = splitPathAtPointIndices(instance.path, pointIndices);
      });
      return {
        changes: changes,
        selection: new Set(),
        undoLabel: "Break Contour" + (numSplits > 1 ? "s" : ""),
        broadcast: true,
      };
    });
  }

  async decomposeSelectedComponents() {
    await this.editInstance(async (sendIncrementalChange, instance) => {
      const { component: componentSelection } = parseSelection(this.selection);
      componentSelection.sort((a, b) => (a > b) - (a < b));

      const { path: newPath, components: newComponents } = await decomposeComponents(
        instance.components,
        componentSelection,
        this.getGlobalLocation(),
        (glyphName) => this.sceneModel.fontController.getGlyph(glyphName)
      );

      const changes = recordChanges(instance, (instance) => {
        const path = instance.path;
        const components = instance.components;

        for (const contour of newPath.iterContours()) {
          // Hm, rounding should be optional
          // contour.coordinates = contour.coordinates.map(c => Math.round(c));
          path.appendContour(contour);
        }
        components.push(...newComponents);

        // Next, delete the components we decomposed
        for (const componentIndex of reversed(componentSelection)) {
          components.splice(componentIndex, 1);
        }
      });

      return {
        changes: changes,
        selection: new Set(),
        undoLabel:
          "Decompose Component" + (componentSelection?.length === 1 ? "" : "s"),
        broadcast: true,
      };
    });
  }

  getPathConnectDetector() {
    return new PathConnectDetector(this);
  }
}

class PathConnectDetector {
  constructor(sceneController) {
    this.sceneController = sceneController;
    const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
    this.path = positionedGlyph.glyph.path;
    const selection = sceneController.selection;
    if (selection.size !== 1) {
      return;
    }
    const { point: pointSelection } = parseSelection(selection);
    if (
      pointSelection?.length !== 1 ||
      !this.path.isStartOrEndPoint(pointSelection[0])
    ) {
      return;
    }
    this.connectSourcePointIndex = pointSelection[0];
  }

  shouldConnect(showConnectIndicator = false) {
    if (this.connectSourcePointIndex === undefined) {
      return false;
    }

    const sceneController = this.sceneController;
    const connectSourcePoint = this.path.getPoint(this.connectSourcePointIndex);
    const connectTargetPointIndex = this.path.firstPointIndexNearPoint(
      connectSourcePoint,
      sceneController.mouseClickMargin,
      this.connectSourcePointIndex
    );
    const shouldConnect =
      connectTargetPointIndex !== undefined &&
      connectTargetPointIndex !== this.connectSourcePointIndex &&
      !!this.path.isStartOrEndPoint(connectTargetPointIndex);
    if (showConnectIndicator && shouldConnect) {
      sceneController.sceneModel.pathConnectTargetPoint = this.path.getPoint(
        connectTargetPointIndex
      );
    } else {
      delete sceneController.sceneModel.pathConnectTargetPoint;
    }
    this.connectTargetPointIndex = connectTargetPointIndex;
    return shouldConnect;
  }

  clearConnectIndicator() {
    delete this.sceneController.sceneModel.pathConnectTargetPoint;
  }
}

function reversePointSelection(path, pointSelection) {
  const newSelection = [];
  for (const pointIndex of pointSelection) {
    const contourIndex = path.getContourIndex(pointIndex);
    const contourStartPoint = path.getAbsolutePointIndex(contourIndex, 0);
    const numPoints = path.getNumPointsOfContour(contourIndex);
    let newPointIndex = pointIndex;
    if (path.contourInfo[contourIndex].isClosed) {
      if (newPointIndex != contourStartPoint) {
        newPointIndex =
          contourStartPoint + numPoints - (newPointIndex - contourStartPoint);
      }
    } else {
      newPointIndex =
        contourStartPoint + numPoints - 1 - (newPointIndex - contourStartPoint);
    }
    newSelection.push(`point/${newPointIndex}`);
  }
  newSelection.sort((a, b) => (a > b) - (a < b));
  return new Set(newSelection);
}

function getSelectedContours(path, pointSelection) {
  const selectedContours = new Set();
  for (const pointIndex of pointSelection) {
    selectedContours.add(path.getContourIndex(pointIndex));
  }
  return [...selectedContours];
}
