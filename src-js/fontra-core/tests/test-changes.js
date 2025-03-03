import { expect } from "chai";

import {
  ChangeCollector,
  applyChange,
  collectChangePaths,
  consolidateChanges,
  filterChangePattern,
  matchChangePath,
  matchChangePattern,
} from "@fontra/core/changes.js";
import { getTestData } from "./test-support.js";

describe("applyChange Tests", () => {
  const test_data = getTestData("apply-change-test-data.json");
  const inputData = test_data["inputData"];
  const tests = test_data["tests"];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const testName = test["testName"];
    const inputDataName = test["inputDataName"];
    const expectedData = test["expectedData"];

    const subject = copyObject(inputData[inputDataName]);
    it(`applyChange Test #${i} -- ${testName}`, () => {
      applyChange(subject, test["change"]);
      expect(subject).to.deep.equal(expectedData);
    });
  }
});

describe("matchChangePattern Tests", () => {
  const tests = getTestData("match-change-pattern-test-data.json");

  for (let i = 0; i < tests.length; i++) {
    const [change, pattern, expectedResult] = tests[i];

    it(`matchChangePattern Test #${i}`, () => {
      const result = matchChangePattern(change, pattern);
      expect(result).to.equal(expectedResult);
    });
  }
});

describe("matchChangePath Tests", () => {
  const tests = [
    [{}, [], false],
    [{ p: ["A"] }, ["A"], true],
    [{ p: ["A"] }, ["A", "B"], false],
    [{ p: ["A", "B"] }, ["A"], true],
    [{ p: ["A", "B"] }, ["A", "B"], true],
    [{ p: ["A"] }, ["B"], false],
    [{ c: [{ p: ["A"] }] }, ["A"], true],
    [{ p: ["A"], c: [{ p: ["B"] }] }, ["A", "B"], true],
    [{ p: ["A"], c: [{ p: ["B"] }] }, ["A", "C"], false],
    [{ p: ["A"], c: [{ p: ["B"] }] }, ["B", "B"], false],
  ];

  for (let i = 0; i < tests.length; i++) {
    const [change, path, expectedResult] = tests[i];

    it(`matchChangePath Test #${i}`, () => {
      const result = matchChangePath(change, path);
      expect(result).to.equal(expectedResult);
    });
  }
});

describe("filterChangePattern Tests", () => {
  const tests = getTestData("filter-change-pattern-test-data.json");

  for (let i = 0; i < tests.length; i++) {
    const [change, pattern, inverse, expectedResult] = tests[i];

    it(`filterChangePattern Test #${i}`, () => {
      const result = filterChangePattern(change, pattern, inverse);
      expect(result).to.deep.equal(expectedResult);
    });
  }
});

describe("collectChangePaths Tests", () => {
  const tests = getTestData("collect-change-paths-test-data.json");

  for (let i = 0; i < tests.length; i++) {
    const [change, depth, expectedPaths] = tests[i];

    it(`collectChangePaths Test #${i}`, () => {
      const paths = collectChangePaths(change, depth);
      expect(paths).to.deep.equal(expectedPaths);
    });
  }
});

const consolidateChangesTestCases = [
  {
    testName: "no-op",
    changes: { f: "=", a: [0, 0] },
    prefixPath: undefined,
    consolidated: { f: "=", a: [0, 0] },
  },
  {
    testName: "no-op + empty p",
    changes: { p: [], f: "=", a: [0, 0] },
    prefixPath: undefined,
    consolidated: { f: "=", a: [0, 0] },
  },
  {
    testName: "no-op + prefix",
    changes: { f: "=", a: [0, 0] },
    prefixPath: ["element"],
    consolidated: { p: ["element"], f: "=", a: [0, 0] },
  },
  {
    testName: "prefix + p",
    changes: { p: ["sub"], f: "=", a: [0, 0] },
    prefixPath: ["element"],
    consolidated: { p: ["element", "sub"], f: "=", a: [0, 0] },
  },
  {
    testName: "single change",
    changes: [{ f: "=", a: [0, 0] }],
    prefixPath: undefined,
    consolidated: { f: "=", a: [0, 0] },
  },
  {
    testName: "single change + prefix",
    changes: [{ f: "=", a: [0, 0] }],
    prefixPath: ["element"],
    consolidated: { p: ["element"], f: "=", a: [0, 0] },
  },
  {
    testName: "two changes",
    changes: [
      { f: "=", a: [0, 0] },
      { f: "=", a: [1, 2] },
    ],
    prefixPath: undefined,
    consolidated: {
      c: [
        { f: "=", a: [0, 0] },
        { f: "=", a: [1, 2] },
      ],
    },
  },
  {
    testName: "two changes + empty p",
    changes: [
      { p: [], f: "=", a: [0, 0] },
      { f: "=", a: [1, 2] },
    ],
    prefixPath: undefined,
    consolidated: {
      c: [
        { f: "=", a: [0, 0] },
        { f: "=", a: [1, 2] },
      ],
    },
  },
  {
    testName: "two changes + prefix",
    changes: [
      { f: "=", a: [0, 0] },
      { f: "=", a: [1, 2] },
    ],
    prefixPath: ["element"],
    consolidated: {
      p: ["element"],
      c: [
        { f: "=", a: [0, 0] },
        { f: "=", a: [1, 2] },
      ],
    },
  },
  {
    testName: "two changes + prefix + different p 1",
    changes: [
      { f: "=", a: [0, 0] },
      { p: ["sub2"], f: "=", a: [1, 2] },
    ],
    prefixPath: ["element"],
    consolidated: {
      p: ["element"],
      c: [
        { f: "=", a: [0, 0] },
        { p: ["sub2"], f: "=", a: [1, 2] },
      ],
    },
  },
  {
    testName: "two changes + prefix + different p 1.1; delete empty p",
    changes: [
      { p: [], f: "=", a: [0, 0] },
      { p: ["sub2"], f: "=", a: [1, 2] },
    ],
    prefixPath: ["element"],
    consolidated: {
      p: ["element"],
      c: [
        { f: "=", a: [0, 0] },
        { p: ["sub2"], f: "=", a: [1, 2] },
      ],
    },
  },
  {
    testName: "two changes + prefix + different p 2",
    changes: [
      { p: ["sub1"], f: "=", a: [0, 0] },
      { p: ["sub2"], f: "=", a: [1, 2] },
    ],
    prefixPath: ["element"],
    consolidated: {
      p: ["element"],
      c: [
        { p: ["sub1"], f: "=", a: [0, 0] },
        { p: ["sub2"], f: "=", a: [1, 2] },
      ],
    },
  },
  {
    testName: "two changes + prefix + same p",
    changes: [
      { p: ["sub"], f: "=", a: [0, 0] },
      { p: ["sub"], f: "=", a: [1, 2] },
    ],
    prefixPath: ["element"],
    consolidated: {
      p: ["element", "sub"],
      c: [
        { f: "=", a: [0, 0] },
        { f: "=", a: [1, 2] },
      ],
    },
  },
  {
    testName: "two changes + prefix + same p + extra element",
    changes: [
      { p: ["sub", "subsub"], f: "=", a: [0, 0] },
      { p: ["sub"], f: "=", a: [1, 2] },
    ],
    prefixPath: ["element"],
    consolidated: {
      p: ["element", "sub"],
      c: [
        { p: ["subsub"], f: "=", a: [0, 0] },
        { f: "=", a: [1, 2] },
      ],
    },
  },
  {
    testName: "unnest single child",
    changes: { c: [{ f: "=", a: [0, 0] }] },
    prefixPath: undefined,
    consolidated: { f: "=", a: [0, 0] },
  },
  {
    testName: "deep unnest single child",
    changes: { c: [{ c: [{ f: "=", a: [0, 0] }] }] },
    prefixPath: undefined,
    consolidated: { f: "=", a: [0, 0] },
  },
  {
    testName: "deep unnest single child of multiple children",
    changes: { c: [{ c: [{ f: "=", a: [0, 0] }] }, { f: "=", a: [1, 2] }] },
    prefixPath: undefined,
    consolidated: {
      c: [
        { f: "=", a: [0, 0] },
        { f: "=", a: [1, 2] },
      ],
    },
  },
  {
    testName: "empty change list",
    changes: [],
    prefixPath: undefined,
    consolidated: {},
  },
  {
    testName: "empty change",
    changes: {},
    prefixPath: undefined,
    consolidated: {},
  },
  {
    testName: "no-op change with path",
    changes: { p: ["item"] },
    prefixPath: undefined,
    consolidated: {},
  },
  {
    testName: "no-op changes with path and empty children",
    changes: { p: ["item"], c: [] },
    prefixPath: undefined,
    consolidated: {},
  },
  {
    testName: "no-op changes with path and no-op children",
    changes: { p: ["item"], c: [{}, {}] },
    prefixPath: undefined,
    consolidated: {},
  },
  {
    testName: "nested no-op changes with path",
    changes: { p: ["item"], c: [{ p: ["sub1"] }, { p: ["sub2"] }] },
    prefixPath: undefined,
    consolidated: {},
  },
  {
    testName: "nested no-op changes with path, no root path",
    changes: { c: [{ p: ["sub1"] }, { p: ["sub2"] }] },
    prefixPath: undefined,
    consolidated: {},
  },
];

describe("consolidateChanges tests", () => {
  for (let i = 0; i < consolidateChangesTestCases.length; i++) {
    const test = consolidateChangesTestCases[i];
    it(`consolidateChanges #${i} -- ${test.testName}`, () => {
      const result = consolidateChanges(test.changes, test.prefixPath);
      expect(result).to.deep.equal(test.consolidated);
    });
  }
});

describe("ChangeCollector tests", () => {
  it("ChangeCollector basic", () => {
    const coll = new ChangeCollector();
    expect(coll.hasChange).to.equal(false);
    expect(coll.hasRollbackChange).to.equal(false);
    expect(coll.change).to.deep.equal({});
    expect(coll.rollbackChange).to.deep.equal({});

    coll.addChange("=", 1);
    expect(coll.change).to.deep.equal({ f: "=", a: [1] });

    coll.addChange("+", 2, 3);
    expect(coll.change).to.deep.equal({
      c: [
        { f: "=", a: [1] },
        { f: "+", a: [2, 3] },
      ],
    });

    coll.addRollbackChange("+", 2);
    expect(coll.rollbackChange).to.deep.equal({ f: "+", a: [2] });

    coll.addRollbackChange(".", 3, 4);
    expect(coll.rollbackChange).to.deep.equal({
      c: [
        { f: ".", a: [3, 4] },
        { f: "+", a: [2] },
      ],
    });
  });

  it("ChangeCollector sub", () => {
    const coll = new ChangeCollector();
    const sub1 = coll.subCollector("item");
    expect(coll.change).to.deep.equal({});
    sub1.addChange("=", 1);
    expect(coll.change).to.deep.equal({ p: ["item"], f: "=", a: [1] });
    sub1.addChange("+", 2);
    expect(coll.change).to.deep.equal({
      p: ["item"],
      c: [
        { f: "=", a: [1] },
        { f: "+", a: [2] },
      ],
    });
    const sub2 = coll.subCollector("item");
    sub2.addChange("+", 5);
    expect(coll.change).to.deep.equal({
      p: ["item"],
      c: [
        { f: "=", a: [1] },
        { f: "+", a: [2] },
        { f: "+", a: [5] },
      ],
    });
    const sub3 = coll.subCollector("sub");
    sub3.addChange("-", 6);
    expect(coll.change).to.deep.equal({
      c: [
        {
          p: ["item"],
          c: [
            { f: "=", a: [1] },
            { f: "+", a: [2] },
            { f: "+", a: [5] },
          ],
        },
        { p: ["sub"], f: "-", a: [6] },
      ],
    });
  });

  it("ChangeCollector sub rollback", () => {
    const coll = new ChangeCollector();
    const sub1 = coll.subCollector("item");
    expect(coll.rollbackChange).to.deep.equal({});
    sub1.addRollbackChange("=", 1);
    expect(coll.rollbackChange).to.deep.equal({ p: ["item"], f: "=", a: [1] });
    sub1.addRollbackChange("+", 2);
    expect(coll.rollbackChange).to.deep.equal({
      p: ["item"],
      c: [
        { f: "+", a: [2] },
        { f: "=", a: [1] },
      ],
    });
    const sub2 = coll.subCollector("item");
    sub2.addRollbackChange("+", 5);
    expect(coll.rollbackChange).to.deep.equal({
      p: ["item"],
      c: [
        { f: "+", a: [5] },
        { f: "+", a: [2] },
        { f: "=", a: [1] },
      ],
    });
    const sub3 = coll.subCollector("sub");
    sub3.addRollbackChange("-", 6);
    expect(coll.rollbackChange).to.deep.equal({
      c: [
        { p: ["sub"], f: "-", a: [6] },
        {
          p: ["item"],
          c: [
            { f: "+", a: [5] },
            { f: "+", a: [2] },
            { f: "=", a: [1] },
          ],
        },
      ],
    });
  });

  it("ChangeCollector concat", () => {
    const coll1 = new ChangeCollector();
    const coll2 = new ChangeCollector();
    const coll3 = coll1.concat(coll2);
    expect(coll3.change).to.deep.equal({});
    expect(coll3.rollbackChange).to.deep.equal({});
    coll1.addChange("+", 1);
    coll1.addRollbackChange("+", 2);
    coll2.addChange("-", 3);
    coll2.addRollbackChange("-", 4);
    const coll4 = coll1.concat(coll2);
    expect(coll4.change).to.deep.equal({
      c: [
        { f: "+", a: [1] },
        { f: "-", a: [3] },
      ],
    });
    expect(coll4.rollbackChange).to.deep.equal({
      c: [
        { f: "-", a: [4] },
        { f: "+", a: [2] },
      ],
    });
    const coll5 = new ChangeCollector();
    coll5.addChange(":", 5);
    coll5.addRollbackChange(":", 6);
    const coll6 = coll1.concat(coll2, coll5);
    expect(coll6.change).to.deep.equal({
      c: [
        { f: "+", a: [1] },
        { f: "-", a: [3] },
        { f: ":", a: [5] },
      ],
    });
    expect(coll6.rollbackChange).to.deep.equal({
      c: [
        { f: ":", a: [6] },
        { f: "-", a: [4] },
        { f: "+", a: [2] },
      ],
    });
  });
});

function copyObject(obj) {
  return JSON.parse(JSON.stringify(obj));
}
