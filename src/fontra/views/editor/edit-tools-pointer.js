import { ChangeCollector, applyChange } from "../core/changes.js";
import { recordChanges } from "../core/change-recorder.js";
import { connectContours } from "../core/path-functions.js";
import { centeredRect, normalizeRect, offsetRect } from "../core/rectangle.js";
import { difference, isSuperset, symmetricDifference, union } from "../core/set-ops.js";
import {
  boolInt,
  commandKeyProperty,
  makeUPlusStringFromCodePoint,
  modulo,
  parseSelection,
  range,
} from "../core/utils.js";
import { VarPackedPath } from "../core/var-path.js";
import * as vector from "../core/vector.js";
import { dialog } from "/web-components/modal-dialog.js";
import { EditBehaviorFactory } from "./edit-behavior.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { equalGlyphSelection } from "./scene-controller.js";

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
      union(sceneController.selection, sceneController.hoverSelection),
      event.altKey
    );
    sceneController.hoverSelection = selection;
    sceneController.hoveredGlyph = undefined;
    sceneController.hoverPathHit = pathHit;

    if (!sceneController.hoverSelection.size && !sceneController.hoverPathHit) {
      sceneController.hoveredGlyph = this.sceneModel.glyphAtPoint(point);
    }

    this.setCursor();
  }

  setCursor() {
    if (
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
    const point = sceneController.localPoint(initialEvent);
    const size = sceneController.mouseClickMargin;
    const { selection, pathHit } = this.sceneModel.selectionAtPoint(
      point,
      size,
      union(sceneController.selection, sceneController.hoverSelection),
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
      await this.handleDoubleClick(selection, point);
      return;
    }

    if (!this.sceneSettings.selectedGlyph?.isEditing) {
      this.sceneSettings.selectedGlyph = this.sceneModel.glyphAtPoint(point);
      eventStream.done();
      return;
    }

    const initialSelection = sceneController.selection;
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

  async handleDoubleClick(selection, point) {
    const sceneController = this.sceneController;
    if (!sceneController.hoverPathHit && (!selection || !selection.size)) {
      const selectedGlyph = this.sceneModel.glyphAtPoint(point);
      this.sceneSettings.selectedGlyph = selectedGlyph
        ? { ...selectedGlyph, isEditing: true }
        : undefined;
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph?.isUndefined) {
        this.sceneSettings.selectedGlyph = {
          ...this.sceneSettings.selectedGlyph,
          isEditing: false,
        };
        // Create a new glyph
        // Or: ask user if they want to create a new glyph
        const uniString = makeUPlusStringFromCodePoint(
          positionedGlyph.character?.codePointAt(0)
        );
        const charMsg = positionedGlyph.character
          ? ` for character “${positionedGlyph.character}” (${uniString})`
          : "";
        const result = await dialog(
          `Create a new glyph “${positionedGlyph.glyphName}”?`,
          `Click “Create” if you want to create a new glyph named “${positionedGlyph.glyphName}”${charMsg}.`,
          [
            { title: "Cancel", resultValue: "no", isCancelButton: true },
            { title: "Create", resultValue: "ok", isDefaultButton: true },
          ]
        );
        if (result === "ok") {
          await this.editor.newGlyph(
            positionedGlyph.glyphName,
            positionedGlyph.character?.codePointAt(0),
            positionedGlyph.glyph.instance
          );
          this.sceneSettings.selectedGlyph = {
            ...this.sceneSettings.selectedGlyph,
            isEditing: true,
          };
        }
      }
    } else {
      const instance = this.sceneModel.getSelectedPositionedGlyph().glyph.instance;
      const { point: pointIndices, component: componentIndices } = parseSelection(
        sceneController.selection
      );
      if (componentIndices?.length) {
        componentIndices.sort();
        sceneController.doubleClickedComponentIndices = componentIndices;
        sceneController._dispatchEvent("doubleClickedComponents");
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
        sceneController.selection = newSelection;
      }
    }
  }

  async handlePointsDoubleClick(pointIndices) {
    await this.sceneController.editInstanceAndRecordChanges((instance) => {
      const path = instance.path;
      for (const pointIndex of pointIndices) {
        const pointType = path.pointTypes[pointIndex];
        const [prevIndex, prevPoint, nextIndex, nextPoint] = neighborPoints(
          path,
          pointIndex
        );
        if (
          (!prevPoint || !nextPoint || (!prevPoint.type && !nextPoint.type)) &&
          pointType !== VarPackedPath.SMOOTH_FLAG
        ) {
          continue;
        }
        if (
          pointType === VarPackedPath.ON_CURVE ||
          pointType === VarPackedPath.SMOOTH_FLAG
        ) {
          const newPointType =
            pointType === VarPackedPath.ON_CURVE
              ? VarPackedPath.SMOOTH_FLAG
              : VarPackedPath.ON_CURVE;
          path.pointTypes[pointIndex] = newPointType;
          if (newPointType === VarPackedPath.SMOOTH_FLAG) {
            const anchorPoint = path.getPoint(pointIndex);
            if (prevPoint?.type && nextPoint?.type) {
              // Fix-up both incoming and outgoing handles
              const [newPrevPoint, newNextPoint] = alignHandles(
                prevPoint,
                anchorPoint,
                nextPoint
              );
              path.setPointPosition(prevIndex, newPrevPoint.x, newPrevPoint.y);
              path.setPointPosition(nextIndex, newNextPoint.x, newNextPoint.y);
            } else if (prevPoint?.type) {
              // Fix-up incoming handle
              const newPrevPoint = alignHandle(nextPoint, anchorPoint, prevPoint);
              path.setPointPosition(prevIndex, newPrevPoint.x, newPrevPoint.y);
            } else if (nextPoint?.type) {
              // Fix-up outgoing handle
              const newNextPoint = alignHandle(prevPoint, anchorPoint, nextPoint);
              path.setPointPosition(nextIndex, newNextPoint.x, newNextPoint.y);
            }
          }
        }
      }
      return "Toggle Smooth";
    });
  }

  async handleRectSelect(eventStream, initialEvent, initialSelection) {
    const sceneController = this.sceneController;
    const initialPoint = sceneController.localPoint(initialEvent);
    for await (const event of eventStream) {
      const currentPoint = sceneController.localPoint(event);
      const selRect = normalizeRect({
        xMin: initialPoint.x,
        yMin: initialPoint.y,
        xMax: currentPoint.x,
        yMax: currentPoint.y,
      });
      const selection = this.sceneModel.selectionAtRect(
        selRect,
        event.altKey ? (point) => !!point.type : (point) => !point.type
      );
      const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
      sceneController.selectionRect = offsetRect(
        selRect,
        -positionedGlyph.x,
        -positionedGlyph.y
      );

      const modeFunc = getSelectModeFunction(event);
      sceneController.selection = modeFunc(initialSelection, selection);
    }
    sceneController.selectionRect = undefined;
  }

  async handleDragSelection(eventStream, initialEvent) {
    const sceneController = this.sceneController;
    await sceneController.editInstance(async (sendIncrementalChange, instance) => {
      const initialPoint = sceneController.localPoint(initialEvent);
      const connectDetector = sceneController.getPathConnectDetector();
      let shouldConnect = false;

      const behaviorFactory = new EditBehaviorFactory(
        instance,
        sceneController.selection,
        sceneController.experimentalFeatures.scalingEditBehavior
      );

      let behaviorName = getBehaviorName(initialEvent);
      let editBehavior = behaviorFactory.getBehavior(behaviorName);

      let editChange;

      for await (const event of eventStream) {
        const newEditBehaviorName = getBehaviorName(event);
        if (behaviorName !== newEditBehaviorName) {
          applyChange(instance, editBehavior.rollbackChange);
          await sendIncrementalChange(editBehavior.rollbackChange);
          behaviorName = newEditBehaviorName;
          editBehavior = behaviorFactory.getBehavior(behaviorName);
        }
        const currentPoint = sceneController.localPoint(event);
        const delta = {
          x: currentPoint.x - initialPoint.x,
          y: currentPoint.y - initialPoint.y,
        };
        editChange = editBehavior.makeChangeForDelta(delta);
        applyChange(instance, editChange);

        shouldConnect = connectDetector.shouldConnect(true);

        await sendIncrementalChange(editChange, true); // true: "may drop"
      }
      let changes = ChangeCollector.fromChanges(
        editChange,
        editBehavior.rollbackChange
      );
      if (shouldConnect) {
        connectDetector.clearConnectIndicator();
        const connectChanges = recordChanges(instance, (instance) => {
          sceneController.selection = connectContours(
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
        undoLabel: "drag selection" + (shouldConnect ? " and connect contours" : ""),
        changes: changes,
        broadcast: true,
      };
    });
  }
}

function getBehaviorName(event) {
  const behaviorNames = ["default", "constrain", "alternate", "alternate-constrain"];
  return behaviorNames[boolInt(event.shiftKey) + 2 * boolInt(event.altKey)];
}

function neighborPoints(path, pointIndex) {
  const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
  const contourStartIndex = path.getAbsolutePointIndex(contourIndex, 0);
  const numPoints = path.getNumPointsOfContour(contourIndex);
  const isClosed = path.contourInfo[contourIndex].isClosed;
  let prevIndex = contourPointIndex - 1;
  let nextIndex = contourPointIndex + 1;
  if (path.contourInfo[contourIndex].isClosed) {
    prevIndex = modulo(prevIndex, numPoints);
    nextIndex = modulo(nextIndex, numPoints);
  }
  let prevPoint, nextPoint;
  if (prevIndex >= 0) {
    prevIndex += contourStartIndex;
    prevPoint = path.getPoint(prevIndex);
  } else {
    prevIndex = undefined;
  }
  if (nextIndex < numPoints) {
    nextIndex += contourStartIndex;
    nextPoint = path.getPoint(nextIndex);
  } else {
    nextIndex = undefined;
  }
  return [prevIndex, prevPoint, nextIndex, nextPoint];
}

function alignHandle(refPoint1, anchorPoint, handlePoint) {
  const direction = vector.subVectors(anchorPoint, refPoint1);
  return alignHandleAlongDirection(direction, anchorPoint, handlePoint);
}

function alignHandles(handleIn, anchorPoint, handleOut) {
  const handleVectorIn = vector.subVectors(anchorPoint, handleIn);
  const handleVectorOut = vector.subVectors(anchorPoint, handleOut);
  const directionIn = vector.subVectors(handleVectorOut, handleVectorIn);
  const directionOut = vector.subVectors(handleVectorIn, handleVectorOut);
  return [
    alignHandleAlongDirection(directionIn, anchorPoint, handleIn),
    alignHandleAlongDirection(directionOut, anchorPoint, handleOut),
  ];
}

function alignHandleAlongDirection(direction, anchorPoint, handlePoint) {
  const length = vector.vectorLength(vector.subVectors(handlePoint, anchorPoint));
  const handleVector = vector.mulVectorScalar(
    vector.normalizeVector(direction),
    length
  );
  return vector.roundVector(vector.addVectors(anchorPoint, handleVector));
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
