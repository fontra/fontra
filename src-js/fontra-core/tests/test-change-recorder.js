import { expect } from "chai";
import fs from "fs";

import { recordChanges } from "@fontra/core/change-recorder.js";
import { applyChange } from "@fontra/core/changes.js";
import { enumerate } from "@fontra/core/utils.js";
import { VarPackedPath } from "@fontra/core/var-path.js";

const testData = [
  {
    testName: "object set",
    subject: { a: 12 },
    operation: (subject) => {
      subject.a = 13;
    },
    expectedSubject: { a: 13 },
    expectedChange: { f: "=", a: ["a", 13] },
    expectedRollbackChange: { f: "=", a: ["a", 12] },
  },
  {
    testName: "object set equal value",
    subject: { a: 12 },
    operation: (subject) => {
      subject.a = 12;
    },
    expectedSubject: { a: 12 },
    expectedChange: { f: "=", a: ["a", 12] },
    expectedRollbackChange: { f: "=", a: ["a", 12] },
  },
  {
    testName: "object delete",
    subject: { a: 12 },
    operation: (subject) => {
      delete subject.a;
    },
    expectedSubject: {},
    expectedChange: { f: "d", a: ["a"] },
    expectedRollbackChange: { f: "=", a: ["a", 12] },
  },
  {
    testName: "object delete error",
    subject: {},
    operation: (subject) => {
      delete subject.a;
    },
    expectedError: "can't delete undefined property",
  },
  {
    testName: "array set item",
    subject: [12],
    operation: (subject) => {
      subject[0] = 13;
    },
    expectedSubject: [13],
    expectedChange: { f: "=", a: [0, 13] },
    expectedRollbackChange: { f: "=", a: [0, 12] },
  },
  {
    testName: "array set item equal value",
    subject: [12],
    operation: (subject) => {
      subject[0] = 12;
    },
    expectedSubject: [12],
    expectedChange: { f: "=", a: [0, 12] },
    expectedRollbackChange: { f: "=", a: [0, 12] },
  },
  {
    testName: "array push",
    subject: [],
    operation: (subject) => {
      subject.push(100);
    },
    expectedSubject: [100],
    expectedChange: { f: "+", a: [0, 100] },
    expectedRollbackChange: { f: "-", a: [0, 1] },
  },
  {
    testName: "array push multiple",
    subject: [],
    operation: (subject) => {
      subject.push(100, 200);
    },
    expectedSubject: [100, 200],
    expectedChange: { f: "+", a: [0, 100, 200] },
    expectedRollbackChange: { f: "-", a: [0, 2] },
  },
  {
    testName: "array splice",
    subject: [5, 6, 7, 8],
    operation: (subject) => {
      subject.splice(1, 2, 999);
    },
    expectedSubject: [5, 999, 8],
    expectedChange: { f: ":", a: [1, 2, 999] },
    expectedRollbackChange: { f: ":", a: [1, 1, 6, 7] },
  },
  {
    testName: "nested array set item",
    subject: [12, [6, 7, 8], 50],
    operation: (subject) => {
      subject[1][2] = 88;
    },
    expectedSubject: [12, [6, 7, 88], 50],
    expectedChange: { p: [1], f: "=", a: [2, 88] },
    expectedRollbackChange: { p: [1], f: "=", a: [2, 8] },
  },
  {
    testName: "multiple changes",
    subject: [12, [6, 7, 8], 50],
    operation: (subject) => {
      subject.splice(1, 0, 77, 88);
      subject[3].splice(1, 0, -3);
    },
    expectedSubject: [12, 77, 88, [6, -3, 7, 8], 50],
    expectedChange: {
      c: [
        { f: ":", a: [1, 0, 77, 88] },
        { p: [3], f: ":", a: [1, 0, -3] },
      ],
    },
    expectedRollbackChange: {
      c: [
        { p: [3], f: ":", a: [1, 1] },
        { f: ":", a: [1, 2] },
      ],
    },
  },
  {
    testName: "path add contour",
    subject: new VarPackedPath(),
    operation: (subject) => {
      subject.insertContour(0, emptyContour());
    },
    expectedSubject: VarPackedPath.fromUnpackedContours([
      { points: [], isClosed: false },
    ]),
    expectedChange: {
      f: "insertContour",
      a: [0, { coordinates: [], pointTypes: [], isClosed: false }],
    },
    expectedRollbackChange: { f: "deleteContour", a: [0] },
  },
  {
    testName: "path delete contour",
    subject: VarPackedPath.fromUnpackedContours([
      { points: [{ x: 100, y: 200 }], isClosed: false },
    ]),
    operation: (subject) => {
      subject.deleteContour(0);
    },
    expectedSubject: new VarPackedPath(),
    expectedChange: { f: "deleteContour", a: [0] },
    expectedRollbackChange: {
      f: "insertContour",
      a: [
        0,
        {
          coordinates: [100, 200],
          pointTypes: [0],
          pointAttributes: null,
          isClosed: false,
        },
      ],
    },
  },
  {
    testName: "path close contour",
    subject: VarPackedPath.fromUnpackedContours([
      { points: [{ x: 100, y: 200 }], isClosed: false },
    ]),
    operation: (subject) => {
      subject.contourInfo[0].isClosed = true;
    },
    expectedSubject: VarPackedPath.fromUnpackedContours([
      { points: [{ x: 100, y: 200 }], isClosed: true },
    ]),
    expectedChange: { p: ["contourInfo", 0], f: "=", a: ["isClosed", true] },
    expectedRollbackChange: { p: ["contourInfo", 0], f: "=", a: ["isClosed", false] },
  },
  {
    testName: "path insert point",
    subject: VarPackedPath.fromUnpackedContours([
      { points: [{ x: 100, y: 200 }], isClosed: false },
    ]),
    operation: (subject) => {
      subject.insertPoint(0, 1, { x: 4, y: 5 });
    },
    expectedSubject: VarPackedPath.fromUnpackedContours([
      {
        points: [
          { x: 100, y: 200 },
          { x: 4, y: 5 },
        ],
        isClosed: false,
      },
    ]),
    expectedChange: { f: "insertPoint", a: [0, 1, { x: 4, y: 5 }] },
    expectedRollbackChange: { f: "deletePoint", a: [0, 1] },
  },
  {
    testName: "path delete point",
    subject: VarPackedPath.fromUnpackedContours([
      { points: [{ x: 100, y: 200 }], isClosed: false },
    ]),
    operation: (subject) => {
      subject.deletePoint(0, 0);
    },
    expectedSubject: VarPackedPath.fromUnpackedContours([
      { points: [], isClosed: false },
    ]),
    expectedChange: { f: "deletePoint", a: [0, 0] },
    expectedRollbackChange: { f: "insertPoint", a: [0, 0, { x: 100, y: 200 }] },
  },
  {
    testName: "path set point position",
    subject: VarPackedPath.fromUnpackedContours([
      { points: [{ x: 100, y: 200 }], isClosed: false },
    ]),
    operation: (subject) => {
      subject.setPointPosition(0, 101, 201);
    },
    expectedSubject: VarPackedPath.fromUnpackedContours([
      { points: [{ x: 101, y: 201 }], isClosed: false },
    ]),
    expectedChange: { f: "=xy", a: [0, 101, 201] },
    expectedRollbackChange: { f: "=xy", a: [0, 100, 200] },
  },
  {
    testName: "path append path",
    subject: VarPackedPath.fromUnpackedContours([]),
    operation: (subject) => {
      subject.appendPath(
        VarPackedPath.fromUnpackedContours([
          { points: [{ x: 101, y: 201 }], isClosed: false },
          { points: [{ x: 202, y: 302 }], isClosed: false },
        ])
      );
    },
    expectedSubject: VarPackedPath.fromUnpackedContours([
      { points: [{ x: 101, y: 201 }], isClosed: false },
      { points: [{ x: 202, y: 302 }], isClosed: false },
    ]),
    expectedChange: {
      f: "appendPath",
      a: [
        {
          contourInfo: [
            {
              endPoint: 0,
              isClosed: false,
            },
            {
              endPoint: 1,
              isClosed: false,
            },
          ],
          coordinates: [101, 201, 202, 302],
          pointAttributes: null,
          pointTypes: [0, 0],
        },
      ],
    },
    expectedRollbackChange: {
      f: "deleteNTrailingContours",
      a: [2],
    },
  },
];

describe("recordChanges tests", () => {
  for (const [index, testCase] of enumerate(testData)) {
    it(`${testCase.testName} #${index}`, () => {
      const subject = copyObject(testCase.subject);
      expect(testCase.subject.constructor.name).to.equal(subject.constructor.name);
      if (testCase.expectedError) {
        expect(() => {
          const changes = recordChanges(subject, testCase.operation);
        }).to.throw(testCase.expectedError);
      } else {
        const changes = recordChanges(subject, testCase.operation);
        expect(subject).to.deep.equal(testCase.expectedSubject);
        if (testCase.expectedChange) {
          expect(changes.change).to.deep.equal(testCase.expectedChange);
        }
        if (testCase.expectedRollbackChange) {
          expect(changes.rollbackChange).to.deep.equal(testCase.expectedRollbackChange);
        }

        // Test applying the rollback and change again
        applyChange(subject, changes.rollbackChange);
        expect(subject).to.deep.equal(testCase.subject);
        applyChange(subject, changes.change);
        expect(subject).to.deep.equal(testCase.expectedSubject);
      }
    });
  }
});

function copyObject(obj) {
  if (obj.copy !== undefined) {
    return obj.copy();
  }
  return JSON.parse(JSON.stringify(obj));
}

function emptyContour() {
  return { coordinates: [], pointTypes: [], isClosed: false };
}
