import { boolInt, modulo, reversed } from "@fontra/core/utils.js";

// Or-able constants for rule definitions
export const NIL = 1 << 0; // Does not exist
export const SEL = 1 << 1; // Selected
export const UNS = 1 << 2; // Unselected
export const SHA = 1 << 3; // Sharp On-Curve
export const SMO = 1 << 4; // Smooth On-Curve
export const OFF = 1 << 5; // Off-Curve
export const ANY = SHA | SMO | OFF;

// Some examples:
//     SHA        point must be sharp, and can be selected or not
//     SHA|SMO    point must be either sharp or smooth, and can be selected or not
//     OFF|SEL    point must be off-curve and selected
//     ANY|UNS    point can be off-curve, sharp or smooth, and must not be selected

const SHARP_SELECTED = "SHARP_SELECTED";
const SHARP_UNSELECTED = "SHARP_UNSELECTED";
const SMOOTH_SELECTED = "SMOOTH_SELECTED";
const SMOOTH_UNSELECTED = "SMOOTH_UNSELECTED";
const OFFCURVE_SELECTED = "OFFCURVE_SELECTED";
const OFFCURVE_UNSELECTED = "OFFCURVE_UNSELECTED";
const DOESNT_EXIST = "DOESNT_EXIST";

const POINT_TYPES = [
  // usage: POINT_TYPES[smooth][oncurve][selected]

  // sharp
  [
    // off-curve
    [OFFCURVE_UNSELECTED, OFFCURVE_SELECTED],
    // on-curve
    [SHARP_UNSELECTED, SHARP_SELECTED],
  ],
  // smooth
  [
    // off-curve
    [OFFCURVE_UNSELECTED, OFFCURVE_SELECTED], // smooth off-curve points don't really exist
    // on-curve
    [SMOOTH_UNSELECTED, SMOOTH_SELECTED],
  ],
];

export function buildPointMatchTree(rules) {
  const matchTree = {};
  let ruleIndex = 0;
  for (const rule of rules) {
    if (rule.length !== 8) {
      throw new Error("assert -- invalid rule");
    }
    const matchPoints = rule.slice(0, 6);
    matchPoints.push(ANY | NIL);
    const actionForward = {
      constrain: rule[6],
      action: rule[7],
      direction: 1,
      ruleIndex: ruleIndex,
    };
    const actionBackward = {
      ...actionForward,
      direction: -1,
    };
    populateTree(matchTree, Array.from(reversed(matchPoints)), actionBackward);
    populateTree(matchTree, matchPoints, actionForward);
    ruleIndex++;
  }
  return matchTree;
}

function populateTree(tree, matchPoints, action) {
  const matchPoint = matchPoints[0];
  matchPoints = matchPoints.slice(1);
  const isLeafNode = !matchPoints.length;
  for (const pointType of convertPointType(matchPoint)) {
    if (isLeafNode) {
      tree[pointType] = action;
    } else {
      let branch = tree[pointType];
      if (!branch) {
        branch = {};
        tree[pointType] = branch;
      }
      populateTree(branch, matchPoints, action);
    }
  }
}

function convertPointType(matchPoint) {
  if (matchPoint === (ANY | NIL)) {
    return ["*"];
  }
  const sel = matchPoint & SEL;
  const unsel = matchPoint & UNS;
  const sharp = matchPoint & SHA;
  const smooth = matchPoint & SMO;
  const offcurve = matchPoint & OFF;
  const doesntExist = matchPoint & NIL;

  if (sel && unsel) {
    throw new Error("assert -- can't match matchPoint that is selected and unselected");
  }
  if (!(sharp || smooth || offcurve)) {
    throw new Error("assert -- matchPoint must be at least sharp, smooth or off-curve");
  }

  const pointTypes = [];
  if (doesntExist) {
    pointTypes.push(DOESNT_EXIST);
  }
  if (sharp) {
    if (!unsel) {
      pointTypes.push(SHARP_SELECTED);
    }
    if (!sel) {
      pointTypes.push(SHARP_UNSELECTED);
    }
  }
  if (smooth) {
    if (!unsel) {
      pointTypes.push(SMOOTH_SELECTED);
    }
    if (!sel) {
      pointTypes.push(SMOOTH_UNSELECTED);
    }
  }
  if (offcurve) {
    if (!unsel) {
      pointTypes.push(OFFCURVE_SELECTED);
    }
    if (!sel) {
      pointTypes.push(OFFCURVE_UNSELECTED);
    }
  }
  return pointTypes;
}

export function findPointMatch(
  matchTree,
  pointIndex,
  contourPoints,
  numPoints,
  isClosed
) {
  const neighborIndices = new Array();
  for (let neighborOffset = -3; neighborOffset < 4; neighborOffset++) {
    let neighborIndex = pointIndex + neighborOffset;
    if (isClosed) {
      neighborIndex = modulo(neighborIndex, numPoints);
    }
    neighborIndices.push(neighborIndex);
  }
  const match = _findPointMatch(matchTree, neighborIndices, contourPoints);
  return [match, neighborIndices];
}

function _findPointMatch(matchTree, neighborIndices, contourPoints) {
  const neighborIndex = neighborIndices[0];
  const point = contourPoints[neighborIndex];
  let pointType;
  if (point === undefined) {
    pointType = DOESNT_EXIST;
  } else {
    const smooth = boolInt(point.smooth);
    const oncurve = boolInt(!point.type);
    const selected = boolInt(point.selected);
    pointType = POINT_TYPES[smooth][oncurve][selected];
  }
  const branchSpecific = matchTree[pointType];
  const branchWildcard = matchTree["*"];
  neighborIndices = neighborIndices.slice(1);
  if (!neighborIndices.length) {
    // Leaf node
    // if (branchSpecific && branchWildcard) {
    //   console.log("----", branchSpecific, branchWildcard);
    // }
    return branchSpecific || branchWildcard;
  }
  // if (branchSpecific && branchWildcard) {
  //   console.log("....pointType", pointType);
  //   console.log("....branchSpecific", branchSpecific);
  //   console.log("....branchWildcard", branchWildcard);
  // }
  let matchSpecific, matchWildcard;
  if (branchSpecific) {
    matchSpecific = _findPointMatch(branchSpecific, neighborIndices, contourPoints);
  }
  if (branchWildcard) {
    matchWildcard = _findPointMatch(branchWildcard, neighborIndices, contourPoints);
  }
  // if (matchSpecific && matchWildcard) {
  //   console.log("+++", matchSpecific, matchWildcard);
  // }
  return matchSpecific || matchWildcard;
}
