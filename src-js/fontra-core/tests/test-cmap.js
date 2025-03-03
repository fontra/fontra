import { expect } from "chai";

import {
  getCharacterMapProxy,
  getGlyphMapProxy,
  makeCharacterMapFromGlyphMap,
  makeGlyphMapFromCharacterMap,
} from "@fontra/core/cmap.js";
import { enumerate } from "@fontra/core/utils.js";

describe("characterMap tests", () => {
  const makeGlyphMapFromCharacterMap_testData = [
    [{}, {}],
    [{ 1: "one" }, { one: [1] }],
    [
      { 1: "one", 2: "two" },
      { one: [1], two: [2] },
    ],
    [{ 1: "double", 2: "double" }, { double: [1, 2] }],
    [{ 2: "double", 1: "double" }, { double: [1, 2] }],
  ];

  for (const [i, [characterMap, expectedGlyphMap]] of enumerate(
    makeGlyphMapFromCharacterMap_testData
  )) {
    it(`makeGlyphMapFromCharacterMap test ${i}`, () => {
      expect(makeGlyphMapFromCharacterMap(characterMap)).to.deep.equal(
        expectedGlyphMap
      );
    });
  }

  const makeCharacterMapFromGlyphMap_testData = [
    [{}, {}, true, null],
    [{ one: [1] }, { 1: "one" }, true, null],
    [{ one: [1], two: [2] }, { 1: "one", 2: "two" }, true, null],
    [{ double: [1, 2] }, { 1: "double", 2: "double" }, true, null],
    [{ one: [1], two: [1] }, null, true, "duplicate code point"],
    [{ one: [1], two: [1] }, { 1: "one" }, false, null],
    [{ two: [1], one: [1] }, { 1: "one" }, false, null],
  ];

  for (const [i, [glyphMap, expectedCharacterMap, strict, error]] of enumerate(
    makeCharacterMapFromGlyphMap_testData
  )) {
    it(`makeCharacterMapFromGlyphMap test ${i}`, () => {
      if (!error) {
        expect(makeCharacterMapFromGlyphMap(glyphMap, strict)).to.deep.equal(
          expectedCharacterMap
        );
      } else {
        expect(() => makeCharacterMapFromGlyphMap(glyphMap, strict)).to.throw(error);
      }
    });
  }

  it("makeGlyphMapFromCharacterMap test simple", () => {
    const characterMap = {};
    expect(makeGlyphMapFromCharacterMap(characterMap)).to.deep.equal({});
  });

  it("getGlyphMapProxy add items", () => {
    const characterMap = {};
    const glyphMapData = {};
    const glyphMap = getGlyphMapProxy(glyphMapData, characterMap);

    glyphMap["space"] = [32];
    glyphMap["double"] = [33, 34];

    expect(characterMap).to.deep.equal({ 32: "space", 33: "double", 34: "double" });
    expect(glyphMapData).to.deep.equal({ space: [32], double: [33, 34] });
  });

  it("getGlyphMapProxy replace items", () => {
    const characterMap = { 32: "space", 33: "test" };
    const glyphMapData = makeGlyphMapFromCharacterMap(characterMap);
    const glyphMap = getGlyphMapProxy(glyphMapData, characterMap);

    glyphMap["space"] = [32, 34];
    expect(characterMap).to.deep.equal({ 32: "space", 33: "test", 34: "space" });
    expect(glyphMap).to.deep.equal({ space: [32, 34], test: [33] });
  });

  it("getGlyphMapProxy replace items with same", () => {
    const characterMap = { 32: "space", 33: "test" };
    const glyphMapData = makeGlyphMapFromCharacterMap(characterMap);
    const glyphMap = getGlyphMapProxy(glyphMapData, characterMap);

    glyphMap["space"] = [32];
    glyphMap["test"] = [33];
    expect(characterMap).to.deep.equal({ 32: "space", 33: "test" });
    expect(glyphMap).to.deep.equal({ space: [32], test: [33] });
  });

  it("getGlyphMapProxy delete items", () => {
    const characterMap = { 32: "space", 33: "test" };
    const glyphMapData = makeGlyphMapFromCharacterMap(characterMap);
    const glyphMap = getGlyphMapProxy(glyphMapData, characterMap);

    delete glyphMap["space"];
    expect(characterMap).to.deep.equal({ 33: "test" });
    expect(glyphMap).to.deep.equal({ test: [33] });

    delete glyphMap["test"];
    expect(characterMap).to.deep.equal({});
    expect(glyphMap).to.deep.equal({});
  });

  it("getCharacterMapProxy add items", () => {
    const characterMapData = {};
    const glyphMap = {};
    const characterMap = getCharacterMapProxy(characterMapData, glyphMap);

    characterMap[32] = "space";
    characterMap[33] = "double";
    characterMap[34] = "double";
    expect(characterMapData).to.deep.equal({ 32: "space", 33: "double", 34: "double" });
    expect(glyphMap).to.deep.equal({ space: [32], double: [33, 34] });
  });

  it("getCharacterMapProxy replace items", () => {
    const characterMapData = { 32: "space", 33: "double", 34: "double" };
    const glyphMap = makeGlyphMapFromCharacterMap(characterMapData);
    const characterMap = getCharacterMapProxy(characterMapData, glyphMap);

    characterMap[32] = "spacey";
    characterMap[34] = "doubly";
    expect(characterMapData).to.deep.equal({
      32: "spacey",
      33: "double",
      34: "doubly",
    });
    expect(glyphMap).to.deep.equal({ spacey: [32], double: [33], doubly: [34] });
  });

  it("getCharacterMapProxy replace items with same", () => {
    const characterMapData = { 32: "space", 33: "double", 34: "double" };
    const glyphMap = makeGlyphMapFromCharacterMap(characterMapData);
    const characterMap = getCharacterMapProxy(characterMapData, glyphMap);

    characterMap[32] = "space";
    characterMap[34] = "double";
    expect(characterMapData).to.deep.equal({ 32: "space", 33: "double", 34: "double" });
    expect(glyphMap).to.deep.equal({ space: [32], double: [33, 34] });
  });

  it("getCharacterMapProxy delete items", () => {
    const characterMapData = { 32: "space", 33: "double", 34: "double" };
    const glyphMap = makeGlyphMapFromCharacterMap(characterMapData);
    const characterMap = getCharacterMapProxy(characterMapData, glyphMap);

    delete characterMap[32];
    expect(characterMapData).to.deep.equal({ 33: "double", 34: "double" });
    expect(glyphMap).to.deep.equal({ double: [33, 34] });

    delete characterMap[33];
    expect(characterMapData).to.deep.equal({ 34: "double" });
    expect(glyphMap).to.deep.equal({ double: [34] });

    delete characterMap[34];
    expect(characterMapData).to.deep.equal({});
    expect(glyphMap).to.deep.equal({});
  });

  it("getCharacterMapProxy add items, ensure sorted", () => {
    const characterMapData = {};
    const glyphMap = {};
    const characterMap = getCharacterMapProxy(characterMapData, glyphMap);

    characterMap[35] = "double";
    expect(glyphMap).to.deep.equal({ double: [35] });
    characterMap[33] = "double";
    expect(glyphMap).to.deep.equal({ double: [33, 35] });
    characterMap[34] = "double";
    expect(glyphMap).to.deep.equal({ double: [33, 34, 35] });
    expect(characterMapData).to.deep.equal({
      33: "double",
      34: "double",
      35: "double",
    });
  });
});
