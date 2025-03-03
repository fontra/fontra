import { equalRect, normalizeRect, sectRect } from "./rectangle.js";
import { reversed } from "./utils.js";

export function pointInConvexPolygon(x, y, polygon) {
  // Adapted from a comment on
  // https://stackoverflow.com/questions/1119627/how-to-test-if-a-point-is-inside-of-a-convex-polygon-in-2d-integer-coordinates

  // Check if a triangle or higher n-gon
  if (polygon.length < 3) {
    return false;
  }

  const testPoint = { x: x, y: y };

  // n>2 Keep track of cross product sign changes
  let pos = 0;
  let neg = 0;

  for (let i = 0; i < polygon.length; i++) {
    // If point is in the polygon
    if (polygon[i].x === x && polygon[i].y === y) {
      return true;
    }

    // Form a segment between the i'th point
    // And the i+1'th, or if i is the last, with the first point
    const i2 = (i + 1) % polygon.length;

    // Compute the cross product
    const d = ccw(polygon[i], testPoint, polygon[i2]);

    if (d > 0) {
      pos++;
    } else if (d < 0) {
      neg++;
    }

    // If the sign changes, then point is outside
    if (pos > 0 && neg > 0) {
      return false;
    }
  }

  // If no change in direction, then on same side of all segments, and thus inside
  return true;
}

export function rectIntersectsPolygon(rect, polygon) {
  // Return true when the rectangle intersects the polygon, or if the
  // polygon is fully enclosed by the rectangle. It misses the case
  // when the rectangle is fully enclosed by the polygon, but we don't
  // need that case so it's left unimplemented.
  const numPoints = polygon.length;
  for (let i1 = 0; i1 < numPoints; i1++) {
    const i2 = (i1 + 1) % numPoints;
    if (lineIntersectsRect(polygon[i1], polygon[i2], rect)) {
      return true;
    }
  }
  return false;
}

const EPSILON = 0.0001; // we deal with font units, this should be small enough

function lineIntersectsRect(p1, p2, rect) {
  // Return true if line p1,p2 intersects any of the sides of rect,
  // or if it is fully enclosed by rect.
  const lineRect = normalizeRect({ xMin: p1.x, yMin: p1.y, xMax: p2.x, yMax: p2.y });
  const lineSectRect = sectRect(rect, lineRect);
  if (!lineSectRect) {
    return false;
  }
  if (equalRect(lineRect, lineSectRect)) {
    // both p1 and p2 are inside rect
    return true;
  }
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const abs_dx = Math.abs(dx);
  const abs_dy = Math.abs(dy);
  if (abs_dx < EPSILON || abs_dy < EPSILON) {
    return true;
  }
  if (abs_dx > abs_dy) {
    const t = clipT(p1.x, dx, rect.xMin, rect.xMax);
    if (!t) {
      return false;
    }
    const v = [p1.y + t[0] * dy, p1.y + t[1] * dy];
    v.sort(compare);
    return v[0] <= rect.yMax && v[1] >= rect.yMin;
  } else {
    const t = clipT(p1.y, dy, rect.yMin, rect.yMax);
    if (!t) {
      return false;
    }
    const v = [p1.x + t[0] * dx, p1.x + t[1] * dx];
    v.sort(compare);
    return v[0] <= rect.xMax && v[1] >= rect.xMin;
  }
  return false; // unreachable
}

function clipT(a, b, minimum, maximum) {
  const t = [(minimum - a) / b, (maximum - a) / b];
  t.sort(compare);
  if (t[0] < 0) {
    t[0] = 0;
  }
  if (t[1] > 1) {
    t[1] = 1;
  }
  return t[0] <= t[1] ? t : undefined;
}

function compare(a, b) {
  // Return -1 when a < b, 1 when a > b, and 0 when a == b
  return (a > b) - (a < b);
}

export function convexHull(points) {
  // Adapted from https://en.wikipedia.org/wiki/Graham_scan

  // "The same basic idea works also if the input is sorted on x-coordinate
  // instead of angle, and the hull is computed in two steps producing the
  // upper and the lower parts of the hull respectively."

  points = Array.from(points);
  // Sort by (x, y)
  points.sort((a, b) => compare(a.x, b.x) || compare(a.y, b.y));
  const lower = halfConvexHull(points);
  const upper = halfConvexHull(reversed(points));
  return upper.concat(lower);
}

function halfConvexHull(points) {
  // Returns half of the convex hull for a set of sorted points.
  // Call with the points reversed for the other half.
  const stack = [];
  for (const point of points) {
    while (
      stack.length > 1 &&
      ccw(stack[stack.length - 2], stack[stack.length - 1], point) <= 0
    ) {
      stack.pop();
    }
    stack.push(point);
  }
  stack.pop();
  return stack;
}

function ccw(p1, p2, p3) {
  // Return a positive number if p1,p2,p3 make a counter-clockwise turn,
  // return a negative number if p1,p2,p3 make a clockwise turn, and
  // return 0 if the three points are collinear
  // A.k.a. compute the cross product
  return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
}

export function simplePolygonArea(points) {
  // Compute the area of a simple (non-self-intersecting) polygon.
  // (A convex polygon is also a simple polygon.)
  // This uses the Shoelace formula: https://en.wikipedia.org/wiki/Shoelace_formula
  let areaX2 = 0;
  let pt0 = points.at(-1);
  for (const pt1 of points) {
    areaX2 += pt0.x * pt1.y;
    areaX2 -= pt0.y * pt1.x;
    pt0 = pt1;
  }
  return areaX2 / 2;
}

export function polygonIsConvex(points) {
  let gotNegative = false;
  let gotPositive = false;
  for (let i = 0; i < points.length; i++) {
    const A = points.at(i - 2);
    const B = points.at(i - 1);
    const C = points[i];
    const prod = ccw(A, B, C);
    if (prod < 0) {
      gotNegative = true;
    } else if (prod > 0) {
      gotPositive = true;
    }
    if (gotNegative && gotPositive) {
      return false;
    }
  }
  return true;
}
