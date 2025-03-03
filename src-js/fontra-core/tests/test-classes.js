import { expect } from "chai";

import { getClassSchema } from "@fontra/core/classes.js";

const [nodeMajor, nodeMinor, nodePatch] = process.versions.node.split(".").map(Number);

if (nodeMajor < 20) {
  throw new Error("This test requires Node.js 20 or later");
}

import coreClasses from "@fontra/core/classes.json" with { type: "json" };
import { enumerate, range } from "@fontra/core/utils.js";
import { Layer, StaticGlyph, VariableGlyph } from "@fontra/core/var-glyph.js";
import { VarPackedPath } from "@fontra/core/var-path.js";
import { readRepoPathAsJSON } from "./test-support.js";

describe("schema tests", () => {
  const testPaths = [
    [["unitsPerEm", "int"]],
    [
      ["glyphs", "dict<VariableGlyph>"],
      ["<anything>", "VariableGlyph"],
      ["sources", "list<GlyphSource>"],
      [999, "GlyphSource"],
      ["location", "dict<float>"],
      ["<anything>", "float"],
    ],
    [
      ["glyphs", "dict<VariableGlyph>"],
      ["<anything>", "VariableGlyph"],
      ["layers", "dict<Layer>"],
      [999, "Layer"],
      ["glyph", "StaticGlyph"],
      ["path", "PackedPath"],
      ["pointTypes", "list<PointType>"],
      [999, "PointType"],
    ],
    [
      ["glyphs", "dict<VariableGlyph>"],
      ["<anything>", "VariableGlyph"],
      ["layers", "dict<Layer>"],
      [999, "Layer"],
      ["glyph", "StaticGlyph"],
      ["components", "list<Component>"],
      [999, "Component"],
      ["location", "dict<float>"],
      ["<anything>", "float"],
    ],
    [["nonExistingProperty", null]],
  ];

  for (const [testIndex, testPath] of enumerate(testPaths)) {
    it(`test path ${testIndex}`, async () => {
      const schema = await getClassSchema(coreClasses);
      let subjectType = schema["Font"]; // Root
      expect(subjectType.className).to.equal("Font");
      expect(subjectType.compositeName).to.equal("Font");
      for (const [pathElement, expectedName] of testPath) {
        if (expectedName) {
          subjectType = subjectType.getSubType(pathElement);
          expect(subjectType.compositeName).to.equal(expectedName);
        } else {
          expect(() => {
            subjectType.getSubType(pathElement);
          }).to.throw("Unknown subType nonExistingProperty of Font");
        }
      }
    });
  }

  const castTestCases = [
    { rootClass: "Font", path: ["unitsPerEm"], inValue: 123, outValue: 123 },
    {
      rootClass: "Font",
      path: ["glyphs", "A"],
      inValue: { name: "A", sources: [], layers: {} },
      outValue: VariableGlyph.fromObject({ name: "A", sources: [], layers: {} }),
    },
    {
      rootClass: "Font",
      path: ["glyphs"],
      inValue: { A: { name: "A", axes: [], sources: [], layers: {} } },
      outValue: {
        A: VariableGlyph.fromObject({ name: "A", axes: [], sources: [], layers: {} }),
      },
    },
    {
      rootClass: "StaticGlyph",
      path: [],
      inValue: { xAdvance: 500 },
      outValue: StaticGlyph.fromObject({
        xAdvance: 500,
        path: { coordinates: [], pointTypes: [], contourInfo: [] },
      }),
    },
    {
      rootClass: "StaticGlyph",
      path: ["path"],
      inValue: {
        coordinates: [],
        pointTypes: [],
        contourInfo: [],
      },
      outValue: VarPackedPath.fromObject({
        coordinates: [],
        pointTypes: [],
        contourInfo: [],
      }),
    },
    {
      rootClass: "VariableGlyph",
      path: ["layers"],
      inValue: { default: { glyph: {} } },
      outValue: { default: Layer.fromObject({ glyph: {} }) },
    },
  ];

  for (const [testIndex, testCase] of enumerate(castTestCases)) {
    it(`cast test ${testIndex}`, async () => {
      const schema = await getClassSchema(coreClasses);
      let subjectType = schema[testCase.rootClass]; // Root
      for (const pathElement of testCase.path) {
        subjectType = subjectType.getSubType(pathElement);
      }
      const castValue = subjectType.cast(testCase.inValue);
      expect(castValue.constructor).to.equal(testCase.outValue.constructor);
      expect(castValue).to.deep.equal(testCase.outValue);
      if (Array.isArray(testCase.outValue)) {
        expect(testCase.outValue.length).to.equal(castValue.length);
        for (const i of range(castValue.length)) {
          const castItem = castValue[i];
          const outItem = testCase.outValue[i];
          expect(castItem.constructor).to.equal(outItem.constructor);
          expect(castItem).to.deep.equal(outItem);
        }
      } else if (testCase.outValue.constructor === Object) {
        for (const [k, outItem] of Object.entries(testCase.outValue)) {
          const castItem = castValue[k];
          expect(castItem.constructor).to.equal(outItem.constructor);
          expect(castItem).to.deep.equal(outItem);
        }
      }
    });
  }
});
