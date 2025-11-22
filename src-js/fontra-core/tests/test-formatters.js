import {
  ArrayFormatter,
  BooleanFormatter,
  DateTimeFormatter,
  FixedLengthArrayFormatter,
  IntegerFormatter,
  IntegerFormatterMinMax,
  UnsignedIntegerFormatter,
  UnsignedNumberFormatter,
} from "@fontra/core/formatters.ts";
import { expect } from "chai";

import { getTestData, parametrize } from "./test-support.js";

// This is in preparation for NumberFormatter
// describe("NumberFormatter", () => {
//   parametrize(
//     "NumberFormatter tests",
//     [
//       ["1", 1],
//       ["11234", 11234],
//       ["0", 0],
//       ["-200", -200],
//       ["asdfg200", undefined],
//       ["", undefined],
//       ["test", undefined],
//       [undefined, undefined],
//       [true, undefined],
//       [false, undefined],
//       [null, undefined],
//       [200, undefined],
//       [0, undefined],
//     ],
//     (testData) => {
//       const [input, expectedResult] = testData;
//       expect(NumberFormatter.fromString(input).value).to.equal(expectedResult);
//     }
//   );
// });

describe("IntegerFormatter", () => {
  parametrize(
    "IntegerFormatter tests",
    [
      ["1", { value: 1 }],
      ["11234", { value: 11234 }],
      ["0", { value: 0 }],
      ["-200", { value: -200 }],
      ["asdfg200", { error: "not an integer" }],
      ["", { error: "not an integer" }],
      ["test", { error: "not an integer" }],
      ["0.152", { error: "not an integer" }],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(IntegerFormatter.fromString(input)).to.deep.equal(expectedResult);
    }
  );
});

describe("FixedLengthArrayFormatter", () => {
  parametrize(
    "FixedLengthArrayFormatter toString tests",
    [
      [[1, 9], "5", { value: 5 }], // eg. usWidthClass
      [[1, 1000], "400", { value: 400 }], // eg. usWeightClass
      [[1, 9], "12", { error: "not between 1 and 9" }],
      [[1, 1000], "1111", { error: "not between 1 and 1000" }],
    ],
    (testData) => {
      const [minMaxValues, input, expectedResult] = testData;
      expect(
        IntegerFormatterMinMax(minMaxValues[0], minMaxValues[1]).fromString(input)
      ).to.deep.equal(expectedResult);
    }
  );
});

describe("UnsignedIntegerFormatter", () => {
  parametrize(
    "UnsignedIntegerFormatter tests",
    [
      ["-0.152", { error: "not an integer" }],
      ["-12", { error: "not a positive integer" }],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(UnsignedIntegerFormatter.fromString(input)).to.deep.equal(expectedResult);
    }
  );
});

describe("UnsignedNumberFormatter", () => {
  parametrize(
    "UnsignedNumberFormatter tests",
    [
      ["-0.152", { error: "not a positive number" }],
      ["-12", { error: "not a positive number" }],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(UnsignedNumberFormatter.fromString(input)).to.deep.equal(expectedResult);
    }
  );
});

describe("ArrayFormatter", () => {
  parametrize(
    "ArrayFormatter fromString tests",
    [
      ["1,2,3,4", { value: [1, 2, 3, 4] }],
      ["1, 2,3,4", { value: [1, 2, 3, 4] }],
      ["", { value: [] }],
      ["Hello", { error: "not an array" }],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(ArrayFormatter.fromString(input)).to.deep.equal(expectedResult);
    }
  );
});

describe("ArrayFormatter", () => {
  parametrize(
    "ArrayFormatter toString tests",
    [
      [[1, 2, 3, 4], "1,2,3,4"],
      [[], ""],
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
      [10, "1,2,3,4,5,6,7,8,9,10", { value: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }],
      [10, "1,2,3,4,5,6,7,8,9", { error: "array length must be 10" }],
      [2, "8,0", { value: [8, 0] }],
    ],
    (testData) => {
      const [arrayLength, input, expectedResult] = testData;
      expect(FixedLengthArrayFormatter(arrayLength).fromString(input)).to.deep.equal(
        expectedResult
      );
    }
  );
});

describe("FixedLengthArrayFormatter", () => {
  parametrize(
    "FixedLengthArrayFormatter toString tests",
    [
      [10, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "1,2,3,4,5,6,7,8,9,10"],
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
      ["false", { value: false }],
      ["true", { value: true }],
      ["False", { value: false }],
      ["True", { value: true }],
      ["FALSE", { value: false }],
      ["TRUE", { value: true }],
      ["", { error: "not a boolean" }],
      ["Hello", { error: "not a boolean" }],
      ["   false    ", { value: false }],
      ["   true    ", { value: true }],
      ["0", { error: "not a boolean" }],
      ["1", { error: "not a boolean" }],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(BooleanFormatter.fromString(input)).to.deep.equal(expectedResult);
    }
  );
});

describe("DateTimeFormatter", () => {
  parametrize(
    "DateTimeFormatter fromString tests",
    [
      ["2025/03/19", { error: "not a valid date-time format (YYYY/MM/DD HH:MM:SS)" }],
      ["2025/03/19 09:29:53", { value: "2025/03/19 09:29:53" }],
      [
        "25/03/19 09:29:53",
        { error: "not a valid date-time format (YYYY/MM/DD HH:MM:SS)" },
      ],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(DateTimeFormatter.fromString(input)).to.deep.equal(expectedResult);
    }
  );
});
