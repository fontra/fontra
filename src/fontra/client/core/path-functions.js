import { arrayExtend, range, reversed } from "./utils.js";
import { VarPackedPath } from "./var-path.js";
import { roundVector } from "./vector.js";

export function insertPoint(path, intersection) {
  let selectedPointIndex;
  const segment = intersection.segment;
  const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(
    segment.parentPointIndices[0]
  );
  const numContourPoints = path.getNumPointsOfContour(contourIndex);
  const absToRel = contourPointIndex - segment.parentPointIndices[0];
  let insertIndex = segment.pointIndices.at(-1) + absToRel;
  if (segment.points.length === 2) {
    // insert point in line
    if (insertIndex <= 0) {
      insertIndex = numContourPoints;
    }
    path.insertPoint(contourIndex, insertIndex, {
      x: intersection.x,
      y: intersection.y,
    });
    selectedPointIndex = insertIndex;
  } else {
    // insert point in curve
    const firstOffCurve = path.getPoint(segment.parentPointIndices[1]);
    const { left, right } = segment.bezier.split(intersection.t);
    if (firstOffCurve.type === "cubic") {
      const points = [...left.points.slice(1), ...right.points.slice(1, 3)].map(
        roundVector
      );
      points[0].type = "cubic";
      points[1].type = "cubic";
      points[2].smooth = true;
      points[3].type = "cubic";
      points[4].type = "cubic";

      const deleteIndices = segment.parentPointIndices.slice(1, -1);
      if (insertIndex < deleteIndices.length) {
        insertIndex = numContourPoints;
      }
      for (const point of reversed(points)) {
        path.insertPoint(contourIndex, insertIndex, point);
      }
      // selectionBias is non-zero if the cubic segment has more than
      // two off-curve points, which is currently invalid. We delete all
      // off-curve, and replace with clean cubic segments, but this messes
      // with the selection index
      const selectionBias = segment.parentPointIndices.length - 4;
      selectedPointIndex = insertIndex - selectionBias;
      deleteIndices.sort((a, b) => b - a); // reverse sort
      deleteIndices.forEach((pointIndex) =>
        path.deletePoint(contourIndex, pointIndex + absToRel)
      );
    } else {
      // quad
      const points = [left.points[1], left.points[2], right.points[1]].map(roundVector);
      points[0].type = "quad";
      points[1].smooth = true;
      points[2].type = "quad";

      const point1 = path.getPoint(segment.pointIndices[0]);
      const point2 = path.getPoint(segment.pointIndices[1]);
      const point3 = path.getPoint(segment.pointIndices[2]);
      insertIndex = segment.pointIndices[1] + absToRel;
      if (point3.type) {
        path.insertPoint(contourIndex, insertIndex + 1, impliedPoint(point2, point3));
      }
      if (point1.type) {
        path.insertPoint(contourIndex, insertIndex, impliedPoint(point1, point2));
        insertIndex++;
      }
      // Delete off-curve
      path.deletePoint(contourIndex, insertIndex);

      // Insert split
      for (const point of reversed(points)) {
        path.insertPoint(contourIndex, insertIndex, point);
      }
      selectedPointIndex = insertIndex + 1;
    }
  }
  const selection = new Set();
  if (selectedPointIndex !== undefined) {
    selectedPointIndex = path.getAbsolutePointIndex(contourIndex, selectedPointIndex);
    selection.add(`point/${selectedPointIndex}`);
  }
  return selection;
}

function impliedPoint(pointA, pointB) {
  return {
    x: Math.round((pointA.x + pointB.x) / 2),
    y: Math.round((pointA.y + pointB.y) / 2),
    smooth: true,
  };
}

export function insertHandles(path, handlePoints, insertIndex, type = "cubic") {
  let [contourIndex, contourPointIndex] = path.getContourAndPointIndex(insertIndex);
  if (!contourPointIndex) {
    contourPointIndex = path.getNumPointsOfContour(contourIndex);
  }
  insertIndex = path.getAbsolutePointIndex(contourIndex, contourPointIndex, true);
  handlePoints = handlePoints.map((pt) => {
    return { x: pt.x, y: pt.y, type: type };
  });
  path.insertPoint(contourIndex, contourPointIndex, handlePoints[1]);
  path.insertPoint(contourIndex, contourPointIndex, handlePoints[0]);
  return new Set([`point/${insertIndex}`, `point/${insertIndex + 1}`]);
}

export function filterPathByPointIndices(path, pointIndices, doCut = false) {
  const selectionByContour = getSelectionByContour(path, pointIndices);
  const filteredUnpackedContours = [];
  const remainingUnpackedContours = doCut ? new Map() : null;
  for (const [contourIndex, contourPointIndices] of selectionByContour.entries()) {
    const contour = path.getUnpackedContour(contourIndex);
    const numContourPoints = contour.points.length;
    const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
    const indexSet = makeExpandedIndexSet(
      path,
      contourPointIndices,
      contourIndex,
      startPoint
    );
    if (indexSet.size === numContourPoints) {
      // Easy: the whole contour is copied
      filteredUnpackedContours.push(contour);
      remainingUnpackedContours?.set(contourIndex, []);
      continue;
    }
    // Split
    const filteredIndices = [...indexSet];
    filteredIndices.sort((a, b) => a - b);
    const filteredRanges = splitContourPointRanges(
      filteredIndices,
      contour.isClosed,
      numContourPoints
    );
    filteredUnpackedContours.push(
      ...rangesToContours(path, startPoint, filteredRanges)
    );
    if (doCut) {
      const remainingRanges = invertContourPointRanges(
        filteredRanges,
        contour.isClosed,
        numContourPoints
      );
      remainingUnpackedContours.set(contourIndex, [
        ...rangesToContours(path, startPoint, remainingRanges),
      ]);
    }
  }
  if (doCut) {
    // replace selected contours with remainingUnpackedContours
    const remainingContourIndices = [...remainingUnpackedContours.keys()];
    // Reverse-sort the contour indices, so we can replace contours
    // with multiple split contours without invalidating the prior
    // contour indices
    remainingContourIndices.sort((a, b) => b - a);
    for (const contourIndex of remainingContourIndices) {
      path.deleteContour(contourIndex);
      for (const contour of reversed(remainingUnpackedContours.get(contourIndex))) {
        path.insertUnpackedContour(contourIndex, contour);
      }
    }
  }
  return VarPackedPath.fromUnpackedContours(filteredUnpackedContours);
}

function makeExpandedIndexSet(
  path,
  contourPointIndices,
  contourIndex,
  startPoint,
  greedy = true
) {
  // Given a "sparse" selection, fill in the gaps by adding all off-curve points
  // that are included in selected segments
  const indexSet = new Set(contourPointIndices);
  for (const segment of path.iterContourSegmentPointIndices(contourIndex)) {
    const indices = segment.pointIndices.map((i) => i - startPoint);
    const firstPointIndex = indices[0];
    const lastPointIndex = indices.at(-1);
    if (
      (greedy &&
        indices.length > 2 &&
        indices.slice(1, -1).some((i) => indexSet.has(i))) ||
      (indexSet.has(firstPointIndex) && indexSet.has(lastPointIndex))
    ) {
      indices.forEach((i) => indexSet.add(i));
    }
  }
  return indexSet;
}

export function splitPathAtPointIndices(path, pointIndices) {
  let numSplits = 0;
  const selectionByContour = getSelectionByContour(path, pointIndices);
  const selectedContours = [...selectionByContour.keys()];
  // Reverse-sort the contour indices, so we can replace contours
  // with multiple split contours without invalidating the prior
  // contour indices
  selectedContours.sort((a, b) => b - a);

  for (const contourIndex of selectedContours) {
    const contour = path.getUnpackedContour(contourIndex);
    const isClosed = path.contourInfo[contourIndex].isClosed;
    const points = contour.points;
    // Filter out off-curve points, as well as start and end points of open paths
    const contourPointIndices = selectionByContour
      .get(contourIndex)
      .filter((i) => !points[i].type && (isClosed || (i > 0 && i < points.length - 1)));
    if (!contourPointIndices.length) {
      continue;
    }
    numSplits += contourPointIndices.length;

    const pointArrays = [points];
    let pointIndexBias = 0;
    if (isClosed) {
      const splitPointIndex = contourPointIndices.pop();
      pointArrays[0] = splitClosedPointsArray(points, splitPointIndex);
      pointIndexBias = points.length - splitPointIndex;
    }

    for (const splitPointIndex of reversed(contourPointIndices)) {
      const points = pointArrays.pop();
      const [points1, points2] = splitOpenPointsArray(
        points,
        splitPointIndex + pointIndexBias
      );
      pointArrays.push(points2);
      pointArrays.push(points1);
    }

    path.deleteContour(contourIndex);
    // Insert the split contours in reverse order
    for (const points of pointArrays) {
      // Ensure the end points are not smooth
      delete points[0].smooth;
      delete points[points.length - 1].smooth;
      path.insertUnpackedContour(contourIndex, { points: points, isClosed: false });
    }
  }
  return numSplits;
}

function splitClosedPointsArray(points, splitPointIndex) {
  return points.slice(splitPointIndex).concat(points.slice(0, splitPointIndex + 1));
}

function splitOpenPointsArray(points, splitPointIndex) {
  if (!splitPointIndex || splitPointIndex >= points.length - 1) {
    throw new Error(`assert -- invalid point index ${splitPointIndex}`);
  }
  return [points.slice(0, splitPointIndex + 1), points.slice(splitPointIndex)];
}

export function connectContours(path, sourcePointIndex, targetPointIndex) {
  let selectedPointIndex;
  const [sourceContourIndex, sourceContourPointIndex] =
    path.getContourAndPointIndex(sourcePointIndex);
  const [targetContourIndex, targetContourPointIndex] =
    path.getContourAndPointIndex(targetPointIndex);
  if (sourceContourIndex == targetContourIndex) {
    // Close contour
    path.contourInfo[sourceContourIndex].isClosed = true;
    if (sourceContourPointIndex) {
      path.deletePoint(sourceContourIndex, sourceContourPointIndex);
    } else {
      // Ensure the target point becomes the start point
      path.setPoint(sourcePointIndex, path.getPoint(targetPointIndex));
      path.deletePoint(sourceContourIndex, targetContourPointIndex);
    }
    selectedPointIndex = sourceContourPointIndex ? targetPointIndex : sourcePointIndex;
  } else {
    // Connect contours
    const sourceContour = path.getUnpackedContour(sourceContourIndex);
    const targetContour = path.getUnpackedContour(targetContourIndex);
    if (!!sourceContourPointIndex == !!targetContourPointIndex) {
      targetContour.points.reverse();
    }
    sourceContour.points.splice(
      sourceContourPointIndex ? -1 : 0,
      1,
      ...targetContour.points
    );
    path.deleteContour(sourceContourIndex);
    path.insertUnpackedContour(sourceContourIndex, sourceContour);
    path.deleteContour(targetContourIndex);

    selectedPointIndex = path.getAbsolutePointIndex(
      targetContourIndex < sourceContourIndex
        ? sourceContourIndex - 1
        : sourceContourIndex,
      sourceContourPointIndex
        ? sourceContourPointIndex
        : targetContour.points.length - 1
    );
  }
  return new Set([`point/${selectedPointIndex}`]);
}

export function deleteSelectedPoints(path, pointIndices) {
  pointIndices = expandPointSelection(path, pointIndices);
  for (const pointIndex of reversed(pointIndices)) {
    const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
    const numContourPoints = path.getNumPointsOfContour(contourIndex);

    if (numContourPoints > 1) {
      path.deletePoint(contourIndex, contourPointIndex);
    } else {
      path.deleteContour(contourIndex);
    }
  }
}

function expandPointSelection(path, pointIndices) {
  // Given a "sparse" selection, fill in the gaps by adding all off-curve points
  // that are included in selected segments
  const selectionByContour = getSelectionByContour(path, pointIndices);
  const filteredUnpackedContours = [];
  let expandedIndices = [];
  for (const [contourIndex, contourPointIndices] of selectionByContour.entries()) {
    const contour = path.getUnpackedContour(contourIndex);
    const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
    const indexSet = makeExpandedIndexSet(
      path,
      contourPointIndices,
      contourIndex,
      startPoint,
      false
    );
    arrayExtend(
      expandedIndices,
      [...indexSet].map((i) => i + startPoint)
    );
  }

  const pointIndicesIncludingSmoothCurveHandles = [];
  for (const pointIndice of expandedIndices) {
    if (path.pointTypes[pointIndice] === VarPackedPath.SMOOTH_FLAG) {
      pointIndicesIncludingSmoothCurveHandles.push(
        pointIndice - 1,
        pointIndice,
        pointIndice + 1
      );
    } else {
      pointIndicesIncludingSmoothCurveHandles.push(pointIndice);
    }
  }

  expandedIndices = pointIndicesIncludingSmoothCurveHandles;

  expandedIndices.sort((a, b) => a - b);
  return expandedIndices;
}

export function getSelectionByContour(path, pointIndices) {
  const selectionByContour = new Map();
  for (const pointIndex of pointIndices) {
    const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
    if (!selectionByContour.has(contourIndex)) {
      selectionByContour.set(contourIndex, []);
    }
    selectionByContour.get(contourIndex).push(contourPointIndex);
  }
  return selectionByContour;
}

function splitContourPointRanges(indices, isClosed, numContourPoints) {
  const ranges = [];
  let currentRange;
  for (const i of indices) {
    if (currentRange && currentRange.at(-1) + 1 === i) {
      currentRange.push(i);
    } else {
      currentRange = [i];
      ranges.push(currentRange);
    }
  }
  _wrapStartRange(ranges, isClosed, numContourPoints);
  return ranges;
}

function invertContourPointRanges(ranges, isClosed, numContourPoints) {
  const invRanges = [];
  let prevEnd = isClosed ? undefined : 0;
  for (const rng of ranges) {
    if (prevEnd !== undefined && prevEnd !== rng[0]) {
      invRanges.push([...range(prevEnd, rng[0] + 1)]);
    }
    prevEnd = rng.at(-1);
  }
  if (isClosed) {
    const firstIndex = ranges[0][0];
    const lastIndex = ranges.at(-1).at(-1);
    let remainingIndex = lastIndex;
    const closingRange = [remainingIndex];
    do {
      remainingIndex = (remainingIndex + 1) % numContourPoints;
      closingRange.push(remainingIndex);
    } while (remainingIndex !== firstIndex);
    invRanges.push(closingRange);
  } else {
    if (!invRanges.length || (prevEnd && prevEnd !== numContourPoints - 1)) {
      invRanges.push([...range(prevEnd, numContourPoints)]);
    }
    _wrapStartRange(invRanges, isClosed, numContourPoints);
  }
  return invRanges;
}

function _wrapStartRange(ranges, isClosed, numContourPoints) {
  if (
    ranges.length > 1 &&
    isClosed &&
    ranges[0][0] === 0 &&
    ranges.at(-1).at(-1) + 1 === numContourPoints
  ) {
    const firstRange = ranges.shift();
    ranges.at(-1).push(...firstRange);
  }
}

function* rangesToContours(path, startPoint, ranges) {
  for (const contourPointIndices of ranges) {
    const points = contourPointIndices.map((i) => path.getPoint(i + startPoint));
    delete points[0].smooth;
    delete points.at(-1).smooth;
    yield { points: points, isClosed: false };
  }
}
