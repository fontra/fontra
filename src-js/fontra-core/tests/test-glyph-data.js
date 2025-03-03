import { expect } from "chai";
import { parametrize } from "./test-support.js";

import {
  getCodePointFromGlyphName,
  getSuggestedGlyphName,
} from "@fontra/core/glyph-data.js";

describe("glyph-data Tests", () => {
  const getSuggestedGlyphName_testData = [
    { codePoint: "A".codePointAt(0), glyphName: "A" },
    { codePoint: "Å".codePointAt(0), glyphName: "Aring" },
    { codePoint: "$".codePointAt(0), glyphName: "dollar" },
    { codePoint: "א".codePointAt(0), glyphName: "alef-hb" },
    { codePoint: "갏".codePointAt(0), glyphName: "galh-ko" },
    { codePoint: "㕍".codePointAt(0), glyphName: "uni354D" },
    { codePoint: 0x12345, glyphName: "u12345" },
  ];

  parametrize("getSuggestedGlyphName", getSuggestedGlyphName_testData, (testItem) => {
    const glyphName = getSuggestedGlyphName(testItem.codePoint);
    expect(glyphName).to.equal(testItem.glyphName);
  });

  const getCodePointFromGlyphName_testData = [
    { glyphName: "A", codePoint: "A".codePointAt(0) },
    { glyphName: "Aring", codePoint: "Å".codePointAt(0) },
    { glyphName: "dollar", codePoint: "$".codePointAt(0) },
    { glyphName: "alef-hb", codePoint: "א".codePointAt(0) },
    { glyphName: "galh-ko", codePoint: "갏".codePointAt(0) },
    { glyphName: "uni354D", codePoint: "㕍".codePointAt(0) },
    { glyphName: "uni354d", codePoint: null },
    { glyphName: "uni354", codePoint: null },
    { glyphName: "uni354X", codePoint: null },
    { glyphName: "uni12345", codePoint: 0x12345 },
    { glyphName: "uni123456", codePoint: null },
    { glyphName: "u12345", codePoint: 0x12345 },
    { glyphName: "u1234", codePoint: null },
    { glyphName: "u123456", codePoint: null },
    { glyphName: "universe", codePoint: null },
    { glyphName: "ugly", codePoint: null },
    { glyphName: "blahblah", codePoint: null },
    { glyphName: "u10FFFF", codePoint: 0x10ffff },
    { glyphName: "u10FFFX", codePoint: null },
    { glyphName: "u10ffff", codePoint: null },
    { glyphName: "u110000", codePoint: null },
    { glyphName: ".notdef", codePoint: null },
    { glyphName: ".null", codePoint: null },
    { glyphName: "h.ss01", codePoint: null },
  ];

  parametrize(
    "getCodePointFromGlyphName",
    getCodePointFromGlyphName_testData,
    (testItem) => {
      const codePoint = getCodePointFromGlyphName(testItem.glyphName);
      expect(codePoint).to.equal(testItem.codePoint);
    }
  );
});
