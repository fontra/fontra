import * as rectangle from "@fontra/core/rectangle.js";
import { commandKeyProperty, range } from "@fontra/core/utils.js";
import { VarPackedPath, packContour } from "@fontra/core/var-path.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { registerVisualizationLayerDefinition } from "./visualization-layer-definitions.js";

export class ShapeTool {
  identifier = "shape-tool";
  subTools = [ShapeToolRect, ShapeToolEllipse];
}

export class ShapeToolRect extends BaseTool {
  iconPath = "/tabler-icons/square-plus-2.svg";
  identifier = "shape-tool-rectangle";
  shapeNames = ["rectangle", "square"];

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
      this.drawShapePath2D(drawPath, mouseRect, event);
      this.sceneModel.shapeToolShapePath = drawPath;
      this.sceneModel.shapeToolShowFill = event[commandKeyProperty];
      this.canvasController.requestUpdate();
    }

    delete this.sceneModel.shapeToolShapePath;
    delete this.sceneModel.shapeToolShowFill;
    this.canvasController.requestUpdate();

    // rectsize return when too small
    if (!mouseRect) {
      return;
    }

    const pathNew = this.drawShapeVarPackedPath(mouseRect, eventTemp);
    // reversed contour direction
    if (eventTemp[commandKeyProperty]) {
      this.reversePath(pathNew);
    }
    this.addShapePath(pathNew, eventTemp);
  }

  async addShapePath(pathNew, event) {
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
        return `add ${this.shapeNames[event.shiftKey ? 1 : 0]}`;
      },
      undefined,
      true
    );
  }

  deactivate() {
    this.canvasController.requestUpdate();
  }

  drawShapePath2D(path2d, mouseRect, event) {
    const path = this.drawShapeVarPackedPath(mouseRect, event);

    return path.drawToPath2d(path2d);
  }

  drawShapeVarPackedPath(mouseRect, event) {
    let x = mouseRect.xMin;
    let y = mouseRect.yMin;
    let width = mouseRect.xMax - mouseRect.xMin;
    let height = mouseRect.yMax - mouseRect.yMin;

    // make square, not rectangle
    if (event.shiftKey) {
      const size = (Math.abs(width) + Math.abs(height)) / 2;
      width = size * Math.sign(width);
      height = size * Math.sign(height);
    }

    // positon at center
    if (event.altKey) {
      x = x - width;
      y = y - height;
      width *= 2;
      height *= 2;
    }

    const varPackedPath = VarPackedPath.fromUnpackedContours(
      this.getUnpackedContours(x, y, width, height)
    );

    // fix contour direction if needed
    if ((width > 0 && height > 0) || (width < 0 && height < 0)) {
      // to make sure the winding direction is always the same,
      // does not matter in which direction the rectangle is drawn
      this.reversePath(varPackedPath);
    }

    return varPackedPath;
  }

  getUnpackedContours(x, y, width, height) {
    return getUnpackedContoursRect(x, y, width, height);
  }

  reversePath(path) {
    for (let i = 0; i < path.contourInfo.length; i++) {
      const contour = path.getUnpackedContour(i);
      const packedContour = this.reversePackedContour(contour);
      path.setContour(i, packContour(packedContour));
    }
  }

  reversePackedContour(contour) {
    contour.points.reverse();
    if (contour.isClosed) {
      const [lastPoint] = contour.points.splice(-1, 1);
      contour.points.splice(0, 0, lastPoint);
    }
    return contour;
  }
}

export function getUnpackedContoursRect(x, y, width, height, contourType = "cubic") {
  const unpackedContours = [
    {
      points: [
        { x: x, y: y },
        { x: x, y: y + height },
        { x: x + width, y: y + height },
        { x: x + width, y: y },
      ],
      isClosed: true,
    },
  ];

  return unpackedContours;
}

export class ShapeToolEllipse extends ShapeToolRect {
  iconPath = "/tabler-icons/circle-plus-2.svg";
  identifier = "shape-tool-ellipse";
  shapeNames = ["ellipse", "circle"];

  getUnpackedContours(x, y, width, height) {
    let cx = x + width / 2;
    let cy = y + height / 2;
    let shape = getUnpackedContoursEllipse(cx, cy, width / 2, height / 2);
    return [this.reversePackedContour(shape[0])];
  }
}

const bezierArcMagic = 0.5522847498; // constant for drawing circular arcs w/ Beziers
export function getUnpackedContoursEllipse(cx, cy, rx, ry, t = bezierArcMagic) {
  let points = [];
  let [x, y] = [1, 0];

  for (let i = 0; i < 4; i++) {
    points.push({ x: cx + rx * x, y: cy + ry * y, smooth: true });
    points.push({ x: cx + rx * (x - y * t), y: cy + ry * (x * t + y), type: "cubic" });
    points.push({ x: cx + rx * (x * t - y), y: cy + ry * (x + y * t), type: "cubic" });
    [x, y] = [-y, x];
  }

  return [{ points: points, isClosed: true }];
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

    if (model.shapeToolShowFill) {
      context.fillStyle = parameters.boxColor;
      context.fill(shape);
    }

    context.strokeStyle = parameters.strokeColor;
    context.lineWidth = parameters.strokeWidth;
    context.stroke(shape);
  },
});
