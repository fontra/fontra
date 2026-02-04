import { expect } from "chai";

import { deepCopyObject } from "@fontra/core/utils.js";
import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parametrize } from "./test-support.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import {
  applyCursiveAttachments,
  applyKerning,
  applyMarkPositioning,
  getShaper,
} from "@fontra/core/shaper.js";

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
    const glyphs = shaper.shape(testInputCodePoints, glyphObjects, {
      variations: { wght: 0, wdth: 0 },
      features: "-kern,-rvrn",
    });
    applyKerning(glyphs, (g1, g2) => kerning.getGlyphPairValue(g1, g2));

    expect(glyphs).to.deep.equal(expectedGlyphs);
  });

  it("test HBShaper RTL", () => {
    const fontData = new Uint8Array(fs.readFileSync(mutatorSansPath));
    const shaper = getShaper(fontData, nominalGlyphFunc, glyphOrder);
    const glyphs = shaper.shape(testInputCodePoints, glyphObjects, {
      direction: "rtl",
    });

    expect(glyphs.map((g) => g.gn)).to.deep.equal([
      "S.closed",
      "Adieresis",
      "C",
      "B",
      "A",
      "V",
      ".notdef",
    ]);
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

  it("test HBShaper getScriptAndLanguageInfo", () => {
    const fontData = new Uint8Array(fs.readFileSync(notoSansPath));
    const shaper = getShaper(fontData, nominalGlyphFunc, glyphOrder);

    const expectedScriptAndLanguageInfo = {
      DFLT: [],
      cyrl: ["MKD ", "SRB "],
      dev2: [],
      grek: [],
      latn: ["APPH", "CAT ", "IPPH", "MAH ", "MOL ", "NAV ", "ROM "],
    };

    expect(shaper.getScriptAndLanguageInfo()).to.deep.equal(
      expectedScriptAndLanguageInfo
    );
  });

  it("test DumbShaper", () => {
    const shaper = getShaper(null, nominalGlyphFunc, glyphOrder);
    const glyphs = shaper.shape(testInputCodePoints, glyphObjects, {
      variations: { wght: 0, wdth: 0 },
      features: "kern",
    });
    applyKerning(glyphs, (g1, g2) => kerning.getGlyphPairValue(g1, g2));

    expect(glyphs).to.deep.equal(expectedGlyphs);
  });

  it("test DumbShaper RTL", () => {
    const shaper = getShaper(null, nominalGlyphFunc, glyphOrder);
    const glyphs = shaper.shape(testInputCodePoints, glyphObjects, {
      direction: "rtl",
    });

    expect(glyphs.map((g) => g.gn)).to.deep.equal([
      "S",
      "Adieresis",
      "C",
      "B",
      "A",
      "V",
      ".notdef",
    ]);
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

    const glyphs = shaper.shape(codePoints, glyphObjects, {});
    const glyphNames2 = glyphs.map((g) => g.gn);
    expect(glyphNames2).to.deep.equal(inputGlyphNames);
  });

  const cursiveGlyphObjects = {
    "A": { xAdvance: 500, propagatedAnchors: [{ name: "exit", x: 450, y: 300 }] },
    "B": {
      xAdvance: 500,
      propagatedAnchors: [
        { name: "entry", x: 25, y: 150 },
        { name: "exit", x: 450, y: 300 },
        { name: "exit", x: -100, y: -100 }, // duplicate, to be ignored
      ],
    },
    "C": { xAdvance: 500, propagatedAnchors: [{ name: "entry", x: 25, y: 150 }] },
    "alef-ar": { xAdvance: 500, propagatedAnchors: [{ name: "exit", x: 50, y: 300 }] },
    "beh-ar": {
      xAdvance: 500,
      propagatedAnchors: [
        { name: "entry", x: 475, y: 150 },
        { name: "exit", x: 50, y: 300 },
        { name: "exit", x: -100, y: -100 }, // duplicate, to be ignored
      ],
    },
    "teh-ar": { xAdvance: 500, propagatedAnchors: [{ name: "entry", x: 475, y: 150 }] },
  };

  const testDataCursiveAttachmentsLTR = [
    // LTR
    { inputGlyphs: [], expectedGlyphs: [], rightToLeft: false },
    {
      inputGlyphs: [
        { gn: "A", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "B", ax: 500, ay: 0, dx: 0, dy: 0 },
      ],
      expectedGlyphs: [
        { gn: "A", ax: 450, ay: 0, dx: 0, dy: 0 },
        { gn: "B", ax: 475, ay: 0, dx: -25, dy: 150 },
      ],
      rightToLeft: false,
    },
    {
      inputGlyphs: [
        { gn: "A", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "B", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "C", ax: 500, ay: 0, dx: 0, dy: 0 },
      ],
      expectedGlyphs: [
        { gn: "A", ax: 450, ay: 0, dx: 0, dy: 0 },
        { gn: "B", ax: 425, ay: 0, dx: -25, dy: 150 },
        { gn: "C", ax: 475, ay: 0, dx: -25, dy: 300 },
      ],
      rightToLeft: false,
    },
    {
      inputGlyphs: [
        { gn: "A", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "mark", ax: 0, ay: 0, dx: 0, dy: 0, mark: true },
        { gn: "B", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "C", ax: 500, ay: 0, dx: 0, dy: 0 },
      ],
      expectedGlyphs: [
        { gn: "A", ax: 450, ay: 0, dx: 0, dy: 0 },
        { gn: "mark", ax: 0, ay: 0, dx: 0, dy: 0, mark: true },
        { gn: "B", ax: 425, ay: 0, dx: -25, dy: 150 },
        { gn: "C", ax: 475, ay: 0, dx: -25, dy: 300 },
      ],
      rightToLeft: false,
    },
    // RTL
    {
      inputGlyphs: [
        { gn: "teh-ar", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "beh-ar", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "alef-ar", ax: 500, ay: 0, dx: 0, dy: 0 },
      ],
      expectedGlyphs: [
        { gn: "teh-ar", ax: 475, ay: 0, dx: 0, dy: 0 },
        { gn: "beh-ar", ax: 425, ay: 0, dx: -50, dy: -150 },
        { gn: "alef-ar", ax: 450, ay: 0, dx: -50, dy: -300 },
      ],
      rightToLeft: true,
    },
    // Wrong direction applied, nonsnese, output, but at least
    // ensure we don't get negative advances
    {
      inputGlyphs: [
        { gn: "alef-ar", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "beh-ar", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "teh-ar", ax: 500, ay: 0, dx: 0, dy: 0 },
      ],
      expectedGlyphs: [
        { gn: "alef-ar", ax: 50, ay: 0, dx: 0, dy: 0 },
        { gn: "beh-ar", ax: 0, ay: 0, dx: -475, dy: 150 },
        { gn: "teh-ar", ax: 25, ay: 0, dx: -475, dy: 300 },
      ],
      rightToLeft: false,
    },
  ];

  parametrize(
    "applyCursiveAttachments tests",
    testDataCursiveAttachmentsLTR,
    (testCase) => {
      const { inputGlyphs, expectedGlyphs, rightToLeft } = testCase;
      const outputGlyphs = deepCopyObject(inputGlyphs);

      applyCursiveAttachments(outputGlyphs, cursiveGlyphObjects, rightToLeft);

      expect(outputGlyphs).to.deep.equal(expectedGlyphs);
    }
  );

  const markGlyphObjects = {
    H: {
      xAdvance: 500,
      propagatedAnchors: [
        { name: "top", x: 250, y: 720 },
        { name: "bottom", x: 250, y: -20 },
      ],
    },
    dotaccentcomb: {
      xAdvance: 500,
      propagatedAnchors: [
        { name: "_top", x: 250, y: 730 },
        { name: "top", x: 250, y: 900 },
      ],
    },
    dotbelowcomb: {
      xAdvance: 500,
      propagatedAnchors: [
        { name: "_bottom", x: 250, y: -20 },
        { name: "bottom", x: 250, y: -190 },
      ],
    },
  };

  const testDataMarkPositioning = [
    { inputGlyphs: [], expectedGlyphs: [] },
    {
      inputGlyphs: [{ gn: "H", ax: 500, ay: 0, dx: 0, dy: 0 }],
      expectedGlyphs: [{ gn: "H", ax: 500, ay: 0, dx: 0, dy: 0 }],
    },
    {
      inputGlyphs: [
        { gn: "H", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: 0, dy: 0, mark: true },
        { gn: "H", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: 0, dy: 0, mark: true },
      ],
      expectedGlyphs: [
        { gn: "H", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: -500, dy: -10, mark: true },
        { gn: "H", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: -500, dy: -10, mark: true },
      ],
    },
    {
      inputGlyphs: [
        { gn: "H", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: 0, dy: 0, mark: true },
        { gn: "dotbelowcomb", ax: 0, ay: 0, dx: 0, dy: 0, mark: true },
      ],
      expectedGlyphs: [
        { gn: "H", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: -500, dy: -10, mark: true },
        { gn: "dotbelowcomb", ax: 0, ay: 0, dx: -500, dy: 0, mark: true },
      ],
    },
    {
      inputGlyphs: [
        { gn: "H", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: 0, dy: 0, mark: true },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: 0, dy: 0, mark: true },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: 0, dy: 0, mark: true },
      ],
      expectedGlyphs: [
        { gn: "H", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: -500, dy: -10, mark: true },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: -500, dy: 160, mark: true },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: -500, dy: 330, mark: true },
      ],
    },
    {
      inputGlyphs: [
        { gn: "H", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: 0, dy: 0, mark: true },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: 0, dy: 0, mark: true },
        { gn: "dotbelowcomb", ax: 0, ay: 0, dx: 0, dy: 0, mark: true },
        { gn: "dotbelowcomb", ax: 0, ay: 0, dx: 0, dy: 0, mark: true },
      ],
      expectedGlyphs: [
        { gn: "H", ax: 500, ay: 0, dx: 0, dy: 0 },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: -500, dy: -10, mark: true },
        { gn: "dotaccentcomb", ax: 0, ay: 0, dx: -500, dy: 160, mark: true },
        { gn: "dotbelowcomb", ax: 0, ay: 0, dx: -500, dy: 0, mark: true },
        { gn: "dotbelowcomb", ax: 0, ay: 0, dx: -500, dy: -170, mark: true },
      ],
    },
  ];

  parametrize("applyMarkPositioning tests", testDataMarkPositioning, (testCase) => {
    const { inputGlyphs, expectedGlyphs } = testCase;
    const outputGlyphs = deepCopyObject(inputGlyphs);

    applyMarkPositioning(outputGlyphs, markGlyphObjects);

    expect(outputGlyphs).to.deep.equal(expectedGlyphs);
  });
});

function ord(s) {
  return s.codePointAt(0);
}
