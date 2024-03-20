import * as rectangle from "../core/rectangle.js";
import { range } from "../core/utils.js";
import { VarPackedPath } from "../core/var-path.js";
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
    let width = mouseRect.yMax - mouseRect.yMin;
    let height = mouseRect.xMax - mouseRect.xMin;

    if (event.shiftKey) {
      // make square, not rectangle
      if ((width > 0 && height > 0) || (width < 0 && height < 0)) {
        height = width;
      } else {
        height = -width;
      }
    }

    let reversed = event.ctrlKey ? true : false; // reversed contour direction
    let centered = event.altKey ? true : false; // positon at center

    this.drawShapePath(path, x, y, width, height, reversed, centered);
  }

  drawShapePath(path, x, y, width, height, reversed, centered) {
    if (centered) {
      // positon at center
      x = x - height / 2;
      y = y - width / 2;
    }

    drawRect(path, x, y, width, height, reversed);
  }
}

function drawRect(path, x, y, width, height, reversed = false) {
  if (reversed) {
    drawRectReversed(path, x, y, width, height);
  } else {
    drawRectNormal(path, x, y, width, height);
  }
}

function drawRectNormal(path, x, y, width, height) {
  path.moveTo(x, y);
  path.lineTo(x, y + width);
  path.lineTo(x + height, y + width);
  path.lineTo(x + height, y);
  path.closePath();
}

function drawRectReversed(path, x, y, width, height) {
  path.moveTo(x, y);
  path.lineTo(x + height, y);
  path.lineTo(x + height, y + width);
  path.lineTo(x, y + width);
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
