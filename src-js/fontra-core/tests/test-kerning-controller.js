import { KerningController } from "@fontra/core/kerning-controller.js";
import { expect } from "chai";
import { parametrize } from "./test-support.js";

describe("KerningController Tests", () => {
  const testFontController = {
    fontAxesSourceSpace: [
      { name: "Weight", minValue: 400, defaultValue: 400, maxValue: 800 },
      { name: "Width", minValue: 100, defaultValue: 100, maxValue: 200 },
    ],
    sources: {
      a: { location: { Weight: 400 } },
      b: { location: { Weight: 600 } },
      c: { location: { Weight: 800 } },
      d: { location: { Weight: 400, Width: 200 } },
      e: { location: { Weight: 600, Width: 200 } },
      f: { location: { Weight: 800, Width: 200 } },
    },
  };

  const testKernData = {
    groups: { "left.O": ["O", "D", "Q"], "right.O": ["O", "C", "G", "Q"] },
    sourceIdentifiers: ["a", "b", "c", "d", "e", "f"],
    values: {
      "T": { A: [-100, null, null, -200, null, null] },
      "left.O": {
        "right.O": [10, null, null, null, null, null],
        "Q": [20, null, 40, null, null, null],
      },
      "Q": { Q: [1, null, null, null, null, null] },
    },
  };

  const testCasesBasic = [
    { leftGlyph: "T", rightGlyph: "A", expectedValue: -100, location: {} },
    { leftGlyph: "T", rightGlyph: "A", expectedValue: -150, location: { Width: 150 } },
    { leftGlyph: "T", rightGlyph: "A", expectedValue: -200, location: { Width: 200 } },
    { leftGlyph: "O", rightGlyph: "O", expectedValue: 10, location: {} },
    { leftGlyph: "D", rightGlyph: "G", expectedValue: 10, location: {} },
    { leftGlyph: "O", rightGlyph: "Q", expectedValue: 20, location: {} },
    { leftGlyph: "O", rightGlyph: "Q", expectedValue: 10, location: { Weight: 500 } },
    { leftGlyph: "O", rightGlyph: "Q", expectedValue: 0, location: { Weight: 600 } },
    { leftGlyph: "Q", rightGlyph: "Q", expectedValue: 1, location: {} },
  ];

  parametrize("KerningController basic test", testCasesBasic, (testCase) => {
    const controller = new KerningController("kern", testKernData, testFontController);
    const instance = controller.instantiate(testCase.location);
    expect(
      instance.getGlyphPairValue(testCase.leftGlyph, testCase.rightGlyph)
    ).to.equal(testCase.expectedValue);
  });

  it("Kerning edit tests", async () => {
    const fontController = copyObject(testFontController);

    // Mock edit methods
    fontController.editIncremental = () => {};
    fontController.editFinal = () => {};

    const controller = new KerningController("kern", testKernData, fontController);
    const editContext = controller.getEditContext([
      { sourceIdentifier: "a", leftName: "v", rightName: "q" },
    ]);
    const newValues = [[0], [1], [2], [300]];
    const changes = await editContext.edit(newValues[Symbol.iterator]());
    // console.log("ch", JSON.stringify(changes.change, null, 2));
    // console.log("rb", JSON.stringify(changes.rollbackChange, null, 2));
  });
});

function copyObject(obj) {
  return JSON.parse(JSON.stringify(obj));
}
