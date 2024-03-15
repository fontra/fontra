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

    let shapeRect;

    for await (const event of eventStream) {
      const point = this.sceneController.selectedGlyphPoint(event);
      if (point.x === undefined) {
        // We can receive non-pointer events like keyboard events: ignore
        continue;
      }
      shapeRect = rectangle.rectRound(rectangle.rectFromPoints([initialPoint, point]));

      const rectPath = new Path2D();
      this.drawShapePath(rectPath, shapeRect);
      this.sceneModel.shapeToolShapePath = rectPath;
      this.canvasController.requestUpdate();
    }

    delete this.sceneModel.shapeToolShapePath;
    this.canvasController.requestUpdate();

    // rectsize return when too small
    if (!shapeRect) {
      return;
    }

    const pathNew = new VarPackedPath();
    this.drawShapePath(pathNew, shapeRect);
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

  drawShapePath(path, rect) {
    path.moveTo(rect.xMin, rect.yMin);
    path.lineTo(rect.xMax, rect.yMin);
    path.lineTo(rect.xMax, rect.yMax);
    path.lineTo(rect.xMin, rect.yMax);
    path.closePath();
  }
}

registerVisualizationLayerDefinition({
  identifier: "fontra.shapetool.shape",
  name: "Shape tool shape",
  selectionMode: "editing",
  zIndex: 500,
  screenParameters: { strokeWidth: 1 },
  colors: { strokeColor: "#000" },
  colorsDarkMode: { strokeColor: "#fff" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const shape = model.shapeToolShapePath;
    if (!shape) {
      return;
    }

    context.strokeStyle = parameters.strokeColor;
    context.lineWidth = parameters.strokeWidth;
    context.stroke(shape);
  },
});
