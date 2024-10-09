import { expect } from "chai";

import { getDecomposedIdentity } from "../src/fontra/client/core/transform.js";
import { enumerate } from "../src/fontra/client/core/utils.js";
import { StaticGlyph, VariableGlyph } from "../src/fontra/client/core/var-glyph.js";

function makeTestGlyphObject() {
  return {
    name: "a",
    axes: [],
    sources: [
      {
        name: "default",
        layerName: "default",
        location: {},
        customData: {},
        locationBase: undefined,
        inactive: false,
      },
    ],
    layers: {
      default: {
        glyph: {
          xAdvance: 500,
          yAdvance: 1000,
          verticalOrigin: 800,
          path: {
            contourInfo: [],
            coordinates: [],
            pointTypes: [],
            pointAttributes: null,
          },
          components: [
            {
              name: "test",
              location: { a: 0.5 },
              transformation: getDecomposedIdentity(),
            },
          ],
          anchors: [],
          guidelines: [],
          image: undefined,
        },
        customData: {},
      },
    },
    customData: {},
  };
}

describe("var-glyph Tests", () => {
  it("new VariableGlyph", () => {
    const vgObj = makeTestGlyphObject();
    const vg = VariableGlyph.fromObject(vgObj);
    expect(vg).to.deep.equal(vgObj);
  });

  it("new densify StaticGlyph", () => {
    const sparseObject = {
      xAdvance: 500,
      components: [
        {
          name: "test",
        },
      ],
    };
    const denseObject = {
      components: [
        {
          name: "test",
          transformation: getDecomposedIdentity(),
          location: {},
        },
      ],
      path: {
        contourInfo: [],
        coordinates: [],
        pointTypes: [],
        pointAttributes: null,
      },
      verticalOrigin: undefined,
      xAdvance: 500,
      yAdvance: undefined,
      anchors: [],
      guidelines: [],
      image: undefined,
    };
    const glyph = StaticGlyph.fromObject(sparseObject);
    expect(glyph).to.deep.equal(denseObject);
  });

  const modifierFuncs = [
    (vg) => vg.axes.push({ name: "wght" }),
    (vg) => (vg.axes = [{ name: "wght" }]),
    (vg) => (vg.sources[0].location.x = 123),
    (vg) => (vg.layers["default"].glyph.xAdvance = 501),
    (vg) => vg.layers["default"].glyph.path.pointTypes.push(0),
    (vg) => (vg.layers["default"].glyph.path.pointTypes = [0]),
    (vg) => vg.layers["default"].glyph.path.coordinates.push(0, 0),
    (vg) => (vg.layers["default"].glyph.path.coordinates = [0, 0]),
    (vg) => vg.layers["default"].glyph.path.contourInfo.push({}),
    (vg) => (vg.layers["default"].glyph.path.contourInfo = [{}]),
    (vg) => (vg.layers["default"].glyph.components[0].name = "test2"),
    (vg) => (vg.layers["default"].glyph.components[0].location.x = 2),
    (vg) => (vg.layers["default"].glyph.components[0].transformation.translateX = 2),
  ];

  for (const [i, m] of enumerate(modifierFuncs)) {
    it(`modify VariableGlyph ${i}`, () => {
      const vgObj = makeTestGlyphObject();
      const vg = VariableGlyph.fromObject(vgObj);
      m(vg);
      expect(vg).to.not.deep.equal(vgObj);
    });
  }

  for (const [i, m] of enumerate(modifierFuncs)) {
    it(`copy + modify VariableGlyph ${i}`, () => {
      const vgObj = makeTestGlyphObject();
      const vg = VariableGlyph.fromObject(vgObj);
      const vg2 = vg.copy();
      m(vg2);
      expect(vg2).to.not.deep.equal(vg);
    });
  }
});

function copyObject(obj) {
  return JSON.parse(JSON.stringify(obj));
}
