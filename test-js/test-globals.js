import VarArray from "../src/fontra/client/core/var-array.js";
import { StaticGlyph, VariableGlyph } from "../src/fontra/client/core/var-glyph.js";
import { VarPackedPath } from "../src/fontra/client/core/var-path.js";

/*
{
    contourInfo: [{ endPoint: 3, isClosed: true }],
    coordinates: [60, 0, 110, 0, 110, 120, 60, 120],
    pointTypes: [0, 0, 0, 0],
  },
*/
function simpleTestPath(isClosed = true) {
  return new VarPackedPath(
    new VarArray(0, 0, 0, 100, 100, 100, 100, 0),
    [
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
      VarPackedPath.ON_CURVE,
    ],
    [{ endPoint: 3, isClosed: isClosed }]
  );
}

const sparseObject = {
  xAdvance: 170,
  path: {
    contourInfo: [{ endPoint: 3, isClosed: true }],
    coordinates: [60, 0, 110, 0, 110, 120, 60, 120],
    pointTypes: [0, 0, 0, 0],
  },
  /*
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
  */
};

export const dummyStaticGlyph = StaticGlyph.fromObject(sparseObject);
