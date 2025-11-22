import VarArray from "./var-array";

export const POINT_TYPE_OFF_CURVE_QUAD: string;
export const POINT_TYPE_OFF_CURVE_CUBIC: string;

export class VarPackedPath {
  static ON_CURVE: number;
  static OFF_CURVE_QUAD: number;
  static OFF_CURVE_CUBIC: number;
  static SMOOTH_FLAG: number;
  static POINT_TYPE_MASK: number;

  coordinates: VarArray;
  pointTypes: number[];
  contourInfo: any[];
  pointAttributes: any[] | null;

  constructor(
    coordinates?: VarArray,
    pointTypes?: number[],
    contourInfo?: any[],
    pointAttributes?: any[] | null
  );

  static fromObject(obj: any): VarPackedPath;
  static fromUnpackedContours(unpackedContours: any[]): VarPackedPath;

  unpackedContours(): any[];
  numContours: number;
  numPoints: number;

  getNumPointsOfContour(contourIndex: number): number;
  getControlBounds(): any;
  getControlBoundsForContour(contourIndex: number): any;
  getBounds(): any;
  getConvexHull(): any;
  getContourIndex(pointIndex: number): number | undefined;
  getContourAndPointIndex(pointIndex: number): [number, number];
  getUnpackedContour(contourIndex: number): any;
  setUnpackedContour(contourIndex: number, unpackedContour: any): void;
  appendUnpackedContour(unpackedContour: any): void;
  insertUnpackedContour(contourIndex: number, unpackedContour: any): void;
  getContour(contourIndex: number): any;
  setContour(contourIndex: number, contour: any): void;
  appendContour(contour: any): void;
  insertContour(contourIndex: number, contour: any): void;
  deleteContour(contourIndex: number): void;
  appendPath(path: VarPackedPath): void;
  deleteNTrailingContours(numContours: number): void;
  getPoint(pointIndex: number): any;
  setPoint(pointIndex: number, point: any): void;
  getPointPosition(pointIndex: number): [number, number];
  setPointPosition(pointIndex: number, x: number, y: number): void;
  setPointType(pointIndex: number, type: string, smooth: boolean): void;
  setPointAttrs(pointIndex: number, attrs: any): void;
  getContourPoint(contourIndex: number, contourPointIndex: number): any;
  setContourPoint(contourIndex: number, contourPointIndex: number, point: any): void;
  insertPoint(contourIndex: number, contourPointIndex: number, point: any): void;
  appendPoint(contourIndex: number, point: any): void;
  deletePoint(contourIndex: number, contourPointIndex: number): void;
  copy(): VarPackedPath;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  cubicCurveTo(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number
  ): void;
  quadraticCurveTo(...args: number[]): void;
  closePath(): void;
  isCompatible(other: VarPackedPath): boolean;
  addItemwise(other: VarPackedPath): VarPackedPath;
  subItemwise(other: VarPackedPath): VarPackedPath;
  mulScalar(scalar: number): VarPackedPath;
  drawToPath2d(path: any): void;
  drawContourToPath2d(path: any, contourIndex: number): void;
  roundCoordinates(roundFunc?: (n: number) => number): VarPackedPath;
  transformed(transformation: any): VarPackedPath;
  concat(other: VarPackedPath): VarPackedPath;
  _checkIntegrity(): boolean;

  // Iterators
  iterPoints(): IterableIterator<any>;
  iterContours(): IterableIterator<any>;
  iterUnpackedContours(): IterableIterator<any>;
  iterHandles(): IterableIterator<any>;
  iterPointsInRect(rect: any): IterableIterator<any>;
  reverseIterPointsInRect(rect: any): IterableIterator<any>;
  iterContourDecomposedSegments(contourIndex: number): IterableIterator<any>;
  iterContourSegmentPointIndices(contourIndex: number): IterableIterator<any>;
}

export function packContour(unpackedContour: any): any;
export function joinPaths(pathsIterable: Iterable<VarPackedPath>): VarPackedPath;
export function joinPathsAsync(
  pathsIterable: AsyncIterable<VarPackedPath>
): Promise<VarPackedPath>;
export function arePathsCompatible(paths: VarPackedPath[]): boolean;
