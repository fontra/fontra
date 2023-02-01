import { ChangeCollector, applyChange } from '../core/changes.js';
import { recordChanges } from '../core/change-recorder.js';
import { centeredRect, normalizeRect } from '../core/rectangle.js';
import { isSuperset, symmetricDifference } from '../core/set-ops.js';
import { dialog } from '../core/ui-dialog.js';
import {
  boolInt,
  makeUPlusStringFromCodePoint,
  modulo,
  parseSelection,
} from '../core/utils.js';
import { VarPackedPath } from '../core/var-path.js';
import * as vector from '../core/vector.js';
import { EditBehaviorFactory } from './edit-behavior.js';
import { BaseTool, shouldInitiateDrag } from './edit-tools-base.js';

export class PointerTool extends BaseTool {
  handleHover(event) {
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(event);
    const size = sceneController.mouseClickMargin;
    const selRect = centeredRect(point.x, point.y, size);
    sceneController.hoverSelection = this.sceneModel.selectionAtPoint(point, size);
    sceneController.hoveredGlyph = this.sceneModel.glyphAtPoint(point);
    if (sceneController.hoverSelection?.size) {
      this.canvasController.canvas.style.cursor = 'pointer';
    } else {
      this.canvasController.canvas.style.cursor = 'default';
    }
  }

  async handleDrag(eventStream, initialEvent) {
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(initialEvent);
    const selection = this.sceneModel.selectionAtPoint(
      point,
      sceneController.mouseClickMargin
    );
    if (initialEvent.detail == 2 || initialEvent.myTapCount == 2) {
      initialEvent.preventDefault(); // don't let our dbl click propagate to other elements
      eventStream.done();
      await this.handleDoubleCick(selection, point);
      return;
    }

    if (!this.sceneModel.selectedGlyphIsEditing) {
      sceneController.selectedGlyph = this.sceneModel.glyphAtPoint(point);
      sceneController.selectedGlyphIsEditing = false;
      eventStream.done();
      return;
    }

    const initialSelection = sceneController.selection;
    let initiateDrag = false;
    let initiateRectSelect = false;

    if (selection.size > 0) {
      if (event.shiftKey) {
        sceneController.selection = symmetricDifference(
          sceneController.selection,
          selection
        );
        if (isSuperset(sceneController.selection, selection)) {
          initiateDrag = true;
        }
      } else if (isSuperset(sceneController.selection, selection)) {
        initiateDrag = true;
      } else {
        sceneController.selection = selection;
        initiateDrag = true;
      }
    } else {
      if (!event.shiftKey) {
        sceneController.selection = selection;
      }
      initiateRectSelect = true;
    }

    if (initiateRectSelect || initiateDrag) {
      if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
        initiateRectSelect = false;
        initiateDrag = false;
        const selectedGlyph = this.sceneModel.glyphAtPoint(point);
        if (selectedGlyph && selectedGlyph != sceneController.selectedGlyph) {
          sceneController.selectedGlyph = selectedGlyph;
          sceneController.selectedGlyphIsEditing = false;
          eventStream.done();
          return;
        }
      }
    }

    sceneController.hoveredGlyph = undefined;

    if (initiateRectSelect) {
      return await this.handleRectSelect(eventStream, initialEvent, initialSelection);
    } else if (initiateDrag) {
      return await this.handleDragSelection(eventStream, initialEvent);
    }
  }

  async handleDoubleCick(selection, point) {
    const sceneController = this.sceneController;
    if (!selection || !selection.size) {
      sceneController.selectedGlyph = this.sceneModel.glyphAtPoint(point);
      sceneController.selectedGlyphIsEditing = !!sceneController.selectedGlyph;
      const positionedGlyph = sceneController.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph?.isUndefined) {
        sceneController.selectedGlyphIsEditing = false;
        // Create a new glyph
        // Or: ask user if they want to create a new glyph
        const uniString = makeUPlusStringFromCodePoint(
          positionedGlyph.character?.codePointAt(0)
        );
        const charMsg = positionedGlyph.character
          ? ` for character “${positionedGlyph.character}” (${uniString})`
          : '';
        const result = await dialog(
          `Create a new glyph “${positionedGlyph.glyphName}”?`,
          `Click “Create” if you want to create a new glyph named “${positionedGlyph.glyphName}”${charMsg}.`,
          [
            { title: 'Cancel', resultValue: 'no', isCancelButton: true },
            { title: 'Create', resultValue: 'ok', isDefaultButton: true },
          ]
        );
        if (result === 'ok') {
          await this.editor.newGlyph(
            positionedGlyph.glyphName,
            positionedGlyph.character?.codePointAt(0),
            positionedGlyph.glyph.instance
          );
          sceneController.selectedGlyphIsEditing = true;
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
        sceneController._dispatchEvent('doubleClickedComponents');
      } else if (pointIndices?.length) {
        await this.handlePointsDoubleClick(pointIndices);
      }
    }
  }

  async handlePointsDoubleClick(pointIndices) {
    await this.sceneController.editInstance((sendIncrementalChange, instance) => {
      const changes = recordChanges(instance, (instance) => {
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
      });
      return {
        changes: changes,
        undoLabel: 'toggle smooth',
        broadcast: true,
      };
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
      const selection = this.sceneModel.selectionAtRect(selRect);
      sceneController.selectionRect = selRect;

      if (event.shiftKey) {
        sceneController.selection = symmetricDifference(initialSelection, selection);
      } else {
        sceneController.selection = selection;
      }
    }
    sceneController.selectionRect = undefined;
  }

  async handleDragSelection(eventStream, initialEvent) {
    const sceneController = this.sceneController;
    await sceneController.editInstance(async (sendIncrementalChange, instance) => {
      const initialPoint = sceneController.localPoint(initialEvent);

      const behaviorFactory = new EditBehaviorFactory(
        instance,
        sceneController.selection
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
        await sendIncrementalChange(editChange, true); // true: "may drop"
      }
      const changes = ChangeCollector.fromChanges(
        editChange,
        editBehavior.rollbackChange
      );
      return {
        undoLabel: 'drag selection',
        changes: changes,
        broadcast: true,
      };
    });
  }
}

function getBehaviorName(event) {
  const behaviorNames = ['default', 'constrain', 'alternate', 'alternate-constrain'];
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
  const handleVector = vector.mulVector(vector.normalizeVector(direction), length);
  return vector.roundVector(vector.addVectors(anchorPoint, handleVector));
}
