import VarArray from "../core/var-array.js";
import {
  POINT_TYPE_OFF_CURVE_CUBIC,
  POINT_TYPE_OFF_CURVE_QUAD,
  VarPackedPath,
  joinPaths,
  joinPathsAsync,
} from "../core/var-path.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";

export class ShapeTool extends BaseTool {
  iconPath = "/tabler-icons/shape.svg";
  identifier = "shape-tool";

  handleHover(event) {}

  setCursor() {
    if (this.sceneModel.selectedGlyph?.isEditing) {
      this.canvasController.canvas.style.cursor = "crosshair";
    }
  }

  handleHover(event) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      this.editor.tools["pointer-tool"].handleHover(event);
      return;
    }
    this.setCursor();
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      await this.editor.tools["pointer-tool"].handleDrag(eventStream, initialEvent);
      return;
    }
    console.log(initialEvent);
    //const initial = this.sceneController.localPoint(initialEvent);
    const initialX = initialEvent.x;
    const initialY = initialEvent.y;
    let eventX;
    let eventY;
    let minX = initialX;
    let minY = initialY;
    let maxX = initialX;
    let maxY = initialY;

    let pt0 = { x: initialX, y: initialY };
    let pt1 = { x: initialX, y: eventY };
    let pt2 = { x: eventX, y: eventY };
    let pt3 = { x: eventX, y: initialY };

    for await (const event of eventStream) {
      //const point = this.sceneController.localPoint(event);
      eventX = event.x;
      eventY = event.y;
      if (eventX === undefined) {
        // We can receive non-pointer events like keyboard events: ignore
        continue;
      }
      // console.log(event);
      // compute selection bounding box
      minX = Math.min(minX, eventX);
      minY = Math.min(minY, eventY);
      maxX = Math.max(maxX, eventX);
      maxY = Math.max(maxY, eventY);
      //console.log(minX, minY, maxX, maxY);

      if (Math.abs(maxX - minX) < 1.0 || Math.abs(maxY - minY) < 1.0) {
        // skip drawing
      }

      pt0 = { x: minX, y: minY };
      pt1 = { x: maxX, y: minY };
      pt2 = { x: maxX, y: maxY };
      pt3 = { x: minX, y: maxY };

      //const ctx = this.canvasController.ctx;
      //ctx.stroke(path2d);
      //this.sceneController

      // this.canvasController.requestUpdate();
    }
    noDrag(pt0, pt1, pt2, pt3);
    /*
    this.noDrag(this.sceneController.localPoint(pt0),
                this.sceneController.localPoint(pt1),
                this.sceneController.localPoint(pt2),
                this.sceneController.localPoint(pt3));
    */
  }

  setupDrag(path, event) {
    const point = this.getPointFromEvent(event);
    this.behaviorFuncs.setupDrag?.(this.context, path, point, event.shiftKey);
  }

  noDrag(pt0, pt1, pt2, pt3) {
    console.log(pt0, pt1, pt2, pt3);
    let glyphController = this.sceneModel.getSelectedPositionedGlyph().glyph;
    if (!glyphController.canEdit) {
      return {};
    }
    let pathNew = getRectPath(pt0, pt1, pt2, pt3);

    glyphController.instance.path.appendPath(pathNew); //pasteGlyph.path);
    //this.behaviorFuncs.noDrag?.(this.context, path);
    //this.canvasController.requestUpdate();
  }

  deactivate() {
    this.canvasController.requestUpdate();
  }
}

function getRectPath(pt0, pt1, pt2, pt3) {
  return new VarPackedPath(
    new VarArray(pt0.x, pt0.y, pt1.x, pt1.y, pt2.x, pt2.y, pt3.x, pt3.y),
    [
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
    ],
    [{ endPoint: 3, isClosed: true }]
  );
}
