import VarArray from "../core/var-array.js";
import {
  POINT_TYPE_OFF_CURVE_CUBIC,
  POINT_TYPE_OFF_CURVE_QUAD,
  VarPackedPath,
  joinPaths,
  joinPathsAsync,
} from "../core/var-path.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";

class MockPath2D {
  constructor() {
    this.items = [];
  }
  moveTo(x, y) {
    this.items.push({ op: "moveTo", args: [x, y] });
  }
  lineTo(x, y) {
    this.items.push({ op: "lineTo", args: [x, y] });
  }
  bezierCurveTo(x1, y1, x2, y2, x3, y3) {
    this.items.push({ op: "bezierCurveTo", args: [x1, y1, x2, y2, x3, y3] });
  }
  quadraticCurveTo(x1, y1, x2, y2) {
    this.items.push({ op: "quadraticCurveTo", args: [x1, y1, x2, y2] });
  }
  closePath() {
    this.items.push({ op: "closePath", args: [] });
  }
}

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

    let pathNew = getRectPath(
      this.sceneController.selectedGlyphPoint(pt0),
      this.sceneController.selectedGlyphPoint(pt1),
      this.sceneController.selectedGlyphPoint(pt2),
      this.sceneController.selectedGlyphPoint(pt3)
    );

    //const glyphController = this.sceneModel.getSelectedPositionedGlyph().glyph;
    //let len_path = glyphController.instance.path.numContours;

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

      pathNew = getRectPath(
        this.sceneController.selectedGlyphPoint(pt0),
        this.sceneController.selectedGlyphPoint(pt1),
        this.sceneController.selectedGlyphPoint(pt2),
        this.sceneController.selectedGlyphPoint(pt3)
      );

      //glyphController.instance.path.appendPath(pathNew)
      //this.sceneController.ghostPath = pathNew.drawToPath2d;

      //this.sceneModel.ghostPath = pathNew.drawToPath2d;
      //this.sceneController.ghostPath = pathNew.drawToPath2d;
      //console.log(this.sceneModel.ghostPath);
      //await this.sceneModel.updateScene();
      //this.canvasController.requestUpdate();

      //glyphController.instance.path.deleteContour(len_path);

      //this.sceneModel.updateScene();
      //this.canvasController.requestUpdate();

      //this.context.lineJoin = "round";
      //this.context.fillStyle = "#AAA6";
      console.log("this.context: ", this.context);
      //context.beginPath();
      //this.context.roundRect(pathNew.drawToPath2d);
      //this.context.fill("#AAA6");
      //this.sceneController

      // this.canvasController.requestUpdate();
    }
    //noDrag(pt0, pt1, pt2, pt3);
    /*
    this.noDrag(this.sceneController.localPoint(pt0),
                this.sceneController.localPoint(pt1),
                this.sceneController.localPoint(pt2),
                this.sceneController.localPoint(pt3));
    */

    this._handleAddPath(pathNew);
  }

  async _handleAddPath(pathNew) {
    //let pathNew = getRectPath(pt0, pt1, pt2, pt3);

    let bbox = pathNew.getBounds();
    let width = bbox.xMax - bbox.xMin;
    let height = bbox.yMax - bbox.yMin;
    if (width < 1 && height < 1) {
      // don't add a shape if it's too small
      return;
    }

    await this.sceneController.editGlyphAndRecordChanges(
      (glyph) => {
        const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
          glyph.layers
        );

        const firstLayerGlyph = Object.values(editLayerGlyphs)[0];
        const selection = new Set();
        selection.add(`point/${firstLayerGlyph.path.numPoints}`);

        for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
          layerGlyph.path.appendPath(pathNew);
        }
        this.sceneController.selection = selection;
        return "add shape";
      },
      undefined,
      true
    );
  }

  /*
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

    //glyphController.instance.path.appendPath(pathNew); //pasteGlyph.path);
    //this.behaviorFuncs.noDrag?.(this.context, path);
    //this.canvasController.requestUpdate();
  }
  */

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
