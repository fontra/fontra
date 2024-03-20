import { VarPackedPath } from "../core/var-path.js";
import { ShapeToolRect } from "./edit-tools-shape.js";

const bezierArcMagic = 0.5522847498; // constant for drawing circular arcs w/ Beziers

export class ShapeToolEllipse extends ShapeToolRect {
  iconPath = "/tabler-icons/circle-plus-2.svg";
  identifier = "shape-tool-ellipse";

  drawShapePath(path, x, y, width, height) {
    let cx = x + width / 2;
    let cy = y + height / 2;

    drawEllipse(path, cx, cy, width / 2, height / 2);
  }
}

function drawEllipse(path, cx, cy, rx, ry, t = bezierArcMagic) {
  let [x, y] = [1, 0];
  path.moveTo(
    Math.round(cx + rx * x),
    Math.round(cy + ry * y),
    VarPackedPath.SMOOTH_FLAG
  );
  for (let i = 0; i < 4; i++) {
    path.bezierCurveTo(
      Math.round(cx + rx * (x - y * t)),
      Math.round(cy + ry * (x * t + y)),
      Math.round(cx + rx * (x * t - y)),
      Math.round(cy + ry * (x + y * t)),
      Math.round(cx + rx * -y),
      Math.round(cy + ry * x),
      VarPackedPath.SMOOTH_FLAG
    );
    [x, y] = [-y, x];
  }
  path.closePath();
}
