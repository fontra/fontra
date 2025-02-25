import { expect } from "chai";
import {
  ArrayFormatter,
  BooleanFormatter,
  FixedLengthArrayFormatter,
  _NumberFormatter,
} from "../src/fontra/client/core/formatters.js";

import { getTestData, parametrize } from "./test-support.js";

describe("NumberFormatter", () => {
  parametrize(
    "NumberFormatter tests",
    [
      ["1", 1],
      ["11234", 11234],
      ["0", 0],
      ["-200", -200],
      ["asdfg200", undefined],
      ["", undefined],
      ["test", undefined],
      [undefined, undefined],
      [true, undefined],
      [false, undefined],
      [null, undefined],
      [200, 200],
      [0, 0],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(_NumberFormatter.fromString(input).value).to.equal(expectedResult);
    }
  );
});

describe("ArrayFormatter", () => {
  parametrize(
    "ArrayFormatter fromString tests",
    [
      ["1,2,3,4", [1, 2, 3, 4]],
      ["1, 2,3,4", [1, 2, 3, 4]],
      ["", []],
      ["Hello", undefined],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(ArrayFormatter.fromString(input).value).to.deep.equal(expectedResult);
    }
  );
});

describe("ArrayFormatter", () => {
  parametrize(
    "ArrayFormatter toString tests",
    [
      [[1, 2, 3, 4], "1,2,3,4"],
      [[], ""],
      [true, { error: "not an array" }],
      [new Set([1, 2, 3]), { error: "not an array" }],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(ArrayFormatter.toString(input)).to.deep.equal(expectedResult);
    }
  );
});

describe("FixedLengthArrayFormatter", () => {
  parametrize(
    "FixedLengthArrayFormatter fromString tests",
    [
      [10, "1,2,3,4,5,6,7,8,9,10", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
      [10, "1,2,3,4,5,6,7,8,9", undefined],
      [2, "8,0", [8, 0]],
    ],
    (testData) => {
      const [arrayLength, input, expectedResult] = testData;
      expect(
        FixedLengthArrayFormatter(arrayLength).fromString(input).value
      ).to.deep.equal(expectedResult);
    }
  );
});

describe("FixedLengthArrayFormatter", () => {
  parametrize(
    "FixedLengthArrayFormatter toString tests",
    [
      [10, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "1,2,3,4,5,6,7,8,9,10"],
      [10, [1, 2, 3, 4, 5, 6, 7, 8, 9], { error: "array length must be 10" }],
      [2, [8, 0], "8,0"],
    ],
    (testData) => {
      const [arrayLength, input, expectedResult] = testData;
      expect(FixedLengthArrayFormatter(arrayLength).toString(input)).to.deep.equal(
        expectedResult
      );
    }
  );
});

describe("BooleanFormatter", () => {
  parametrize(
    "BooleanFormatter fromString tests",
    [
      ["false", false],
      ["true", true],
      ["False", false],
      ["True", true],
      ["FALSE", false],
      ["TRUE", true],
      [false, false],
      [true, true],
      ["", undefined],
      ["Hello", undefined],
      ["   false    ", false],
      ["   true    ", true],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(BooleanFormatter.fromString(input).value).to.deep.equal(expectedResult);
    }
  );
});
