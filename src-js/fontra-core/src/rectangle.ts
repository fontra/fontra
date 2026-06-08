import { isNumber } from "./utils.ts";

export type Point = {
  x: number;
  y: number;
};

export type Rect = {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
};

export type Size = {
  width: number;
  height: number;
};

export function pointInRect(x: number, y: number, rect: Rect) {
  if (!rect) {
    return false;
  }
  return x >= rect.xMin && x <= rect.xMax && y >= rect.yMin && y <= rect.yMax;
}

export function centeredRect(
  x: number,
  y: number,
  width: number,
  height: number = width
) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return {
    xMin: x - halfWidth,
    yMin: y - halfHeight,
    xMax: x + halfWidth,
    yMax: y + halfHeight,
  };
}

export function normalizeRect(rect: Rect): Rect {
  return {
    xMin: Math.min(rect.xMin, rect.xMax),
    yMin: Math.min(rect.yMin, rect.yMax),
    xMax: Math.max(rect.xMin, rect.xMax),
    yMax: Math.max(rect.yMin, rect.yMax),
  };
}

/**
 * Test for rectangle-rectangle intersection.
 *
 * @param rect1 First bounding rectangle
 * @param rect2 Second bounding rectangle
 *
 * @returns
 * A rectangle or undefined.
 *
 * If the input rectangles intersect, returns the intersecting rectangle.
 * Returns ``undefined`` if the input rectangles do not intersect.
 */
export function sectRect(rect1: Rect, rect2: Rect): Rect | undefined {
  const xMin = Math.max(rect1.xMin, rect2.xMin);
  const yMin = Math.max(rect1.yMin, rect2.yMin);
  const xMax = Math.min(rect1.xMax, rect2.xMax);
  const yMax = Math.min(rect1.yMax, rect2.yMax);
  if (xMin > xMax || yMin > yMax) {
    return undefined;
  }
  return { xMin: xMin, yMin: yMin, xMax: xMax, yMax: yMax };
}

export function unionRect(...rectangles: Rect[]): Rect | undefined {
  if (!rectangles.length) {
    return undefined;
  }
  const firstRect = rectangles[0];
  let xMin = firstRect.xMin;
  let yMin = firstRect.yMin;
  let xMax = firstRect.xMax;
  let yMax = firstRect.yMax;
  for (let i = 1; i < rectangles.length; i++) {
    const rect = rectangles[i];
    xMin = Math.min(xMin, rect.xMin);
    yMin = Math.min(yMin, rect.yMin);
    xMax = Math.max(xMax, rect.xMax);
    yMax = Math.max(yMax, rect.yMax);
  }
  return { xMin: xMin, yMin: yMin, xMax: xMax, yMax: yMax };
}

export function offsetRect(rect: Rect, x: number, y: number): Rect {
  return {
    xMin: rect.xMin + x,
    yMin: rect.yMin + y,
    xMax: rect.xMax + x,
    yMax: rect.yMax + y,
  };
}

export function scaleRect(rect: Rect, sx: number, sy: number = sx): Rect {
  return {
    xMin: rect.xMin * sx,
    yMin: rect.yMin * sy,
    xMax: rect.xMax * sx,
    yMax: rect.yMax * sy,
  };
}

export function insetRect(rect: Rect, dx: number, dy: number): Rect {
  return {
    xMin: rect.xMin + dx,
    yMin: rect.yMin + dy,
    xMax: rect.xMax - dx,
    yMax: rect.yMax - dy,
  };
}

export function equalRect(rect1: Rect, rect2: Rect) {
  return (
    rect1.xMin === rect2.xMin &&
    rect1.yMin === rect2.yMin &&
    rect1.xMax === rect2.xMax &&
    rect1.yMax === rect2.yMax
  );
}

export function rectCenter(rect: Rect): Point {
  return {
    x: (rect.xMin + rect.xMax) / 2,
    y: (rect.yMin + rect.yMax) / 2,
  };
}

export function rectSize(rect: Rect): Size {
  return {
    width: Math.abs(rect.xMax - rect.xMin),
    height: Math.abs(rect.yMax - rect.yMin),
  };
}

export function rectFromArray(array: [number, number, number, number]): Rect {
  if (array.length != 4) {
    throw new Error("rect array must have length == 4");
  }
  return {
    xMin: array[0],
    yMin: array[1],
    xMax: array[2],
    yMax: array[3],
  };
}

export function rectToArray(rect: Rect): [number, number, number, number] {
  return [rect.xMin, rect.yMin, rect.xMax, rect.yMax];
}

export function isEmptyRect(rect: Rect) {
  const size = rectSize(rect);
  return size.width === 0 && size.height === 0;
}

export function rectFromPoints(points: Point[]): Rect | undefined {
  if (!points.length) {
    return undefined;
  }
  const firstPoint = points[0];
  let xMin = firstPoint.x;
  let yMin = firstPoint.y;
  let xMax = firstPoint.x;
  let yMax = firstPoint.y;
  for (const point of points.slice(1)) {
    xMin = Math.min(xMin, point.x);
    yMin = Math.min(yMin, point.y);
    xMax = Math.max(xMax, point.x);
    yMax = Math.max(yMax, point.y);
  }
  return { xMin, yMin, xMax, yMax };
}

export function rectToPoints(rect: Rect): [Point, Point, Point, Point] {
  return [
    { x: rect.xMin, y: rect.yMin },
    { x: rect.xMax, y: rect.yMin },
    { x: rect.xMax, y: rect.yMax },
    { x: rect.xMin, y: rect.yMax },
  ];
}

/**
 * Return the smallest rect that includes the original rect and the given point.
 */
export function updateRect(rect: Rect, point: Point): Rect {
  return {
    xMin: Math.min(rect.xMin, point.x),
    yMin: Math.min(rect.yMin, point.y),
    xMax: Math.max(rect.xMax, point.x),
    yMax: Math.max(rect.yMax, point.y),
  };
}

export function rectAddMargin(rect: Rect, relativeMargin: number) {
  const size = rectSize(rect);
  const inset =
    size.width > size.height
      ? size.width * relativeMargin
      : size.height * relativeMargin;
  return insetRect(rect, -inset, -inset);
}

export function rectScaleAroundCenter(rect: Rect, scaleFactor: number, center: Point) {
  rect = offsetRect(rect, -center.x, -center.y);
  rect = scaleRect(rect, scaleFactor);
  rect = offsetRect(rect, center.x, center.y);
  return rect;
}

export function rectRound(rect: Rect): Rect {
  return {
    xMin: Math.round(rect.xMin),
    yMin: Math.round(rect.yMin),
    xMax: Math.round(rect.xMax),
    yMax: Math.round(rect.yMax),
  };
}

export function validateRect(rect: Rect) {
  if (
    !rect ||
    !isNumber(rect.xMin) ||
    !isNumber(rect.yMin) ||
    !isNumber(rect.xMax) ||
    !isNumber(rect.yMax)
  ) {
    throw new TypeError(`Not a valid rectangle: ${JSON.stringify(rect)}`);
  }
}
