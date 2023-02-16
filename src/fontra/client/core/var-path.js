import VarArray from "./var-array.js";
import { VariationError } from "./errors.js";
import { centeredRect, pointInRect } from "./rectangle.js";
import { convexHull } from "./convex-hull.js";
import { enumerate, range } from "./utils.js";

export const POINT_TYPE_OFF_CURVE_QUAD = "quad";
export const POINT_TYPE_OFF_CURVE_CUBIC = "cubic";

export class VarPackedPath {
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
    const path = new VarPackedPath();
    path.coordinates = VarArray.from(obj.coordinates);
    path.pointTypes = obj.pointTypes;
    path.contourInfo = obj.contourInfo;
    return path;
  }

  static fromUnpackedContours(unpackedContours) {
    const path = new VarPackedPath();
    for (const contour of unpackedContours) {
      path.appendUnpackedContour(contour);
    }
    return path;
  }

  unpackedContours() {
    return Array.from(this.iterUnpackedContours());
  }

  get numContours() {
    return this.contourInfo.length;
  }

  get numPoints() {
    return this.pointTypes.length;
  }

  getNumPointsOfContour(contourIndex) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const startPoint = this._getContourStartPoint(contourIndex);
    const contourInfo = this.contourInfo[contourIndex];
    return contourInfo.endPoint + 1 - startPoint;
  }

  getControlBounds() {
    return this._getControlBounds(0, this.pointTypes.length - 1);
  }

  getControlBoundsForContour(contourIndex) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const startPoint = this._getContourStartPoint(contourIndex);
    return this._getControlBounds(startPoint, this.contourInfo[contourIndex].endPoint);
  }

  _getControlBounds(startPoint, endPoint) {
    const startIndex = startPoint * 2;
    const endIndex = (endPoint + 1) * 2;
    if (endIndex - startIndex <= 0) {
      return undefined;
    }
    let xMin = this.coordinates[startIndex];
    let yMin = this.coordinates[startIndex + 1];
    let xMax = xMin;
    let yMax = yMin;
    for (let i = startIndex + 2; i < endIndex; i += 2) {
      const x = this.coordinates[i];
      const y = this.coordinates[i + 1];
      xMin = Math.min(x, xMin);
      yMin = Math.min(y, yMin);
      xMax = Math.max(x, xMax);
      yMax = Math.max(y, yMax);
    }
    return { xMin: xMin, yMin: yMin, xMax: xMax, yMax: yMax };
  }

  getConvexHull() {
    if (!this.coordinates.length) {
      return undefined;
    }
    const points = [];
    for (let i = 0; i < this.coordinates.length; i += 2) {
      points.push({ x: this.coordinates[i], y: this.coordinates[i + 1] });
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
      const mid = (lo + hi) >> 1; // Math.floor((lo + hi) / 2)
      if (pointIndex <= this.contourInfo[mid].endPoint) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    if (lo >= this.contourInfo.length) {
      return undefined;
    }
    return lo;
  }

  getContourAndPointIndex(pointIndex) {
    // Given an absolute pointIndex, return [contourIndex, contourPointIndex].
    // Throws an Error if the pointIndex is out of bounds.
    const contourIndex = this.getContourIndex(pointIndex);
    if (contourIndex === undefined) {
      throw new Error(`pointIndex out of bounds: ${pointIndex}`);
    }
    const startPoint = this._getContourStartPoint(contourIndex);
    return [contourIndex, pointIndex - startPoint];
  }

  getUnpackedContour(contourIndex) {
    return this._getUnpackedContour(this._normalizeContourIndex(contourIndex));
  }

  _getUnpackedContour(contourIndex) {
    const contourInfo = this.contourInfo[contourIndex];
    return {
      points: Array.from(this._iterPointsOfContour(contourIndex)),
      isClosed: contourInfo.isClosed,
    };
  }

  setUnpackedContour(contourIndex, unpackedContour) {
    this.setContour(contourIndex, packContour(unpackedContour));
  }

  appendUnpackedContour(unpackedContour) {
    this.appendContour(packContour(unpackedContour));
  }

  insertUnpackedContour(contourIndex, unpackedContour) {
    this.insertContour(contourIndex, packContour(unpackedContour));
  }

  getContour(contourIndex) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const contour = this.contourInfo[contourIndex];
    const startPoint = this._getContourStartPoint(contourIndex);
    return {
      coordinates: this.coordinates.slice(startPoint * 2, (contour.endPoint + 1) * 2),
      pointTypes: this.pointTypes.slice(startPoint, contour.endPoint + 1),
      isClosed: contour.isClosed,
    };
  }

  setContour(contourIndex, contour) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const startPoint = this._getContourStartPoint(contourIndex);
    const numOldPoints = this.contourInfo[contourIndex].endPoint + 1 - startPoint;
    this._replacePoints(
      startPoint,
      numOldPoints,
      contour.coordinates,
      contour.pointTypes
    );
    this._moveEndPoints(contourIndex, contour.pointTypes.length - numOldPoints);
    this.contourInfo[contourIndex].isClosed = contour.isClosed;
  }

  appendContour(contour) {
    this.insertContour(this.contourInfo.length, contour);
  }

  insertContour(contourIndex, contour) {
    contourIndex = this._normalizeContourIndex(contourIndex, true);
    const startPoint = this._getContourStartPoint(contourIndex);
    this._replacePoints(startPoint, 0, contour.coordinates, contour.pointTypes);
    const contourInfo = { endPoint: startPoint - 1, isClosed: contour.isClosed };
    this.contourInfo.splice(contourIndex, 0, contourInfo);
    this._moveEndPoints(contourIndex, contour.pointTypes.length);
  }

  deleteContour(contourIndex) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const contour = this.contourInfo[contourIndex];
    const startPoint = this._getContourStartPoint(contourIndex);
    const numPoints = contour.endPoint + 1 - startPoint;
    this._replacePoints(startPoint, numPoints, [], []);
    this.contourInfo.splice(contourIndex, 1);
    this._moveEndPoints(contourIndex, -numPoints);
  }

  getPoint(pointIndex) {
    const point = {
      x: this.coordinates[pointIndex * 2],
      y: this.coordinates[pointIndex * 2 + 1],
    };
    if (point.x === undefined) {
      return undefined;
    }
    const pointType = this.pointTypes[pointIndex] & VarPackedPath.POINT_TYPE_MASK;
    if (pointType) {
      point["type"] =
        pointType === VarPackedPath.OFF_CURVE_CUBIC
          ? POINT_TYPE_OFF_CURVE_CUBIC
          : POINT_TYPE_OFF_CURVE_QUAD;
    } else if (this.pointTypes[pointIndex] & VarPackedPath.SMOOTH_FLAG) {
      point["smooth"] = true;
    }
    return point;
  }

  setPoint(pointIndex, point) {
    this.setPointPosition(pointIndex, point.x, point.y);
    this.setPointType(pointIndex, point.type, point.smooth);
  }

  getPointPosition(pointIndex) {
    return [this.coordinates[pointIndex * 2], this.coordinates[pointIndex * 2 + 1]];
  }

  setPointPosition(pointIndex, x, y) {
    this.coordinates[pointIndex * 2] = x;
    this.coordinates[pointIndex * 2 + 1] = y;
  }

  setPointType(pointIndex, type, smooth) {
    this.pointTypes[pointIndex] = packPointType(type, smooth);
  }

  getContourPoint(contourIndex, contourPointIndex) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const pointIndex = this.getAbsolutePointIndex(
      contourIndex,
      contourPointIndex,
      false
    );
    return this.getPoint(pointIndex);
  }

  setContourPoint(contourIndex, contourPointIndex, point) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const pointIndex = this.getAbsolutePointIndex(
      contourIndex,
      contourPointIndex,
      false
    );
    this.setPoint(pointIndex, point);
  }

  insertPoint(contourIndex, contourPointIndex, point) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const pointIndex = this.getAbsolutePointIndex(
      contourIndex,
      contourPointIndex,
      true
    );
    this._insertPoint(contourIndex, pointIndex, point);
  }

  appendPoint(contourIndex, point) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const contour = this.contourInfo[contourIndex];
    this._insertPoint(contourIndex, contour.endPoint + 1, point);
  }

  deletePoint(contourIndex, contourPointIndex) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const pointIndex = this.getAbsolutePointIndex(contourIndex, contourPointIndex);
    this.coordinates.splice(pointIndex * 2, 2);
    this.pointTypes.splice(pointIndex, 1);
    this._moveEndPoints(contourIndex, -1);
  }

  _insertPoint(contourIndex, pointIndex, point) {
    this.coordinates.splice(pointIndex * 2, 0, point.x, point.y);
    this.pointTypes.splice(pointIndex, 0, 0);
    this.setPointType(pointIndex, point.type, point.smooth);
    this._moveEndPoints(contourIndex, 1);
  }

  _replacePoints(startPoint, numPoints, coordinates, pointTypes) {
    this.coordinates.splice(startPoint * 2, numPoints * 2, ...coordinates);
    this.pointTypes.splice(startPoint, numPoints, ...pointTypes);
  }

  _moveEndPoints(fromContourIndex, offset) {
    for (let ci = fromContourIndex; ci < this.contourInfo.length; ci++) {
      this.contourInfo[ci].endPoint += offset;
    }
  }

  _normalizeContourIndex(contourIndex, forInsert = false) {
    const originalContourIndex = contourIndex;
    const numContours = this.contourInfo.length;
    if (contourIndex < 0) {
      contourIndex += numContours;
    }
    if (contourIndex < 0 || contourIndex >= numContours + (forInsert ? 1 : 0)) {
      throw new Error(`contourIndex out of bounds: ${originalContourIndex}`);
    }
    return contourIndex;
  }

  getAbsolutePointIndex(contourIndex, contourPointIndex, forInsert = false) {
    const startPoint = this._getContourStartPoint(contourIndex);
    const contour = this.contourInfo[contourIndex];
    const numPoints = contour.endPoint + 1 - startPoint;
    const originalContourPointIndex = contourPointIndex;
    if (contourPointIndex < 0) {
      contourPointIndex += numPoints;
    }
    if (contourPointIndex < 0 || contourPointIndex >= numPoints + (forInsert ? 1 : 0)) {
      throw new Error(`contourPointIndex out of bounds: ${originalContourPointIndex}`);
    }
    return startPoint + contourPointIndex;
  }

  _getContourStartPoint(contourIndex) {
    return contourIndex === 0 ? 0 : this.contourInfo[contourIndex - 1].endPoint + 1;
  }

  isStartOrEndPoint(pointIndex) {
    //
    // Returns -1 if `pointIndex` references the start point of an open contour,
    // returns 1 if `pointIndex` references the end point of an open contour.
    // Returns 0 in all other cases.
    //
    const [contourIndex, contourPointIndex] = this.getContourAndPointIndex(pointIndex);
    const contour = this.contourInfo[contourIndex];
    if (!contour.isClosed) {
      if (contourPointIndex === 0) {
        return -1;
      } else if (pointIndex === contour.endPoint) {
        return 1;
      }
    }
    return 0;
  }

  firstPointIndexNearPoint(point, margin, skipPointIndex = undefined) {
    //
    // Given `point` and a `margin`, return the index of the first point
    // that is within `margin` of `point`. Return undefined if no such
    // point was found.
    //
    // If `skipPointIndex` is given, skip that particular point index.
    // This is useful if you want to find a point that is not a specific
    // point nearby.
    //
    const rect = centeredRect(point.x, point.y, margin);
    for (const hit of this.iterPointsInRect(rect)) {
      // TODO: we may have to filter or sort for the case when a handle coincides with
      // its anchor, to get a consistent result despite which of the two comes first.
      if (hit.pointIndex !== skipPointIndex) {
        return hit.pointIndex;
      }
    }
  }

  *iterPoints() {
    yield* this._iterPointsFromTo(0, this.pointTypes.length - 1);
  }

  *_iterPointsOfContour(contourIndex) {
    const contour = this.contourInfo[contourIndex];
    const startPoint = this._getContourStartPoint(contourIndex);
    yield* this._iterPointsFromTo(startPoint, contour.endPoint);
  }

  *_iterPointsFromTo(startPoint, endPoint) {
    for (let index = startPoint; index <= endPoint; index++) {
      yield this.getPoint(index);
    }
  }

  *iterContours() {
    for (let i = 0; i < this.contourInfo.length; i++) {
      yield this.getContour(i);
    }
  }

  *iterUnpackedContours() {
    for (let i = 0; i < this.contourInfo.length; i++) {
      yield this._getUnpackedContour(i);
    }
  }

  *iterHandles() {
    let startPoint = 0;
    for (const contour of this.contourInfo) {
      const endPoint = contour.endPoint;
      let prevIndex = contour.isClosed ? endPoint : startPoint;
      for (
        let nextIndex = startPoint + (contour.isClosed ? 0 : 1);
        nextIndex <= endPoint;
        nextIndex++
      ) {
        const prevType = this.pointTypes[prevIndex] & VarPackedPath.POINT_TYPE_MASK;
        const nextType = this.pointTypes[nextIndex] & VarPackedPath.POINT_TYPE_MASK;
        if (prevType != nextType) {
          yield [
            {
              x: this.coordinates[prevIndex * 2],
              y: this.coordinates[prevIndex * 2 + 1],
            },
            {
              x: this.coordinates[nextIndex * 2],
              y: this.coordinates[nextIndex * 2 + 1],
            },
          ];
        }
        prevIndex = nextIndex;
      }
      startPoint = endPoint + 1;
    }
  }

  *iterPointsInRect(rect) {
    for (const [pointIndex, point] of enumerate(this.iterPoints())) {
      if (pointInRect(point.x, point.y, rect)) {
        yield { ...point, pointIndex: pointIndex };
      }
    }
  }

  copy() {
    return new this.constructor(
      this.coordinates.copy(),
      this.pointTypes.slice(),
      this.contourInfo.map((item) => {
        return { ...item };
      })
    );
  }

  _appendPoint(x, y, pointType) {
    this.contourInfo[this.contourInfo.length - 1].endPoint += 1;
    this.coordinates.push(x, y);
    this.pointTypes.push(pointType);
  }

  moveTo(x, y) {
    this.appendContour({ coordinates: [], pointTypes: [], isClosed: false });
    this._appendPoint(x, y, VarPackedPath.ON_CURVE);
  }

  lineTo(x, y) {
    this._appendPoint(x, y, VarPackedPath.ON_CURVE);
  }

  cubicCurveTo(x1, y1, x2, y2, x3, y3) {
    this._appendPoint(x1, y1, VarPackedPath.OFF_CURVE_CUBIC);
    this._appendPoint(x2, y2, VarPackedPath.OFF_CURVE_CUBIC);
    this._appendPoint(x3, y3, VarPackedPath.ON_CURVE);
  }

  quadraticCurveTo(...args) {
    const numArgs = args.length;
    if (numArgs % 2) {
      throw new Error("number of arguments to quadraticCurveTo must be even");
    }
    for (let i = 0; i < numArgs - 2; i += 2) {
      this._appendPoint(args[i], args[i + 1], VarPackedPath.OFF_CURVE_QUAD);
    }
    const i = numArgs - 2;
    this._appendPoint(args[i], args[i + 1], VarPackedPath.ON_CURVE);
  }

  closePath() {
    this.contourInfo[this.contourInfo.length - 1].isClosed = true;
  }

  addItemwise(other) {
    let otherCoordinates;
    if (other instanceof VarPackedPath) {
      this._ensureCompatibility(other);
      otherCoordinates = other.coordinates;
    } else {
      otherCoordinates = other;
    }
    return new this.constructor(
      this.coordinates.addItemwise(otherCoordinates),
      this.pointTypes,
      this.contourInfo
    );
  }

  subItemwise(other) {
    let otherCoordinates;
    if (other instanceof VarPackedPath) {
      this._ensureCompatibility(other);
      otherCoordinates = other.coordinates;
    } else {
      otherCoordinates = other;
    }
    return new this.constructor(
      this.coordinates.subItemwise(otherCoordinates),
      this.pointTypes,
      this.contourInfo
    );
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
    return new this.constructor(
      this.coordinates.mulScalar(scalar),
      this.pointTypes,
      this.contourInfo
    );
  }

  getContourSegmentPointIndices(contourIndex) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    return this._getContourSegmentPointIndices(contourIndex);
  }

  _getContourSegmentPointIndices(contourIndex) {
    const startPoint = this._getContourStartPoint(contourIndex);
    const contour = this.contourInfo[contourIndex];
    const segments = [
      ...this._iterContourSegmentPointIndices(
        startPoint,
        contour.endPoint,
        contour.isClosed
      ),
    ];
    return { isClosed: contour.isClosed, segments: segments };
  }

  _drawContourToPath2d___(path, startPoint, endPoint, isClosed) {
    for (const call of this._iterPath2dCalls(startPoint, endPoint, isClosed)) {
      path[call.method](...call.args);
    }
  }

  _drawContourToPath2dXX(path, startPoint, endPoint, isClosed) {
    let needMoveTo = true;
    const coordinates = this.coordinates;

    function getPoint(pointIndex) {
      return { x: coordinates[pointIndex * 2], y: coordinates[pointIndex * 2 + 1] };
    }

    const decompose = {
      line: (pointIndices) => [pointIndices.map(getPoint)],
      quad: (pointIndices) => [pointIndices.map(getPoint)],
    };

    for (const segment of this._iterContourSegmentPointIndices(
      startPoint,
      endPoint,
      isClosed
    )) {
      console.log(segment.segmentType);
      for (const points of decompose[segment.segmentType](segment.pointIndices)) {
        //
        if (needMoveTo) {
          console.log("points", points);
          path.moveTo(points[0].x, points[0].y);
          needMoveTo = false;
        }
        switch (segment.segmentType) {
          case "line":
            path.lineTo(points[1].x, points[1].y);
            break;
        }
      }
    }
  }

  *_iterContourSegmentPointIndices(startPoint, endPoint, isClosed) {
    const numPoints = endPoint - startPoint + 1;
    const pointTypes = this.pointTypes;
    let firstOnCurve = null;
    // Determine the index of the first on-curve point, if any
    for (let i = 0; i < numPoints; i++) {
      if (
        (pointTypes[i + startPoint] & VarPackedPath.POINT_TYPE_MASK) ===
        VarPackedPath.ON_CURVE
      ) {
        firstOnCurve = i;
        break;
      }
    }
    if (firstOnCurve === null) {
      // quad blob
      // Maybe TODO: cubic blob, see glyf-1 spec
      yield {
        segmentType: "quadBlob", // or "cubicBlob"
        pointIndices: [...range(startPoint, endPoint + 1)],
      };
    } else {
      let currentSegment = [];

      let segmentType = "line";
      const lastIndex = isClosed ? numPoints : numPoints - 1 - firstOnCurve;
      for (let i = 0; i <= lastIndex; i++) {
        const pointIndex = isClosed
          ? startPoint + ((firstOnCurve + i) % numPoints)
          : startPoint + firstOnCurve + i;
        const pointType = pointTypes[pointIndex] & VarPackedPath.POINT_TYPE_MASK;
        currentSegment.push(pointIndex);
        if (i === 0) {
          continue;
        }
        switch (pointType) {
          case VarPackedPath.ON_CURVE:
            yield { segmentType, pointIndices: currentSegment };
            currentSegment = [pointIndex];
            segmentType = "line";
            break;
          case VarPackedPath.OFF_CURVE_QUAD:
            segmentType = "quad";
            break;
          case VarPackedPath.OFF_CURVE_CUBIC:
            segmentType = "cubic";
            break;
          default:
            throw new Error("illegal point type");
        }
      }
    }
  }

  drawToPath2d(path) {
    let startPoint = 0;

    for (const contour of this.contourInfo) {
      const endPoint = contour.endPoint;
      this._drawContourToPath2d(path, startPoint, endPoint, contour.isClosed);
      startPoint = endPoint + 1;
    }
  }

  drawContourToPath2d(path, contourIndex) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const startPoint = this._getContourStartPoint(contourIndex);
    const contour = this.contourInfo[contourIndex];
    this._drawContourToPath2d(path, startPoint, contour.endPoint, contour.isClosed);
  }

  _drawContourToPath2d(path, startPoint, endPoint, isClosed) {
    const coordinates = this.coordinates;
    const pointTypes = this.pointTypes;
    const numPoints = endPoint + 1 - startPoint;
    var firstOnCurve = null;

    // Determine the index of the first on-curve point, if any
    for (let i = 0; i < numPoints; i++) {
      if (
        (pointTypes[i + startPoint] & VarPackedPath.POINT_TYPE_MASK) ===
        VarPackedPath.ON_CURVE
      ) {
        firstOnCurve = i;
        break;
      }
    }

    if (firstOnCurve !== null) {
      drawContourToPath(
        path,
        coordinates,
        pointTypes,
        startPoint,
        numPoints,
        firstOnCurve,
        isClosed
      );
    } else {
      // draw quad blob
      // create copy of contour points, and insert implied on-curve at front
      const blobCoordinates = coordinates.slice(startPoint * 2, (endPoint + 1) * 2);
      const blobPointTypes = pointTypes.slice(startPoint, endPoint + 1);
      const xMid = (blobCoordinates[0] + blobCoordinates[endPoint * 2]) / 2;
      const yMid = (blobCoordinates[1] + blobCoordinates[endPoint * 2 + 1]) / 2;
      blobCoordinates.unshift(xMid, yMid);
      blobPointTypes.unshift(VarPackedPath.ON_CURVE);
      drawContourToPath(
        path,
        blobCoordinates,
        blobPointTypes,
        0,
        numPoints + 1,
        0,
        true
      );
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
    const result = new VarPackedPath();
    result.coordinates = this.coordinates.concat(other.coordinates);
    result.pointTypes = this.pointTypes.concat(other.pointTypes);
    result.contourInfo = this.contourInfo.concat(other.contourInfo).map((c) => {
      return { ...c };
    });
    const endPointOffset = this.numPoints;
    for (let i = this.contourInfo.length; i < result.contourInfo.length; i++) {
      result.contourInfo[i].endPoint += endPointOffset;
    }
    return result;
  }

  _checkIntegrity() {
    let bad = false;
    let startPoint = 0;
    for (const contourInfo of this.contourInfo) {
      if (contourInfo.endPoint < startPoint - 1) {
        console.log("endPoint before start point");
        bad = true;
      }
      startPoint = contourInfo.endPoint + 1;
    }
    if (startPoint !== this.pointTypes.length) {
      console.log("bad final end point");
      bad = true;
    }
    if (this.coordinates.length !== this.pointTypes.length * 2) {
      console.log("coordinates length does not match point types length");
      bad = true;
    }
    return bad;
  }
}

function drawContourToPath(
  path,
  coordinates,
  pointTypes,
  startPoint,
  numPoints,
  firstOnCurve,
  isClosed
) {
  let currentSegment = [];
  let segmentFunc = drawLineSegment;
  const lastIndex = isClosed ? numPoints : numPoints - 1 - firstOnCurve;
  for (let i = 0; i <= lastIndex; i++) {
    const index = isClosed
      ? startPoint + ((firstOnCurve + i) % numPoints)
      : startPoint + firstOnCurve + i;
    const pointType = pointTypes[index] & VarPackedPath.POINT_TYPE_MASK;
    const x = coordinates[index * 2];
    const y = coordinates[index * 2 + 1];
    if (i === 0) {
      path.moveTo(x, y);
    } else {
      currentSegment.push(x, y);
      switch (pointType) {
        case VarPackedPath.ON_CURVE:
          segmentFunc(path, currentSegment);
          currentSegment = [];
          segmentFunc = drawLineSegment;
          break;
        case VarPackedPath.OFF_CURVE_QUAD:
          segmentFunc = drawQuadSegment;
          break;
        case VarPackedPath.OFF_CURVE_CUBIC:
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
  let [x1, y1] = [segment[0], segment[1]];
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
  if (segment.length === 4) {
    // Only one handle, fall back to quad
    path.quadraticCurveTo(...segment);
  } else if (segment.length === 6) {
    path.bezierCurveTo(...segment);
  } else if (segment.length >= 8) {
    // Ignore all but the first and last off curve points
    // FontTools has "super bezier" in this case. Was nice.
    path.bezierCurveTo(...segment.slice(0, 2), ...segment.slice(-4));
  } else {
    // Fall back to line. Can't happen.
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
    if (
      (a[i] & VarPackedPath.POINT_TYPE_MASK) !=
      (b[i] & VarPackedPath.POINT_TYPE_MASK)
    ) {
      return false;
    }
  }
  return true;
}

function packPointType(type, smooth) {
  let pointType = VarPackedPath.ON_CURVE;
  if (type) {
    pointType =
      type === POINT_TYPE_OFF_CURVE_CUBIC
        ? VarPackedPath.OFF_CURVE_CUBIC
        : VarPackedPath.OFF_CURVE_QUAD;
  } else if (smooth) {
    pointType |= VarPackedPath.SMOOTH_FLAG;
  }
  return pointType;
}

export function packContour(unpackedContour) {
  const coordinates = new VarArray(unpackedContour.points.length * 2);
  const pointTypes = new Array(unpackedContour.points.length);
  for (let i = 0; i < unpackedContour.points.length; i++) {
    const point = unpackedContour.points[i];
    coordinates[i * 2] = point.x;
    coordinates[i * 2 + 1] = point.y;
    pointTypes[i] = packPointType(point.type, point.smooth);
  }
  return {
    coordinates: coordinates,
    pointTypes: pointTypes,
    isClosed: unpackedContour.isClosed,
  };
}
