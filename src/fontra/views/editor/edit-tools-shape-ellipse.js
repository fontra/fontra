import * as rectangle from "../core/rectangle.js";
import { range } from "../core/utils.js";
import { ShapeToolRect } from "./edit-tools-shape.js";

const bezierArcMagic = 0.5522847498; // constant for drawing circular arcs w/ Beziers

export class ShapeToolEllipse extends ShapeToolRect {
  iconPath = "/tabler-icons/circle-plus-2.svg";
  identifier = "shape-tool-ellipse";

  drawShapePath(path, x, y, width, height, reversed, centered) {
    let radiusX = height * -1;
    let radiusY = width;

    drawEllipse(
      path,
      x,
      y,
      radiusX / 2,
      radiusY / 2,
      bezierArcMagic,
      reversed,
      centered
    );
  }
}

function drawEllipse(
  path,
  cx,
  cy,
  rx,
  ry,
  tension,
  reversed = false,
  centered = false
) {
  // to reverse contour, just use negative rx or ry
  let shiftX = rx,
    shiftY = ry;

  if (reversed) {
    rx = rx * -1;
    shiftX = rx;
  } else {
    shiftX = -rx;
  }

  if (centered) {
    (shiftX = 0), (shiftY = 0);
    rx = rx * 2;
    ry = ry * 2;
  }

  let h1x = 1,
    h1y = tension;
  let h2x = tension,
    h2y = 1;
  let x = 0,
    y = 1;
  path.moveTo(cx + rx + shiftX, cy + shiftY);

  for (let i = 0; i < 4; i++) {
    path.bezierCurveTo(
      Math.round(cx + rx * h1x + shiftX),
      Math.round(cy + ry * h1y + shiftY),
      Math.round(cx + rx * h2x + shiftX),
      Math.round(cy + ry * h2y + shiftY),
      Math.round(cx + rx * x + shiftX),
      Math.round(cy + ry * y + shiftY)
    );
    let tempH1x = h1x,
      tempH1y = h1y;
    h1x = -h1y;
    h1y = tempH1x;
    let tempH2x = h2x,
      tempH2y = h2y;
    h2x = -h2y;
    h2y = tempH2x;
    let tempX = x,
      tempY = y;
    x = -y;
    y = tempX;
  }
  path.closePath();
}
