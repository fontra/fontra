import { expect } from "chai";

import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { applyKerning, getShaper } from "@fontra/core/shaper.js";

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
      nominalGlyphFunc: (codePoint) => characterMap[codePoint],
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
      nominalGlyphFunc: (codePoint) => characterMap[codePoint],
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
