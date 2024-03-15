import * as rectangle from "../core/rectangle.js";
import { range } from "../core/utils.js";
import { ShapeToolRect } from "./edit-tools-shape.js";

const bezierArcMagic = 0.5522847498; // constant for drawing circular arcs w/ Beziers

export class ShapeToolEllipse extends ShapeToolRect {
  iconPath = "/tabler-icons/circle-plus-2.svg";
  identifier = "shape-tool-ellipse";

  drawShapePath(path, rect, event) {
    const x = rect.xMin;
    const y = rect.yMin;
    let radiusX = rect.xMax - rect.xMin;
    let radiusY = rect.yMax - rect.yMin;

    if (event.shiftKey) {
      // make circle, not ellipse
      if ((radiusX > 0 && radiusY > 0) || (radiusX < 0 && radiusY < 0)) {
        radiusY = radiusX;
      } else {
        radiusY = -radiusX;
      }
    }

    if (event.ctrlKey) {
      // reversed ellipse
      radiusX = radiusX * -1;
    }

    if (event.altKey) {
      // positon at center
      drawEllipse(path, x, y, radiusX, radiusY, bezierArcMagic, true);
    } else {
      drawEllipse(path, x, y, radiusX / 2, radiusY / 2, bezierArcMagic);
    }
  }
}

function drawEllipse(path, cx, cy, rx, ry, tension, centered = false) {
  // to reverse contour, just use negative rx or ry
  let shiftX = rx,
    shiftY = ry;
  if (centered) {
    (shiftX = 0), (shiftY = 0);
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

/*
// constant for drawing circular arcs w/ quadratic Beziers
const quadBezierArcMagic = 0.414213562373

export function drawEllipseQuadratic(pen, cx, cy, rx, ry, tension=quadBezierArcMagic):
    // to reverse contour, just use negative rx or ry
    x = rx * tension
    y = ry * tension
    pen.qCurveTo((cx+x, cy+ry), (cx+rx, cy+y),
                 (cx+rx, cy-y), (cx+x, cy-ry),
                 (cx-x, cy-ry), (cx-rx, cy-y),
                 (cx-rx, cy+y), (cx-x, cy+ry), None)
    pen.closePath()


// Two convenience functions

export function drawCircle(pen, cx, cy, radius, reverse=False):
    rx = ry = radius
    if reverse:
        ry = -ry
    drawEllipse(pen, cx, cy, rx, ry)


export function drawCircleQuadratic(pen, cx, cy, radius, reverse=False):
    rx = ry = radius
    if reverse:
        ry = -ry
    drawEllipseQuadratic(pen, cx, cy, rx, ry)
*/
