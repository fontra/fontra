import { DiscreteVariationModel } from "@fontra/core/discrete-variation-model.js";
import { expect } from "chai";
import { parametrize } from "./test-support.js";

describe("DiscreteVariationModel tests", () => {
  const testAxes = [
    { name: "Weight", minValue: 400, maxValue: 700, defaultValue: 400 },
    { name: "Italic", values: [0, 1], defaultValue: 0 },
  ];

  const testLocations = [
    {},
    { Weight: 700 },
    { Italic: 1 },
    { Weight: 700, Italic: 1 },
  ];

  const testSourceData = [
    [0, 0],
    [100, 0],
    [0, 100, 200], // Incompatible Italic sources
    [100, 100, 300], // etc.
  ];

  const testCases = [
    {
      location: {},
      expectedResult: [0, 0],
    },
    {
      location: { Weight: 550 },
      expectedResult: [50, 0],
    },
    {
      location: { Weight: 700 },
      expectedResult: [100, 0],
    },
    {
      location: { Italic: 1 },
      expectedResult: [0, 100, 200],
    },
    {
      location: { Weight: 700, Italic: 1 },
      expectedResult: [100, 100, 300],
    },
    {
      location: { Weight: 550, Italic: 1 },
      expectedResult: [50, 100, 250],
    },
    {
      location: { Weight: 550, Italic: 0.4 },
      expectedResult: [50, 0],
    },
    {
      location: { Weight: 550, Italic: 0.6 },
      expectedResult: [50, 100, 250],
    },
  ];

  parametrize("DiscreteVariationModel test", testCases, (testData) => {
    const model = new DiscreteVariationModel(testLocations, testAxes);
    const deltas = model.getDeltas(testSourceData);
    const { instance, errors } = model.interpolateFromDeltas(testData.location, deltas);
    expect(instance).to.deep.equal(testData.expectedResult);
    expect(errors).to.deep.equal(undefined);
  });

  const badLocations = [...testLocations];
  badLocations[3] = {};

  const testCasesBadLocations = [
    {
      location: {},
      expectedResult: [0, 0],
      expectedErrors: [
        {
          message: "Italic=0: locations must be unique",
          type: "model-error",
        },
      ],
    },
    {
      location: { Weight: 600 },
      expectedResult: [100, 0],
      expectedErrors: [
        {
          message: "Italic=0: locations must be unique",
          type: "model-error",
        },
      ],
    },
  ];

  parametrize(
    "DiscreteVariationModel bad locations",
    testCasesBadLocations,
    (testData) => {
      const model = new DiscreteVariationModel(badLocations, testAxes);
      const deltas = model.getDeltas(testSourceData);
      const { instance, errors } = model.interpolateFromDeltas(
        testData.location,
        deltas
      );
      expect(instance).to.deep.equal(testData.expectedResult);
      expect(errors).to.deep.equal(testData.expectedErrors);
    }
  );

  const testIncompatibleSourceData = [
    [0, 0],
    [100, 0, 1, 1], // bad incompatible source
    [0, 100, 200],
    [100, 100, 300],
  ];

  const testCasesIncompatibleSources = [
    {
      location: {},
      expectedResult: [0, 0],
      expectedErrors: [
        {
          message: "arrays have incompatible lengths: 4 != 2",
          type: "interpolation-error",
        },
      ],
    },
    {
      location: { Weight: 600 },
      expectedResult: [100, 0, 1, 1],
      expectedErrors: [
        {
          message: "arrays have incompatible lengths: 4 != 2",
          type: "interpolation-error",
        },
      ],
    },
  ];

  parametrize(
    "DiscreteVariationModel incompatible sources",
    testCasesIncompatibleSources,
    (testData) => {
      const model = new DiscreteVariationModel(testLocations, testAxes);
      const deltas = model.getDeltas(testIncompatibleSourceData);
      const { instance, errors } = model.interpolateFromDeltas(
        testData.location,
        deltas
      );
      expect(instance).to.deep.equal(testData.expectedResult);
      expect(errors).to.deep.equal(testData.expectedErrors);
    }
  );

  const testLocationsNoItalic = [{}, { Weight: 700 }];

  const testSourceDataNoItalic = [
    [0, 0],
    [100, 0],
  ];

  const testCasesNoItalic = [
    {
      location: {},
      expectedResult: [0, 0],
    },
    {
      location: { Weight: 550 },
      expectedResult: [50, 0],
    },
    {
      location: { Weight: 550, Italic: 1 },
      expectedResult: [50, 0],
      expectedErrors: [
        {
          message: "there are no sources for Italic=1",
          type: "model-warning",
        },
      ],
    },
  ];

  parametrize("DiscreteVariationModel no italic", testCasesNoItalic, (testData) => {
    const model = new DiscreteVariationModel(testLocationsNoItalic, testAxes);
    const deltas = model.getDeltas(testSourceDataNoItalic);
    const { instance, errors } = model.interpolateFromDeltas(testData.location, deltas);
    expect(instance).to.deep.equal(testData.expectedResult);
    expect(errors).to.deep.equal(testData.expectedErrors);
  });
});
