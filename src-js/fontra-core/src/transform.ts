// transform.js is a partial port of fonttools' transform.py
// (AKA fontTools.misc.transform.Transform) which is used on
// Fontra's Python side.
//
// For our purposes it is very useful to have a 1-on-1 translation.
// Using an arbitrary other 2d matrix lib (or even npm's latest or
// most-popular or whatever) would likely cause more friction
// for us than this tiny rewrite.

export interface Point {
  x: number;
  y: number;
}
export interface DecomposedTransform {
  translateX: number;
  translateY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
  tCenterX: number;
  tCenterY: number;
}

type TransformTuple = [number, number, number, number, number, number];

/**
 * Class representing a 2D affine transformation.
 *
 * The transformation is represented by six values (xx, xy, yx, yy, dx, dy) that define
 * a 3x3 matrix for performing affine transformations such as translation, rotation,
 * scaling, and skewing.
 *
 * Matrix representation:
 * ```
 * [xx  yx  dx]
 * [xy  yy  dy]
 * [0   0   1 ]
 * ```
 *
 * @example
 * const t = new Transform();
 * const scaled = t.scale(2, 3);
 * const [x, y] = scaled.transformPoint(10, 20);
 * // Result: [20, 60]
 *
 * @example
 * const t = new Transform(2, 0, 0, 2, 10, 20);
 * const inverse = t.inverse();
 * // Returns the inverse transformation
 */
export class Transform {
  xx: number;
  xy: number;
  yx: number;
  yy: number;
  dx: number;
  dy: number;

  constructor(xx = 1, xy = 0, yx = 0, yy = 1, dx = 0, dy = 0) {
    this.xx = xx;
    this.xy = xy;
    this.yx = yx;
    this.yy = yy;
    this.dx = dx;
    this.dy = dy;
  }

  /**
   * Transform a point (x, y) and return the transformed point as [x, y].
   *
   * @example
   *  >>> t = new Transform()
   *  >>> t = t.scale(2.5, 5.5)
   *  >>> t.transformPoint(100, 100)
   *  (250.0, 550.0)
   */
  transformPoint(x: number, y: number): [number, number] {
    return [this.xx * x + this.yx * y + this.dx, this.xy * x + this.yy * y + this.dy];
  }

  /**
   * Transform a point object and return the transformed point as a new point object.
   */
  transformPointObject(point: Point): Point {
    const [x, y] = this.transformPoint(point.x, point.y);
    return { x, y };
  }

  /**
   * Return a new transformation, translated (offset) by x, y.
   *
   * Example:
   *  >>> t = new Transform()
   *  >>> t.translate(20, 30)
   *  <Transform [1 0 0 1 20 30]>
   */
  translate(x: number, y: number): Transform {
    return this._transform(1, 0, 0, 1, x, y);
  }

  /**
   * Return a new transformation, scaled by x, y. The 'y' argument
   * may be None, which implies to use the x value for y as well.
   * @example
   *  >>> t = new Transform()
   *  >>> t.scale(5)
   *  <Transform [5 0 0 5 0 0]>
   *  >>> t.scale(5, 6)
   *  <Transform [5 0 0 6 0 0]>
   **/
  scale(x: number, y?: number): Transform {
    if (y === undefined) {
      y = x;
    }
    return this._transform(x, 0, 0, y, 0, 0);
  }

  /**
   * Return a new transformation, rotated by 'angle' (radians).
   *
   * @example
   * >>> import math
   * >>> t = new Transform()
   * >>> t.rotate(math.pi / 2)
   * <Transform [0 1 -1 0 0 0]>
   */
  rotate(angle: number): Transform {
    const c = _normSinCos(Math.cos(angle));
    const s = _normSinCos(Math.sin(angle));
    return this._transform(c, s, -s, c, 0, 0);
  }

  /**
   * Return a new transformation, skewed by x and y (radians).
   *
   * @example
   * >>> import math
   * >>> t = new Transform()
   * >>> t.skew(math.pi / 4)
   * <Transform [1 0 1 1 0 0]>
   */
  skew(x: number, y = 0): Transform {
    return this._transform(1, Math.tan(y), Math.tan(x), 1, 0, 0);
  }

  /**
   * Return a new transformation, transformed by another
   * transformation.
   *
   * @example
   * >>> t = new Transform(2, 0, 0, 3, 1, 6)
   * >>> t.transform((4, 3, 2, 1, 5, 6))
   * <Transform [8 9 4 3 11 24]>
   */
  transform(other: Transform | TransformTuple): Transform {
    if (!Array.isArray(other)) {
      other = _unpackTransformObject(other);
    }
    return this._transform(other[0], other[1], other[2], other[3], other[4], other[5]);
  }

  _transform(
    xx: number,
    xy: number,
    yx: number,
    yy: number,
    dx: number,
    dy: number
  ): Transform {
    return new Transform(
      xx * this.xx + xy * this.yx,
      xx * this.xy + xy * this.yy,
      yx * this.xx + yy * this.yx,
      yx * this.xy + yy * this.yy,
      this.xx * dx + this.yx * dy + this.dx,
      this.xy * dx + this.yy * dy + this.dy
    );
  }

  /**
   * Return a new transformation, which is the other transformation
   * transformed by self. self.reverseTransform(other) is equivalent to
   * other.transform(self).
   *
   * @example
   *  >>> t = new Transform(2, 0, 0, 3, 1, 6)
   * >>> t.reverseTransform((4, 3, 2, 1, 5, 6))
   * <Transform [8 6 6 3 21 15]>
   * >>> Transform(4, 3, 2, 1, 5, 6).transform((2, 0, 0, 3, 1, 6))
   * <Transform [8 6 6 3 21 15]>
   */

  reverseTransform(other: Transform | TransformTuple): Transform {
    if (!Array.isArray(other)) {
      other = _unpackTransformObject(other);
    }

    const [xx, xy, yx, yy, dx, dy] = other;
    return new Transform(
      this.xx * xx + this.xy * yx,
      this.xx * xy + this.xy * yy,
      this.yx * xx + this.yy * yx,
      this.yx * xy + this.yy * yy,
      xx * this.dx + yx * this.dy + dx,
      xy * this.dx + yy * this.dy + dy
    );
  }

  /**
   *  Return the inverse transformation.
   *
   * @example
   * >>> t = Identity.translate(2, 3).scale(4, 5)
   * >>> t.transformPoint(10, 20)
   * (42, 103)
   * >>> it = t.inverse()
   * >>> it.transformPoint(42, 103)
   * (10.0, 20.0)
   */
  inverse(): Transform {
    if (
      this.xx === 1 &&
      this.xy === 0 &&
      this.yx === 0 &&
      this.yy === 1 &&
      this.dx === 0 &&
      this.dy === 0
    ) {
      return this;
    }
    let [xx, xy, yx, yy, dx, dy] = [
      this.xx,
      this.xy,
      this.yx,
      this.yy,
      this.dx,
      this.dy,
    ];
    const det = xx * yy - yx * xy;
    [xx, xy, yx, yy] = [yy / det, -xy / det, -yx / det, xx / det];
    [dx, dy] = [-xx * dx - yx * dy, -xy * dx - yy * dy];
    return new Transform(xx, xy, yx, yy, dx, dy);
  }

  /**
   * Decompose into a DecomposedTransform.
   */
  toDecomposed(): DecomposedTransform {
    return decomposedFromTransform(this);
  }

  toArray(): TransformTuple {
    return _unpackTransformObject(this);
  }
}

function _unpackTransformObject(
  t: Transform
): [number, number, number, number, number, number] {
  return [t.xx, t.xy, t.yx, t.yy, t.dx, t.dy];
}

export function decomposedToTransform(transformation: DecomposedTransform): Transform {
  let t = new Transform();
  t = t.translate(
    transformation.translateX + transformation.tCenterX,
    transformation.translateY + transformation.tCenterY
  );
  t = t.rotate(transformation.rotation * (Math.PI / 180));
  t = t.scale(transformation.scaleX, transformation.scaleY);
  t = t.skew(
    transformation.skewX * (Math.PI / 180),
    transformation.skewY * (Math.PI / 180)
  );
  t = t.translate(-transformation.tCenterX, -transformation.tCenterY);
  return t;
}

/**
 * Decompose a Transform into a DecomposedTransform.
 */
export function decomposedFromTransform(affine: Transform): DecomposedTransform {
  // Decompose a 2x2 transformation matrix into components:
  // - rotation
  // - scaleX
  // - scaleY
  // - skewX
  // - skewY
  let [a, b, c, d] = [affine.xx, affine.xy, affine.yx, affine.yy];

  let sx = Math.sign(a) || 1;
  if (sx < 0) {
    a *= sx;
    b *= sx;
  }

  const delta = a * d - b * c;

  let rotation = 0;
  let scaleX = 0,
    scaleY = 0;
  let skewX = 0,
    skewY = 0;

  // Apply the QR-like decomposition.
  if (a != 0 || b != 0) {
    const r = Math.sqrt(a * a + b * b);
    rotation = b >= 0 ? Math.acos(a / r) : -Math.acos(a / r);
    [scaleX, scaleY] = [r, delta / r];
    [skewX, skewY] = [Math.atan((a * c + b * d) / (r * r)), 0];
  } else if (c != 0 || d != 0) {
    const s = Math.sqrt(c * c + d * d);
    rotation = Math.PI / 2 - (d >= 0 ? Math.acos(-c / s) : -Math.acos(c / s));
    [scaleX, scaleY] = [delta / s, s];
    [skewX, skewY] = [0, Math.atan((a * c + b * d) / (s * s))];
  } else {
    // a = b = c = d = 0
  }

  const transformation = {
    translateX: affine.dx,
    translateY: affine.dy,
    rotation: rotation * (180 / Math.PI),
    scaleX: scaleX * sx,
    scaleY: scaleY,
    skewX: skewX * (180 / Math.PI) * sx,
    skewY: skewY * (180 / Math.PI),
    tCenterX: 0,
    tCenterY: 0,
  };
  return transformation;
}

const _EPSILON = 1e-15;
const _ONE_EPSILON = 1 - _EPSILON;
const _MINUS_ONE_EPSILON = -1 + _EPSILON;

function _normSinCos(v: number): number {
  if (Math.abs(v) < _EPSILON) {
    v = 0;
  } else if (v > _ONE_EPSILON) {
    v = 1;
  } else if (v < _MINUS_ONE_EPSILON) {
    v = -1;
  }
  return v;
}

const decomposedIdentity: DecomposedTransform = {
  translateX: 0,
  translateY: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  skewX: 0,
  skewY: 0,
  tCenterX: 0,
  tCenterY: 0,
};

export function getDecomposedIdentity(): DecomposedTransform {
  return { ...decomposedIdentity };
}

/**
 * Prepend `prependTransform` to `decomposed`
 *
 * `prependTransform` is a `Transform` instance
 * `decomposed` is a decomposed transform
 * The return value is a decomposed transform
 *
 * This operation ensures the `tCenterX` and `tCenterY` properties of the
 * `decomposed` transform are not lost.
 */
export function prependTransformToDecomposed(
  prependTransform: Transform,
  decomposed: DecomposedTransform
): DecomposedTransform {
  const [tCenterX, tCenterY] = [decomposed.tCenterX, decomposed.tCenterY];

  const newTransform = new Transform()
    .translate(-tCenterX, -tCenterY)
    .transform(prependTransform)
    .transform(decomposedToTransform(decomposed))
    .translate(tCenterX, tCenterY);

  const newDecomposed = decomposedFromTransform(newTransform);
  newDecomposed.tCenterX = tCenterX;
  newDecomposed.tCenterY = tCenterY;
  return newDecomposed;
}
