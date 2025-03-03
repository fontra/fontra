import {
  chordLengthParameterize,
  computeMaxError,
  fitCubic,
  generateBezier,
  newtonRhapsonRootFind,
} from "@fontra/core/fit-cubic.js";
import { expect } from "chai";

import { normalizeVector } from "@fontra/core/vector.js";
import { Bezier } from "bezier-js";

describe("chordLengthParameterize", () => {
  it("parameterize the given points", () => {
    const points = [
      { x: -28, y: 138 },
      { x: 72, y: 188 },
      { x: 118, y: 190 },
      { x: 192, y: 160 },
      { x: 262, y: 134 },
      { x: 296, y: 86 },
      { x: 318, y: 18 },
    ];
    const parameters = chordLengthParameterize(points);
    expect(parameters).deep.equal([
      0.0, 0.25257093967929206, 0.3565860188512732, 0.5369718939837534,
      0.7056620562778243, 0.8385441379333622, 1.0,
    ]);
  });
});

describe("Bezier curve evaluation", () => {
  const p1 = { x: -28, y: 138 };
  const p2 = { x: 98.70185667874232, y: 264.70185667874233 };
  const p3 = { x: 274.3331007115815, y: 149.00069786525552 };
  const p4 = { x: 318, y: 18 };
  const bezier = new Bezier(p1, p2, p3, p4);
  it("Returns an intermediate point relevant to t value", () => {
    const { x, y } = bezier.get(0.2);
    expect(x).equal(52.44549063294889);
    expect(y).equal(186.74957995970166);
  });
  it("Returns the first point when t at zero", () => {
    const { x, y } = bezier.get(0);
    expect(x).equal(-28);
    expect(y).equal(138);
  });
  it("Returns the last point when t at the end", () => {
    const { x, y } = bezier.get(1);
    expect(x).equal(318);
    expect(y).equal(18);
  });
});

describe("computeMaxError", () => {
  it("should compute max error", () => {
    const points = [
      { x: -28, y: 138 },
      { x: 72, y: 188 },
      { x: 118, y: 190 },
      { x: 192, y: 160 },
      { x: 262, y: 134 },
      { x: 296, y: 86 },
      { x: 318, y: 18 },
    ];
    const bezier = new Bezier([
      { x: -28, y: 138 },
      { x: 98.70185668, y: 264.70185668 },
      { x: 274.33310071, y: 149.00069787 },
      { x: 318, y: 18 },
    ]);
    const maxError = computeMaxError(
      points,
      bezier,
      [
        0.0, 0.25257093967929206, 0.3565860188512732, 0.5369718939837534,
        0.7056620562778243, 0.8385441379333622, 1.0,
      ]
    );
    expect(maxError).deep.equals([251.76193388154175, 4]);
  });
});

describe("bezierqprime", () => {
  it("cubic bezier first derivative at t", () => {
    const { x, y } = new Bezier([
      { x: -28, y: 0 },
      { x: 16.276295129835724, y: 44.276295129835724 },
      { x: 182.32886105475268, y: 425.0134168357419 },
      { x: 318, y: 18 },
    ]).derivative(0.8718749216671997);

    expect({ x, y }).deep.equal({
      x: 422.87567451044663,
      y: -670.8219354679883,
    });
  });
});

describe("bezierqprimeprime", () => {
  it("cubic bezier second derivative at t", () => {
    const { x, y } = new Bezier([
      { x: -28, y: 0 },
      { x: 16.276295129835724, y: 44.276295129835724 },
      { x: 182.32886105475268, y: 425.0134168357419 },
      { x: 318, y: 18 },
    ]).dderivative(0.8718749216671997);

    expect({ x, y }).deep.equal({
      x: -65.31726020004677,
      y: -3862.265215939896,
    });
  });
});

describe("fitCubic", () => {
  it("should create a bezier curve by given points", () => {
    const points = [
      { x: -28, y: 0 },
      { x: 72, y: 188 },
      { x: 118, y: 190 },
      { x: 192, y: 160 },
      { x: 262, y: 134 },
      { x: 296, y: 86 },
      { x: 318, y: 18 },
    ];
    const leftTangent = normalizeVector({ x: 1, y: 1 });
    const rightTangent = normalizeVector({ x: -1, y: 3 });
    const segment = fitCubic(points, leftTangent, rightTangent, 800);
    expect(segment.points.map(({ x, y }) => ({ x, y }))).deep.equal([
      { x: -28, y: 0 },
      { x: 30.619361253106185, y: 58.619361253106185 },
      { x: 185.4153571748979, y: 415.7539284753063 },
      { x: 318, y: 18 },
    ]);
  });
});

describe("generateBezier", () => {
  it("generates a bezier curve by given t values", () => {
    let [b1, b2, b3, b4] = generateBezier(
      [
        { x: -28, y: 138 },
        { x: 72, y: 188 },
        { x: 118, y: 190 },
        { x: 192, y: 160 },
        { x: 262, y: 134 },
        { x: 296, y: 86 },
        { x: 318, y: 18 },
      ],
      [
        0.0, 0.25257093967929206, 0.3565860188512732, 0.5369718939837534,
        0.7056620562778243, 0.8385441379333622, 1.0,
      ],

      { x: 0.7071067811865475, y: 0.7071067811865475 },
      { x: -0.31622776601683794, y: 0.9486832980505138 }
    ).points;

    expect(b1).deep.equal({ x: -28, y: 138 });
    expect(b2).deep.equal({ x: 98.70185667874232, y: 264.70185667874233 });
    expect(b3).deep.equal({ x: 274.3331007115815, y: 149.00069786525552 });
    expect(b4).deep.equal({ x: 318, y: 18 });

    [b1, b2, b3, b4] = generateBezier(
      [
        { x: -28, y: 0 },
        { x: 72, y: 188 },
        { x: 118, y: 190 },
        { x: 192, y: 160 },
        { x: 262, y: 134 },
        { x: 296, y: 86 },
        { x: 318, y: 18 },
      ],
      [
        0.0, 0.3603797149797222, 0.43632563266986446, 0.5189086170461938,
        0.6924786624363051, 0.822507279460892, 1.0,
      ],

      { x: 0.7071067811865475, y: 0.7071067811865475 },
      { x: -0.31622776601683794, y: 0.9486832980505138 }
    ).points;

    expect(b1).deep.equal({ x: -28, y: 0 });
    expect(b2).deep.equal({ x: 134.85620891904577, y: 162.85620891904577 });
    expect(b3).deep.equal({ x: 235.09934508233675, y: 266.7019647529898 });
    expect(b4).deep.equal({ x: 318, y: 18 });
  });
});

describe("newtonRaphsonRootFind", () => {
  expect(
    newtonRhapsonRootFind(
      new Bezier(
        { x: -28, y: 0 },
        { x: 16.276295129835724, y: 44.276295129835724 },
        { x: 182.32886105475268, y: 425.0134168357419 },
        { x: 318, y: 18 }
      ),
      { x: 262, y: 134 },
      0.8718749216671997
    )
  ).equal(0.8744228180105965);
});
