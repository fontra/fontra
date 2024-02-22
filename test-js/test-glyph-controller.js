import { expect } from "chai";

import { StaticGlyphController } from "../src/fontra/client/core/glyph-controller.js";
import { range } from "../src/fontra/client/core/utils.js";
import { StaticGlyph, VariableGlyph } from "../src/fontra/client/core/var-glyph.js";
import { VarPackedPath } from "../src/fontra/client/core/var-path.js";

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
        transformation: {
          translateX: 0,
          translateY: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          skewX: 0,
          skewY: 0,
          tCenterX: 0,
          tCenterY: 0,
        },
      },
    ],
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
