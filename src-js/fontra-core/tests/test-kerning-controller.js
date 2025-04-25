import { applyChange } from "@fontra/core/changes.js";
import { FontSourcesInstancer } from "@fontra/core/font-sources-instancer.js";
import { KerningController } from "@fontra/core/kerning-controller.js";
import { expect } from "chai";
import { parametrize } from "./test-support.js";

describe("KerningController Tests", () => {
  const testFontController = {
    // Mock edit methods
    editIncremental: () => {},
    editFinal: () => {},

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

  testFontController.fontSourcesInstancer = new FontSourcesInstancer(
    testFontController.fontAxesSourceSpace,
    testFontController.sources
  );

  const testKerning = {
    kern: {
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
    { leftGlyph: "O", rightGlyph: "Q", expectedValue: null, location: { Weight: 600 } },
    { leftGlyph: "Q", rightGlyph: "Q", expectedValue: 1, location: {} },
  ];

  parametrize("KerningController basic test", testCasesBasic, (testCase) => {
    const controller = new KerningController("kern", testKerning, testFontController);
    const instance = controller.instantiate(testCase.location);
    expect(
      instance.getGlyphPairValue(testCase.leftGlyph, testCase.rightGlyph)
    ).to.equal(testCase.expectedValue);
  });

  const testCasesEditing = [
    {
      pairSelectors: [{ sourceIdentifier: "a", leftName: "v", rightName: "q" }],
      newValues: [300],
      valueChecks: [
        { leftGlyph: "v", rightGlyph: "q", expectedValue: 300, location: {} },
        {
          leftGlyph: "v",
          rightGlyph: "q",
          expectedValue: 150,
          location: { Weight: 500 },
        },
      ],
    },
    {
      pairSelectors: [{ sourceIdentifier: "a", leftName: "T", rightName: "A" }],
      newValues: [300],
      valueChecks: [
        { leftGlyph: "T", rightGlyph: "A", expectedValue: 300, location: {} },
        {
          leftGlyph: "T",
          rightGlyph: "A",
          expectedValue: 150,
          location: { Weight: 500 },
        },
      ],
    },
    {
      pairSelectors: [
        { sourceIdentifier: "a", leftName: "T", rightName: "A" },
        { sourceIdentifier: "b", leftName: "T", rightName: "A" },
      ],
      newValues: [300, 400],
      valueChecks: [
        { leftGlyph: "T", rightGlyph: "A", expectedValue: 300, location: {} },
        {
          leftGlyph: "T",
          rightGlyph: "A",
          expectedValue: 350,
          location: { Weight: 500 },
        },
      ],
    },
    {
      doDelete: true,
      pairSelectors: [{ sourceIdentifier: "a", leftName: "T", rightName: "A" }],
      newValues: [300],
      valueChecks: [
        { leftGlyph: "T", rightGlyph: "A", expectedValue: null, location: {} },
        {
          leftGlyph: "T",
          rightGlyph: "A",
          expectedValue: null,
          location: { Weight: 500 },
        },
      ],
    },
  ];

  parametrize("KerningController editing test", testCasesEditing, async (testCase) => {
    const testFont = { kerning: testKerning };

    const editedFont = copyObject(testFont);

    const controller = new KerningController(
      "kern",
      editedFont.kerning,
      testFontController
    );
    const editContext = controller.getEditContext(testCase.pairSelectors);
    let changes;
    if (testCase.doDelete) {
      changes = await editContext.delete();
    } else {
      changes = await editContext.edit(testCase.newValues);
    }

    expect(editedFont).to.not.deep.equal(testFont);

    for (const valueCheck of testCase.valueChecks) {
      const instance = controller.instantiate(valueCheck.location);
      expect(
        instance.getGlyphPairValue(valueCheck.leftGlyph, valueCheck.rightGlyph)
      ).to.equal(valueCheck.expectedValue);
    }

    // Check rollback changes
    const revertedFont = copyObject(editedFont);
    applyChange(revertedFont, changes.rollbackChange);
    expect(revertedFont).to.not.deep.equal(editedFont);
    expect(revertedFont).to.deep.equal(testFont);

    // Check forward changes
    const newlyEditedFont = copyObject(testFont);
    applyChange(newlyEditedFont, changes.change);
    expect(newlyEditedFont).to.deep.equal(editedFont);
    expect(newlyEditedFont).to.not.deep.equal(testFont);
  });

  it("KerningController empty kerning data", async () => {
    const pairSelectors = [
      {
        sourceIdentifier: "a",
        leftName: "T",
        rightName: "A",
      },
      {
        sourceIdentifier: "b",
        leftName: "T",
        rightName: "A",
      },
    ];
    const testFont = { kerning: {} };

    const editedFont = copyObject(testFont);

    const controller = new KerningController(
      "kern",
      editedFont.kerning,
      testFontController
    );
    const editContext = controller.getEditContext(pairSelectors);

    const changes = await editContext.edit([100, 200]);

    {
      const instance = controller.instantiate({});
      const value = instance.getGlyphPairValue("T", "A");
      expect(value).to.equal(100);
    }

    {
      const instance = controller.instantiate({ Weight: 500 });
      const value = instance.getGlyphPairValue("T", "A");
      expect(value).to.equal(150);
    }
  });
});

function copyObject(obj) {
  return JSON.parse(JSON.stringify(obj));
}
