import { compute, nameCapture } from "@fontra/core/simple-compute.js";
import { expect } from "chai";
import { parametrize } from "./test-support.js";

describe("simple-compute", () => {
  const computeTestData = [
    { expression: 12, expectedException: "compute `expression` argument not a string" },
    { expression: "", expectedException: "Empty expression given" },
    { expression: "a", variables: {}, expectedException: "Undefined name: 'a'" },
    { expression: "12", expectedResult: 12 },
    { expression: "1.2", expectedResult: 1.2 },
    { expression: "1,2", expectedResult: 1.2 },
    { expression: "1,2+4", expectedResult: 5.2 },
    { expression: "-12", expectedResult: -12 },
    { expression: "0 - -12", expectedResult: 12 },
    { expression: "12*3", expectedResult: 36 },
    { expression: "12 * 3", expectedResult: 36 },
    { expression: "2 * (3 + 1)", expectedResult: 8 },
    { expression: "2 * 3 + 1", expectedResult: 7 },
    { expression: "a", variables: { a: 3 }, expectedResult: 3 },
    { expression: "a!", variables: { "a!": 3 }, expectedResult: 3 },
    { expression: "-a", variables: { a: 3 }, expectedResult: -3 },
    { expression: "aa23", variables: { aa23: 4 }, expectedResult: 4 },
    { expression: "a.alt", variables: { "a.alt": 4 }, expectedResult: 4 },
    { expression: "a-b.2", variables: { "a-b.2": 4 }, expectedResult: 4 },
    { expression: "a-2", variables: { a: 4 }, expectedResult: 2 },
    { expression: "a-b", variables: { "a-b": 4 }, expectedResult: 4 },
    { expression: "a-b", variables: { a: 4, b: 1 }, expectedResult: 3 },
    { expression: "a/2", variables: { a: 3 }, expectedResult: 1.5 },
    { expression: "((a))", variables: { a: 3 }, expectedResult: 3 },
    { expression: "(a)", variables: { a: 3 }, expectedResult: 3 },
    { expression: "(a", variables: { a: 3 }, expectedException: "syntax error" },
    {
      expression: "*",
      variables: { a: 3 },
      expectedException: "Unexpected token: MUL",
    },
    {
      expression: "1 *",
      expectedException: "syntax error",
    },
  ];

  parametrize("compute", computeTestData, (testItem) => {
    if (testItem.expectedException) {
      expect(() =>
        compute(testItem.expression, undefined, testItem.variables)
      ).to.throw(testItem.expectedException);
    } else {
      expect(compute(testItem.expression, undefined, testItem.variables)).to.equal(
        testItem.expectedResult
      );
    }
  });

  const nameCaptureTestData = [
    {
      expression: "a",
      variables: { a: 12 },
      expectedResult: 12,
      expectedNames: new Set(["a"]),
    },
    {
      expression: "a",
      variables: {},
      expectedException: "Undefined name: 'a'",
    },
    {
      expression: "a + b",
      variables: { a: 12, b: 1, c: 4, d: 43 },
      expectedResult: 13,
      expectedNames: new Set(["a", "b"]),
    },
    {
      expression: "a + b",
      variables: { a: [1, 2, 3], b: [4, 5, 6] },
      expectedResult: 2,
      expectedNames: new Set(["a", "b"]),
      getter: (namesObject, prop) => 1,
    },
  ];

  parametrize("compute + nameCapture", nameCaptureTestData, (testItem) => {
    const { names, namespace } = nameCapture(testItem.variables, testItem.getter);
    if (testItem.expectedException) {
      expect(() => compute(testItem.expression, undefined, namespace)).to.throw(
        testItem.expectedException
      );
    } else {
      expect(compute(testItem.expression, undefined, namespace)).to.equal(
        testItem.expectedResult
      );
      expect(names).to.deep.equal(testItem.expectedNames);
    }
  });
});
