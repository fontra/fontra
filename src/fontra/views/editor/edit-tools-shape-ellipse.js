import * as rectangle from "../core/rectangle.js";
import { range } from "../core/utils.js";
import { ShapeToolRect } from "./edit-tools-shape.js";

const bezierArcMagic = 0.5522847498; // constant for drawing circular arcs w/ Beziers

export class ShapeToolEllipse extends ShapeToolRect {
  iconPath = "/tabler-icons/circle-plus-2.svg";
  identifier = "shape-tool-ellipse";

  getUnpackedContour(x, y, width, height) {
    let cx = x + width / 2;
    let cy = y + height / 2;

    return getUnpackedContourEllipse(cx, cy, width / 2, height / 2);
  }
}

export function getUnpackedContourEllipse(cx, cy, rx, ry, t = bezierArcMagic) {
  let points = [];
  let [x, y] = [1, 0];
  points.push({ x: cx + rx * x, y: cy + ry * y, smooth: true });
  for (let i = 0; i < 4; i++) {
    points.push({ x: cx + rx * (x - y * t), y: cy + ry * (x * t + y), type: "cubic" });
    points.push({ x: cx + rx * (x * t - y), y: cy + ry * (x + y * t), type: "cubic" });
    points.push({ x: cx + rx * -y, y: cy + ry * x, smooth: true });
    [x, y] = [-y, x];
  }
  points.pop(); // remove last point
  return [{ points: points, isClosed: true }];
}
