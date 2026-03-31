import { assert, deepCopyObject } from "@fontra/core/utils.js";
import { expect } from "chai";
import { fileURLToPath } from "url";
import { NodePath } from "./node-path.js";
import { getFontController } from "./test-font-controller.js";
import { parametrize } from "./test-support.js";

import { buildShaperFont } from "build-shaper-font";

import { guessDirectionFromCodePoints } from "@fontra/core/glyph-data.js";
import { ObservableController } from "@fontra/core/observable-object.js";
import { ShaperController } from "@fontra/core/shaper-controller.js";
import {
  applyCursiveAttachments,
  applyKerning,
  applyMarkToBasePositioning,
  applyMarkToMarkPositioning,
  characterGlyphMapping,
  getShaper,
} from "@fontra/core/shaper.js";

const moduleDirName = new NodePath(fileURLToPath(import.meta.url)).parent;

describe("shaper tests", () => {
  const testDataDir = moduleDirName.parent.parent.parent.joinPath("test-py", "data");
  const mutatorSansPath = testDataDir.joinPath("mutatorsans", "MutatorSans.ttf");
  const notoSansPath = testDataDir.joinPath("noto", "NotoSans-Regular.otf");

  const testInputCodePoints = [..."😻VABCÄS"].map((c) => ord(c));

  function getExpectedGlyphs(useGlyphObjects) {
    return [
      {
        codepoint: 0,
        cluster: 0,
        x_advance: 500,
        y_advance: 0,
        x_offset: 0,
        y_offset: 0,
        glyphname: ".notdef",
        mark: false,
      },
      {
        codepoint: 24,
        cluster: 1,
        x_advance: useGlyphObjects ? 301 : 300,
        y_advance: 0,
        x_offset: 0,
        y_offset: 0,
        glyphname: "V",
        mark: false,
      },
      {
        codepoint: 1,
        cluster: 2,
        x_advance: 396,
        y_advance: 0,
        x_offset: 0,
        y_offset: 0,
        glyphname: "A",
        mark: false,
      },
      {
        codepoint: 4,
        cluster: 3,
        x_advance: 443,
        y_advance: 0,
        x_offset: 0,
        y_offset: 0,
        glyphname: "B",
        mark: false,
      },
      {
        codepoint: 5,
        cluster: 4,
        x_advance: 499,
        y_advance: 0,
        x_offset: 0,
        y_offset: 0,
        glyphname: "C",
        mark: false,
      },
      {
        codepoint: 3,
        cluster: 5,
        x_advance: 396,
        y_advance: 0,
        x_offset: 0,
        y_offset: 0,
        glyphname: "Adieresis",
        mark: false,
      },
      {
        codepoint: 21,
        cluster: 6,
        x_advance: 393,
        y_advance: 0,
        x_offset: 0,
        y_offset: 0,
        glyphname: "S",
        mark: false,
      },
    ];
  }

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
    "macroncomb",
  ];

  const characterMap = {
    [ord("A")]: "A",
    [ord("Ä")]: "Adieresis",
    [ord("B")]: "B",
    [ord("C")]: "C",
    [ord("H")]: "H",
    [ord("S")]: "S",
    [ord("V")]: "V",
    [0x0304]: "macroncomb",
    [0x0307]: "dotaccentcomb",
  };

  const markGlyphs = new Set(["macroncomb", "dotaccentcomb"]);

  const nominalGlyphFunc = (codePoint) => characterMap[codePoint];
  const isGlyphMarkFunc = (glyphName) => markGlyphs.has(glyphName);

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

  it("test HBShaper basic tests with funcs", () => {
    const fontData = mutatorSansPath.readBytesSync();
    const shaper = getShaper({
      fontData,
      nominalGlyphFunc,
      glyphOrder,
      isGlyphMarkFunc,
    });
    const { glyphs } = shaper.shape(testInputCodePoints, glyphObjects, {
      variations: { wght: 0, wdth: 0 },
      features: "kern,-rvrn",
    });

    expect(glyphs).to.deep.equal(getExpectedGlyphs(true));
  });

  it("test HBShaper basic tests without funcs", () => {
    const fontData = mutatorSansPath.readBytesSync();
    const shaper = getShaper({ fontData });
    const { glyphs } = shaper.shape(testInputCodePoints, null, {
      variations: { wght: 0, wdth: 0 },
      features: "kern,-rvrn",
    });

    expect(glyphs).to.deep.equal(getExpectedGlyphs(false));
  });

  it("test HBShaper RTL", () => {
    const fontData = mutatorSansPath.readBytesSync();
    const shaper = getShaper({
      fontData,
      nominalGlyphFunc,
      glyphOrder,
      isGlyphMarkFunc,
    });
    const { glyphs } = shaper.shape(testInputCodePoints, glyphObjects, {
      direction: "rtl",
    });

    expect(glyphs.map((g) => g.glyphname)).to.deep.equal([
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

    const fontData = notoSansPath.readBytesSync();
    const shaper = getShaper({
      fontData,
      nominalGlyphFunc,
      glyphOrder,
      isGlyphMarkFunc,
    });

    expect(shaper.getFeatureInfo("GSUB")).to.deep.equal(expectedGSUBInfo);
    expect(shaper.getFeatureInfo("GPOS")).to.deep.equal(expectedGPOSInfo);
  });

  it("test HBShaper getScriptAndLanguageInfo", () => {
    const fontData = notoSansPath.readBytesSync();
    const shaper = getShaper({
      fontData,
      nominalGlyphFunc,
      glyphOrder,
      isGlyphMarkFunc,
    });

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
    const shaper = getShaper({ nominalGlyphFunc, glyphOrder, isGlyphMarkFunc });
    const { glyphs } = shaper.shape(testInputCodePoints, glyphObjects, {
      variations: { wght: 0, wdth: 0 },
      features: "kern",
      kerningPairFunc: (g1, g2) => kerning.getGlyphPairValue(g1, g2),
    });

    expect(glyphs).to.deep.equal(getExpectedGlyphs(true));
  });

  it("test DumbShaper RTL", () => {
    const shaper = getShaper({ nominalGlyphFunc, glyphOrder, isGlyphMarkFunc });
    const { glyphs } = shaper.shape(testInputCodePoints, glyphObjects, {
      direction: "rtl",
    });

    expect(glyphs.map((g) => g.glyphname)).to.deep.equal([
      "S",
      "Adieresis",
      "C",
      "B",
      "A",
      "V",
      ".notdef",
    ]);
  });

  const testInputCodePointsKerningSkipMarks = [..."V\u0304A"].map((c) => ord(c));
  const expectedGlyphsKerningSkipMarks = [
    {
      codepoint: 24,
      cluster: 0,
      glyphname: "V",
      mark: false,
      x_advance: 301,
      y_advance: 0,
      x_offset: 0,
      y_offset: 0,
    },
    {
      codepoint: 51,
      cluster: 1,
      glyphname: "macroncomb",
      mark: true,
      x_advance: 0,
      y_advance: 0,
      x_offset: 0,
      y_offset: 0,
    },
    {
      codepoint: 1,
      cluster: 2,
      glyphname: "A",
      mark: false,
      x_advance: 396,
      y_advance: 0,
      x_offset: 0,
      y_offset: 0,
    },
  ];

  const defaultInsertMarkers = [
    { tag: "curs", lookupId: undefined },
    { tag: "kern", lookupId: undefined },
    { tag: "mark", lookupId: undefined },
    { tag: "mkmk", lookupId: undefined },
  ];

  it("test applyKerning skip marks", () => {
    const shaper = getShaper({
      nominalGlyphFunc,
      glyphOrder,
      isGlyphMarkFunc,
      insertMarkers: defaultInsertMarkers,
    });
    const { glyphs } = shaper.shape(testInputCodePointsKerningSkipMarks, glyphObjects, {
      kerningPairFunc: (g1, g2) => kerning.getGlyphPairValue(g1, g2),
    });

    expect(glyphs).to.deep.equal(expectedGlyphsKerningSkipMarks);
  });

  it("test getGlyphNameCodePoint", () => {
    const inputGlyphNames = ["A", "B", "C"];
    const expectedCodePoints = [0x110001, 0x110004, 0x110005];

    const shaper = getShaper({ nominalGlyphFunc, glyphOrder, isGlyphMarkFunc });

    const codePoints = inputGlyphNames.map((glyphName) =>
      shaper.getGlyphNameCodePoint(glyphName)
    );
    expect(codePoints).to.deep.equal(expectedCodePoints);

    const glyphNames = codePoints.map((codePoint) => shaper.nominalGlyph(codePoint));
    expect(glyphNames).to.deep.equal(inputGlyphNames);

    const { glyphs } = shaper.shape(codePoints, glyphObjects, {});
    const glyphNames2 = glyphs.map((g) => g.glyphname);
    expect(glyphNames2).to.deep.equal(inputGlyphNames);
  });

  const cursiveGlyphObjects = {
    "A": { xAdvance: 500, anchors: [{ name: "exit", x: 450, y: 300 }] },
    "B": {
      xAdvance: 500,
      anchors: [
        { name: "entry", x: 25, y: 150 },
        { name: "exit", x: 450, y: 300 },
        { name: "exit", x: -100, y: -100 }, // duplicate, to be ignored
      ],
    },
    "C": { xAdvance: 500, anchors: [{ name: "entry", x: 25, y: 150 }] },
    "alef-ar": { xAdvance: 500, anchors: [{ name: "exit", x: 50, y: 300 }] },
    "beh-ar": {
      xAdvance: 500,
      anchors: [
        { name: "entry", x: 475, y: 150 },
        { name: "exit", x: 50, y: 300 },
        { name: "exit", x: -100, y: -100 }, // duplicate, to be ignored
      ],
    },
    "teh-ar": { xAdvance: 500, anchors: [{ name: "entry", x: 475, y: 150 }] },
  };

  propagateAnchors(cursiveGlyphObjects);

  const testDataCursiveAttachmentsLTR = [
    // LTR
    { inputGlyphs: [], expectedGlyphs: [], rightToLeft: false },
    {
      inputGlyphs: [
        { glyphname: "A", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        { glyphname: "B", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
      ],
      expectedGlyphs: [
        { glyphname: "A", x_advance: 450, y_advance: 0, x_offset: 0, y_offset: 0 },
        { glyphname: "B", x_advance: 475, y_advance: 0, x_offset: -25, y_offset: 150 },
      ],
      rightToLeft: false,
    },
    {
      inputGlyphs: [
        { glyphname: "A", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        { glyphname: "B", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        { glyphname: "C", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
      ],
      expectedGlyphs: [
        { glyphname: "A", x_advance: 450, y_advance: 0, x_offset: 0, y_offset: 0 },
        { glyphname: "B", x_advance: 425, y_advance: 0, x_offset: -25, y_offset: 150 },
        { glyphname: "C", x_advance: 475, y_advance: 0, x_offset: -25, y_offset: 300 },
      ],
      rightToLeft: false,
    },
    {
      inputGlyphs: [
        { glyphname: "A", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "mark",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        { glyphname: "B", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        { glyphname: "C", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
      ],
      expectedGlyphs: [
        { glyphname: "A", x_advance: 450, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "mark",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        { glyphname: "B", x_advance: 425, y_advance: 0, x_offset: -25, y_offset: 150 },
        { glyphname: "C", x_advance: 475, y_advance: 0, x_offset: -25, y_offset: 300 },
      ],
      rightToLeft: false,
    },
    // RTL
    {
      inputGlyphs: [
        { glyphname: "teh-ar", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        { glyphname: "beh-ar", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "alef-ar",
          x_advance: 500,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
        },
      ],
      expectedGlyphs: [
        { glyphname: "teh-ar", x_advance: 475, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "beh-ar",
          x_advance: 425,
          y_advance: 0,
          x_offset: -50,
          y_offset: -150,
        },
        {
          glyphname: "alef-ar",
          x_advance: 450,
          y_advance: 0,
          x_offset: -50,
          y_offset: -300,
        },
      ],
      rightToLeft: true,
    },
    // Wrong direction applied, nonsnese, output, but at least
    // ensure we don't get negative advances
    {
      inputGlyphs: [
        {
          glyphname: "alef-ar",
          x_advance: 500,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
        },
        { glyphname: "beh-ar", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        { glyphname: "teh-ar", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
      ],
      expectedGlyphs: [
        { glyphname: "alef-ar", x_advance: 50, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "beh-ar",
          x_advance: 0,
          y_advance: 0,
          x_offset: -475,
          y_offset: 150,
        },
        {
          glyphname: "teh-ar",
          x_advance: 25,
          y_advance: 0,
          x_offset: -475,
          y_offset: 300,
        },
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
      anchors: [
        { name: "top", x: 250, y: 720 },
        { name: "bottom", x: 250, y: -20 },
      ],
    },
    H_H: {
      xAdvance: 800,
      anchors: [
        { name: "top_1", x: 250, y: 720 },
        { name: "top_2", x: 550, y: 720 },
      ],
    },
    dotaccentcomb: {
      xAdvance: 200,
      anchors: [
        { name: "_top", x: 100, y: 730 },
        { name: "top", x: 100, y: 900 },
      ],
    },
    dotbelowcomb: {
      xAdvance: 200,
      anchors: [
        { name: "_bottom", x: 100, y: -20 },
        { name: "bottom", x: 100, y: -190 },
      ],
    },
    macroncomb: {
      xAdvance: 350,
      anchors: [
        { name: "_top", x: 170, y: 734 },
        { name: "top", x: 170, y: 884 },
      ],
    },
  };

  propagateAnchors(markGlyphObjects);

  const testDataMarkPositioning = [
    { inputGlyphs: [], expectedGlyphs: [] },
    {
      inputGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
      ],
      expectedGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
      ],
    },
    {
      inputGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
      ],
      expectedGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: -10,
          mark: true,
        },
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: -10,
          mark: true,
        },
      ],
    },
    {
      inputGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotbelowcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
      ],
      expectedGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: -10,
          mark: true,
        },
        {
          glyphname: "dotbelowcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: 0,
          mark: true,
        },
      ],
    },
    {
      inputGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
      ],
      expectedGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: -10,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: 160,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: 330,
          mark: true,
        },
      ],
    },
    {
      inputGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotbelowcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotbelowcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
      ],
      expectedGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: -10,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: 160,
          mark: true,
        },
        {
          glyphname: "dotbelowcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotbelowcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: -170,
          mark: true,
        },
      ],
    },
    // RTL
    {
      inputGlyphs: [
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotbelowcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotbelowcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
      ],
      expectedGlyphs: [
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 150,
          y_offset: 160,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 150,
          y_offset: -10,
          mark: true,
        },
        {
          glyphname: "dotbelowcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 150,
          y_offset: -170,
          mark: true,
        },
        {
          glyphname: "dotbelowcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 150,
          y_offset: 0,
          mark: true,
        },
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
      ],
      rightToLeft: true,
    },
  ];

  parametrize("applyMarkPositioning tests", testDataMarkPositioning, (testCase) => {
    const { inputGlyphs, expectedGlyphs, rightToLeft } = testCase;
    const outputGlyphs = deepCopyObject(inputGlyphs);

    applyMarkToBasePositioning(outputGlyphs, markGlyphObjects, rightToLeft);
    applyMarkToMarkPositioning(outputGlyphs, markGlyphObjects, rightToLeft);

    expect(outputGlyphs).to.deep.equal(expectedGlyphs);
  });

  const testDataMarkToBasePositioning = [
    {
      inputGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotbelowcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
      ],
      expectedGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: -10,
          mark: true,
        },
        {
          glyphname: "dotbelowcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: 0,
          mark: true,
        },
      ],
    },
    {
      inputGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
      ],
      expectedGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: -10,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: -10,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: -10,
          mark: true,
        },
      ],
    },
  ];

  parametrize(
    "applyMarkToBasePositioning tests",
    testDataMarkToBasePositioning,
    (testCase) => {
      const { inputGlyphs, expectedGlyphs, rightToLeft } = testCase;
      const outputGlyphs = deepCopyObject(inputGlyphs);

      applyMarkToBasePositioning(outputGlyphs, markGlyphObjects, rightToLeft);

      expect(outputGlyphs).to.deep.equal(expectedGlyphs);
    }
  );

  const testDataMarkToMarkPositioning = [
    {
      inputGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotbelowcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
      ],
      expectedGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotbelowcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
      ],
    },
    {
      inputGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
      ],
      expectedGlyphs: [
        { glyphname: "H", x_advance: 500, y_advance: 0, x_offset: 0, y_offset: 0 },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 170,
          mark: true,
        },
        {
          glyphname: "dotaccentcomb",
          x_advance: 0,
          y_advance: 0,
          x_offset: 0,
          y_offset: 340,
          mark: true,
        },
      ],
    },
  ];

  parametrize(
    "applyMarkToMarkPositioning tests",
    testDataMarkToMarkPositioning,
    (testCase) => {
      const { inputGlyphs, expectedGlyphs, rightToLeft } = testCase;
      const outputGlyphs = deepCopyObject(inputGlyphs);

      applyMarkToMarkPositioning(outputGlyphs, markGlyphObjects, rightToLeft);

      expect(outputGlyphs).to.deep.equal(expectedGlyphs);
    }
  );

  const markToLigatureInputGlyphOrder = [".notdef", ...Object.keys(markGlyphObjects)];
  const markToLigatureGlyphClasses = {
    base: [],
    ligature: [],
    mark: ["macroncomb", "dotaccentcomb"],
    component: [],
  };
  const markToLigatureFeatureCode = `
languagesystem DFLT dflt;
languagesystem latn dflt;

feature liga {
  lookupflag IgnoreMarks;

  sub H H by H_H;
} liga;
  `;

  const { fontData, insertMarkers: markToLigatureInsertMarkers } = buildShaperFont(
    1000,
    markToLigatureInputGlyphOrder,
    markToLigatureFeatureCode,
    [],
    markToLigatureGlyphClasses
  );

  const testDataMarkToLigaturePositioning = [
    {
      inputCodePoints: [ord("H"), 0x0304, 0x0307, ord("H"), 0x0307, 0x0304],
      expectedOutputGlyphs: [
        {
          codepoint: 2,
          cluster: 0,
          x_advance: 800,
          y_advance: 0,
          x_offset: 0,
          y_offset: 0,
          glyphname: "H_H",
          mark: false,
        },
        {
          codepoint: 5,
          cluster: 0,
          x_advance: 0,
          y_advance: 0,
          x_offset: -720,
          y_offset: -14,
          glyphname: "macroncomb",
          mark: true,
        },
        {
          codepoint: 3,
          cluster: 0,
          x_advance: 0,
          y_advance: 0,
          x_offset: -650,
          y_offset: 140,
          glyphname: "dotaccentcomb",
          mark: true,
        },
        {
          codepoint: 3,
          cluster: 4,
          x_advance: 0,
          y_advance: 0,
          x_offset: -350,
          y_offset: -10,
          glyphname: "dotaccentcomb",
          mark: true,
        },
        {
          codepoint: 5,
          cluster: 5,
          x_advance: 0,
          y_advance: 0,
          x_offset: -420,
          y_offset: 156,
          glyphname: "macroncomb",
          mark: true,
        },
      ],
    },
  ];

  parametrize(
    "mark-to-ligature tests",
    testDataMarkToLigaturePositioning,
    (testCase) => {
      const shaper = getShaper({
        fontData,
        nominalGlyphFunc,
        glyphOrder: markToLigatureInputGlyphOrder,
        isGlyphMarkFunc,
        insertMarkers: markToLigatureInsertMarkers,
      });

      const { glyphs } = shaper.shape(testCase.inputCodePoints, markGlyphObjects, {});
      expect(glyphs).to.deep.equal(testCase.expectedOutputGlyphs);
    }
  );

  it("test glyph-classification-gdef-override", () => {
    const gdefFeatureCode = `
table GDEF {
  # At least one class needs to contain a glyph
  GlyphClassDef [H], [], [], []; # note: macroncomb is not in the "mark" class list
} GDEF;
  `;

    const { fontData, insertMarkers } = buildShaperFont(
      1000,
      markToLigatureInputGlyphOrder,
      gdefFeatureCode,
      [],
      markToLigatureGlyphClasses
    );

    expect(fontData).to.be.ok; // "truthy"

    const shaper = getShaper({
      fontData,
      nominalGlyphFunc,
      glyphOrder: markToLigatureInputGlyphOrder,
      isGlyphMarkFunc,
      insertMarkers,
    });

    const inputCodePoints = [ord("H"), 0x0304 /* macroncomb */];

    const expectedGlyphs = [
      {
        cluster: 0,
        codepoint: 1,
        glyphname: "H",
        mark: false,
        x_advance: 500,
        x_offset: 0,
        y_advance: 0,
        y_offset: 0,
      },
      {
        cluster: 1,
        codepoint: 5,
        glyphname: "macroncomb",
        mark: false,
        x_advance: 500,
        x_offset: 0,
        y_advance: 0,
        y_offset: 0,
      },
    ];

    const { glyphs } = shaper.shape(inputCodePoints, glyphObjects, {
      kerningPairFunc: (g1, g2) => kerning.getGlyphPairValue(g1, g2),
    });

    expect(glyphs).to.deep.equal(expectedGlyphs);
  });

  const clusterTestData = [
    { clusters: [], numChars: 0, expectedGlyphToChars: [], expectedCharToGlyphs: [] },
    {
      clusters: [0, 1, 2, 5, 6, 8],
      numChars: 10,
      expectedGlyphToChars: [[0], [1], [2, 3, 4], [5], [6, 7], [8, 9]],
      expectedCharToGlyphs: [[0], [1], [2], [2], [2], [3], [4], [4], [5], [5]],
    },
    {
      clusters: [0, 1],
      numChars: 3,
      expectedGlyphToChars: [[0], [1, 2]],
      expectedCharToGlyphs: [[0], [1], [1]],
    },
    {
      clusters: [0, 0, 1],
      numChars: 2,
      expectedGlyphToChars: [[0], [0], [1]],
      expectedCharToGlyphs: [[0, 1], [2]],
    },
    {
      clusters: [0, 0, 1, 1],
      numChars: 2,
      expectedGlyphToChars: [[0], [0], [1], [1]],
      expectedCharToGlyphs: [
        [0, 1],
        [2, 3],
      ],
    },
    {
      clusters: [0, 0, 2, 2],
      numChars: 3,
      expectedGlyphToChars: [[0, 1], [0, 1], [2], [2]],
      expectedCharToGlyphs: [
        [0, 1],
        [0, 1],
        [2, 3],
      ],
    },
    {
      clusters: [3, 2, 1, 0],
      numChars: 4,
      expectedGlyphToChars: [[3], [2], [1], [0]],
      expectedCharToGlyphs: [[3], [2], [1], [0]],
    },
    {
      clusters: [3, 2, 0, 1],
      numChars: 4,
      expectedGlyphToChars: [[3], [2], [0], [1]],
      expectedCharToGlyphs: [[2], [3], [1], [0]],
    },
    {
      clusters: [2, 0],
      numChars: 3,
      expectedGlyphToChars: [[2], [0, 1]],
      expectedCharToGlyphs: [[1], [1], [0]],
    },
    {
      clusters: [1, 0],
      numChars: 3,
      expectedGlyphToChars: [[1, 2], [0]],
      expectedCharToGlyphs: [[1], [0], [0]],
    },
    {
      clusters: [2, 2, 0, 0],
      numChars: 3,
      expectedGlyphToChars: [[2], [2], [0, 1], [0, 1]],
      expectedCharToGlyphs: [
        [2, 3],
        [2, 3],
        [0, 1],
      ],
    },
  ];

  parametrize(
    "characterGlyphMapping tests",
    clusterTestData,
    ({ clusters, numChars, expectedGlyphToChars, expectedCharToGlyphs }) => {
      const { glyphToChars, charToGlyphs } = characterGlyphMapping(clusters, numChars);
      expect(glyphToChars).to.deep.equal(expectedGlyphToChars);
      expect(charToGlyphs).to.deep.equal(expectedCharToGlyphs);
    }
  );
});

describe("shaper tests compare emulation with native", () => {
  const basicComparisonTests = {
    name: "basic",
    setupShapers: setupShapersFactory(
      moduleDirName.joinPath("data", "positioning-emulation")
    ),
    testData: [
      {
        input: "HH",
        expectedGlyphs: [
          {
            cluster: 0,
            x_advance: 800,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
            glyphname: "H_H",
            mark: false,
          },
        ],
      },
      {
        input: "ABC",
        expectedGlyphs: [
          {
            cluster: 0,
            x_advance: 450,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
            glyphname: "A",
            mark: false,
          },
          {
            cluster: 1,
            x_advance: 425,
            y_advance: 0,
            x_offset: -25,
            y_offset: 150,
            glyphname: "B",
            mark: false,
          },
          {
            cluster: 2,
            x_advance: 475,
            y_advance: 0,
            x_offset: -25,
            y_offset: 300,
            glyphname: "C",
            mark: false,
          },
        ],
      },
      {
        input: "Ḥ̄̇Ḥ̇̄",
        expectedGlyphs: [
          {
            cluster: 0,
            x_advance: 800,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
            glyphname: "H_H",
            mark: false,
          },
          {
            cluster: 0,
            x_advance: 0,
            y_advance: 0,
            x_offset: -650,
            y_offset: 0,
            glyphname: "dotbelowcomb",
            mark: true,
          },
          {
            cluster: 0,
            x_advance: 0,
            y_advance: 0,
            x_offset: -720,
            y_offset: -14,
            glyphname: "macroncomb",
            mark: true,
          },
          {
            cluster: 0,
            x_advance: 0,
            y_advance: 0,
            x_offset: -650,
            y_offset: 140,
            glyphname: "dotaccentcomb",
            mark: true,
          },
          {
            cluster: 5,
            x_advance: 0,
            y_advance: 0,
            x_offset: -350,
            y_offset: 0,
            glyphname: "dotbelowcomb",
            mark: true,
          },
          {
            cluster: 5,
            x_advance: 0,
            y_advance: 0,
            x_offset: -350,
            y_offset: -10,
            glyphname: "dotaccentcomb",
            mark: true,
          },
          {
            cluster: 7,
            x_advance: 0,
            y_advance: 0,
            x_offset: -420,
            y_offset: 156,
            glyphname: "macroncomb",
            mark: true,
          },
        ],
      },
      {
        input: "H̄",
        expectedGlyphs: [
          {
            cluster: 0,
            x_advance: 500,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
            glyphname: "H",
            mark: false,
          },
          {
            cluster: 1,
            x_advance: 0,
            y_advance: 0,
            x_offset: -420,
            y_offset: -14,
            glyphname: "macroncomb",
            mark: true,
          },
        ],
      },
      {
        input: "H̄",
        features: "ss03",
        expectedGlyphs: [
          {
            cluster: 0,
            x_advance: 500,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
            glyphname: "H",
            mark: false,
          },
          {
            cluster: 0,
            x_advance: 500,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
            glyphname: "A",
            mark: false,
          },
          {
            cluster: 1,
            x_advance: 0,
            y_advance: 0,
            x_offset: -920,
            y_offset: -14,
            glyphname: "macroncomb",
            mark: true,
          },
        ],
      },
    ],
  };

  const raqqComparisonTests = {
    name: "raqq",
    setupShapers: setupShapersFactory(moduleDirName.joinPath("data", "raqq")),
    testData: [
      {
        input: "ا",
        expectedGlyphs: [
          {
            cluster: 0,
            x_advance: 658,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
            glyphname: "alef-ar",
            mark: false,
          },
        ],
      },
      {
        // https://github.com/fontra/fontra/issues/2507
        input: "ن",
        expectedGlyphs: [
          {
            cluster: 0,
            x_advance: 0,
            y_advance: 0,
            x_offset: 5,
            y_offset: 191,
            glyphname: "dotabove-ar",
            mark: true,
          },
          {
            cluster: 0,
            x_advance: 295,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
            glyphname: "noonghunna-ar",
            mark: false,
          },
        ],
      },
      {
        // https://github.com/fontra/fontra/issues/2437
        input: "فَأنتَ",
        expectedGlyphs: [
          {
            cluster: 5,
            x_advance: 0,
            y_advance: 0,
            x_offset: 593,
            y_offset: 93,
            glyphname: "fatha-ar",
            mark: true,
          },
          {
            cluster: 4,
            x_advance: 0,
            y_advance: 0,
            x_offset: 803,
            y_offset: 264,
            glyphname: "twodotsverticalabove-ar",
            mark: true,
          },
          {
            cluster: 4,
            x_advance: 984,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
            glyphname: "behDotless-ar.fina",
            mark: false,
          },
          {
            cluster: 3,
            x_advance: 0,
            y_advance: 0,
            x_offset: -9,
            y_offset: 392,
            glyphname: "dotabove-ar.beh",
            mark: true,
          },
          {
            cluster: 3,
            x_advance: 0,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
            glyphname: "_c.seen.beh",
            mark: false,
          },
          {
            cluster: 3,
            x_advance: 130,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
            glyphname: "behDotless-ar.init.high",
            mark: false,
          },
          {
            cluster: 0,
            x_advance: 0,
            y_advance: 0,
            x_offset: 491,
            y_offset: 594,
            glyphname: "fatha-ar",
            mark: true,
          },
          {
            cluster: 0,
            x_advance: 0,
            y_advance: 0,
            x_offset: 673,
            y_offset: 432,
            glyphname: "fatha-ar",
            mark: true,
          },
          {
            cluster: 0,
            x_advance: 0,
            y_advance: 0,
            x_offset: 553,
            y_offset: 394,
            glyphname: "dotabove-ar",
            mark: true,
          },
          {
            cluster: 0,
            x_advance: 960,
            y_advance: 0,
            x_offset: 400,
            y_offset: 0,
            glyphname: "fehDotless_alef-ar",
            mark: false,
          },
        ],
      },
      {
        // https://github.com/fontra/fontra/issues/2521
        input: "قل",
        expectedGlyphs: [
          {
            cluster: 1,
            x_advance: 177,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
            glyphname: "lam-ar.fina",
            mark: false,
          },
          {
            cluster: 0,
            x_advance: 0,
            y_advance: 0,
            x_offset: -31,
            y_offset: 381,
            glyphname: "twodotsverticalabove-ar",
            mark: true,
          },
          {
            cluster: 0,
            x_advance: 174,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
            glyphname: "_c.feh.init.beh",
            mark: false,
          },
          {
            cluster: 0,
            x_advance: 220,
            y_advance: 0,
            x_offset: -114,
            y_offset: 0,
            glyphname: "fehDotless-ar.init",
            mark: false,
          },
        ],
      },
    ],
  };

  for (const { name, setupShapers, testData } of [
    basicComparisonTests,
    raqqComparisonTests,
  ]) {
    parametrize(`${name} emulation tests`, testData, async (testCase) => {
      const { nativeShapeFunc, emulatedShapeFunc } = await setupShapers();

      const testInputCodePoints = [...testCase.input].map((c) => ord(c));
      const direction = guessDirectionFromCodePoints(testInputCodePoints);

      const { glyphs: nativeGlyphs } = nativeShapeFunc(testInputCodePoints, {
        variations: testCase.variations,
        features: testCase.features,
        direction,
      });

      // console.log(JSON.stringify(stripGlyphIDs(nativeGlyphs)));

      expect(stripGlyphIDs(nativeGlyphs)).to.deep.equal(testCase.expectedGlyphs);

      const { glyphs: emulatedGlyphs } = await emulatedShapeFunc(testInputCodePoints, {
        variations: testCase.variations,
        features: testCase.features,
        direction,
      });

      expect(stripGlyphIDs(emulatedGlyphs)).to.deep.equal(testCase.expectedGlyphs);
    });
  }
});

function stripGlyphIDs(glyphs) {
  return glyphs.map((glyph) => {
    glyph = { ...glyph };
    delete glyph.codepoint;
    return glyph;
  });
}

function ord(s) {
  return s.codePointAt(0);
}

function propagateAnchors(glyphs) {
  for (const glyph of Object.values(glyphs)) {
    glyph.propagatedAnchors = glyph.anchors;
  }
}

async function getEmulatedShapeFuncForPath(path) {
  const fontController = await getFontController(path);
  const mockAppSettingsController = new ObservableController({});
  const shaperController = new ShaperController(
    fontController,
    mockAppSettingsController
  );

  const kerningController = await fontController.getKerningController("kern");
  const kerningInstance = kerningController.instantiate({});
  const kerningPairFunc = (leftGlyph, rightGlyph) =>
    kerningInstance.getGlyphPairValue(leftGlyph, rightGlyph);

  const { shaper } = await shaperController.getShaper(true);

  async function emulatedShapeFunc(codePoints, shaperOptions) {
    shaperOptions = { ...shaperOptions, kerningPairFunc };
    const glyphInstances = {};

    let { glyphs, requiredGlyphs } = shaper.shape(
      codePoints,
      glyphInstances,
      shaperOptions
    );

    for (const glyphName of requiredGlyphs) {
      if (!(glyphName in glyphInstances) && glyphName in fontController.glyphMap) {
        glyphInstances[glyphName] = await fontController.getGlyphInstance(
          glyphName,
          {}
        );
      }
    }

    ({ glyphs } = shaper.shape(codePoints, glyphInstances, shaperOptions));

    return { glyphs };
  }

  return emulatedShapeFunc;
}

function setupShapersFactory(path) {
  let testCase;

  async function setupFunc() {
    if (!testCase) {
      const ttfPath = await iterFirst(await path.glob("*.ttf"));
      const fontraPath = await iterFirst(await path.glob("*.fontra"));
      assert(ttfPath);
      assert(fontraPath);

      const fontData = ttfPath.readBytesSync();
      const nativeShaper = getShaper({ fontData });
      const nativeShapeFunc = (codePoints, options) =>
        nativeShaper.shape(codePoints, null, options);

      const emulatedShapeFunc = await getEmulatedShapeFuncForPath(fontraPath);

      testCase = { nativeShapeFunc, emulatedShapeFunc };
    }
    return testCase;
  }

  return setupFunc;
}

async function iterFirst(iterator) {
  for await (const item of iterator) {
    return item;
  }
  return undefined;
}
