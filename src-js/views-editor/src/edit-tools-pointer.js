import { recordChanges } from "@fontra/core/change-recorder.js";
import {
  ChangeCollector,
  applyChange,
  consolidateChanges,
} from "@fontra/core/changes.js";
import { translate } from "@fontra/core/localization.js";
import { connectContours, toggleSmooth } from "@fontra/core/path-functions.js";
import {
  centeredRect,
  normalizeRect,
  offsetRect,
  pointInRect,
  rectSize,
} from "@fontra/core/rectangle.js";
import {
  difference,
  isSuperset,
  symmetricDifference,
  union,
} from "@fontra/core/set-ops.js";
import { Transform } from "@fontra/core/transform.js";
import {
  assert,
  boolInt,
  commandKeyProperty,
  enumerate,
  parseSelection,
  range,
} from "@fontra/core/utils.js";
import { copyBackgroundImage, copyComponent } from "@fontra/core/var-glyph.js";
import { VarPackedPath } from "@fontra/core/var-path.js";
import * as vector from "@fontra/core/vector.js";
import { EditBehaviorFactory } from "./edit-behavior.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { getPinPoint } from "./panel-transformation.js";
import { equalGlyphSelection } from "./scene-controller.js";
import {
  glyphSelector,
  registerVisualizationLayerDefinition,
  strokeRoundNode,
  strokeSquareNode,
} from "./visualization-layer-definitions.js";

const transformHandleMargin = 6;
const transformHandleSize = 8;
const rotationHandleSizeFactor = 1.2;

export class PointerTools {
  identifier = "pointer-tools";
  subTools = [PointerTool, PointerToolScale];
}

export class PointerTool extends BaseTool {
  iconPath = "/images/pointer.svg";
  identifier = "pointer-tool";

  handleHover(event) {
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(event);
    const size = sceneController.mouseClickMargin;
    const selRect = centeredRect(point.x, point.y, size);
    const { selection, pathHit } = this.sceneModel.selectionAtPoint(
      point,
      size,
      sceneController.selection,
      sceneController.hoverSelection,
      event.altKey
    );
    sceneController.hoverSelection = selection;
    sceneController.hoverPathHit = pathHit;

    if (!sceneController.hoverSelection.size && !sceneController.hoverPathHit) {
      sceneController.hoveredGlyph = this.sceneModel.glyphAtPoint(point);
    } else {
      sceneController.hoveredGlyph = undefined;
    }

    this.sceneController.sceneModel.showTransformSelection = true;

    const resizeHandle = this.getResizeHandle(event, sceneController.selection);
    const rotationHandle = !resizeHandle
      ? this.getRotationHandle(event, sceneController.selection)
      : undefined;
    if (this.sceneController.sceneModel.hoverResizeHandle != resizeHandle) {
      this.sceneController.sceneModel.hoverResizeHandle = resizeHandle;
      this.canvasController.requestUpdate();
    }
    if (rotationHandle) {
      this.setCursorForRotationHandle(rotationHandle);
    } else if (resizeHandle) {
      this.setCursorForResizeHandle(resizeHandle);
    } else {
      this.setCursor();
    }
  }

  setCursorForRotationHandle(handleName) {
    this.setCursor(`url('/images/cursor-rotate-${handleName}.svg') 16 16, auto`);
  }

  setCursorForResizeHandle(handleName) {
    if (handleName === "bottom-left" || handleName === "top-right") {
      this.setCursor("nesw-resize");
    } else if (handleName === "bottom-right" || handleName === "top-left") {
      this.setCursor("nwse-resize");
    } else if (handleName === "bottom-center" || handleName === "top-center") {
      this.setCursor("ns-resize");
    } else if (handleName === "middle-left" || handleName === "middle-right") {
      this.setCursor("ew-resize");
    } else {
      this.setCursor();
    }
  }

  setCursor(cursor = undefined) {
    if (cursor) {
      this.canvasController.canvas.style.cursor = cursor;
    } else if (
      this.sceneController.hoverSelection?.size ||
      this.sceneController.hoverPathHit
    ) {
      this.canvasController.canvas.style.cursor = "pointer";
    } else {
      this.canvasController.canvas.style.cursor = "default";
    }
  }

  async handleDrag(eventStream, initialEvent) {
    const sceneController = this.sceneController;
    const initialSelection = sceneController.selection;
    const resizeHandle = this.getResizeHandle(initialEvent, initialSelection);
    const rotationHandle = this.getRotationHandle(initialEvent, initialSelection);
    if (resizeHandle || rotationHandle) {
      sceneController.sceneModel.clickedTransformSelectionHandle =
        resizeHandle || rotationHandle;
      await this.handleBoundsTransformSelection(
        initialSelection,
        eventStream,
        initialEvent,
        !!rotationHandle
      );
      delete sceneController.sceneModel.clickedTransformSelectionHandle;
      initialEvent.preventDefault();
      return;
    }

    const point = sceneController.localPoint(initialEvent);
    const size = sceneController.mouseClickMargin;
    const { selection, pathHit } = this.sceneModel.selectionAtPoint(
      point,
      size,
      sceneController.selection,
      sceneController.hoverSelection,
      initialEvent.altKey
    );
    let initialClickedPointIndex;
    if (!pathHit) {
      const { point: pointIndices } = parseSelection(selection);
      if (pointIndices?.length) {
        initialClickedPointIndex = pointIndices[0];
      }
    }
    if (initialEvent.detail == 2 || initialEvent.myTapCount == 2) {
      initialEvent.preventDefault(); // don't let our dbl click propagate to other elements
      eventStream.done();
      await this.handleDoubleClick(selection, point, initialEvent);
      return;
    }

    if (!this.sceneSettings.selectedGlyph?.isEditing) {
      this.sceneSettings.selectedGlyph = this.sceneModel.glyphAtPoint(point);
      eventStream.done();
      return;
    }

    let initiateDrag = false;
    let initiateRectSelect = false;

    const modeFunc = getSelectModeFunction(event);
    const newSelection = modeFunc(sceneController.selection, selection);
    const cleanSel = selection;
    if (
      !selection.size ||
      event.shiftKey ||
      event.altKey ||
      !isSuperset(sceneController.selection, cleanSel)
    ) {
      this._selectionBeforeSingleClick = sceneController.selection;
      sceneController.selection = newSelection;
    }

    if (isSuperset(sceneController.selection, cleanSel)) {
      initiateDrag = true;
    }
    if (!selection.size) {
      initiateRectSelect = true;
    }

    if (initiateRectSelect || initiateDrag) {
      if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
        initiateRectSelect = false;
        initiateDrag = false;
        if (!selection.size) {
          const selectedGlyph = this.sceneModel.glyphAtPoint(point);
          if (
            selectedGlyph &&
            !equalGlyphSelection(selectedGlyph, this.sceneSettings.selectedGlyph)
          ) {
            this.sceneSettings.selectedGlyph = selectedGlyph;
            eventStream.done();
            return;
          }
        }
      }
    }

    sceneController.hoveredGlyph = undefined;
    if (initiateRectSelect) {
      return await this.handleRectSelect(eventStream, initialEvent, initialSelection);
    } else if (initiateDrag) {
      this.sceneController.sceneModel.initialClickedPointIndex =
        initialClickedPointIndex;
      const result = await this.handleDragSelection(eventStream, initialEvent);
      delete this.sceneController.sceneModel.initialClickedPointIndex;
      return result;
    }
  }

  async handleDoubleClick(selection, point, event) {
    const sceneController = this.sceneController;
    if (!sceneController.hoverPathHit && (!selection || !selection.size)) {
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph?.isUndefined) {
        sceneController._dispatchEvent("doubleClickedUndefinedGlyph");
      } else {
        const selectedGlyph = this.sceneModel.glyphAtPoint(point);
        this.sceneSettings.selectedGlyph = selectedGlyph
          ? { ...selectedGlyph, isEditing: true }
          : undefined;
      }
    } else {
      const instance = this.sceneModel.getSelectedPositionedGlyph().glyph.instance;
      const {
        point: pointIndices,
        component: componentIndices,
        anchor: anchorIndices,
        guideline: guidelineIndices,
        // TODO: Font Guidelines
        // fontGuideline: fontGuidelineIndices,
      } = parseSelection(sceneController.selection);
      if (componentIndices?.length && !pointIndices?.length && !anchorIndices?.length) {
        componentIndices.sort();
        sceneController.doubleClickedComponentIndices = componentIndices;
        sceneController._dispatchEvent("doubleClickedComponents");
      } else if (
        anchorIndices?.length &&
        !pointIndices?.length &&
        !componentIndices?.length
      ) {
        anchorIndices.sort();
        sceneController.doubleClickedAnchorIndices = anchorIndices;
        sceneController._dispatchEvent("doubleClickedAnchors");
      } else if (
        guidelineIndices?.length &&
        !pointIndices?.length &&
        !componentIndices?.length
      ) {
        guidelineIndices.sort();
        sceneController.doubleClickedGuidelineIndices = guidelineIndices;
        sceneController._dispatchEvent("doubleClickedGuidelines");
      } else if (pointIndices?.length && !sceneController.hoverPathHit) {
        await this.handlePointsDoubleClick(pointIndices);
      } else if (sceneController.hoverPathHit) {
        const contourIndex = sceneController.hoverPathHit.contourIndex;
        const startPoint = instance.path.getAbsolutePointIndex(contourIndex, 0);
        const endPoint = instance.path.contourInfo[contourIndex].endPoint;
        const newSelection = new Set();
        for (const i of range(startPoint, endPoint + 1)) {
          const pointType = instance.path.pointTypes[i] & VarPackedPath.POINT_TYPE_MASK;
          if (pointType === VarPackedPath.ON_CURVE) {
            newSelection.add(`point/${i}`);
          }
        }
        const selection = this._selectionBeforeSingleClick || sceneController.selection;
        this._selectionBeforeSingleClick = undefined;
        const modeFunc = getSelectModeFunction(event);
        sceneController.selection = modeFunc(selection, newSelection);
      }
    }
  }

  async handlePointsDoubleClick(pointIndices) {
    let newPointType;
    await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      for (const layerGlyph of Object.values(layerGlyphs)) {
        newPointType = toggleSmooth(layerGlyph.path, pointIndices, newPointType);
      }
      return translate("edit-tools-pointer.undo.toggle-smooth");
    });
  }

  async handleRectSelect(eventStream, initialEvent, initialSelection) {
    const sceneController = this.sceneController;
    const initialPoint = sceneController.localPoint(initialEvent);
    for await (const event of eventStream) {
      const modifierEvent = sceneController.applicationSettings
        .rectSelectLiveModifierKeys
        ? event
        : initialEvent;
      const currentPoint = sceneController.localPoint(event);
      const selRect = normalizeRect({
        xMin: initialPoint.x,
        yMin: initialPoint.y,
        xMax: currentPoint.x,
        yMax: currentPoint.y,
      });
      const selection = this.sceneModel.selectionAtRect(
        selRect,
        modifierEvent.altKey ? (point) => !!point.type : (point) => !point.type
      );
      const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
      sceneController.selectionRect = offsetRect(
        selRect,
        -positionedGlyph.x,
        -positionedGlyph.y
      );

      const modeFunc = getSelectModeFunction(modifierEvent);
      sceneController.selection = modeFunc(initialSelection, selection);
    }
    sceneController.selectionRect = undefined;
    this._selectionBeforeSingleClick = undefined;
  }

  async handleDragSelection(eventStream, initialEvent) {
    this.sceneController.sceneModel.showTransformSelection = false;
    this._selectionBeforeSingleClick = undefined;
    const sceneController = this.sceneController;
    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const initialPoint = sceneController.selectedGlyphPoint(initialEvent);
      let behaviorName = getBehaviorName(initialEvent);

      const layerInfo = Object.entries(
        sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        const behaviorFactory = new EditBehaviorFactory(
          layerGlyph,
          sceneController.selection,
          this.scalingEditBehavior
        );
        return {
          layerName,
          layerGlyph,
          changePath: ["layers", layerName, "glyph"],
          pathPrefix: [],
          connectDetector: sceneController.getPathConnectDetector(layerGlyph.path),
          shouldConnect: false,
          behaviorFactory,
          editBehavior: behaviorFactory.getBehavior(behaviorName),
        };
      });

      assert(layerInfo.length >= 1, "no layer to edit");

      layerInfo[0].isPrimaryLayer = true;

      this.sceneController.scrollAdjustBehavior = "pin-glyph-origin";
      let editChange;

      for await (const event of eventStream) {
        const newEditBehaviorName = getBehaviorName(event);
        if (behaviorName !== newEditBehaviorName) {
          // Behavior changed, undo current changes
          behaviorName = newEditBehaviorName;
          const rollbackChanges = [];
          for (const layer of layerInfo) {
            applyChange(layer.layerGlyph, layer.editBehavior.rollbackChange);
            rollbackChanges.push(
              consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
            );
            layer.editBehavior = layer.behaviorFactory.getBehavior(behaviorName);
          }
          await sendIncrementalChange(consolidateChanges(rollbackChanges));
        }
        const currentPoint = sceneController.selectedGlyphPoint(event);
        const delta = {
          x: currentPoint.x - initialPoint.x,
          y: currentPoint.y - initialPoint.y,
        };

        const deepEditChanges = [];
        for (const layer of layerInfo) {
          const editChange = layer.editBehavior.makeChangeForDelta(delta);
          applyChange(layer.layerGlyph, editChange);
          deepEditChanges.push(consolidateChanges(editChange, layer.changePath));
          layer.shouldConnect = layer.connectDetector.shouldConnect(
            layer.isPrimaryLayer
          );
        }

        editChange = consolidateChanges(deepEditChanges);

        await sendIncrementalChange(editChange, true); // true: "may drop"
      }
      let changes = ChangeCollector.fromChanges(
        editChange,
        consolidateChanges(
          layerInfo.map((layer) =>
            consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
          )
        )
      );
      let shouldConnect;
      for (const layer of layerInfo) {
        if (!layer.shouldConnect) {
          continue;
        }
        shouldConnect = true;
        if (layer.isPrimaryLayer) {
          layer.connectDetector.clearConnectIndicator();
        }

        const connectChanges = recordChanges(layer.layerGlyph, (layerGlyph) => {
          const selection = connectContours(
            layerGlyph.path,
            layer.connectDetector.connectSourcePointIndex,
            layer.connectDetector.connectTargetPointIndex
          );
          if (layer.isPrimaryLayer) {
            sceneController.selection = selection;
          }
        });
        if (connectChanges.hasChange) {
          changes = changes.concat(connectChanges.prefixed(layer.changePath));
        }
      }
      return {
        undoLabel: shouldConnect
          ? translate("edit-tools-pointer.undo.drag-selection-and-connect-contours")
          : translate("edit-tools-pointer.undo.drag-selection"),
        changes: changes,
        broadcast: true,
      };
    });
    this.sceneController.sceneModel.showTransformSelection = true;
  }

  async handleBoundsTransformSelection(
    selection,
    eventStream,
    initialEvent,
    rotation = false
  ) {
    const sceneController = this.sceneController;
    const clickedHandle = sceneController.sceneModel.clickedTransformSelectionHandle;

    // The following may seem wrong, but it's correct, because we say
    // for example bottom-left and not left-bottom. Y-X order.
    const [handlePositionY, handlePositionX] = clickedHandle.split("-");

    const origin = { x: handlePositionX, y: handlePositionY };
    // origin must be the opposite side of where we have our mouse
    if (handlePositionX === "left") {
      origin.x = "right";
    } else if (handlePositionX === "right") {
      origin.x = "left";
    }
    if (handlePositionY === "top") {
      origin.y = "bottom";
    } else if (handlePositionY === "bottom") {
      origin.y = "top";
    }
    // no else because could be middle or center

    // must be set to the opposite side of the mouse if left or bottom
    const fixDragLeftValue = clickedHandle.includes("left") ? -1 : 1;
    const fixDragBottomValue = clickedHandle.includes("bottom") ? -1 : 1;

    const glyphController =
      await sceneController.sceneModel.getSelectedStaticGlyphController();

    // The following is only needed in case of rotation, because we want to have
    // the roation angle for all layers the same and not different.
    let regularPinPointSelectedLayer, altPinPointSelectedLayer;
    if (rotation) {
      const selectedLayerBounds = glyphController.getSelectionBounds(
        selection,
        this.editor.fontController.getBackgroundImageBoundsFunc
      );
      regularPinPointSelectedLayer = getPinPoint(
        selectedLayerBounds,
        origin.x,
        origin.y
      );
      altPinPointSelectedLayer = getPinPoint(selectedLayerBounds, undefined, undefined);
    }

    const staticGlyphControllers = await sceneController.getStaticGlyphControllers();

    await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
      const initialPoint = sceneController.selectedGlyphPoint(initialEvent);

      const layerInfo = Object.entries(
        sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
      ).map(([layerName, layerGlyph]) => {
        const behaviorFactory = new EditBehaviorFactory(
          layerGlyph,
          sceneController.selection,
          this.scalingEditBehavior
        );
        const layerBounds = (
          staticGlyphControllers[layerName] || glyphController
        ).getSelectionBounds(
          selection,
          this.editor.fontController.getBackgroundImageBoundsFunc
        );

        return {
          layerName,
          changePath: ["layers", layerName, "glyph"],
          layerGlyph: layerGlyph,
          editBehavior: behaviorFactory.getTransformBehavior("default"),
          regularPinPoint: getPinPoint(layerBounds, origin.x, origin.y),
          altPinPoint: getPinPoint(layerBounds, undefined, undefined),
          regularPinPointSelectedLayer: regularPinPointSelectedLayer,
          altPinPointSelectedLayer: altPinPointSelectedLayer,
          selectionWidth: layerBounds.xMax - layerBounds.xMin,
          selectionHeight: layerBounds.yMax - layerBounds.yMin,
        };
      });

      this.sceneController.scrollAdjustBehavior = "pin-glyph-origin";
      let editChange;

      for await (const event of eventStream) {
        const currentPoint = sceneController.selectedGlyphPoint(event);

        const deepEditChanges = [];
        for (const layer of layerInfo) {
          const layerGlyph = layer.layerGlyph;
          const pinPoint = event.altKey ? layer.altPinPoint : layer.regularPinPoint;
          let transformation;
          if (rotation) {
            // Rotate (based on pinPoint of selected layer)
            this.sceneController.sceneModel.showTransformSelection = false;
            const pinPointSelectedLayer = event.altKey
              ? layer.altPinPointSelectedLayer
              : layer.regularPinPointSelectedLayer;
            const angle = Math.atan2(
              pinPointSelectedLayer.y - currentPoint.y,
              pinPointSelectedLayer.x - currentPoint.x
            );
            const angleInitial = Math.atan2(
              pinPointSelectedLayer.y - initialPoint.y,
              pinPointSelectedLayer.x - initialPoint.x
            );
            // Snap to 45 degrees by rounding to the nearest 45 degree angle if shift is pressed
            const rotationAngle = !event.shiftKey
              ? angle - angleInitial
              : Math.round((angle - angleInitial) / (Math.PI / 4)) * (Math.PI / 4);
            transformation = new Transform().rotate(rotationAngle);
          } else {
            // Scale (based on pinPoint)
            const delta = {
              x: (currentPoint.x - initialPoint.x) * fixDragLeftValue,
              y: (currentPoint.y - initialPoint.y) * fixDragBottomValue,
            };

            let scaleX = (layer.selectionWidth + delta.x) / layer.selectionWidth;
            let scaleY = (layer.selectionHeight + delta.y) / layer.selectionHeight;

            if (clickedHandle.includes("middle")) {
              scaleY = event.shiftKey ? scaleX : 1;
            } else if (clickedHandle.includes("center")) {
              scaleX = event.shiftKey ? scaleY : 1;
            } else if (event.shiftKey) {
              scaleX = scaleY = Math.max(scaleX, scaleY);
            }
            transformation = new Transform().scale(scaleX, scaleY);
          }

          const pinnedTransformation = new Transform()
            .translate(pinPoint.x, pinPoint.y)
            .transform(transformation)
            .translate(-pinPoint.x, -pinPoint.y);

          const editChange =
            layer.editBehavior.makeChangeForTransformation(pinnedTransformation);

          applyChange(layerGlyph, editChange);
          deepEditChanges.push(consolidateChanges(editChange, layer.changePath));
        }

        editChange = consolidateChanges(deepEditChanges);
        await sendIncrementalChange(editChange, true); // true: "may drop"
      }

      let changes = ChangeCollector.fromChanges(
        editChange,
        consolidateChanges(
          layerInfo.map((layer) =>
            consolidateChanges(layer.editBehavior.rollbackChange, layer.changePath)
          )
        )
      );

      return {
        undoLabel: rotation
          ? translate("edit-tools-pointer.undo.rotate-selection")
          : translate("edit-tools-pointer.undo.resize-selection"),
        changes: changes,
        broadcast: true,
      };
    });
  }

  getRotationHandle(event, selection) {
    return this.getTransformSelectionHandle(event, selection, true);
  }

  getResizeHandle(event, selection) {
    return this.getTransformSelectionHandle(event, selection);
  }

  getTransformSelectionHandle(event, selection, rotation = false) {
    if (!this.editor.visualizationLayersSettings.model["fontra.transform.selection"]) {
      return undefined;
    }
    if (!selection.size) {
      return undefined;
    }
    const glyph = this.sceneController.sceneModel.getSelectedPositionedGlyph()?.glyph;
    if (!glyph) {
      return undefined;
    }
    const bounds = getTransformSelectionBounds(
      glyph,
      selection,
      this.editor.fontController.getBackgroundImageBoundsFunc
    );
    // bounds can be undefined if for example only one point is selected
    if (!bounds) {
      return undefined;
    }

    const handleSize =
      transformHandleSize * this.editor.visualizationLayers.scaleFactor;
    const handleMargin =
      transformHandleMargin * this.editor.visualizationLayers.scaleFactor;

    const point = this.sceneController.selectedGlyphPoint(event);
    const resizeHandles = getTransformHandles(bounds, handleMargin + handleSize / 2);
    const rotationHandles = rotation
      ? getTransformHandles(
          bounds,
          handleMargin + (handleSize * rotationHandleSizeFactor) / 2 + handleSize / 2
        )
      : {};
    for (const [handleName, handle] of Object.entries(resizeHandles)) {
      const inCircle = pointInCircleHandle(point, handle, handleSize);
      if (rotation) {
        const inSquare = pointInSquareHandle(
          point,
          rotationHandles[handleName],
          handleSize * rotationHandleSizeFactor
        );
        if (inSquare && !inCircle) {
          return handleName;
        }
      } else {
        if (inCircle) {
          return handleName;
        }
      }
    }
    return undefined;
  }

  get scalingEditBehavior() {
    return false;
  }

  activate() {
    super.activate();
    this.sceneController.sceneModel.showTransformSelection = true;
    this.canvasController.requestUpdate();
  }

  deactivate() {
    super.deactivate();
    this.sceneController.sceneModel.showTransformSelection = false;
    this.canvasController.requestUpdate();
  }
}

function pointInSquareHandle(point, handle, handleSize) {
  const selRect = centeredRect(handle.x, handle.y, handleSize);
  return pointInRect(point.x, point.y, selRect);
}

function pointInCircleHandle(point, handle, handleSize) {
  return vector.distance(handle, point) <= handleSize / 2;
}

function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}

function replace(setA, setB) {
  return setB;
}

function getSelectModeFunction(event) {
  return event.shiftKey
    ? event[commandKeyProperty]
      ? difference
      : symmetricDifference
    : event[commandKeyProperty]
    ? union
    : replace;
}

registerVisualizationLayerDefinition({
  identifier: "fontra.transform.selection",
  name: "edit-tools-pointer.transform.selection",
  selectionFunc: glyphSelector("editing"),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 400,
  screenParameters: {
    strokeWidth: 1,
    lineDash: [2, 4],
    handleSize: transformHandleSize,
    hoverStrokeOffset: 4,
    margin: transformHandleMargin,
  },

  colors: { handleColor: "#BBB", strokeColor: "#DDD" },
  colorsDarkMode: { handleColor: "#777", strokeColor: "#555" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    if (!model.showTransformSelection) {
      return;
    }
    const transformBounds = getTransformSelectionBounds(
      positionedGlyph.glyph,
      model.selection,
      model.fontController.getBackgroundImageBoundsFunc
    );
    if (!transformBounds) {
      return;
    }

    context.strokeStyle = parameters.handleColor;
    context.lineWidth = parameters.strokeWidth;

    // The following code is helpful for designing/adjusting the invisible rotation handle areas
    // draw rotation handles
    // const rotationHandles = getTransformHandles(transformBounds, parameters.margin + parameters.handleSize * rotationHandleSizeFactor / 2 + parameters.handleSize / 2);
    // for (const [handleName, handle] of Object.entries(rotationHandles)) {
    //   strokeSquareNode(context, handle, parameters.handleSize * rotationHandleSizeFactor);
    // }

    // draw resize handles
    const handles = getTransformHandles(
      transformBounds,
      parameters.margin + parameters.handleSize / 2
    );
    for (const [handleName, handle] of Object.entries(handles)) {
      strokeRoundNode(context, handle, parameters.handleSize);
    }

    // draw resize handles hover
    if (!model.clickedTransformSelectionHandle && handles[model.hoverResizeHandle]) {
      strokeRoundNode(
        context,
        handles[model.hoverResizeHandle],
        parameters.handleSize + parameters.hoverStrokeOffset
      );
    }

    // because of the dashed line draw resize bounding box last
    context.strokeStyle = parameters.strokeColor;
    context.setLineDash(parameters.lineDash);
    context.strokeRect(
      transformBounds.xMin,
      transformBounds.yMin,
      transformBounds.xMax - transformBounds.xMin,
      transformBounds.yMax - transformBounds.yMin
    );
  },
});

export class PointerToolScale extends PointerTool {
  iconPath = "/images/pointerscale.svg";
  identifier = "pointer-tool-scale";

  get scalingEditBehavior() {
    return true;
  }
}

function getTransformHandles(transformBounds, margin) {
  const { width, height } = rectSize(transformBounds);

  const [x, y, w, h] = [
    transformBounds.xMin - margin,
    transformBounds.yMin - margin,
    transformBounds.xMax - transformBounds.xMin + margin * 2,
    transformBounds.yMax - transformBounds.yMin + margin * 2,
  ];

  const handles = {
    "bottom-left": { x: x, y: y },
    "bottom-center": { x: x + w / 2, y: y },
    "bottom-right": { x: x + w, y: y },
    "top-left": { x: x, y: y + h },
    "top-center": { x: x + w / 2, y: y + h },
    "top-right": { x: x + w, y: y + h },
    "middle-left": { x: x, y: y + h / 2 },
    "middle-right": { x: x + w, y: y + h / 2 },
  };

  if (width != 0 && height != 0) {
    return handles;
  }

  for (const handleName of Object.keys(handles)) {
    if (width == 0 && handleName != "top-center" && handleName != "bottom-center") {
      delete handles[handleName];
    }
    if (height == 0 && handleName != "middle-left" && handleName != "middle-right") {
      delete handles[handleName];
    }
  }

  return handles;
}

function getTransformSelectionBounds(glyph, selection, getBackgroundImageBoundsFunc) {
  if (selection.size == 1 && parseSelection(selection).point?.length == 1) {
    // Return if only a single point is selected, as in that case the "selection bounds"
    // is not really useful for the user, and is distracting instead.
    return undefined;
  }
  const selectionBounds = glyph.getSelectionBounds(
    selection,
    getBackgroundImageBoundsFunc
  );
  if (!selectionBounds) {
    return undefined;
  }
  const { width, height } = rectSize(selectionBounds);
  if (width == 0 && height == 0) {
    // return undefined if for example only one point is selected
    return undefined;
  }

  return selectionBounds;
}
