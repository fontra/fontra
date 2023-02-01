import { ChangeCollector } from '../core/changes.js';
import { recordChanges } from '../core/change-recorder.js';
import { isEqualSet } from '../core/set-ops.js';
import { VarPackedPath } from '../core/var-path.js';
import * as vector from '../core/vector.js';
import { parseSelection } from '../core/utils.js';
import { BaseTool, shouldInitiateDrag } from './edit-tools-base.js';
import { constrainHorVerDiag } from './edit-behavior.js';

export class PenTool extends BaseTool {
  handleHover(event) {
    if (!this.sceneModel.selectedGlyphIsEditing) {
      this.editor.tools['pointer-tool'].handleHover(event);
      return;
    }
    this.canvasController.canvas.style.cursor = 'crosshair';
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.sceneModel.selectedGlyphIsEditing) {
      await this.editor.tools['pointer-tool'].handleDrag(
        eventStream,
        initialEvent
      );
      return;
    }

    await this.sceneController.editInstance(
      async (sendIncrementalChange, instance) => {
        const behavior = getPenToolBehavior(
          this.sceneController,
          initialEvent,
          instance.path
        );
        if (!behavior) {
          // Nothing to do
          return;
        }

        const initialChanges = recordChanges(instance, (instance) => {
          behavior.initialChanges(instance.path, initialEvent);
        });
        this.sceneController.selection = behavior.selection;
        await sendIncrementalChange(initialChanges.change);
        let preDragChanges = new ChangeCollector();
        let dragChanges = new ChangeCollector();

        if (await shouldInitiateDrag(eventStream, initialEvent)) {
          preDragChanges = recordChanges(instance, (instance) => {
            behavior.setupDrag(instance.path, initialEvent);
          });
          this.sceneController.selection = behavior.selection;
          await sendIncrementalChange(preDragChanges.change);
          for await (const event of eventStream) {
            dragChanges = recordChanges(instance, (instance) => {
              behavior.drag(instance.path, event);
            });
            await sendIncrementalChange(dragChanges.change, true); // true: "may drop"
          }
          await sendIncrementalChange(dragChanges.change);
        }

        const finalChanges = initialChanges.concat(preDragChanges, dragChanges);

        return {
          changes: finalChanges,
          undoLabel: behavior.undoLabel,
        };
      }
    );
  }
}

const AppendModes = {
  APPEND: 'append',
  PREPEND: 'prepend',
};

function getPenToolBehavior(sceneController, initialEvent, path) {
  const appendInfo = getAppendInfo(path, sceneController.selection);

  let behaviorFuncs;

  if (appendInfo.createContour) {
    // Let's add a new contour
    behaviorFuncs = {
      setup: [insertContourAndSetupAnchorPoint, insertAnchorPoint],
      setupDrag: insertHandleOut,
      drag: dragHandle,
    };
  } else {
    behaviorFuncs = {
      setup: [setupAnchorPoint, insertAnchorPoint],
      setupDrag: appendInfo.isOnCurve ? insertHandleOut : insertHandleInOut,
      drag: dragHandle,
    };

    const selectedPoint = path.getContourPoint(
      appendInfo.contourIndex,
      appendInfo.contourPointIndex
    );
    const clickedSelection = sceneController.sceneModel.selectionAtPoint(
      sceneController.localPoint(initialEvent),
      sceneController.mouseClickMargin
    );
    if (isEqualSet(clickedSelection, sceneController.selection)) {
      // We clicked on the selected point
      if (selectedPoint.type) {
        // off-curve
        if (path.getNumPointsOfContour(appendInfo.contourIndex) < 2) {
          // Contour is a single off-curve point, let's not touch it
          return null;
        }
        behaviorFuncs = { setup: [deleteHandle] };
      } else {
        // on-curve
        behaviorFuncs = {
          setup: [setupExistingAnchorPoint],
          setupDrag: insertHandleOut,
          drag: dragHandle,
        };
      }
    } else if (clickedSelection.size === 1) {
      const { point: pointSelection } = parseSelection(clickedSelection);
      const pointIndex = pointSelection[0];
      if (pointIndex !== undefined) {
        const [clickedContourIndex, clickedContourPointIndex] =
          path.getContourAndPointIndex(pointIndex);
        const numClickedContourPoints =
          path.getNumPointsOfContour(clickedContourIndex);
        if (
          clickedContourPointIndex === 0 ||
          clickedContourPointIndex === numClickedContourPoints - 1
        ) {
          if (clickedContourIndex === appendInfo.contourIndex) {
            const clickedPoint = path.getContourPoint(
              clickedContourIndex,
              clickedContourPointIndex
            );
            if (clickedPoint.type || !selectedPoint.type) {
              behaviorFuncs = { setup: [closeContour] };
            } else {
              behaviorFuncs = {
                setup: [closeContour],
                setupDrag: insertHandleIn,
                drag: dragHandle,
              };
            }
          } else {
            console.log('connect!!');
          }
        }
      }
    }
  }

  const getPointFromEvent = (event) =>
    sceneController.selectedGlyphPoint(event);

  return new PenToolBehavior(getPointFromEvent, appendInfo, behaviorFuncs);
}

class PenToolBehavior {
  undoLabel = 'add point(s)';

  constructor(getPointFromEvent, appendInfo, behaviorFuncs) {
    this.getPointFromEvent = getPointFromEvent;
    this.context = { ...appendInfo };
    this.context.curveType = 'cubic';
    this.context.appendBias =
      this.context.appendMode === AppendModes.APPEND ? 1 : 0;
    this.context.prependBias =
      this.context.appendMode === AppendModes.PREPEND ? 1 : 0;
    this.context.appendDirection =
      this.context.appendMode === AppendModes.APPEND ? +1 : -1;
    this.behaviorFuncs = behaviorFuncs;
  }

  get selection() {
    return this.context.selection || new Set();
  }

  initialChanges(path, event) {
    const point = this.getPointFromEvent(event);
    for (const func of this.behaviorFuncs.setup || []) {
      func(this.context, path, point, event.shiftKey);
    }
  }

  setupDrag(path, event) {
    const point = this.getPointFromEvent(event);
    this.behaviorFuncs.setupDrag?.(this.context, path, point, event.shiftKey);
  }

  drag(path, event) {
    const point = this.getPointFromEvent(event);
    this.behaviorFuncs.drag?.(this.context, path, point, event.shiftKey);
  }
}

function insertContourAndSetupAnchorPoint(
  context,
  path,
  point,
  shiftConstrain
) {
  path.insertContour(context.contourIndex, emptyContour());
  context.anchorIndex = context.contourPointIndex;
}

function setupAnchorPoint(context, path, point, shiftConstrain) {
  context.anchorIndex = context.contourPointIndex + context.appendBias;
}

function setupExistingAnchorPoint(context, path, point, shiftConstrain) {
  context.anchorIndex = context.contourPointIndex;
  context.anchorPoint = path.getContourPoint(
    context.contourIndex,
    context.contourPointIndex
  );
}

function insertAnchorPoint(context, path, point, shiftConstrain) {
  point = vector.roundVector(point);
  path.insertPoint(context.contourIndex, context.anchorIndex, point);
  context.anchorPoint = point;
  context.selection = getPointSelection(
    path,
    context.contourIndex,
    context.anchorIndex
  );
}

function insertHandleOut(context, path, point, shiftConstrain) {
  point = vector.roundVector(point);
  _insertHandleOut(context, path, point);
  _setHandleOutAbsIndex(context, path);
  context.selection = getPointSelectionAbs(context.handleOutAbsIndex);
}

function insertHandleIn(context, path, point, shiftConstrain) {
  point = vector.roundVector(point);
  _insertHandleIn(context, path, point);
  _setHandleInAbsIndex(context, path);
  context.selection = new Set();
}

function insertHandleInOut(context, path, point, shiftConstrain) {
  point = vector.roundVector(point);
  _insertHandleIn(context, path, point);
  _insertHandleOut(context, path, point);
  _setHandleInAbsIndex(context, path);
  _setHandleOutAbsIndex(context, path);
  const anchorIndex = path.getAbsolutePointIndex(
    context.contourIndex,
    context.anchorIndex
  );
  path.pointTypes[anchorIndex] = VarPackedPath.SMOOTH_FLAG;
  context.selection = getPointSelectionAbs(context.handleOutAbsIndex);
}

function _insertHandleIn(context, path, point, shiftConstrain) {
  path.insertPoint(
    context.contourIndex,
    context.anchorIndex + context.prependBias,
    { ...point, type: context.curveType }
  );
  context.anchorIndex += context.appendBias;
}

function _insertHandleOut(context, path, point, shiftConstrain) {
  path.insertPoint(
    context.contourIndex,
    context.anchorIndex + context.appendBias,
    { ...point, type: context.curveType }
  );
  context.anchorIndex += context.prependBias;
}

function _setHandleInAbsIndex(context, path) {
  context.handleInAbsIndex = path.getAbsolutePointIndex(
    context.contourIndex,
    context.anchorIndex - context.appendDirection
  );
}

function _setHandleOutAbsIndex(context, path) {
  context.handleOutAbsIndex = path.getAbsolutePointIndex(
    context.contourIndex,
    context.anchorIndex + context.appendDirection
  );
}

function deleteHandle(context, path, point, shiftConstrain) {
  path.deletePoint(context.contourIndex, context.contourPointIndex);
  const anchorIndex = path.getAbsolutePointIndex(
    context.contourIndex,
    context.contourPointIndex - context.appendBias
  );
  path.pointTypes[anchorIndex] = VarPackedPath.ON_CURVE;
  context.selection = getPointSelectionAbs(anchorIndex);
}

function closeContour(context, path, point, shiftConstrain) {
  path.contourInfo[context.contourIndex].isClosed = true;
  const numPoints = path.getNumPointsOfContour(context.contourIndex);
  if (!context.contourPointIndex) {
    const lastPointIndex = numPoints - 1;
    const lastPoint = path.getContourPoint(
      context.contourIndex,
      lastPointIndex
    );
    path.deletePoint(context.contourIndex, lastPointIndex);
    path.insertPoint(context.contourIndex, 0, lastPoint);
  }
  // When appending, we pretend the anchor index is beyond the last point,
  // so we insert the handle at the end of the contour, instead of at the front
  context.anchorIndex =
    context.appendMode === AppendModes.APPEND ? numPoints : 0;
  context.anchorPoint = path.getContourPoint(context.contourIndex, 0);
  context.selection = getPointSelection(path, context.contourIndex, 0);
}

function dragHandle(context, path, point, shiftConstrain) {
  point = getHandle(point, context.anchorPoint, shiftConstrain);
  if (context.handleOutAbsIndex !== undefined) {
    path.setPointPosition(context.handleOutAbsIndex, point.x, point.y);
  }
  if (context.handleInAbsIndex !== undefined) {
    const oppositePoint = oppositeHandle(context.anchorPoint, point);
    path.setPointPosition(
      context.handleInAbsIndex,
      oppositePoint.x,
      oppositePoint.y
    );
  }
}

function getPointSelection(path, contourIndex, contourPointIndex) {
  const pointIndex = path.getAbsolutePointIndex(
    contourIndex,
    contourPointIndex
  );
  return new Set([`point/${pointIndex}`]);
}

function getPointSelectionAbs(pointIndex) {
  return new Set([`point/${pointIndex}`]);
}

function getAppendInfo(path, selection) {
  if (selection.size === 1) {
    const { point: pointSelection } = parseSelection(selection);
    const pointIndex = pointSelection[0];
    if (pointIndex !== undefined && pointIndex < path.numPoints) {
      const [contourIndex, contourPointIndex] =
        path.getContourAndPointIndex(pointIndex);
      const numPointsContour = path.getNumPointsOfContour(contourIndex);
      if (
        !path.contourInfo[contourIndex].isClosed &&
        (contourPointIndex === 0 || contourPointIndex === numPointsContour - 1)
      ) {
        // Let's append or prepend a point to an existing contour
        const appendMode =
          contourPointIndex || numPointsContour === 1
            ? AppendModes.APPEND
            : AppendModes.PREPEND;
        const isOnCurve = !path.getPoint(pointIndex).type;
        const createContour = false;
        return {
          contourIndex,
          contourPointIndex,
          appendMode,
          isOnCurve,
          createContour,
        };
      }
    }
  }
  return {
    contourIndex: path.contourInfo.length,
    contourPointIndex: 0,
    appendMode: AppendModes.APPEND,
    isOnCurve: undefined,
    createContour: true,
  };
}

function emptyContour() {
  return { coordinates: [], pointTypes: [], isClosed: false };
}

function getHandle(handleOut, anchorPoint, constrain) {
  if (constrain) {
    handleOut = shiftConstrain(anchorPoint, handleOut);
  }
  return vector.roundVector(handleOut);
}

function oppositeHandle(anchorPoint, handlePoint) {
  return vector.addVectors(
    anchorPoint,
    vector.mulVector(vector.subVectors(handlePoint, anchorPoint), -1)
  );
}

function shiftConstrain(anchorPoint, handlePoint) {
  const delta = constrainHorVerDiag(
    vector.subVectors(handlePoint, anchorPoint)
  );
  return vector.addVectors(anchorPoint, delta);
}
