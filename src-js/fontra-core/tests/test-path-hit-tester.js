import { expect } from "chai";

import { PathHitTester } from "@fontra/core/path-hit-tester.js";
import { VarPackedPath } from "@fontra/core/var-path.js";
import { parametrize } from "./test-support.js";

describe("PathHitTester Tests", () => {
  const hitTest_testData = [
    [{ x: -30, y: 10 }, 20, {}],
    [
      { x: 10, y: 10 },
      20,
      { contourIndex: 0, segmentIndex: 3, d: 10, t: 0.95, x: 10.000000000000009, y: 0 },
    ],
    [
      { x: 100, y: 10 },
      20,
      { contourIndex: 0, segmentIndex: 3, d: 10, t: 0.5, x: 100, y: 0 },
    ],
    [
      { x: 190, y: 10 },
      20,
      {
        contourIndex: 0,
        segmentIndex: 3,
        d: 10,
        t: 0.05000000000000001,
        x: 190,
        y: 0,
      },
    ],
    [{ x: 190, y: 49 }, 20, {}],
    [
      { x: 230, y: 49 },
      20,
      {
        contourIndex: 0,
        segmentIndex: 2,
        d: 5.009098283124404,
        t: 0.509,
        x: 224.99190000000002,
        y: 49.1,
      },
    ],
    [
      { x: 10, y: 210 },
      20,
      {
        contourIndex: 1,
        segmentIndex: 3,
        d: 10,
        t: 0.95,
        x: 10.000000000000009,
        y: 200,
      },
    ],
    [
      { x: 100, y: 210 },
      20,
      {
        contourIndex: 1,
        segmentIndex: 3,
        d: 10,
        t: 0.5,
        x: 100,
        y: 200,
      },
    ],
    [
      { x: 220, y: 250 },
      20,
      {
        contourIndex: 1,
        segmentIndex: 2,
        d: 12.956840321996932,
        t: 0.335,
        x: 226.73300000000003,
        y: 238.92993125000007,
      },
    ],
  ];
  parametrize("hitTest test", hitTest_testData, (testData) => {
    const [testPoint, margin, expectedHit] = testData;
    const p = new VarPackedPath();
    p.moveTo(0, 0);
    p.lineTo(0, 100);
    p.lineTo(200, 100);
    p.quadraticCurveTo(250, 50, 200, 0);
    p.closePath();
    p.moveTo(0, 200);
    p.lineTo(0, 300);
    p.lineTo(200, 200);
    p.cubicCurveTo(240, 275, 240, 225, 200, 200);
    p.closePath();
    const pcf = new PathHitTester(p);
    const hit = pcf.hitTest(testPoint, margin);
    expect(filterHit(hit)).to.deep.equal(expectedHit);
  });
});

function filterHit(hit) {
  const newHit = {};
  const properties = ["contourIndex", "segmentIndex", "x", "y", "d", "t"];
  for (const prop of properties) {
    if (prop in hit) {
      newHit[prop] = hit[prop];
    }
  }
  return newHit;
}
