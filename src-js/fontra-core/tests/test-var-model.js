import { expect } from "chai";

import {
  VariationModel,
  deepCompare,
  locationToString,
  mapBackward,
  mapForward,
  normalizeLocation,
  normalizeValue,
  piecewiseLinearMap,
  supportScalar,
  unnormalizeLocation,
  unnormalizeValue,
} from "@fontra/core/var-model.js";
import { parametrize } from "./test-support.js";

describe("var-model tests", () => {
  describe("VariationModel tests", () => {
    it("basic", () => {
      const locations = [
        { wght: 100 },
        { wght: -100 },
        { wght: -180 },
        { wdth: +0.3 },
        { wght: +120, wdth: 0.3 },
        { wght: +120, wdth: 0.2 },
        {},
        { wght: +180, wdth: 0.3 },
        { wght: +180 },
      ];
      const model = new VariationModel(locations, ["wght"]);
      const sortedLocations = [
        {},
        { wght: -100 },
        { wght: -180 },
        { wght: 100 },
        { wght: 180 },
        { wdth: 0.3 },
        { wdth: 0.3, wght: 180 },
        { wdth: 0.3, wght: 120 },
        { wdth: 0.2, wght: 120 },
      ];
      expect(model.locations).to.deep.equal(sortedLocations);
      expect(model.mapping).to.deep.equal([3, 1, 2, 5, 7, 8, 0, 6, 4]);
      expect(model.reverseMapping).to.deep.equal([6, 1, 2, 0, 8, 3, 7, 4, 5]);
      // test model.deltaWeights

      expect(model.deltaWeights).to.deep.equal([
        new Map(),
        new Map([[0, 1.0]]),
        new Map([[0, 1.0]]),
        new Map([[0, 1.0]]),
        new Map([[0, 1.0]]),
        new Map([[0, 1.0]]),
        new Map([
          [0, 1.0],
          [4, 1.0],
          [5, 1.0],
        ]),
        new Map([
          [0, 1.0],
          [3, 0.75],
          [4, 0.25],
          [5, 1.0],
          [6, 0.6666666666666666],
        ]),
        new Map([
          [0, 1.0],
          [3, 0.75],
          [4, 0.25],
          [5, 0.6666666666666667],
          [6, 0.4444444444444445],
          [7, 0.6666666666666667],
        ]),
      ]);
    });

    it("deltas and interpolation", () => {
      const locations = [{}, { wght: 1 }, { wdth: 1 }, { wght: 1, wdth: 1 }];
      const model = new VariationModel(locations);
      const masterValues = [1, 2.5, 3.25, 5.25];
      const deltas = model.getDeltas(masterValues);
      expect(deltas).to.deep.equal([1, 2.25, 1.5, 0.5]);
      const testValues = [
        // loc, expectedValue
        [{}, 1.0],
        [{ wght: 1 }, 2.5],
        [{ wdth: 1 }, 3.25],
        [{ wght: 0.5 }, 1.75],
        [{ wdth: 0.5 }, 2.125],
        [{ wght: 1, wdth: 1 }, 5.25],
        [{ wght: 0.5, wdth: 0.5 }, 3.0],
      ];
      for (const [loc, expectedValue] of testValues) {
        const result = model.interpolateFromDeltas(loc, deltas);
        expect(result).to.equal(expectedValue);
      }
    });

    it("throw missing base master", () => {
      new VariationModel([{}]); // should not throw
      expect(() => new VariationModel([])).to.throw(
        "locations must contain default (missing base source)"
      );
      expect(() => new VariationModel([{ a: 100 }])).to.throw(
        "locations must contain default (missing base source)"
      );
    });

    it("throw non-unique locations", () => {
      expect(() => new VariationModel([{}, {}])).to.throw("locations must be unique");
      expect(
        () =>
          new VariationModel([
            { a: 1, b: 2 },
            { b: 2, a: 1 },
          ])
      ).to.throw("locations must be unique");
      expect(
        () =>
          new VariationModel([
            { a: 1, b: 2 },
            { a: 1, b: 2.0 },
          ])
      ).to.throw("locations must be unique");
    });
  });

  describe("normalizeValue test", () => {
    it("misc", () => {
      expect(normalizeValue(400, 100, 400, 900)).to.equal(0.0);
      expect(normalizeValue(100, 100, 400, 900)).to.equal(-1.0);
      expect(normalizeValue(650, 100, 400, 900)).to.equal(0.5);
      expect(normalizeValue(0, 100, 400, 900)).to.equal(-1.0);
      expect(normalizeValue(1000, 100, 400, 900)).to.equal(1.0);
    });
  });

  describe("unnormalizeValue test", () => {
    it("misc", () => {
      expect(unnormalizeValue(0, 100, 400, 900)).to.equal(400);
      expect(unnormalizeValue(-1, 100, 400, 900)).to.equal(100);
      expect(unnormalizeValue(-0.5, 100, 400, 900)).to.equal(250);
      expect(unnormalizeValue(0.5, 100, 400, 900)).to.equal(650);
      expect(unnormalizeValue(-2, 100, 400, 900)).to.equal(100);
      expect(unnormalizeValue(2, 100, 400, 900)).to.equal(900);
    });
  });

  describe("normalizeLocation tests", () => {
    it("-1,0,1", () => {
      const axes = [{ name: "wght", minValue: 100, defaultValue: 400, maxValue: 900 }];
      expect(normalizeLocation({ wght: 400 }, axes)).to.deep.equal({ wght: 0.0 });
      expect(normalizeLocation({ wght: 100 }, axes)).to.deep.equal({ wght: -1.0 });
      expect(normalizeLocation({ wght: 900 }, axes)).to.deep.equal({ wght: 1.0 });
      expect(normalizeLocation({ wght: 650 }, axes)).to.deep.equal({ wght: 0.5 });
      expect(normalizeLocation({ wght: 1000 }, axes)).to.deep.equal({ wght: 1.0 });
      expect(normalizeLocation({ wght: 0 }, axes)).to.deep.equal({ wght: -1.0 });
    });

    it("0,0,1", () => {
      const axes = [{ name: "wght", minValue: 0, defaultValue: 0, maxValue: 1000 }];
      expect(normalizeLocation({ wght: 0 }, axes)).to.deep.equal({ wght: 0.0 });
      expect(normalizeLocation({ wght: -1 }, axes)).to.deep.equal({ wght: 0.0 });
      expect(normalizeLocation({ wght: 1000 }, axes)).to.deep.equal({ wght: 1.0 });
      expect(normalizeLocation({ wght: 500 }, axes)).to.deep.equal({ wght: 0.5 });
      expect(normalizeLocation({ wght: 1001 }, axes)).to.deep.equal({ wght: 1.0 });
    });

    it("0,1,1", () => {
      const axes = [{ name: "wght", minValue: 0, defaultValue: 1000, maxValue: 1000 }];
      expect(normalizeLocation({ wght: 0 }, axes)).to.deep.equal({ wght: -1.0 });
      expect(normalizeLocation({ wght: -1 }, axes)).to.deep.equal({ wght: -1.0 });
      expect(normalizeLocation({ wght: 500 }, axes)).to.deep.equal({ wght: -0.5 });
      expect(normalizeLocation({ wght: 1000 }, axes)).to.deep.equal({ wght: 0.0 });
      expect(normalizeLocation({ wght: 1001 }, axes)).to.deep.equal({ wght: 0.0 });
    });

    it("buggy axis low default", () => {
      const axes = [{ name: "wght", minValue: 500, defaultValue: 0, maxValue: 1000 }];
      expect(normalizeLocation({ wght: 0 }, axes)).to.deep.equal({ wght: 0.0 });
      expect(normalizeLocation({ wght: 500 }, axes)).to.deep.equal({ wght: 0.0 });
      expect(normalizeLocation({ wght: 600 }, axes)).to.deep.equal({ wght: 0.2 });
      expect(normalizeLocation({ wght: 1000 }, axes)).to.deep.equal({ wght: 1.0 });
    });

    it("buggy axis high default", () => {
      const axes = [{ name: "wght", minValue: 0, defaultValue: 1000, maxValue: 500 }];
      expect(normalizeLocation({ wght: 0 }, axes)).to.deep.equal({ wght: -1.0 });
      expect(normalizeLocation({ wght: 400 }, axes)).to.deep.equal({ wght: -0.2 });
      expect(normalizeLocation({ wght: 500 }, axes)).to.deep.equal({ wght: 0.0 });
      expect(normalizeLocation({ wght: 1000 }, axes)).to.deep.equal({ wght: 0.0 });
    });

    it("buggy axis min/max", () => {
      const axes = [{ name: "wght", minValue: 0, defaultValue: 0, maxValue: -500 }];
      expect(normalizeLocation({ wght: 0 }, axes)).to.deep.equal({ wght: 0 });
    });
  });

  describe("unnormalizeLocation tests", () => {
    it("-1,0,1", () => {
      const axes = [{ name: "wght", minValue: 100, defaultValue: 400, maxValue: 900 }];
      expect(unnormalizeLocation({ wght: 0 }, axes)).to.deep.equal({ wght: 400 });
      expect(unnormalizeLocation({ wght: -1 }, axes)).to.deep.equal({ wght: 100 });
      expect(unnormalizeLocation({ wght: 1 }, axes)).to.deep.equal({ wght: 900 });
      expect(unnormalizeLocation({ wght: 0.5 }, axes)).to.deep.equal({ wght: 650 });
      expect(unnormalizeLocation({ wght: 2 }, axes)).to.deep.equal({ wght: 900 });
      expect(unnormalizeLocation({ wght: -2 }, axes)).to.deep.equal({ wght: 100 });
    });

    it("0,0,1", () => {
      const axes = [{ name: "wght", minValue: 0, defaultValue: 0, maxValue: 1000 }];
      expect(unnormalizeLocation({ wght: 0 }, axes)).to.deep.equal({ wght: 0 });
      expect(unnormalizeLocation({ wght: -1 }, axes)).to.deep.equal({ wght: 0.0 });
      expect(unnormalizeLocation({ wght: 1 }, axes)).to.deep.equal({ wght: 1000 });
      expect(unnormalizeLocation({ wght: 0.5 }, axes)).to.deep.equal({ wght: 500 });
      expect(unnormalizeLocation({ wght: 2 }, axes)).to.deep.equal({ wght: 1000 });
    });

    it("0,1,1", () => {
      const axes = [{ name: "wght", minValue: 0, defaultValue: 1000, maxValue: 1000 }];
      expect(unnormalizeLocation({ wght: -1 }, axes)).to.deep.equal({ wght: 0 });
      expect(unnormalizeLocation({ wght: -2 }, axes)).to.deep.equal({ wght: 0 });
      expect(unnormalizeLocation({ wght: -0.5 }, axes)).to.deep.equal({ wght: 500 });
      expect(unnormalizeLocation({ wght: 0 }, axes)).to.deep.equal({ wght: 1000 });
      expect(unnormalizeLocation({ wght: 0.5 }, axes)).to.deep.equal({ wght: 1000 });
    });

    it("buggy axis low default", () => {
      const axes = [{ name: "wght", minValue: 500, defaultValue: 0, maxValue: 1000 }];
      expect(unnormalizeLocation({ wght: 0 }, axes)).to.deep.equal({ wght: 500 });
      expect(unnormalizeLocation({ wght: 0.2 }, axes)).to.deep.equal({ wght: 600 });
      expect(unnormalizeLocation({ wght: 1 }, axes)).to.deep.equal({ wght: 1000 });
    });

    it("buggy axis high default", () => {
      const axes = [{ name: "wght", minValue: 0, defaultValue: 1000, maxValue: 500 }];
      expect(unnormalizeLocation({ wght: -1 }, axes)).to.deep.equal({ wght: 0 });
      expect(unnormalizeLocation({ wght: -0.2 }, axes)).to.deep.equal({ wght: 400 });
      expect(unnormalizeLocation({ wght: 0 }, axes)).to.deep.equal({ wght: 500 });
      expect(unnormalizeLocation({ wght: 1 }, axes)).to.deep.equal({ wght: 500 });
    });

    it("buggy axis min/max", () => {
      const axes = [{ name: "wght", minValue: 0, defaultValue: 0, maxValue: -500 }];
      expect(unnormalizeLocation({ wght: 0 }, axes)).to.deep.equal({ wght: 0 });
    });
  });

  describe("supportScalar tests", () => {
    it("supportScalar", () => {
      expect(supportScalar({}, {})).to.equal(1.0);
      expect(supportScalar({ wght: 0.2 }, {})).to.equal(1.0);
      expect(supportScalar({ wght: 0.2 }, { wght: [0, 2, 3] })).to.equal(0.1);
      expect(supportScalar({ wght: 2.5 }, { wght: [0, 2, 4] })).to.equal(0.75);
      expect(
        supportScalar({ wght: 2.5, wdth: 0 }, { wght: [0, 2, 4], wdth: [-1, 0, +1] })
      ).to.equal(0.75);
      expect(
        supportScalar(
          { wght: 2.5, wdth: 0.5 },
          { wght: [0, 2, 4], wdth: [-1, 0, +1] },
          false
        )
      ).to.equal(0.375);
      expect(
        supportScalar({ wght: 2.5, wdth: 0 }, { wght: [0, 2, 4], wdth: [-1, 0, +1] })
      ).to.equal(0.75);
      expect(
        supportScalar({ wght: 2.5, wdth: 0.5 }, { wght: [0, 2, 4], wdth: [-1, 0, +1] })
      ).to.equal(0.75);
    });
  });

  describe("locationToString tests", () => {
    it("empty location", () => {
      expect(locationToString({})).to.equal("{}");
      expect(locationToString({ a: 1, b: 2 })).to.equal('{"a":1,"b":2}');
      expect(locationToString({ b: 2, a: 1 })).to.equal('{"a":1,"b":2}');
    });
  });

  describe("deepCompare tests", () => {
    it("deepCompare scalars", () => {
      expect(deepCompare(1, 2)).to.equal(-1);
      expect(deepCompare(9, 10)).to.equal(-1);
      expect(deepCompare(3, 2)).to.equal(1);
      expect(deepCompare(3, 3)).to.equal(0);
      expect(deepCompare("a", "b")).to.equal(-1);
      expect(deepCompare("a", "aa")).to.equal(-1);
      expect(deepCompare("aa", "a")).to.equal(1);
      expect(deepCompare("aaa", "aaa")).to.equal(0);
      expect(deepCompare("9", "10")).to.equal(1);
    });

    it("deepCompare empty array", () => {
      expect(deepCompare([], [])).to.equal(0);
    });

    it("deepCompare string array", () => {
      expect(deepCompare(["a", "aa"], ["a", "aa"])).to.equal(0);
      expect(deepCompare(["a", "aa"], ["a", "aaa"])).to.equal(-1);
      expect(deepCompare(["a", "aaaa"], ["a", "aaa"])).to.equal(1);
    });

    it("deepCompare numeric array", () => {
      expect(deepCompare([1, 2], [1, 2])).to.equal(0);
      expect(deepCompare([1, 2], [2, 2])).to.equal(-1);
      expect(deepCompare([1, 2], [1, 3])).to.equal(-1);
      expect(deepCompare([1, 4], [1, 3])).to.equal(1);
      expect(deepCompare([2, 2], [1, 3])).to.equal(1);
    });

    it("deepCompare numeric array", () => {
      expect(deepCompare([1, 2], [1, 2])).to.equal(0);
      expect(deepCompare([1, 2], [2, 2])).to.equal(-1);
      expect(deepCompare([1, 2], [1, 2, 3])).to.equal(-1);
      expect(deepCompare([1, 2], [1, 3])).to.equal(-1);
      expect(deepCompare([1, 4], [1, 3])).to.equal(1);
      expect(deepCompare([2, 2], [1, 3])).to.equal(1);
      const l = [
        [1, 2, 3],
        [1, 2],
      ];
      l.sort(deepCompare);
      expect(l).to.deep.equal([
        [1, 2],
        [1, 2, 3],
      ]);
    });

    it("deepCompare nested numeric array", () => {
      expect(deepCompare([1, [3, 4]], [1, [3, 4]])).to.equal(0);
      expect(deepCompare([1, [3, 4]], [1, [3, 5]])).to.equal(-1);
      expect(deepCompare([1, [3, 4]], [1, [3, 3]])).to.equal(1);
    });

    it("deepCompare throw TypeError", () => {
      expect(() => deepCompare({}, [])).to.throw(TypeError);
      expect(() => deepCompare(123, "123")).to.throw(TypeError);
    });
  });

  describe("piecewiseLinearMap tests", () => {
    it("undefined mapping", () => {
      expect(piecewiseLinearMap(10, undefined)).to.equal(10);
    });

    it("empty mapping", () => {
      expect(piecewiseLinearMap(10, {})).to.equal(10);
    });

    it("low mapping", () => {
      expect(piecewiseLinearMap(9, { 10: 100, 20: 200 })).to.equal(99);
    });

    it("high mapping", () => {
      expect(piecewiseLinearMap(21, { 10: 100, 20: 200 })).to.equal(201);
    });

    it("one segment mapping", () => {
      expect(piecewiseLinearMap(15, { 10: 100, 20: 200 })).to.equal(150);
    });

    it("multi segment mapping", () => {
      expect(piecewiseLinearMap(15, { 10: 100, 20: 200, 30: 1000 })).to.equal(150);
      expect(piecewiseLinearMap(25, { 10: 100, 20: 200, 30: 1000 })).to.equal(600);
    });
  });

  describe("mapForward tests", () => {
    it("undefined map", () => {
      const axes = [{ name: "weight" }];
      const location = { weight: 10 };
      expect(mapForward(location, axes)).to.deep.equal({ weight: 10 });
    });

    it("empty map", () => {
      const axes = [{ name: "weight", mapping: [] }];
      const location = { weight: 10 };
      expect(mapForward(location, axes)).to.deep.equal({ weight: 10 });
    });

    it("simple map", () => {
      const axes = [
        {
          name: "weight",
          mapping: [
            [0, 100],
            [20, 200],
          ],
        },
      ];
      const location = { weight: 10, width: 100 };
      expect(mapForward(location, axes)).to.deep.equal({ weight: 150, width: 100 });
    });
  });

  describe("mapBackward tests", () => {
    it("undefined map", () => {
      const axes = [{ name: "weight" }];
      const location = { weight: 10 };
      expect(mapBackward(location, axes)).to.deep.equal({ weight: 10 });
    });

    it("empty map", () => {
      const axes = [{ name: "weight", mapping: [] }];
      const location = { weight: 10 };
      expect(mapBackward(location, axes)).to.deep.equal({ weight: 10 });
    });

    it("simple map", () => {
      const axes = [
        {
          name: "weight",
          mapping: [
            [0, 100],
            [20, 200],
          ],
        },
      ];
      const location = { weight: 150, width: 100 };
      expect(mapBackward(location, axes)).to.deep.equal({ weight: 10, width: 100 });
    });
  });

  describe("getSourceContributions tests", () => {
    const locationsA = [{}, { wght: 1 }, { wdth: 1 }];
    const locationsB = [{}, { wght: 1 }, { wdth: 1 }, { wght: 1, wdth: 1 }];
    const locationsC = [
      {},
      { wght: 0.5 },
      { wght: 1 },
      { wdth: 1 },
      { wght: 1, wdth: 1 },
    ];
    parametrize(
      "test contrib",
      [
        { locations: locationsA, location: { wght: 0, wdth: 0 }, result: [1, 0, 0] },
        {
          locations: locationsA,
          location: { wght: 0.5, wdth: 0 },
          result: [0.5, 0.5, 0],
        },
        { locations: locationsA, location: { wght: 1, wdth: 0 }, result: [0, 1, 0] },
        {
          locations: locationsA,
          location: { wght: 0, wdth: 0.5 },
          result: [0.5, 0, 0.5],
        },
        { locations: locationsA, location: { wght: 0, wdth: 1 }, result: [0, 0, 1] },
        { locations: locationsA, location: { wght: 1, wdth: 1 }, result: [-1, 1, 1] },
        {
          locations: locationsA,
          location: { wght: 0.5, wdth: 0.5 },
          result: [0, 0.5, 0.5],
        },
        {
          locations: locationsA,
          location: { wght: 0.75, wdth: 0.75 },
          result: [-0.5, 0.75, 0.75],
        },
        {
          locations: locationsB,
          location: { wght: 1, wdth: 1 },
          result: [0, 0, 0, 1],
        },
        {
          locations: locationsB,
          location: { wght: 0.5, wdth: 0 },
          result: [0.5, 0.5, 0, 0],
        },
        {
          locations: locationsB,
          location: { wght: 1, wdth: 0.5 },
          result: [0, 0.5, 0, 0.5],
        },
        {
          locations: locationsB,
          location: { wght: 0.5, wdth: 0.5 },
          result: [0.25, 0.25, 0.25, 0.25],
        },
        {
          locations: locationsC,
          location: { wght: 0.5, wdth: 0 },
          result: [0, 1, 0, 0, 0],
        },
        {
          locations: locationsC,
          location: { wght: 0.25, wdth: 0 },
          result: [0.5, 0.5, 0, 0, 0],
        },
        {
          locations: locationsC,
          location: { wght: 0.75, wdth: 0 },
          result: [0, 0.5, 0.5, 0, 0],
        },
        {
          locations: locationsC,
          location: { wght: 0.5, wdth: 1 },
          result: [-0.5, 1, -0.5, 0.5, 0.5],
        },
        {
          locations: locationsC,
          location: { wght: 0.75, wdth: 1 },
          result: [-0.25, 0.5, -0.25, 0.25, 0.75],
        },
      ],
      (testData) => {
        const model = new VariationModel(testData.locations, ["wght", "wdth"]);
        expect(model.getSourceContributions(testData.location)).to.deep.equal(
          testData.result
        );
      }
    );
  });
});
