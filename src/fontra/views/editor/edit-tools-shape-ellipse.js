import * as rectangle from "../core/rectangle.js";
import { range } from "../core/utils.js";
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
  path.moveTo(cx + rx * x, cy + ry * y);
  for (let i = 0; i < 4; i++) {
    path.bezierCurveTo(
      cx + rx * (x - y * t),
      cy + ry * (x * t + y),
      cx + rx * (x * t - y),
      cy + ry * (x + y * t),
      cx + rx * -y,
      cy + ry * x
    );
    [x, y] = [-y, x];
  }
  path.closePath();
}
