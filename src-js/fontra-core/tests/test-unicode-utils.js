import { expect, use } from "chai";
import chaiAlmost from "chai-almost";
use(chaiAlmost());

import { unicodeMadeOf, unicodeUsedBy } from "@fontra/core/unicode-utils.js";

import { parametrize } from "./test-support.js";

describe("unicode-utils tests", () => {
  const usedByTestCases = [
    { input: "#", output: ["\uFE5F", "\uFF03"] },
    { input: "Ä", output: [] },
    { input: "$", output: ["\ufe69", "\uff04"] },
  ];

  parametrize("unicodeUsedBy tests", usedByTestCases, (testData) => {
    const testChar = testData.input.codePointAt(0);
    const result = unicodeUsedBy(testChar).map((codePoint) =>
      String.fromCodePoint(codePoint)
    );
    expect(result).to.deep.equal(testData.output);
  });

  const madeOfTestCases = [
    { input: "A", output: [] },
    { input: "Ä", output: ["A", "\u0308"] },
    { input: "\ufe69", output: ["$"] },
  ];

  parametrize("unicodeMadeOf tests", madeOfTestCases, (testData) => {
    const testChar = testData.input.codePointAt(0);
    const result = unicodeMadeOf(testChar).map((codePoint) =>
      String.fromCodePoint(codePoint)
    );
    expect(result).to.deep.equal(testData.output);
  });
});
