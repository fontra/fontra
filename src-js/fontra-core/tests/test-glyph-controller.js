import { expect } from "chai";

import { StaticGlyphController } from "@fontra/core/glyph-controller.js";
import { getDecomposedIdentity } from "@fontra/core/transform.js";
import { range } from "@fontra/core/utils.js";
import { StaticGlyph, VariableGlyph } from "@fontra/core/var-glyph.js";
import { VarPackedPath } from "@fontra/core/var-path.js";
import { parametrize } from "./test-support.js";

function makeTestStaticGlyphObject() {
  return {
    xAdvance: 170,
    path: {
      contourInfo: [{ endPoint: 3, isClosed: true }],
      coordinates: [60, 0, 110, 0, 110, 120, 60, 120],
      pointTypes: [0, 0, 0, 0],
    },
    components: [
      {
        name: "test",
        location: { a: 0.5 },
        transformation: getDecomposedIdentity(),
      },
    ],
    anchors: [
      { name: "top", x: 100, y: 100 },
      { name: "bottom", x: 100, y: 0 },
    ],
    guidelines: [
      { name: "top", x: 100, y: 100, angle: 0 },
      { name: "center", x: 100, y: 0, angle: 90 },
    ],
  };
}

function makeTestEmptyStaticGlyphObject() {
  return {
    xAdvance: 170,
  };
}

function changeStaticGlyphLeftMargin(layerGlyph, layerGlyphController, value) {
  const translationX = value - layerGlyphController.leftMargin;
  for (const i of range(0, layerGlyph.path.coordinates.length, 2)) {
    layerGlyph.path.coordinates[i] += translationX;
  }
  for (const compo of layerGlyph.components) {
    compo.transformation.translateX += translationX;
  }
  layerGlyph.xAdvance += translationX;
}

describe("glyph-controller Tests", () => {
  it("get StaticGlyphController name", () => {
    const sgObj = makeTestStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );
    expect(staticGlyphController.name).to.equal("dummy");
  });

  it("get StaticGlyphController xAdvance", () => {
    const sgObj = makeTestStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );
    expect(staticGlyphController.xAdvance).to.equal(170);
  });

  it("get empty StaticGlyphController xAdvance, leftMargin and rightMargin", () => {
    const sgObj = makeTestEmptyStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );
    expect(staticGlyphController.xAdvance).to.equal(170);
    expect(staticGlyphController.leftMargin).to.equal(undefined);
    expect(staticGlyphController.rightMargin).to.equal(undefined);
  });

  it("get StaticGlyphController path", () => {
    const sgObj = makeTestStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );
    const expectedPath = new VarPackedPath(
      [60, 0, 110, 0, 110, 120, 60, 120],
      [0, 0, 0, 0],
      [{ endPoint: 3, isClosed: true }]
    );
    expect(staticGlyphController.path).to.deep.equal(expectedPath);
  });

  it("get StaticGlyphController anchors", () => {
    const sgObj = makeTestStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );
    const expectedAnchors = [
      { name: "top", x: 100, y: 100 },
      { name: "bottom", x: 100, y: 0 },
    ];
    expect(staticGlyphController.anchors).to.deep.equal(expectedAnchors);
  });

  it("get StaticGlyphController anchors", () => {
    const sgObj = makeTestEmptyStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );
    const expectedAnchors = [];
    expect(staticGlyphController.anchors).to.deep.equal(expectedAnchors);
  });

  it("get StaticGlyphController guidelines", () => {
    const sgObj = makeTestStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );
    const expectedGuidelines = [
      { name: "top", x: 100, y: 100, angle: 0, locked: false },
      { name: "center", x: 100, y: 0, angle: 90, locked: false },
    ];
    expect(staticGlyphController.guidelines).to.deep.equal(expectedGuidelines);
  });

  it("get StaticGlyphController bounds", () => {
    const sgObj = makeTestStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );

    expect(staticGlyphController.bounds).to.deep.equal({
      xMin: 60,
      yMin: 0,
      xMax: 110,
      yMax: 120,
    });
  });

  it("get StaticGlyphController leftMargin", () => {
    const sgObj = makeTestStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );
    expect(staticGlyphController.leftMargin).to.equal(60);
  });

  it("get StaticGlyphController rightMargin", () => {
    const sgObj = makeTestStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );
    expect(staticGlyphController.rightMargin).to.equal(60);
  });

  it("modify leftMargin check leftMargin", () => {
    const sgObj = makeTestStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );

    changeStaticGlyphLeftMargin(staticGlyph, staticGlyphController, 70);
    expect(staticGlyph.xAdvance).to.deep.equal(180);
    const staticGlyphController2 = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );
    expect(staticGlyphController2.leftMargin).to.equal(70);
  });

  it("modify StaticGlyphController xAdvance check rightMargin", () => {
    const sgObj = makeTestStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );
    staticGlyph.xAdvance += 10;
    expect(staticGlyphController.rightMargin).to.equal(70);
  });
});

describe("StaticGlyphController getSelectionBounds", () => {
  const sgObj = makeTestStaticGlyphObject();
  const staticGlyph = StaticGlyph.fromObject(sgObj);
  const staticGlyphController = new StaticGlyphController(
    "dummy",
    staticGlyph,
    undefined
  );

  staticGlyphController.components.push({
    bounds: { xMin: 0, yMin: 0, xMax: 100, yMax: 200 },
  });

  parametrize(
    "StaticGlyphController getSelectionBounds",
    [
      [
        ["point/0", "point/1", "point/2", "point/3"],
        { xMin: 60, yMin: 0, xMax: 110, yMax: 120 },
      ],
      [["point/0"], { xMin: 60, yMin: 0, xMax: 60, yMax: 0 }],
      [["point/0", "point/1"], { xMin: 60, yMin: 0, xMax: 110, yMax: 0 }],
      [["component/0"], { xMin: 0, yMin: 0, xMax: 100, yMax: 200 }],
      [
        ["point/0", "point/1", "component/0"],
        { xMin: 0, yMin: 0, xMax: 110, yMax: 200 },
      ],
      [["point/0", "point/1", "anchor/0"], { xMin: 60, yMin: 0, xMax: 110, yMax: 100 }],
      [["point/18"], undefined], // out of bounds
    ],
    (testData) => {
      const [selection, result] = testData;
      expect(
        staticGlyphController.getSelectionBounds(new Set(selection))
      ).to.deep.equal(result);
    }
  );
});
