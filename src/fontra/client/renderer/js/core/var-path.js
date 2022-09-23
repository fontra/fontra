import VarArray from "./var-array.js"
import { VariationError } from "./errors.js"
import { pointInRect } from "./rectangle.js";
import { convexHull } from "./convex-hull.js";


export default class VarPath {

  // point types
  static ON_CURVE = 0x00;
  static OFF_CURVE_QUAD = 0x01;
  static OFF_CURVE_CUBIC = 0x02;
  static SMOOTH_FLAG = 0x08;
  static POINT_TYPE_MASK = 0x07;

  constructor(coordinates, pointTypes, contourInfo) {
    if (coordinates === undefined) {
      this.coordinates = new VarArray();
      this.pointTypes = [];
      this.contourInfo = [];
    } else {
      this.coordinates = coordinates;
      this.pointTypes = pointTypes;
      this.contourInfo = contourInfo;
    }
  }

  static fromObject(obj) {
    const path = new VarPath();
    path.coordinates = VarArray.from(obj.coordinates);
    path.pointTypes = obj.pointTypes;
    path.contourInfo = obj.contourInfo;
    return path;
  }

  get numPoints() {
    return this.pointTypes.length;
  }

  getControlBounds() {
    if (!this.coordinates.length) {
      return undefined;
    }
    let xMin = this.coordinates[0];
    let yMin = this.coordinates[1];
    let xMax = xMin;
    let yMax = yMin;
    for (let i = 2; i < this.coordinates.length; i += 2) {
      const x = this.coordinates[i];
      const y = this.coordinates[i + 1];
      xMin = Math.min(x, xMin);
      yMin = Math.min(y, yMin);
      xMax = Math.max(x, xMax);
      yMax = Math.max(y, yMax);
    }
    return {"xMin": xMin, "yMin": yMin, "xMax": xMax, "yMax": yMax};
  }

  getConvexHull() {
    if (!this.coordinates.length) {
      return undefined;
    }
    const points = [];
    for (let i = 0; i < this.coordinates.length; i += 2) {
      points.push({"x": this.coordinates[i], "y": this.coordinates[i + 1]});
    }
    return convexHull(points);
  }

  getContourIndex(pointIndex) {
    if (pointIndex < 0) {
      return undefined;
    }
    // binary search, adapted from bisect.py
    let lo = 0;
    let hi = this.contourInfo.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (pointIndex <= this.contourInfo[mid].endPoint) {
        hi = mid;
      }
      else {
        lo = mid + 1;
      }
    }
    if (lo >= this.contourInfo.length) {
      return undefined;
    }
    return lo
  }

  getPoint(pointIndex) {
    const point = {
      x: this.coordinates[pointIndex * 2],
      y: this.coordinates[pointIndex * 2 + 1],
      type: this.pointTypes[pointIndex] & VarPath.POINT_TYPE_MASK,
      smooth: !!(this.pointTypes[pointIndex] & VarPath.SMOOTH_FLAG),
    };
    if (point.x === undefined) {
      return undefined;
    }
    return point;
  }

  setPoint(pointIndex, point) {
    this.setPointPosition(pointIndex, point.x, point.y);
    this.setPointType(pointIndex, point.type, point.smooth);
  }

  setPointPosition(pointIndex, x, y) {
    this.coordinates[pointIndex * 2] = x;
    this.coordinates[pointIndex * 2 + 1] = y;
  }

  setPointType(pointIndex, type, smooth) {
    if (type !== undefined) {
      this.pointTypes[pointIndex] &= ~VarPath.POINT_TYPE_MASK;
      this.pointTypes[pointIndex] |= type & VarPath.POINT_TYPE_MASK;
    }
    if (smooth !== undefined) {
      this.pointTypes[pointIndex] &= ~VarPath.SMOOTH_FLAG;
      this.pointTypes[pointIndex] |= (!!smooth) * VarPath.SMOOTH_FLAG;
    }
  }

  insertPoint(contourIndex, contourPointIndex, point) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const pointIndex = this._getAbsolutePointIndex(contourIndex, contourPointIndex, true);
    this._insertPoint(contourIndex, pointIndex, point);
  }

  appendPoint(contourIndex, point) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const contour = this.contourInfo[contourIndex];
    this._insertPoint(contourIndex, contour.endPoint + 1, point);
  }

  deletePoint(contourIndex, contourPointIndex) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const pointIndex = this._getAbsolutePointIndex(contourIndex, contourPointIndex);
    this.coordinates.splice(pointIndex * 2, 2);
    this.pointTypes.splice(pointIndex, 1);
    for (let ci = contourIndex; ci < this.contourInfo.length; ci++) {
      this.contourInfo[ci].endPoint--;
    }
  }

  _insertPoint(contourIndex, pointIndex, point) {
    this.coordinates.splice(pointIndex * 2, 0, point.x, point.y);
    this.pointTypes.splice(pointIndex, 0, 0);
    for (let ci = contourIndex; ci < this.contourInfo.length; ci++) {
      this.contourInfo[ci].endPoint++;
    }
    this.setPointType(pointIndex, point.type, point.smooth);
  }

  _normalizeContourIndex(contourIndex) {
    const originalContourIndex = contourIndex;
    if (contourIndex < 0) {
      contourIndex += this.contourInfo.length;
    }
    if (this.contourInfo[contourIndex] === undefined) {
      throw new Error(`contourIndex out of bounds: ${originalContourIndex}`)
    }
    return contourIndex;
  }

  _getAbsolutePointIndex(contourIndex, contourPointIndex, forInsert = false) {
    const startPoint = this._getContourStartPoint(contourIndex);
    const contour = this.contourInfo[contourIndex];
    const numPoints = contour.endPoint + 1 - startPoint;
    const originalContourPointIndex = contourPointIndex;
    if (contourPointIndex < 0) {
      contourPointIndex += numPoints;
    }
    if (contourPointIndex < 0 || contourPointIndex >= numPoints + (forInsert ? 1 : 0)) {
      throw new Error(`contourPointIndex out of bounds: ${originalContourPointIndex}`)
    }
    return startPoint + contourPointIndex;
  }

  _getContourStartPoint(contourIndex) {
    return contourIndex === 0 ? 0 : this.contourInfo[contourIndex - 1].endPoint + 1;
  }

  *iterPoints() {
    yield* this._iterPointsFromTo(0, this.pointTypes.length - 1);
  }

  *iterPointsOfContour(contourIndex) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const contour = this.contourInfo[contourIndex];
    const startPoint = this._getContourStartPoint(contourIndex);
    yield* this._iterPointsFromTo(startPoint, contour.endPoint);
  }

  *_iterPointsFromTo(startPoint, endPoint) {
    for (let index = startPoint; index <= endPoint; index++) {
      yield this.getPoint(index);
    }
  }

  *iterHandles() {
    let startPoint = 0;
    for (const contour of this.contourInfo) {
      const endPoint = contour.endPoint;
      let prevIndex = contour.isClosed ? endPoint : startPoint;
      for (let nextIndex = startPoint + (contour.isClosed ? 0 : 1); nextIndex <= endPoint; nextIndex++) {
        const prevType = this.pointTypes[prevIndex] & VarPath.POINT_TYPE_MASK;
        const nextType = this.pointTypes[nextIndex] & VarPath.POINT_TYPE_MASK;
        if (prevType != nextType) {
          yield [
            {x: this.coordinates[prevIndex * 2], y: this.coordinates[prevIndex * 2 + 1]},
            {x: this.coordinates[nextIndex * 2], y: this.coordinates[nextIndex * 2 + 1]},
          ];
        }
        prevIndex = nextIndex;
      }
      startPoint = endPoint + 1;
    }
  }

  *iterPointsInRect(rect) {
    let pointIndex = 0;
    for (const point of this.iterPoints()) {
      if (pointInRect(point.x, point.y, rect)) {
        yield {...point, pointIndex: pointIndex};
      }
      pointIndex++;
    }
  }

  copy() {
    return new this.constructor(
      this.coordinates.copy(),
      this.pointTypes.slice(),
      this.contourInfo.map(item => { return {...item} }),
    );
  }

  appendEmptyPath() {
    this.contourInfo.push({endPoint: this.coordinates.length / 2 - 1, isClosed: false});
  }

  _appendPoint(x, y, pointType) {
    this.contourInfo[this.contourInfo.length - 1].endPoint += 1;
    this.coordinates.push(x, y);
    this.pointTypes.push(pointType);
  }

  moveTo(x, y) {
    this.appendEmptyPath();
    this._appendPoint(x, y, VarPath.ON_CURVE);
  }

  lineTo(x, y) {
    this._appendPoint(x, y, VarPath.ON_CURVE);
  }

  cubicCurveTo(x1, y1, x2, y2, x3, y3) {
    this._appendPoint(x1, y1, VarPath.OFF_CURVE_CUBIC);
    this._appendPoint(x2, y2, VarPath.OFF_CURVE_CUBIC);
    this._appendPoint(x3, y3, VarPath.ON_CURVE);
  }

  quadraticCurveTo(...args) {
    const numArgs = args.length;
    if (numArgs % 2) {
      throw new Error("number of arguments to quadraticCurveTo must be even");
    }
    for (let i = 0; i < numArgs - 2; i += 2) {
      this._appendPoint(args[i], args[i + 1], VarPath.OFF_CURVE_QUAD);
    }
    const i = numArgs - 2;
    this._appendPoint(args[i], args[i + 1], VarPath.ON_CURVE);
  }

  closePath() {
    this.contourInfo[this.contourInfo.length - 1].isClosed = true;
  }

  addItemwise(other) {
    let otherCoordinates;
    if (other instanceof VarPath) {
      this._ensureCompatibility(other);
      otherCoordinates = other.coordinates;
    } else {
      otherCoordinates = other;
    }
    return new this.constructor(this.coordinates.addItemwise(otherCoordinates), this.pointTypes, this.contourInfo);
  }

  subItemwise(other) {
    let otherCoordinates;
    if (other instanceof VarPath) {
      this._ensureCompatibility(other);
      otherCoordinates = other.coordinates;
    } else {
      otherCoordinates = other;
    }
    return new this.constructor(this.coordinates.subItemwise(otherCoordinates), this.pointTypes, this.contourInfo);
  }

  _ensureCompatibility(other) {
    if (
      !arrayEquals(this.contourInfo, other.contourInfo) ||
      !pointTypesEquals(this.pointTypes, other.pointTypes)
    ) {
      throw new VariationError("paths are not compatible");
    }
  }

  mulScalar(scalar) {
    return new this.constructor(this.coordinates.mulScalar(scalar), this.pointTypes, this.contourInfo);
  }

  drawToPath2d(path) {
    let startPoint = 0
    const coordinates = this.coordinates;
    const pointTypes = this.pointTypes;

    for (const contour of this.contourInfo) {
      const endPoint = contour.endPoint;
      const numPoints = contour.endPoint + 1 - startPoint;

      var firstOnCurve = null;

      // Determine the index of the first on-curve point, if any
      for (let i = 0; i < numPoints; i++) {
        if ((pointTypes[i + startPoint] & VarPath.POINT_TYPE_MASK) === VarPath.ON_CURVE) {
          firstOnCurve = i;
          break;
        }
      }

      if (firstOnCurve !== null) {
        drawContourToPath(path, coordinates, pointTypes, startPoint, numPoints, firstOnCurve, contour.isClosed);
      } else {
        // draw quad blob
        // create copy of contour points, and insert implied on-curve at front
        const blobCoordinates = coordinates.slice(startPoint * 2, (endPoint + 1) * 2);
        const blobPointTypes = pointTypes.slice(startPoint, endPoint + 1);
        const xMid = (blobCoordinates[0] + blobCoordinates[endPoint * 2]) / 2;
        const yMid = (blobCoordinates[1] + blobCoordinates[endPoint * 2 + 1]) / 2;
        blobCoordinates.unshift(xMid, yMid);
        blobPointTypes.unshift(VarPath.ON_CURVE);
        drawContourToPath(path, blobCoordinates, blobPointTypes, 0, numPoints + 1, 0, true);
      }

      startPoint = endPoint + 1;
    }
  }

  transformed(transformation) {
    const coordinates = new VarArray(this.coordinates.length);
    for (let i = 0; i < this.coordinates.length; i += 2) {
      const x = this.coordinates[i];
      const y = this.coordinates[i + 1];
      [coordinates[i], coordinates[i + 1]] = transformation.transformPoint(x, y);
    }
    return new this.constructor(coordinates, this.pointTypes, this.contourInfo);
  }

  concat(other) {
    const result = new VarPath();
    result.coordinates = this.coordinates.concat(other.coordinates);
    result.pointTypes = this.pointTypes.concat(other.pointTypes);
    result.contourInfo = this.contourInfo.concat(other.contourInfo).map(c => { return {...c}; });
    const endPointOffset = this.numPoints;
    for (let i = this.contourInfo.length; i < result.contourInfo.length; i++) {
      result.contourInfo[i].endPoint += endPointOffset;
    }
    return result;
  }

}


function drawContourToPath(path, coordinates, pointTypes, startPoint, numPoints, firstOnCurve, isClosed) {
  let currentSegment = [];
  let segmentFunc = drawLineSegment;
  const lastIndex = isClosed ? numPoints : numPoints - 1 - firstOnCurve;
  for (let i = 0; i <= lastIndex; i++) {
    const index = isClosed ? (startPoint + (firstOnCurve + i) % numPoints) : (startPoint + firstOnCurve + i);
    const pointType = pointTypes[index] & VarPath.POINT_TYPE_MASK;
    const x = coordinates[index * 2];
    const y = coordinates[index * 2 + 1];
    if (i === 0) {
      path.moveTo(x, y);
    } else {
      currentSegment.push(x, y);
      switch (pointType) {
        case VarPath.ON_CURVE:
          segmentFunc(path, currentSegment)
          currentSegment = [];
          segmentFunc = drawLineSegment;
          break;
        case VarPath.OFF_CURVE_QUAD:
          segmentFunc = drawQuadSegment;
          break;
        case VarPath.OFF_CURVE_CUBIC:
          segmentFunc = drawCubicSegment;
          break;
        default:
          throw new Error("illegal point type");
      }
    }
  }
  if (isClosed) {
    path.closePath();
  }
}


function drawLineSegment(path, segment) {
  path.lineTo(...segment);
}


function drawQuadSegment(path, segment) {
  let [x1, y1] = [segment[0], segment[1]]
  const lastIndex = segment.length - 2;
  for (let i = 2; i < lastIndex; i += 2) {
    const [x2, y2] = [segment[i], segment[i + 1]];
    const xMid = (x1 + x2) / 2;
    const yMid = (y1 + y2) / 2;
    path.quadraticCurveTo(x1, y1, xMid, yMid);
    [x1, y1] = [x2, y2];
  }
  path.quadraticCurveTo(x1, y1, segment[lastIndex], segment[lastIndex + 1]);
}


function drawCubicSegment(path, segment) {
  if (segment.length === 6) {
    path.bezierCurveTo(...segment);
  } else if (segment.length >= 2) {
    // TODO warn or error
    path.lineTo(...segment.slice(-2));
  }
}


function arrayEquals(a, b) {
  // Oh well
  return JSON.stringify(a) === JSON.stringify(b);
}


function pointTypesEquals(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if ((a[i] & VarPath.POINT_TYPE_MASK) != (b[i] & VarPath.POINT_TYPE_MASK)) {
      return false;
    }
  }
  return true;
}
