import hbPromise from "harfbuzzjs";
import { assert, enumerate, range } from "./utils.js";

const hb = await hbPromise;

export function getShaper(fontData, nominalGlyphFunc, glyphOrder) {
  let shaper;

  if (fontData) {
    shaper = new HBShaper(fontData, nominalGlyphFunc, glyphOrder);
  } else {
    return new DumbShaper(nominalGlyphFunc, glyphOrder);
  }

  return shaper;
}

const MAX_UNICODE = 0x0110000;

class ShaperBase {
  constructor(nominalGlyphFunc, glyphOrder) {
    this._baseNominalGlyphFunc = nominalGlyphFunc;
    this.glyphOrder = glyphOrder;
    this.glyphNameToID = {};
    for (const [i, glyphName] of enumerate(glyphOrder)) {
      this.glyphNameToID[glyphName] = i;
    }
    this.nominalGlyph = (codePoint) =>
      codePoint >= MAX_UNICODE
        ? this.glyphOrder[codePoint - MAX_UNICODE]
        : this._baseNominalGlyphFunc(codePoint);
  }

  getGlyphNameCodePoint(glyphName) {
    const glyphID = this.glyphNameToID[glyphName];
    assert(glyphID != undefined);
    return glyphID + MAX_UNICODE;
  }
}

class HBShaper extends ShaperBase {
  constructor(fontData, nominalGlyphFunc, glyphOrder) {
    super(nominalGlyphFunc, glyphOrder);
    this.blob = hb.createBlob(fontData);
    this.face = hb.createFace(this.blob, 0);
    this.font = hb.createFont(this.face);

    this.fontFuncs = hb.createFontFuncs();

    this.fontFuncs.setNominalGlyphFunc((font, codePoint) =>
      this._getNominalGlyph(font, codePoint)
    );

    this.fontFuncs.setGlyphHAdvanceFunc((font, glyphID) =>
      this._getHAdvanceFunc(font, glyphID)
    );

    const subFont = this.font.subFont();
    subFont.setFuncs(this.fontFuncs);
    this.font.destroy();
    this.font = subFont;
  }

  shape(codePoints, variations, features, glyphObjects) {
    const buffer = hb.createBuffer();
    buffer.addCodePoints(codePoints);
    buffer.guessSegmentProperties(); // Set script, language and direction

    this.font.setVariations(variations || {});

    this._glyphObjects = glyphObjects;

    hb.shape(this.font, buffer, features);

    delete this._glyphObjects;

    const glyphs = buffer.json();
    buffer.destroy();

    for (const glyph of glyphs) {
      glyph.gn = this.font.glyphName(glyph.g);
    }

    return glyphs;
  }

  _getNominalGlyph(font, codePoint) {
    const glyphName = this.nominalGlyph(codePoint);
    return glyphName ? this.font.glyphFromName(glyphName) : 0;
  }

  _getHAdvanceFunc(font, glyphID) {
    const glyphName = this.font.glyphName(glyphID);
    return this._glyphObjects[glyphName]?.xAdvance ?? 500;
  }

  getFeatureTags(otTableTag) {
    const features = new Set();
    const numScripts = this.face.getTableScriptTags(otTableTag).length;

    for (const scriptIndex of range(numScripts)) {
      const numLanguages = this.face.getScriptLanguageTags(
        otTableTag,
        scriptIndex
      ).length;
      const langIdices = [...range(numLanguages), 0xffff];
      for (const langIndex of [...range(numLanguages), 0xffff]) {
        this.face
          .getLanguageFeatureTags(otTableTag, 0, 0xffff)
          .forEach((tag) => features.add(tag));
      }
    }

    return [...features].sort();
  }

  close() {
    this.font.destroy();
    this.face.destroy();
    this.blob.destroy();
  }
}

class DumbShaper extends ShaperBase {
  constructor(nominalGlyphFunc, glyphOrder) {
    super(nominalGlyphFunc, glyphOrder);
  }

  shape(codePoints, variations, features, glyphObjects) {
    const glyphs = [];

    for (const [i, codePoint] of enumerate(codePoints)) {
      const glyphName = this.nominalGlyph(codePoint);

      const xAdvance = glyphObjects[glyphName]?.xAdvance ?? 500;

      glyphs.push({
        g: glyphName ? -1 : 0,
        cl: i, // cluster
        gn: glyphName ?? ".notdef",
        ax: xAdvance,
        ay: 0,
        dx: 0,
        dy: 0,
        flags: 0,
      });
    }

    return glyphs;
  }

  getFeatureTags(otTableTag) {
    return [];
  }

  close() {
    // noop
  }
}

export function applyKerning(glyphs, pairFunc) {
  for (let i = 1; i < glyphs.length; i++) {
    const kernValue = pairFunc(glyphs[i - 1].gn, glyphs[i].gn);
    if (kernValue) {
      glyphs[i - 1].ax += kernValue;
      glyphs[i].flags |= 1;
    }
  }
}
