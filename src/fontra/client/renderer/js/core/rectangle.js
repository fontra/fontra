export function pointInRect(x, y, rect) {
  return (
    x >= rect.xMin &&
    x <= rect.xMax &&
    y >= rect.yMin &&
    y <= rect.yMax
  );
}


export function centeredRect(x, y, width, height) {
  if (height === undefined) {
    height = width;
  }
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return {
    xMin: x - halfWidth,
    yMin: y - halfHeight,
    xMax: x + halfWidth,
    yMax: y + halfHeight,
  }
}


export function normalizeRect(rect) {
  const nRect = {
    "xMin": Math.min(rect.xMin, rect.xMax),
    "yMin": Math.min(rect.yMin, rect.yMax),
    "xMax": Math.max(rect.xMin, rect.xMax),
    "yMax": Math.max(rect.yMin, rect.yMax),
  };
  return nRect;
}


export function sectRect(rect1, rect2) {
    // Test for rectangle-rectangle intersection.

    // Args:
    //     rect1: First bounding rectangle
    //     rect2: Second bounding rectangle

    // Returns:
    //     A rectangle or null.
    //     If the input rectangles intersect, returns the intersecting rectangle.
    //     Returns ``null`` if the input rectangles do not intersect.
    const xMin = Math.max(rect1.xMin, rect2.xMin);
    const yMin = Math.max(rect1.yMin, rect2.yMin);
    const xMax = Math.min(rect1.xMax, rect2.xMax);
    const yMax = Math.min(rect1.yMax, rect2.yMax);
    if (xMin > xMax || yMin > yMax) {
      return undefined;
    }
    return {"xMin": xMin, "yMin": yMin, "xMax": xMax, "yMax": yMax};
}


export function unionRect(...rectangles) {
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
  return {"xMin": xMin, "yMin": yMin, "xMax": xMax, "yMax": yMax};
}


export function offsetRect(rect, x, y) {
  return {
    "xMin": rect.xMin + x,
    "yMin": rect.yMin + y,
    "xMax": rect.xMax + x,
    "yMax": rect.yMax + y,
  };
}


export function scaleRect(rect, sx, sy) {
  if (sy === undefined) {
    sy = sx;
  }
  return {
    "xMin": rect.xMin * sx,
    "yMin": rect.yMin * sy,
    "xMax": rect.xMax * sx,
    "yMax": rect.yMax * sy,
  };
}


export function insetRect(rect, dx, dy) {
  return {
    "xMin": rect.xMin + dx,
    "yMin": rect.yMin + dy,
    "xMax": rect.xMax - dx,
    "yMax": rect.yMax - dy,
  };
}


export function equalRect(rect1, rect2) {
  return (
    rect1.xMin === rect2.xMin &&
    rect1.yMin === rect2.yMin &&
    rect1.xMax === rect2.xMax &&
    rect1.yMax === rect2.yMax
  )
}


export function rectCenter(rect) {
  return {"x": (rect.xMin + rect.xMax) / 2, "y": (rect.yMin + rect.yMax) / 2};
}


export function rectSize(rect) {
  return {"width": Math.abs(rect.xMax - rect.xMin), "height": Math.abs(rect.yMax - rect.yMin)};
}


export function rectFromArray(array) {
  if (array.length != 4) {
    throw new Error("rect array must have length == 4");
  }
  return {"xMin": array[0], "yMin": array[1], "xMax": array[2], "yMax": array[3]}
}


export function rectToArray(rect) {
  return [rect.xMin, rect.yMin, rect.xMax, rect.yMax];
}


export function isEmptyRect(rect) {
  const size = rectSize(rect);
  return size.width === 0 && size.height === 0;
}
