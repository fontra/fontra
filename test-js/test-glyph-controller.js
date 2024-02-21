import { expect } from "chai";

import { StaticGlyphController } from "../src/fontra/client/core/glyph-controller.js";
import { StaticGlyph, VariableGlyph } from "../src/fontra/client/core/var-glyph.js";
import { VarPackedPath } from "../src/fontra/client/core/var-path.js";

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
        inactive: false,
      },
    ],
    layers: {
      default: {
        glyph: {
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
        },
        customData: {},
      },
    },
    customData: {},
  };
}

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

describe("glyph-controller Tests", () => {
  it("get StaticGlyphController name", () => {
    const sgObj = makeTestStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );
    expect(staticGlyphController.name).to.deep.equal("dummy");
  });

  it("get StaticGlyphController xAdvance", () => {
    const sgObj = makeTestStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );
    expect(staticGlyphController.xAdvance).to.deep.equal(170);
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
    expect(staticGlyphController.leftMargin).to.deep.equal(60);
  });

  it("get StaticGlyphController rightMargin", () => {
    const sgObj = makeTestStaticGlyphObject();
    const staticGlyph = StaticGlyph.fromObject(sgObj);
    const staticGlyphController = new StaticGlyphController(
      "dummy",
      staticGlyph,
      undefined
    );
    expect(staticGlyphController.rightMargin).to.deep.equal(60);
  });

  /*
  it("modify StaticGlyph leftMargin check xAdvance", () => {
    const glyph = StaticGlyph.fromObject(sparseObject);
    glyph.leftMargin = 70;
    expect(glyph.xAdvance).to.deep.equal(180);
  });

  it("modify StaticGlyph leftMargin check leftMargin", () => {
    const glyph = StaticGlyph.fromObject(sparseObject);
    glyph.leftMargin = 70;
    expect(glyph.leftMargin).to.deep.equal(70);
  });

  it("modify StaticGlyph leftMargin check coordinates", () => {
    const glyph = StaticGlyph.fromObject(sparseObject);
    glyph.leftMargin = 70;
    expect(glyph.path.coordinates).to.deep.equal([70, 0, 120, 0, 120, 120, 70, 120]);
  });

  it("modify StaticGlyph leftMargin check components translateX", () => {
    const glyph = StaticGlyph.fromObject(sparseObject);
    glyph.leftMargin = 70;
    expect(glyph.components[0].transformation.translateX).to.deep.equal(10);
  });

  it("modify StaticGlyph rightMargin check xAdvance", () => {
    const glyph = StaticGlyph.fromObject(sparseObject);
    glyph.rightMargin = 70;
    expect(glyph.xAdvance).to.deep.equal(180);
  });

  it("modify StaticGlyph rightMargin check rightMargin", () => {
    const glyph = StaticGlyph.fromObject(sparseObject);
    glyph.rightMargin = 70;
    expect(glyph.rightMargin).to.deep.equal(70);
  });

  it("modify StaticGlyph rightMargin check coordinates", () => {
    const glyph = StaticGlyph.fromObject(sparseObject);
    glyph.rightMargin = 70;
    expect(glyph.path.coordinates).to.deep.equal([60, 0, 110, 0, 110, 120, 60, 120]);
  });

  it("modify StaticGlyph rightMargin check components translateX", () => {
    const glyph = StaticGlyph.fromObject(sparseObject);
    glyph.rightMargin = 70;
    expect(glyph.components[0].transformation.translateX).to.deep.equal(0);
  });

  */
});

function copyObject(obj) {
  return JSON.parse(JSON.stringify(obj));
}
