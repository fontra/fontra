import * as rectangle from "../core/rectangle.js";
import { range } from "../core/utils.js";
import { VarPackedPath, packContour } from "../core/var-path.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { registerVisualizationLayerDefinition } from "./visualization-layer-definitions.js";

export class ShapeToolRect extends BaseTool {
  iconPath = "/tabler-icons/square-plus-2.svg";
  identifier = "shape-tool-rectangle";

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

    const initialPoint = this.sceneController.selectedGlyphPoint(initialEvent);

    if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
      // TODO: open dialog for numeric size input
      return;
    }

    let mouseRect;
    let eventTemp;
    for await (const event of eventStream) {
      eventTemp = event;
      const point = this.sceneController.selectedGlyphPoint(event);
      if (point.x === undefined) {
        // We can receive non-pointer events like keyboard events: ignore
        continue;
      }
      mouseRect = rectangle.rectRound({
        xMin: initialPoint.x,
        yMin: initialPoint.y,
        xMax: point.x,
        yMax: point.y,
      });

      const drawPath = new Path2D();
      this.drawShapeWithKeys(drawPath, mouseRect, event);
      this.sceneModel.shapeToolShapePath = drawPath;
      this.sceneModel.event = event;
      this.canvasController.requestUpdate();
    }

    delete this.sceneModel.shapeToolShapePath;
    delete this.sceneModel.event;
    this.canvasController.requestUpdate();

    // rectsize return when too small
    if (!mouseRect) {
      return;
    }

    const pathNew = new VarPackedPath();
    this.drawShapeWithKeys(pathNew, mouseRect, eventTemp);
    // reversed contour direction
    if (eventTemp.ctrlKey) {
      this.reversePath(pathNew);
    }
    this.fixPath(pathNew);
    this.addShapePath(pathNew);
  }

  async addShapePath(pathNew) {
    await this.sceneController.editGlyphAndRecordChanges(
      (glyph) => {
        const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
          glyph.layers
        );

        const firstLayerGlyph = Object.values(editLayerGlyphs)[0];
        const selection = new Set();
        const firstIndex = firstLayerGlyph.path.numPoints;
        for (const index of range(pathNew.numPoints)) {
          const point = pathNew.getPoint(index);
          if (!point.type) {
            selection.add(`point/${firstIndex + index}`);
          }
        }
        this.sceneController.selection = selection;

        for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
          layerGlyph.path.appendPath(pathNew);
        }
        return "add shape";
      },
      undefined,
      true
    );
  }

  deactivate() {
    this.canvasController.requestUpdate();
  }

  drawShapeWithKeys(path, mouseRect, event) {
    let x = mouseRect.xMin;
    let y = mouseRect.yMin;
    let width = mouseRect.xMax - mouseRect.xMin;
    let height = mouseRect.yMax - mouseRect.yMin;

    // make square, not rectangle
    if (event.shiftKey) {
      if ((width > 0 && height > 0) || (width < 0 && height < 0)) {
        height = width;
      } else {
        height = -width;
      }
    }

    // positon at center
    if (event.altKey) {
      width = width * 2;
      height = height * 2;
      x = x - width / 2;
      y = y - height / 2;
    }

    this.drawShapePath(path, x, y, width, height);
  }

  drawShapePath(path, x, y, width, height) {
    drawRect(path, x, y, width, height);
  }

  reversePath(path) {
    const contour = path.getUnpackedContour(0);
    contour.points.reverse();
    if (contour.isClosed) {
      const [lastPoint] = contour.points.splice(-1, 1);
      contour.points.splice(0, 0, lastPoint);
    }
    const packedContour = packContour(contour);
    path.setContour(0, packedContour);
  }

  fixPath(path) {
    // remove last point if it's the same as the first
    const contour = path.getUnpackedContour(0);
    const firstPoint = contour.points[0];
    const lastPoint = contour.points[contour.points.length - 1];
    if (firstPoint.x === lastPoint.x && firstPoint.y === lastPoint.y) {
      contour.points.pop();
    }
    const packedContour = packContour(contour);
    path.setContour(0, packedContour);
  }
}

function drawRect(path, x, y, width, height) {
  path.moveTo(x, y);
  path.lineTo(x, y + height);
  path.lineTo(x + width, y + height);
  path.lineTo(x + width, y);
  path.closePath();
}

registerVisualizationLayerDefinition({
  identifier: "fontra.shapetool.shape",
  name: "Shape tool shape",
  selectionMode: "editing",
  zIndex: 500,
  screenParameters: { strokeWidth: 1 },
  colors: { boxColor: "#FFFB", color: "#000" },
  colorsDarkMode: { boxColor: "#1118", color: "#FFF" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const shape = model.shapeToolShapePath;
    if (!shape) {
      return;
    }

    if (model.event.ctrlKey) {
      context.fillStyle = parameters.boxColor;
      context.fill(shape);
    }

    context.strokeStyle = parameters.strokeColor;
    context.lineWidth = parameters.strokeWidth;
    context.stroke(shape);
  },
});
