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

export const MAX_UNICODE = 0x0110000;

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
    let glyphID = this.glyphNameToID[glyphName];
    if (glyphID === undefined) {
      glyphID = this.glyphOrder.length;
      this.glyphOrder.push(glyphName);
      this.glyphNameToID[glyphName] = glyphID;
    }
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
      glyph.gn = this.glyphOrder[glyph.g];
    }

    return glyphs;
  }

  _getNominalGlyph(font, codePoint) {
    const glyphName = this.nominalGlyph(codePoint);
    return glyphName ? this.glyphNameToID[glyphName] ?? 0 : 0;
  }

  _getHAdvanceFunc(font, glyphID) {
    const glyphName = this.glyphOrder[glyphID];
    return this._glyphObjects[glyphName]?.xAdvance ?? 500;
  }

  getFeatureInfo(otTableTag) {
    const tags = this.face.getTableFeatureTags(otTableTag);
    const info = {};

    for (const [featureIndex, tag] of enumerate(tags)) {
      if (tag in info) {
        continue;
      }
      const nameIds = this.face.getFeatureNameIds(otTableTag, featureIndex);
      info[tag] = nameIds?.uiLabelNameId
        ? { uiLabelName: this.face.getName(nameIds.uiLabelNameId, "en") }
        : {};
    }

    return info;
  }

  getScriptAndLanguageInfo() {
    const results = [];

    for (const otTableTag of ["GSUB", "GPOS"]) {
      const tableResults = {};
      this.face.getTableScriptTags(otTableTag).forEach((script, scriptIndex) => {
        tableResults[script] = [];
        this.face.getScriptLanguageTags(otTableTag, scriptIndex).forEach((language) => {
          tableResults[script].push(language);
        });
      });

      results.push(tableResults);
    }

    // Merge GSUB and GPOS
    const result = results[0];

    for (const [script, languages] of Object.entries(results[1])) {
      if (results[script]) {
        languages.forEach((language) => {
          if (!result[script].includes(language)) {
            result[script].push(language);
          }
        });
      } else {
        results[script] = languages;
      }
      results[script].sort();
    }

    Object.values(result).forEach((languages) => languages.unshift("dflt"));

    return result;
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
        g: glyphName ? this.glyphNameToID[glyphName] : 0,
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

  getFeatureInfo(otTableTag) {
    return {};
  }

  getScriptAndLanguageInfo() {
    return {};
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
