import { expect } from "chai";

import {
  centeredRect,
  equalRect,
  insetRect,
  isEmptyRect,
  normalizeRect,
  offsetRect,
  pointInRect,
  rectAddMargin,
  rectCenter,
  rectFromArray,
  rectFromPoints,
  rectRound,
  rectScaleAroundCenter,
  rectSize,
  rectToArray,
  rectToPoints,
  scaleRect,
  sectRect,
  unionRect,
  updateRect,
} from "@fontra/core/rectangle.js";
import { parametrize } from "./test-support.js";

describe("pointInRect", () => {
  const testData = [
    [
      { x: 0, y: 0 },
      { xMin: -Infinity, yMin: -Infinity, xMax: Infinity, yMax: Infinity },
      true,
      "Rectangle should has not been bound to a limit",
    ],
    [
      { x: 40, y: 40 },
      undefined,
      false,
      "Should return false if rectangle is a falsy value",
    ],
    [{ x: 40, y: 40 }, { xMin: 0, yMin: 0, xMax: 200, yMax: 200 }, true, "Should work"],
    [
      { x: 40.0, y: 40.0 },
      { xMin: 0, yMin: 0, xMax: 200, yMax: 200 },
      true,
      "Should work with floats",
    ],
    [{ x: 220, y: 220 }, { xMin: 0, yMin: 0, xMax: 200, yMax: 200 }, false],
    [{ x: 220, y: -1 }, { xMin: 0, yMin: 0, xMax: 200, yMax: 200 }, false],
    [{ x: -1, y: 200 }, { xMin: 0, yMin: 0, xMax: 200, yMax: 200 }, false],
    [{ x: 0, y: 0 }, { xMin: 0, yMin: 0, xMax: 200, yMax: 200 }, true],
    [{ x: 0, y: 100 }, { xMin: 0, yMin: 0, xMax: 200, yMax: 200 }, true],
    [{ x: 0, y: 200 }, { xMin: 0, yMin: 0, xMax: 200, yMax: 200 }, true],
    [{ x: 0, y: 201 }, { xMin: 0, yMin: 0, xMax: 200, yMax: 200 }, false],
    [{ x: 100, y: 200 }, { xMin: 0, yMin: 0, xMax: 200, yMax: 200 }, true],
    [{ x: 200, y: 200 }, { xMin: 0, yMin: 0, xMax: 200, yMax: 200 }, true],
    [{ x: 0, y: -1 }, { xMin: 0, yMin: 0, xMax: 200, yMax: 200 }, false],
  ];
  parametrize(
    "is point in rectangle",
    testData,
    ([point, rectangle, acceptance, testDescription]) => {
      const result = pointInRect(point.x, point.y, rectangle);
      expect(result).equals(acceptance, testDescription);
    }
  );
});

describe("centeredRect", () => {
  const testData = [
    [
      { x: 100, y: 100 },
      { width: 50, height: 60 },
      {
        xMin: 75,
        xMax: 125,
        yMin: 70,
        yMax: 130,
      },
      "Should create a rectangle centered to a point",
    ],
    [
      { x: 100, y: 100 },
      { width: 50 },
      {
        xMin: 75,
        xMax: 125,
        yMin: 75,
        yMax: 125,
      },
      "Should create a square if an height is not given",
    ],
  ];
  parametrize(
    "Creates a centered rectagle",
    testData,
    ([point, sizes, acceptance, testDescription]) => {
      const result = centeredRect(point.x, point.y, sizes.width, sizes.height);
      expect(result).deep.equals(acceptance, testDescription);
    }
  );
});

describe("normalizeRect", () => {
  const testData = [
    [
      { xMin: 100, yMin: 100, xMax: 0, yMax: 0 },
      { xMin: 0, yMin: 0, xMax: 100, yMax: 100 },
    ],
    [
      { xMin: 100, yMin: 0, xMax: 0, yMax: 100 },
      { xMin: 0, yMin: 0, xMax: 100, yMax: 100 },
    ],
    [
      { xMin: 0, yMin: 100, xMax: 100, yMax: 0 },
      { xMin: 0, yMin: 0, xMax: 100, yMax: 100 },
    ],
    [
      { xMin: 0, yMin: 0, xMax: 100, yMax: 100 },
      { xMin: 0, yMin: 0, xMax: 100, yMax: 100 },
    ],
  ];
  parametrize(
    "Normalizes a rectangle",
    testData,
    ([rectangle, acceptance, testDescription]) => {
      const result = normalizeRect(rectangle);
      expect(result).deep.equals(acceptance, testDescription);
    }
  );
});

describe("sectRect", () => {
  const testData = [
    [
      { xMin: 20, yMin: 30, xMax: 50, yMax: 60 },
      { xMin: 25, yMin: 35, xMax: 40, yMax: 50 },
      { xMin: 25, yMin: 35, xMax: 40, yMax: 50 },
    ],
    [
      { xMin: 50, yMin: 50, xMax: 60, yMax: 60 },
      { xMin: 60, yMin: 60, xMax: 70, yMax: 70 },
      { xMin: 60, yMin: 60, xMax: 60, yMax: 60 },
    ],
    [
      { xMin: 50, yMin: 50, xMax: 60, yMax: 60 },
      { xMin: 61, yMin: 61, xMax: 70, yMax: 70 },
      undefined,
      "Should not create a rectangle if they do not intersect",
    ],
  ];
  parametrize(
    "Creates an intersection by given two rectangles",
    testData,
    ([a, b, acceptance, testDescription]) => {
      const result = sectRect(a, b);
      expect(result).deep.equals(acceptance, testDescription);
    }
  );
});

describe("unionRect", () => {
  const testData = [
    [[], undefined],
    [
      [
        { xMin: 50, yMin: 50, xMax: 100, yMax: 100 },
        { xMin: 100, yMin: 75, xMax: 150, yMax: 100 },
      ],
      {
        xMin: 50,
        xMax: 150,
        yMin: 50,
        yMax: 100,
      },
    ],
  ];
  parametrize(
    "Creates a smallest rectangle that covers all given rectangles",
    testData,
    ([rects, acceptance, testDescription]) => {
      const result = unionRect(...rects);
      expect(result).deep.equals(acceptance, testDescription);
    }
  );
});

describe("offsetRect", () => {
  const testData = [
    [
      { xMin: 50, yMin: 55, xMax: 60, yMax: 65 },
      { x: -10, y: -10 },
      {
        xMin: 40,
        yMin: 45,
        xMax: 50,
        yMax: 55,
      },
    ],
    [
      { xMin: 20, yMin: 10, xMax: 40, yMax: 25 },
      { x: 10, y: 10 },
      {
        xMin: 30,
        yMin: 20,
        xMax: 50,
        yMax: 35,
      },
    ],
  ];
  parametrize(
    "Moves the rectangle by given offset",
    testData,
    ([rectangle, offset, acceptance, testDescription]) => {
      const result = offsetRect(rectangle, offset.x, offset.y);
      expect(result).deep.equals(acceptance, testDescription);
    }
  );
});

describe("scaleRect", () => {
  const testData = [
    [
      { xMin: 10, yMin: 12, xMax: 20, yMax: 25 },
      { x: 2, y: 4 },
      { xMin: 20, yMin: 48, xMax: 40, yMax: 100 },
    ],
    [
      { xMin: 16, yMin: 8, xMax: 32, yMax: 64 },
      { x: 2, y: undefined },
      { xMin: 32, yMin: 16, xMax: 64, yMax: 128 },
    ],
  ];
  parametrize(
    "Scales the given rectangle by multiplier",
    testData,
    ([rectangle, scale, acceptance, testDescription]) => {
      const result = scaleRect(rectangle, scale.x, scale.y);
      expect(result).deep.equals(acceptance, testDescription);
    }
  );
});

describe("insetRect", () => {
  const testData = [
    [
      { xMin: 50, yMin: 50, xMax: 60, yMax: 60 },
      { x: 10, y: 10 },
      {
        xMin: 60,
        yMin: 60,
        xMax: 50,
        yMax: 50,
      },
    ],
  ];
  parametrize(
    "Scales down the rectangle from the center by given offset",
    testData,
    ([rectangle, offset, acceptance, testDescription]) => {
      const result = insetRect(rectangle, offset.x, offset.y);
      expect(result).deep.equals(acceptance, testDescription);
    }
  );
});

describe("equalRect", () => {
  const testData = [
    [
      { xMin: 0, yMin: 0, xMax: 10, yMax: 10 },
      { xMin: 0, yMin: 0, xMax: 10, yMax: 10 },
      true,
    ],
    [
      { xMin: 0, yMin: 0, xMax: 10, yMax: 10 },
      { xMin: 0.0, yMin: 0, xMax: 10, yMax: 10 },
      true,
    ],
    [
      { xMin: 1, yMin: 0, xMax: 10, yMax: 10 },
      { xMin: 0, yMin: 0, xMax: 10, yMax: 10 },
      false,
    ],
  ];
  parametrize(
    "Checks if the rectangles are in same sizes and positioned equally",
    testData,
    ([a, b, acceptance, testDescription]) => {
      const result = equalRect(a, b);
      expect(result).deep.equals(acceptance, testDescription);
    }
  );
});

describe("rectCenter", () => {
  const testData = [
    [
      { xMin: 0, yMin: 5, xMax: 10, yMax: 10 },
      { x: 5, y: 7.5 },
    ],
    [
      { xMin: -10, yMin: -10, xMax: 0, yMax: 10 },
      { x: -5, y: 0 },
    ],
  ];
  parametrize(
    "Finds the center of given rectangle",
    testData,
    ([rectangle, acceptance, testDescription]) => {
      const result = rectCenter(rectangle);
      expect(result).deep.equals(acceptance, testDescription);
    }
  );
});

describe("rectSize", () => {
  const testData = [
    [
      { xMin: 0, yMin: 10, xMax: 10, yMax: 12 },
      { width: 10, height: 2 },
    ],
    [
      { xMin: -10, yMin: -2, xMax: 10, yMax: 10 },
      { width: 20, height: 12 },
    ],
  ];
  parametrize(
    "Returns the size of given rectangle",
    testData,
    ([rectangle, acceptance, testDescription]) => {
      const result = rectSize(rectangle);
      expect(result).deep.equals(acceptance, testDescription);
    }
  );
});

describe("rectFromArray", () => {
  const testData = [
    [[0, 0, 10, 10], { xMin: 0, yMin: 0, xMax: 10, yMax: 10 }],
    [
      [],
      (rectangle) => {
        expect(() => {
          rectFromArray(rectangle);
        }).to.throw();
      },
    ],
  ];
  parametrize(
    "Creates rectangle from an array",
    testData,
    ([rectangle, acceptance, testDescription]) => {
      if (typeof acceptance === "function") {
        acceptance(rectangle);
      } else {
        const result = rectFromArray(rectangle);
        expect(result).deep.equals(acceptance, testDescription);
      }
    }
  );
});

describe("rectToArray", () => {
  const testData = [[{ xMin: 0, yMin: 0, xMax: 10, yMax: 10 }, [0, 0, 10, 10]]];
  parametrize(
    "Creates array from given rectangle",
    testData,
    ([rectangle, acceptance, testDescription]) => {
      const result = rectToArray(rectangle);
      expect(result).deep.equals(acceptance, testDescription);
    }
  );
});

describe("isEmptyRect", () => {
  const testData = [
    [{ xMin: 10, yMin: 10, xMax: 10, yMax: 10 }, true],
    [{ xMin: 10, yMin: 10, xMax: 10, yMax: 11 }, false],
  ];
  parametrize(
    "Checks if the area of given rectangle is zero",
    testData,
    ([rectangle, acceptance, testDescription]) => {
      const result = isEmptyRect(rectangle);
      expect(result).deep.equals(acceptance, testDescription);
    }
  );
});

describe("rectFromPoints", () => {
  const testData = [
    [[], undefined],
    [
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
      ],
      {
        xMin: 0,
        yMin: 0,
        xMax: 10,
        yMax: 10,
      },
    ],
    [
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: -20, y: 10 },
      ],
      {
        xMin: -20,
        yMin: 0,
        xMax: 10,
        yMax: 10,
      },
    ],
  ];
  parametrize(
    "Creates a rectangle from given points",
    testData,
    ([rectangle, acceptance, testDescription]) => {
      const result = rectFromPoints(rectangle);
      expect(result).deep.equals(acceptance, testDescription);
    }
  );
});

describe("rectToPoints", () => {
  const testData = [
    [
      {
        xMin: 0,
        yMin: 0,
        xMax: 10,
        yMax: 10,
      },
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    ],
    [
      {
        xMin: -20,
        yMin: 0,
        xMax: 10,
        yMax: 10,
      },
      [
        { x: -20, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: -20, y: 10 },
      ],
    ],
  ];
  parametrize(
    "Creates an array of four corner points from given rectangle",
    testData,
    ([rectangle, acceptance, testDescription]) => {
      const result = rectToPoints(rectangle);
      expect(result).deep.equals(acceptance, testDescription);
    }
  );
});

describe("updateRect", () => {
  const testData = [
    [
      {
        xMin: 0,
        yMin: 0,
        xMax: 10,
        yMax: 10,
      },
      { x: 0, y: 0 },
      {
        xMin: 0,
        yMin: 0,
        xMax: 10,
        yMax: 10,
      },
    ],
    [
      {
        xMin: 0,
        yMin: 0,
        xMax: 10,
        yMax: 10,
      },
      { x: 20, y: 0 },
      {
        xMin: 0,
        yMin: 0,
        xMax: 20,
        yMax: 10,
      },
    ],
    [
      {
        xMin: 0,
        yMin: 0,
        xMax: 10,
        yMax: 10,
      },
      { x: 0, y: 20 },
      {
        xMin: 0,
        yMin: 0,
        xMax: 10,
        yMax: 20,
      },
    ],
    [
      {
        xMin: 0,
        yMin: 0,
        xMax: 10,
        yMax: 10,
      },
      { x: -10, y: 0 },
      {
        xMin: -10,
        yMin: 0,
        xMax: 10,
        yMax: 10,
      },
    ],
    [
      {
        xMin: 0,
        yMin: 0,
        xMax: 10,
        yMax: 10,
      },
      { x: 0, y: -10 },
      {
        xMin: 0,
        yMin: -10,
        xMax: 10,
        yMax: 10,
      },
    ],
  ];
  parametrize(
    "Update a rect with a point",
    testData,
    ([rectangle, point, acceptance]) => {
      const result = updateRect(rectangle, point);
      expect(result).deep.equals(acceptance);
    }
  );
});

describe("rectAddMargin", () => {
  const testData = [
    [
      { xMin: 0, yMin: 0, xMax: 20, yMax: 20 },
      1,
      { xMin: -20, yMin: -20, xMax: 40, yMax: 40 },
    ],
    [
      { xMin: 0, yMin: 0, xMax: 20, yMax: 40 },
      1,
      { xMin: -40, yMin: -40, xMax: 60, yMax: 80 },
    ],
    [
      { xMin: 10, yMin: 12, xMax: 21, yMax: 14 },
      1,
      { xMin: -1, yMin: 1, xMax: 32, yMax: 25 },
    ],
    [
      { xMin: 10, yMin: 12, xMax: 21, yMax: 14 },
      0.5,
      { xMin: 4.5, yMin: 6.5, xMax: 26.5, yMax: 19.5 },
    ],
  ];
  parametrize(
    "Adds margin to the rectangle relatively to the rect size",
    testData,
    ([rectangle, relativeMargin, expectedResult]) => {
      const result = rectAddMargin(rectangle, relativeMargin);
      expect(result).deep.equals(expectedResult);
    }
  );
});

describe("rectScaleAroundCenter", () => {
  const testData = [
    [
      { xMin: 0, yMin: 0, xMax: 10, yMax: 10 },
      1,
      { x: 5, y: 5 },
      { xMin: 0, yMin: 0, xMax: 10, yMax: 10 },
    ],
    [
      { xMin: 0, yMin: 0, xMax: 10, yMax: 10 },
      2,
      { x: 5, y: 5 },
      { xMin: -5, yMin: -5, xMax: 15, yMax: 15 },
    ],
    [
      { xMin: 0, yMin: 0, xMax: 10, yMax: 10 },
      2,
      { x: 0, y: 0 },
      { xMin: 0, yMin: 0, xMax: 20, yMax: 20 },
    ],
  ];
  parametrize(
    "Scale a rectangle by given origin",
    testData,
    ([rectangle, scalemultiplier, origin, expectedResult]) => {
      const result = rectScaleAroundCenter(rectangle, scalemultiplier, origin);
      expect(result).deep.equals(expectedResult);
    }
  );
});

describe("rectRound", () => {
  const testData = [
    [
      { xMin: 0.2, yMin: 0.3, xMax: 10.1, yMax: 10.0000001 },
      { xMin: 0, yMin: 0, xMax: 10, yMax: 10 },
    ],
  ];
  parametrize(
    "Rounds rectangle dimensions",
    testData,
    ([rectangle, expectedResult]) => {
      const result = rectRound(rectangle);
      expect(result).deep.equals(expectedResult);
    }
  );
});
