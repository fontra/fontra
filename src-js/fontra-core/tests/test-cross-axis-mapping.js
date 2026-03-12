import { CrossAxisMapping } from "@fontra/core/cross-axis-mapping.js";
import { expect } from "chai";
import { parametrize } from "./test-support.js";

describe("CrossAxisMapping Tests", () => {
  const axes = [newAxis("Diagonal"), newAxis("Horizontal"), newAxis("Vertical")];

  const mappings = [
    {
      inputLocation: { Diagonal: 0 },
      outputLocation: { Horizontal: 0, Vertical: 0 },
    },
    {
      inputLocation: { Diagonal: 25 },
      outputLocation: { Horizontal: 0, Vertical: 33 },
    },
    {
      inputLocation: { Diagonal: 75 },
      outputLocation: { Horizontal: 100, Vertical: 67 },
    },
    {
      inputLocation: { Diagonal: 100 },
      outputLocation: { Horizontal: 100, Vertical: 100 },
    },
  ];

  const testData = [
    { inputLocation: {}, outputLocation: { Diagonal: 0, Horizontal: 0, Vertical: 0 } },
    {
      inputLocation: { Diagonal: 0 },
      outputLocation: { Diagonal: 0, Horizontal: 0, Vertical: 0 },
    },
    {
      inputLocation: { Diagonal: 12.5 },
      outputLocation: { Diagonal: 12.5, Horizontal: 0, Vertical: 16.5 },
    },
    {
      inputLocation: { Diagonal: 12.5, Horizontal: 10, Vertical: 10 },
      outputLocation: { Diagonal: 12.5, Horizontal: 10, Vertical: 26.5 },
    },
    {
      inputLocation: { Diagonal: 12.5, Horizontal: 10, Vertical: 100 },
      outputLocation: { Diagonal: 12.5, Horizontal: 10, Vertical: 100 },
    },
    {
      inputLocation: { Diagonal: 25 },
      outputLocation: { Diagonal: 25, Horizontal: 0, Vertical: 33 },
    },
    {
      inputLocation: { Diagonal: 50 },
      outputLocation: { Diagonal: 50, Horizontal: 50, Vertical: 50 },
    },
    {
      inputLocation: { Diagonal: 75 },
      outputLocation: { Diagonal: 75, Horizontal: 100, Vertical: 67 },
    },
    {
      inputLocation: { Diagonal: 100 },
      outputLocation: { Diagonal: 100, Horizontal: 100, Vertical: 100 },
    },
  ];

  parametrize("CrossAxisMapping.mapLocation", testData, (testItem) => {
    const mam = new CrossAxisMapping(axes, mappings);
    expect(mam.mapLocation(testItem.inputLocation)).to.deep.equal(
      testItem.outputLocation
    );
  });

  it("Test empty mappings", () => {
    const mam = new CrossAxisMapping(axes, []);
    const loc = { a: 12, b: 31 };
    expect(mam.mapLocation(loc)).to.deep.equal(loc);
  });

  it("Test undefined mappings", () => {
    const mam = new CrossAxisMapping(axes, undefined);
    const loc = { a: 12, b: 31 };
    expect(mam.mapLocation(loc)).to.deep.equal(loc);
  });

  it("Test mappings with output at default while input not at default", () => {
    const axes = [newAxis("a"), newAxis("b")];
    const mappings = [
      {
        inputLocation: { a: 100, b: 100 },
        outputLocation: { a: 0, b: 100 },
      },
      {
        inputLocation: { a: 100, b: 1e-18 }, // tiny but not zero
        outputLocation: { a: 0, b: 0 },
      },
    ];

    const mam = new CrossAxisMapping(axes, mappings);
    expect(mam.mapLocation({})).to.deep.equal({ a: 0, b: 0 });
    expect(mam.mapLocation({ a: 50 })).to.deep.equal({ a: 50, b: 0 });
    expect(mam.mapLocation({ a: 100 })).to.deep.equal({ a: 100, b: 0 });
    expect(mam.mapLocation({ b: 50 })).to.deep.equal({ a: 0, b: 50 });
    expect(mam.mapLocation({ b: 100 })).to.deep.equal({ a: 0, b: 100 });
    // Test that b wins, setting a to 0
    expect(mam.mapLocation({ a: 100, b: 1 })).to.deep.equal({ a: 0, b: 1 });
    expect(mam.mapLocation({ a: 10, b: 50 })).to.deep.equal({ a: 0, b: 50 });
    expect(mam.mapLocation({ a: 50, b: 50 })).to.deep.equal({ a: 0, b: 50 });
    expect(mam.mapLocation({ a: 50, b: 100 })).to.deep.equal({ a: 0, b: 100 });
  });

  it("Test invalid mappings", () => {
    const mam = new CrossAxisMapping(axes, [
      {
        inputLocation: {},
        outputLocation: {},
      },
      {
        inputLocation: {},
        outputLocation: {},
      },
    ]);
    const loc = { a: 12, b: 31 };
    expect(mam.mapLocation(loc)).to.deep.equal(loc);
  });
});

function newAxis(name, minValue = 0, defaultValue = 0, maxValue = 100) {
  return { name, minValue, defaultValue, maxValue };
}
