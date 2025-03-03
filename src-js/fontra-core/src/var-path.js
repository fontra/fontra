import { Bezier } from "bezier-js";
import { convexHull } from "./convex-hull.js";
import { VariationError } from "./errors.js";
import { centeredRect, pointInRect, rectFromPoints, updateRect } from "./rectangle.js";
import {
  arrayExtend,
  assert,
  enumerate,
  isObjectEmpty,
  range,
  reversed,
} from "./utils.js";
import VarArray from "./var-array.js";

export const POINT_TYPE_OFF_CURVE_QUAD = "quad";
export const POINT_TYPE_OFF_CURVE_CUBIC = "cubic";

export class VarPackedPath {
  // point types
  static ON_CURVE = 0x00;
  static OFF_CURVE_QUAD = 0x01;
  static OFF_CURVE_CUBIC = 0x02;
  static SMOOTH_FLAG = 0x08;
  static POINT_TYPE_MASK = 0x07;

  constructor(coordinates, pointTypes, contourInfo, pointAttributes) {
    if (coordinates === undefined) {
      this.coordinates = new VarArray();
      this.pointTypes = [];
      this.contourInfo = [];
      this.pointAttributes = null;
    } else {
      if (pointAttributes) {
        assert(
          pointAttributes.length == pointTypes.length,
          "mismatching point attributes"
        );
        if (!pointAttributes.some((attrs) => attrs && !isObjectEmpty(attrs))) {
          pointAttributes = null;
        }
      }

      this.coordinates = coordinates;
      this.pointTypes = pointTypes;
      this.contourInfo = contourInfo;
      this.pointAttributes = pointAttributes || null;
    }
  }

  static fromObject(obj) {
    if (!obj.coordinates) {
      assert(!obj.pointTypes);
      assert(!obj.pointTypes);
      assert(!obj.contourInfo);
      return new VarPackedPath();
    }
    const coordinates = VarArray.from(obj.coordinates);
    const pointTypes = [...obj.pointTypes];
    const contourInfo = obj.contourInfo.map((item) => {
      return { ...item };
    });
    const pointAttributes =
      obj.pointAttributes?.map((attrs) => {
        return copyPointAttrs(attrs);
      }) || null;
    return new VarPackedPath(coordinates, pointTypes, contourInfo, pointAttributes);
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

  getBounds() {
    let bounds = undefined;
    for (let i = 0; i < this.contourInfo.length; i++) {
      if (this.getNumPointsOfContour(i) === 1) {
        // Single point, not a segment, but does participate in the bounding box
        const point = this.getContourPoint(i, 0);
        if (!bounds) {
          bounds = rectFromPoints([point]);
        } else {
          bounds = updateRect(bounds, point);
        }
        continue;
      }
      let isFirstSegment = true;
      for (const segment of this.iterContourDecomposedSegments(i)) {
        if (!bounds) {
          bounds = rectFromPoints([segment.points[0]]);
        } else if (isFirstSegment) {
          bounds = updateRect(bounds, segment.points[0]);
        }
        bounds = updateRect(bounds, segment.points.at(-1));
        if (
          segment.points
            .slice(1, -1)
            .some((point) => !pointInRect(point.x, point.y, bounds))
        ) {
          // Compute the actual bounding box of the segment
          const bez = new Bezier(segment.points);
          const extrema = bez.extrema();
          for (const t of extrema.values) {
            bounds = updateRect(bounds, bez.compute(t));
          }
        }
        isFirstSegment = false;
      }
    }
    return bounds;
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
      pointAttributes: filterPointAttributes(
        this.pointAttributes?.slice(startPoint, contour.endPoint + 1)
      ),
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
      contour.pointTypes,
      contour.pointAttributes
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
    this._replacePoints(
      startPoint,
      0,
      contour.coordinates,
      contour.pointTypes,
      contour.pointAttributes
    );
    const contourInfo = { endPoint: startPoint - 1, isClosed: contour.isClosed };
    this.contourInfo.splice(contourIndex, 0, contourInfo);
    this._moveEndPoints(contourIndex, contour.pointTypes.length);
  }

  deleteContour(contourIndex) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const contour = this.contourInfo[contourIndex];
    const startPoint = this._getContourStartPoint(contourIndex);
    const numPoints = contour.endPoint + 1 - startPoint;
    this._replacePoints(startPoint, numPoints, [], [], null);
    this.contourInfo.splice(contourIndex, 1);
    this._moveEndPoints(contourIndex, -numPoints);
  }

  appendPath(path) {
    const originalNumPoints = this.pointTypes.length;

    arrayExtend(this.coordinates, path.coordinates);
    arrayExtend(this.pointTypes, path.pointTypes);
    const endPointOffset = this.contourInfo.length
      ? this.contourInfo.at(-1).endPoint + 1
      : 0;
    arrayExtend(
      this.contourInfo,
      path.contourInfo.map((contour) => {
        return {
          endPoint: contour.endPoint + endPointOffset,
          isClosed: contour.isClosed,
        };
      })
    );

    let pointAttributes = path.pointAttributes;
    if (this.pointAttributes && !pointAttributes) {
      pointAttributes = new Array(path.pointTypes.length).fill(null);
    } else if (!this.pointAttributes && pointAttributes) {
      this.pointAttributes = new Array(originalNumPoints).fill(null);
    }
    if (this.pointAttributes) {
      arrayExtend(this.pointAttributes, copyPointAttributesArray(pointAttributes));
    }
  }

  deleteNTrailingContours(numContours) {
    // The opposite of appendPath, more or less
    if (numContours <= 0) {
      // Nothing to do
      return;
    }

    numContours = Math.min(numContours, this.numContours);

    const contourIndex = this.numContours - numContours;
    const startPoint = this._getContourStartPoint(contourIndex);
    const numPoints = this.numPoints - startPoint;
    this._replacePoints(startPoint, numPoints, [], [], null);
    this.contourInfo.splice(contourIndex, numContours);
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

    const attrs = this.pointAttributes?.[pointIndex];
    if (attrs) {
      point["attrs"] = attrs;
    }
    return point;
  }

  setPoint(pointIndex, point) {
    this.setPointPosition(pointIndex, point.x, point.y);
    this.setPointType(pointIndex, point.type, point.smooth);
    this.setPointAttrs(pointIndex, point.attrs);
  }

  getPointPosition(pointIndex) {
    return [this.coordinates[pointIndex * 2], this.coordinates[pointIndex * 2 + 1]];
  }

  setPointPosition(pointIndex, x, y) {
    const coordIndex = pointIndex * 2;
    if (coordIndex + 1 >= this.coordinates.length) {
      throw new Error(
        `pointIndex out of range: ${coordIndex} >= ${this.coordinates.length}`
      );
    }
    this.coordinates[coordIndex] = x;
    this.coordinates[coordIndex + 1] = y;
  }

  setPointType(pointIndex, type, smooth) {
    if (pointIndex >= this.pointTypes.length) {
      throw new Error(
        `pointIndex out of range: ${pointIndex} >= ${this.pointTypes.length}`
      );
    }
    this.pointTypes[pointIndex] = packPointType(type, smooth);
  }

  setPointAttrs(pointIndex, attrs) {
    if (pointIndex >= this.pointAttributes?.length) {
      throw new Error(
        `pointIndex out of range: ${pointIndex} >= ${this.pointAttributes.length}`
      );
    }
    if (attrs && !isObjectEmpty(attrs) && !this.pointAttributes) {
      this.pointAttributes = new Array(this.pointTypes.length).fill(null);
    }
    if (this.pointAttributes) {
      this.pointAttributes[pointIndex] = isObjectEmpty(attrs)
        ? null
        : copyPointAttrs(attrs);
    }
  }

  getContourPoint(contourIndex, contourPointIndex) {
    const pointIndex = this.getAbsolutePointIndex(
      contourIndex,
      contourPointIndex,
      false
    );
    return this.getPoint(pointIndex);
  }

  setContourPoint(contourIndex, contourPointIndex, point) {
    const pointIndex = this.getAbsolutePointIndex(
      contourIndex,
      contourPointIndex,
      false
    );
    this.setPoint(pointIndex, point);
  }

  insertPoint(contourIndex, contourPointIndex, point) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const pointIndex = this._getAbsolutePointIndex(
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
    const pointIndex = this._getAbsolutePointIndex(contourIndex, contourPointIndex);
    this.coordinates.splice(pointIndex * 2, 2);
    this.pointTypes.splice(pointIndex, 1);
    this.pointAttributes?.splice(pointIndex, 1);
    this._moveEndPoints(contourIndex, -1);
  }

  _insertPoint(contourIndex, pointIndex, point) {
    const originalNumPoints = this.pointTypes.length;

    this.coordinates.splice(pointIndex * 2, 0, point.x, point.y);
    this.pointTypes.splice(pointIndex, 0, 0);
    this.setPointType(pointIndex, point.type, point.smooth);

    if (point.attrs && !this.pointAttributes) {
      this.pointAttributes = new Array(originalNumPoints).fill(null);
    }
    this.pointAttributes?.splice(pointIndex, 0, point.attrs || null);
    this._moveEndPoints(contourIndex, 1);
  }

  _replacePoints(startPoint, numPoints, coordinates, pointTypes, pointAttributes) {
    const originalNumPoints = this.pointTypes.length;

    this.coordinates.splice(startPoint * 2, numPoints * 2, ...coordinates);
    this.pointTypes.splice(startPoint, numPoints, ...pointTypes);

    if (this.pointAttributes && !pointAttributes) {
      pointAttributes = new Array(pointTypes.length).fill(null);
    } else if (!this.pointAttributes && pointAttributes) {
      this.pointAttributes = new Array(originalNumPoints).fill(null);
    }
    this.pointAttributes?.splice(
      startPoint,
      numPoints,
      ...copyPointAttributesArray(pointAttributes)
    );
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
    contourIndex = this._normalizeContourIndex(contourIndex);
    return this._getAbsolutePointIndex(contourIndex, contourPointIndex, forInsert);
  }

  _getAbsolutePointIndex(contourIndex, contourPointIndex, forInsert = false) {
    contourIndex = this._normalizeContourIndex(contourIndex);
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

  pointIndexNearPoint(point, margin, skipPointIndex = undefined) {
    //
    // Given `point` and a `margin`, return the index of the first point
    // that is within `margin` of `point`, searching from the *end* of the
    // points list. Return undefined if no such point was found.
    //
    // If `skipPointIndex` is given, skip that particular point index.
    // This is useful if you want to find a point that is not a specific
    // point nearby.
    //
    const rect = centeredRect(point.x, point.y, margin);
    for (const hit of this.reverseIterPointsInRect(rect)) {
      // TODO: we may have to filter or sort for the case when a handle coincides with
      // its anchor, to get a consistent result despite which of the two comes first.
      if (hit.pointIndex !== skipPointIndex) {
        return hit.pointIndex;
      }
    }
  }

  pointIndexNearPointFromPointIndices(point, margin, pointIndices) {
    //
    // Given `point` and a `margin` and an array of `pointIndices`, return the
    // index of the first point that is within `margin` of `point`, searching
    // from the *end* of the `pointIndices` list. Return undefined if no such
    // point was found.
    //
    const rect = centeredRect(point.x, point.y, margin);
    for (const pointIndex of reversed(pointIndices)) {
      const point = this.getPoint(pointIndex);
      if (point && pointInRect(point.x, point.y, rect)) {
        return pointIndex;
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
        if (prevType != nextType || nextType === VarPackedPath.OFF_CURVE_QUAD) {
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

  *reverseIterPointsInRect(rect) {
    for (let index = this.pointTypes.length - 1; index >= 0; index--) {
      const point = this.getPoint(index);
      if (pointInRect(point.x, point.y, rect)) {
        yield { ...point, pointIndex: index };
      }
    }
  }

  copy() {
    return new this.constructor(
      this.coordinates.copy(),
      this.pointTypes.slice(),
      this.contourInfo.map((item) => {
        return { ...item };
      }),
      copyPointAttributesArray(this.pointAttributes)
    );
  }

  _appendPoint(x, y, pointType) {
    this.contourInfo[this.contourInfo.length - 1].endPoint += 1;
    this.coordinates.push(x, y);
    this.pointTypes.push(pointType);
    this.pointAttributes?.push(null);
  }

  moveTo(x, y) {
    this.appendContour({
      coordinates: [],
      pointTypes: [],
      pointAttributes: null,
      isClosed: false,
    });
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

  isCompatible(other) {
    return (
      other instanceof VarPackedPath &&
      arrayEquals(this.contourInfo, other.contourInfo) &&
      pointTypesEquals(this.pointTypes, other.pointTypes)
    );
  }

  addItemwise(other) {
    this._ensureCompatibility(other);
    return new this.constructor(
      this.coordinates.addItemwise(other.coordinates),
      this.pointTypes,
      this.contourInfo,
      this.pointAttributes
    );
  }

  subItemwise(other) {
    this._ensureCompatibility(other);
    return new this.constructor(
      this.coordinates.subItemwise(other.coordinates),
      this.pointTypes,
      this.contourInfo,
      this.pointAttributes
    );
  }

  _ensureCompatibility(other) {
    if (!this.isCompatible(other)) {
      throw new VariationError("paths are not compatible");
    }
  }

  mulScalar(scalar) {
    return new this.constructor(
      this.coordinates.mulScalar(scalar),
      this.pointTypes,
      this.contourInfo,
      this.pointAttributes
    );
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
    let needMoveTo = true;
    for (const segment of this._iterDecomposedSegments(
      startPoint,
      endPoint,
      isClosed
    )) {
      if (needMoveTo) {
        path.moveTo(...segment.coordinates.slice(0, 2));
        needMoveTo = false;
      }
      switch (segment.type) {
        case "line":
          path.lineTo(...segment.coordinates.slice(2));
          break;
        case "quad":
          path.quadraticCurveTo(...segment.coordinates.slice(2));
          break;
        case "cubic":
          path.bezierCurveTo(...segment.coordinates.slice(2));
          break;
        default:
          throw new Error(`unknown operator: ${segment.segmentType}`);
      }
    }
    if (isClosed) {
      path.closePath();
    }
  }

  *iterContourDecomposedSegments(contourIndex) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const startPoint = this._getContourStartPoint(contourIndex);
    const contour = this.contourInfo[contourIndex];
    for (const segment of this._iterDecomposedSegments(
      startPoint,
      contour.endPoint,
      contour.isClosed
    )) {
      segment.points = coordinatesToPoints(segment.coordinates);
      delete segment.coordinates;
      yield segment;
    }
  }

  *_iterDecomposedSegments(startPoint, endPoint, isClosed, filterCoords = null) {
    const coordinates = this.coordinates;
    let needMoveTo = true;
    for (const segment of iterContourSegmentPointIndices(
      this.pointTypes,
      startPoint,
      endPoint,
      isClosed
    )) {
      // fill in coordinates
      const coordinates = this.coordinates;
      const segmentCoordinates = [];
      for (const pointIndex of segment.pointIndices) {
        const pointIndex2 = pointIndex * 2;
        segmentCoordinates.push(coordinates[pointIndex2], coordinates[pointIndex2 + 1]);
      }
      segment.coordinates = segmentCoordinates;
      yield* decomposeSegment(segment, filterCoords);
    }
  }

  *iterContourSegmentPointIndices(contourIndex) {
    contourIndex = this._normalizeContourIndex(contourIndex);
    const startPoint = this._getContourStartPoint(contourIndex);
    const contour = this.contourInfo[contourIndex];

    yield* iterContourSegmentPointIndices(
      this.pointTypes,
      startPoint,
      contour.endPoint,
      contour.isClosed
    );
  }

  roundCoordinates(roundFunc) {
    // Return a copy with all coordinates rounded.
    // Optionally you can supply a custom round function.
    if (!roundFunc) {
      roundFunc = Math.round;
    }
    const coordinates = new VarArray(this.coordinates.length);
    for (let i = 0; i < this.coordinates.length; i++) {
      coordinates[i] = roundFunc(this.coordinates[i]);
    }
    return new this.constructor(
      coordinates,
      this.pointTypes,
      this.contourInfo,
      this.pointAttributes
    );
  }

  transformed(transformation) {
    const coordinates = new VarArray(this.coordinates.length);
    for (let i = 0; i < this.coordinates.length; i += 2) {
      const x = this.coordinates[i];
      const y = this.coordinates[i + 1];
      [coordinates[i], coordinates[i + 1]] = transformation.transformPoint(x, y);
    }
    return new this.constructor(
      coordinates,
      this.pointTypes,
      this.contourInfo,
      this.pointAttributes
    );
  }

  concat(other) {
    const coordinates = this.coordinates.concat(other.coordinates);
    const pointTypes = this.pointTypes.concat(other.pointTypes);
    const contourInfo = this.contourInfo.concat(other.contourInfo).map((c) => {
      return { ...c };
    });

    const otherPointAttributes =
      this.pointAttributes && !other.pointAttributes
        ? new Array(other.pointTypes.length).fill(null)
        : other.pointAttributes;
    const thisPointAttributes =
      !this.pointAttributes && other.pointAttributes
        ? new Array(this.pointTypes.length).fill(null)
        : this.pointAttributes;

    const pointAttributes = copyPointAttributesArray(
      thisPointAttributes?.concat(otherPointAttributes)
    );

    const endPointOffset = this.numPoints;
    for (let i = this.contourInfo.length; i < contourInfo.length; i++) {
      contourInfo[i].endPoint += endPointOffset;
    }

    return new VarPackedPath(coordinates, pointTypes, contourInfo, pointAttributes);
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
    if (
      this.pointAttributes &&
      this.pointAttributes.length !== this.pointTypes.length
    ) {
      console.log("point attributes length does not match point types length");
      bad = true;
    }
    return bad;
  }
}

function* iterContourSegmentPointIndices(pointTypes, startPoint, endPoint, isClosed) {
  const numPoints = endPoint - startPoint + 1;
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
      type: "quadBlob", // or "cubicBlob"
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
          yield { type: segmentType, pointIndices: currentSegment };
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
    if (currentSegment.length > 1) {
      // dangling off curve
      // currentSegment.push(null)
      // yield { type: segmentType, pointIndices: currentSegment };
    }
  }
}

function* decomposeSegment(parentSegment, filterCoords) {
  for (const segment of decomposeSegmentFuncs[parentSegment.type](parentSegment)) {
    if (filterCoords) {
      segment.coordinates = filterCoords(segment.coordinates);
    }
    segment.parentPointIndices = parentSegment.pointIndices;
    yield segment;
  }
}

const decomposeSegmentFuncs = {
  *line(segment) {
    if (segment.coordinates.length !== 4) {
      throw new Error(`assert -- wrong coordinates length: ${coordinates.length}`);
    }
    yield segment;
  },

  *cubic(segment) {
    if (segment.coordinates.length <= 6) {
      // Only one handle, fall back to quad
      yield* this.quad(segment);
    } else if (segment.coordinates.length === 8) {
      yield segment;
    } else if (segment.coordinates.length >= 8) {
      // Ignore all but the first and last off curve points
      // Alternatively: Super bezier? Implied on-curve as per glyf-1?
      const coordinates = segment.coordinates;
      const pointIndices = segment.pointIndices;
      yield {
        type: "cubic",
        coordinates: [...coordinates.slice(0, 4), ...coordinates.slice(-4)],
        pointIndices: [
          pointIndices[0],
          pointIndices[1],
          pointIndices.at(-2),
          pointIndices.at(-1),
        ],
      };
    } else {
      throw new Error("assert -- wrong coordinates length for cubic");
    }
  },

  *quad(segment) {
    if (segment.coordinates.length < 6) {
      throw new Error(
        `assert -- not enough coordinates for quad: ${segment.coordinates.length}`
      );
    }
    const coordinates = segment.coordinates;
    const pointIndices = [...segment.pointIndices];
    let [x0, y0] = [coordinates[0], coordinates[1]];
    let [x1, y1] = [coordinates[2], coordinates[3]];
    const lastIndex = coordinates.length - 2;
    for (let i = 4; i < lastIndex; i += 2) {
      const [x2, y2] = [coordinates[i], coordinates[i + 1]];
      const xMid = (x1 + x2) / 2;
      const yMid = (y1 + y2) / 2;
      yield {
        type: "quad",
        coordinates: [x0, y0, x1, y1, xMid, yMid],
        pointIndices: pointIndices.slice(0, 3),
      };
      pointIndices.shift();
      [x0, y0] = [xMid, yMid];
      [x1, y1] = [x2, y2];
    }
    yield {
      type: "quad",
      coordinates: [x0, y0, x1, y1, coordinates[lastIndex], coordinates[lastIndex + 1]],
      pointIndices: pointIndices.slice(0, 3),
    };
  },

  *quadBlob(segment) {
    const coordinates = segment.coordinates;
    const pointIndices = segment.pointIndices;
    const lastIndex = coordinates.length - 2;
    const [x0, y0] = [coordinates[0], coordinates[1]];
    const [xN, yN] = [coordinates[lastIndex], coordinates[lastIndex + 1]];
    const mid = [(x0 + xN) / 2, (y0 + yN) / 2];
    yield* this.quad({
      type: "quad",
      coordinates: [...mid, ...coordinates, ...mid],
      pointIndices: [pointIndices.at(-1), ...pointIndices, pointIndices[0]],
    });
  },
};

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
  const pointAttributes = new Array(unpackedContour.points.length);
  for (let i = 0; i < unpackedContour.points.length; i++) {
    const point = unpackedContour.points[i];
    coordinates[i * 2] = point.x;
    coordinates[i * 2 + 1] = point.y;
    pointTypes[i] = packPointType(point.type, point.smooth);
    pointAttributes[i] = copyPointAttrs(point.attrs);
  }
  return {
    coordinates: coordinates,
    pointTypes: pointTypes,
    pointAttributes: filterPointAttributes(pointAttributes),
    isClosed: unpackedContour.isClosed,
  };
}

function coordinatesToPoints(coordinates) {
  const points = [];
  for (let i = 0; i < coordinates.length; i += 2) {
    points.push({ x: coordinates[i], y: coordinates[i + 1] });
  }
  return points;
}

export function joinPaths(pathsIterable) {
  const result = new VarPackedPath();
  for (const path of pathsIterable) {
    result.appendPath(path);
  }
  return result;
}

export async function joinPathsAsync(pathsIterable) {
  // This is the same as joinPaths, except it takes an async iterable
  const result = new VarPackedPath();
  for await (const path of pathsIterable) {
    result.appendPath(path);
  }
  return result;
}

export function arePathsCompatible(paths) {
  assert(paths.length, "`paths` needs to contain at least one path");
  const firstPath = paths[0];
  for (const path of paths.slice(1)) {
    if (!firstPath.isCompatible(path)) {
      return false;
    }
  }
  return true;
}

function copyPointAttrs(attrs) {
  return attrs ? { ...attrs } : null;
}

function copyPointAttributesArray(pointAttributes) {
  return pointAttributes?.map((attrs) => copyPointAttrs(attrs)) || null;
}

function filterPointAttributes(pointAttributes) {
  return pointAttributes?.some((attrs) => attrs) ? pointAttributes : null;
}
