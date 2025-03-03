export function addVectors(vectorA, vectorB) {
  return { x: vectorA.x + vectorB.x, y: vectorA.y + vectorB.y };
}

export function subVectors(vectorA, vectorB) {
  return { x: vectorA.x - vectorB.x, y: vectorA.y - vectorB.y };
}

export function mulVectorScalar(vector, scalar) {
  return { x: vector.x * scalar, y: vector.y * scalar };
}

export function mulVectorVector(vectorA, vectorB) {
  return { x: vectorA.x * vectorB.x, y: vectorA.y * vectorB.y };
}

export function rotateVector90CW(vector) {
  return { x: vector.y, y: -vector.x };
}

export function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y);
}

export function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y);
  if (length < _EPSILON) {
    return vector;
  }
  return mulVectorScalar(vector, 1 / length);
}

export function roundVector(vector) {
  return { x: Math.round(vector.x), y: Math.round(vector.y) };
}

const _EPSILON = 1e-10;

export function intersect(pt1, pt2, pt3, pt4) {
  // Return the intersection point of pt1-pt2 and pt3-pt4 as well as
  // two 't' values, indicating where the intersection is relatively to
  // the input lines, like so:
  //         if 0 <= t1 <= 1:
  //                 the intersection lies between pt1 and pt2
  //         elif t1 < 0:
  //                 the intersection lies between before pt1
  //         elif t1 > 1:
  //                 the intersection lies between beyond pt2
  // Similarly for t2 and pt3-pt4.
  // Return [undefined, undefined, undefined] if there is no intersection.
  let intersection;
  const delta1 = subVectors(pt2, pt1);
  const delta2 = subVectors(pt4, pt3);
  const determinant = delta2.y * delta1.x - delta2.x * delta1.y;
  if (Math.abs(determinant) > _EPSILON) {
    const t1 = ((pt3.x - pt1.x) * delta2.y + (pt1.y - pt3.y) * delta2.x) / determinant;
    const t2 = ((pt1.x - pt3.x) * delta1.y + (pt3.y - pt1.y) * delta1.x) / -determinant;
    intersection = addVectors(mulVectorScalar(delta1, t1), pt1);
    intersection.t1 = t1;
    intersection.t2 = t2;
  }
  return intersection;
}

export function distance(pt1, pt2) {
  return vectorLength(subVectors(pt2, pt1));
}

export function dotVector(vectorA, vectorB) {
  return vectorA.x * vectorB.x + vectorA.y * vectorB.y;
}

export function interpolateVectors(vectorA, vectorB, t) {
  const d = subVectors(vectorB, vectorA);
  return addVectors(vectorA, mulVectorScalar(d, t));
}
