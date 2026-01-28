import { expect } from "chai";

import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parametrize } from "./test-support.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { applyKerning, getShaper } from "@fontra/core/shaper.js";

describe("shaper tests", () => {
  const testDataDir = join(dirname(__dirname), "..", "..", "test-py", "data");
  const mutatorSansPath = join(testDataDir, "mutatorsans", "MutatorSans.ttf");
  const notoSansPath = join(testDataDir, "noto", "NotoSans-Regular.otf");

  const testInputCodePoints = [..."😻VABCÄS"].map((c) => ord(c));

  const expectedGlyphs = [
    { g: 0, cl: 0, ax: 500, ay: 0, dx: 0, dy: 0, flags: 0, gn: ".notdef" },
    { g: 24, cl: 1, ax: 301, ay: 0, dx: 0, dy: 0, flags: 0, gn: "V" },
    { g: 1, cl: 2, ax: 396, ay: 0, dx: 0, dy: 0, flags: 0, gn: "A", flags: 1 },
    { g: 4, cl: 3, ax: 443, ay: 0, dx: 0, dy: 0, flags: 0, gn: "B" },
    { g: 5, cl: 4, ax: 499, ay: 0, dx: 0, dy: 0, flags: 0, gn: "C" },
    {
      g: 3,
      cl: 5,
      ax: 396,
      ay: 0,
      dx: 0,
      dy: 0,
      flags: 0,
      gn: "Adieresis",
    },
    {
      g: 21,
      cl: 6,
      ax: 393,
      ay: 0,
      dx: 0,
      dy: 0,
      flags: 0,
      gn: "S",
    },
  ];

  const glyphOrder = [
    ".notdef",
    "A",
    "Aacute",
    "Adieresis",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
    "S.closed",
    "I.narrow",
    "J.narrow",
    "quotesinglbase",
    "quotedblbase",
    "quotedblleft",
    "quotedblright",
    "comma",
    "period",
    "colon",
    "semicolon",
    "arrowleft",
    "arrowup",
    "arrowright",
    "arrowdown",
    "dot",
    "dieresis",
    "acute",
    "space",
    "IJ",
    "em",
    "tenttest",
  ];

  const characterMap = {
    [ord("A")]: "A",
    [ord("Ä")]: "Adieresis",
    [ord("B")]: "B",
    [ord("C")]: "C",
    [ord("S")]: "S",
    [ord("V")]: "V",
  };

  const nominalGlyphFunc = (codePoint) => characterMap[codePoint];

  const glyphObjects = {
    A: { xAdvance: 396 },
    Adieresis: { xAdvance: 396 },
    B: { xAdvance: 443 },
    C: { xAdvance: 499 },
    S: { xAdvance: 393 },
    V: { xAdvance: 401 }, // one more than in the font, to test metrics hooks
  };

  const kerningData = { V: { A: -100 } };
  const kerning = { getGlyphPairValue: (g1, g2) => kerningData[g1]?.[g2] ?? 0 };

  it("test HBShaper", () => {
    const fontData = new Uint8Array(fs.readFileSync(mutatorSansPath));
    const shaper = getShaper(fontData, nominalGlyphFunc, glyphOrder);
    const glyphs = shaper.shape(
      testInputCodePoints,
      { wght: 0, wdth: 0 },
      "-kern,-rvrn",
      glyphObjects
    );
    applyKerning(glyphs, (g1, g2) => kerning.getGlyphPairValue(g1, g2));

    expect(glyphs).to.deep.equal(expectedGlyphs);
  });

  it("test HBShaper getFeatureInfo", () => {
    const expectedGSUBInfo = {
      aalt: {},
      c2sc: {},
      case: {},
      ccmp: {},
      dnom: {},
      frac: {},
      liga: {},
      lnum: {},
      locl: {},
      numr: {},
      onum: {},
      ordn: {},
      pnum: {},
      rtlm: {},
      salt: {},
      sinf: {},
      smcp: {},
      ss03: { uiLabelName: "florin symbol" },
      ss04: {
        uiLabelName: "Titling Alternates I and J for titling and all cap settings",
      },
      ss06: { uiLabelName: "Accented Greek SC" },
      ss07: { uiLabelName: "iota adscript" },
      subs: {},
      sups: {},
      tnum: {},
      zero: {},
    };

    const expectedGPOSInfo = { kern: {}, mark: {}, mkmk: {} };

    const fontData = new Uint8Array(fs.readFileSync(notoSansPath));
    const shaper = getShaper(fontData, nominalGlyphFunc, glyphOrder);

    expect(shaper.getFeatureInfo("GSUB")).to.deep.equal(expectedGSUBInfo);
    expect(shaper.getFeatureInfo("GPOS")).to.deep.equal(expectedGPOSInfo);
  });

  it("test DumbShaper", () => {
    const shaper = getShaper(null, nominalGlyphFunc, glyphOrder);
    const glyphs = shaper.shape(
      testInputCodePoints,
      { wght: 0, wdth: 0 },
      "kern",
      glyphObjects
    );
    applyKerning(glyphs, (g1, g2) => kerning.getGlyphPairValue(g1, g2));

    expect(glyphs).to.deep.equal(expectedGlyphs);
  });

  it("test getGlyphNameCodePoint", () => {
    const inputGlyphNames = ["A", "B", "C"];
    const expectedCodePoints = [0x110001, 0x110004, 0x110005];

    const shaper = getShaper(null, nominalGlyphFunc, glyphOrder);

    const codePoints = inputGlyphNames.map((glyphName) =>
      shaper.getGlyphNameCodePoint(glyphName)
    );
    expect(codePoints).to.deep.equal(expectedCodePoints);

    const glyphNames = codePoints.map((codePoint) => shaper.nominalGlyph(codePoint));
    expect(glyphNames).to.deep.equal(inputGlyphNames);

    const glyphs = shaper.shape(codePoints, null, null, glyphObjects);
    const glyphNames2 = glyphs.map((g) => g.gn);
    expect(glyphNames2).to.deep.equal(inputGlyphNames);
  });
});

function ord(s) {
  return s.codePointAt(0);
}
