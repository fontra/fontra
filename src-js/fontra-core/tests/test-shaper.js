import { expect } from "chai";

import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parametrize } from "./test-support.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { PUADispenser, applyKerning, getShaper } from "@fontra/core/shaper.js";

describe("shaper tests", () => {
  const testFontPath = join(
    dirname(__dirname),
    "..",
    "..",
    "test-py",
    "data",
    "mutatorsans",
    "MutatorSans.ttf"
  );

  const testInputString = "😻VABCÄS";

  const expectedGlyphs = [
    { g: 0, cl: 0, ax: 500, ay: 0, dx: 0, dy: 0, flags: 0, gn: ".notdef" },
    { g: 24, cl: 2, ax: 301, ay: 0, dx: 0, dy: 0, flags: 0, gn: "V" },
    { g: 1, cl: 3, ax: 396, ay: 0, dx: 0, dy: 0, flags: 0, gn: "A", flags: 1 },
    { g: 4, cl: 4, ax: 443, ay: 0, dx: 0, dy: 0, flags: 0, gn: "B" },
    { g: 5, cl: 5, ax: 499, ay: 0, dx: 0, dy: 0, flags: 0, gn: "C" },
    {
      g: 3,
      cl: 6,
      ax: 396,
      ay: 0,
      dx: 0,
      dy: 0,
      flags: 0,
      gn: "Adieresis",
    },
    {
      g: 21,
      cl: 7,
      ax: 393,
      ay: 0,
      dx: 0,
      dy: 0,
      flags: 0,
      gn: "S",
    },
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

  it("test HBShaper", async () => {
    const fontData = new Uint8Array(fs.readFileSync(testFontPath));
    const shaper = await getShaper(fontData, {
      nominalGlyphFunc,
      useMetricsHooks: true,
    });
    const glyphs = shaper.shape(
      testInputString,
      { wght: 0, wdth: 0 },
      "-kern,-rvrn",
      glyphObjects
    );
    applyKerning(glyphs, (g1, g2) => kerning.getGlyphPairValue(g1, g2));

    expect(glyphs).to.deep.equal(expectedGlyphs);
  });

  it("test HBShaper getFeatureTags", async () => {
    const fontData = new Uint8Array(fs.readFileSync(testFontPath));
    const shaper = await getShaper(fontData);
    expect(shaper.getFeatureTags("GSUB")).to.deep.equal(["rvrn"]);
    expect(shaper.getFeatureTags("GPOS")).to.deep.equal(["kern"]);
  });

  it("test DumbShaper", async () => {
    const shaper = await getShaper(null, {
      nominalGlyphFunc,
    });
    const glyphs = shaper.shape(
      testInputString,
      { wght: 0, wdth: 0 },
      "kern",
      glyphObjects
    );
    applyKerning(glyphs, (g1, g2) => kerning.getGlyphPairValue(g1, g2));

    expect(glyphs).to.deep.equal(removeGIDs(expectedGlyphs));
  });

  const puaTestData = [
    {
      inputGlyphNames: ["a", "b", "c"],
      expectedCodePoints: [0xe000, 0xe001, 0xe002],
      nominalGlyphFunc: (codePoint) => null,
    },
    {
      inputGlyphNames: ["a", "b", "a"],
      expectedCodePoints: [0xe000, 0xe001, 0xe000],
      nominalGlyphFunc: (codePoint) => null,
    },
    {
      inputGlyphNames: ["a", "b", "a"],
      expectedCodePoints: [0xf0000, 0xf0001, 0xf0000],
      nominalGlyphFunc: (codePoint) => (codePoint < 0xf0000 ? "x" : null),
    },
    {
      inputGlyphNames: ["a", "b", "a"],
      expectedCodePoints: [0xf5000, 0xf5001, 0xf5000],
      nominalGlyphFunc: (codePoint) => (codePoint < 0xf5000 ? "x" : null),
    },
    {
      inputGlyphNames: ["a", "b", "a"],
      expectedCodePoints: [0x100500, 0x100501, 0x100500],
      nominalGlyphFunc: (codePoint) => (codePoint < 0x100500 ? "x" : null),
    },
  ];

  parametrize(
    "test PUADispenser",
    puaTestData,
    ({ inputGlyphNames, expectedCodePoints, nominalGlyphFunc }) => {
      const m = new PUADispenser(nominalGlyphFunc);
      const codePoints = inputGlyphNames.map((glyphName) =>
        m.addGlyphName(glyphName).codePointAt(0)
      );
      expect(codePoints).to.deep.equal(expectedCodePoints);

      const glyphNames = codePoints.map((codePoint) => m.nominalGlyph(codePoint));
      expect(glyphNames).to.deep.equal(inputGlyphNames);
    }
  );
});

function removeGIDs(glyphs) {
  return glyphs.map((glyph) => {
    glyph = { ...glyph };
    delete glyph.g;
    return glyph;
  });
}

function ord(s) {
  return s.codePointAt(0);
}
