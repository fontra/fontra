import hbPromise from "harfbuzzjs";
import { range } from "./utils.js";

const hb = await hbPromise;

export function getShaper(fontData, nominalGlyphFunc) {
  let shaper;

  if (fontData) {
    shaper = new HBShaper(fontData, nominalGlyphFunc);
  } else {
    return new DumbShaper(nominalGlyphFunc);
  }

  return shaper;
}

class HBShaper {
  constructor(fontData, nominalGlyphFunc) {
    this.blob = hb.createBlob(fontData);
    this.face = hb.createFace(this.blob, 0);
    this.font = hb.createFont(this.face);
    this._nominalGlyphFunc = nominalGlyphFunc;

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

  shape(text, variations, features, glyphObjects) {
    const buffer = hb.createBuffer();
    buffer.addText(text);
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
    const glyphName = this._nominalGlyphFunc?.(codePoint);
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

class DumbShaper {
  constructor(nominalGlyphFunc) {
    this._nominalGlyphFunc = nominalGlyphFunc;
  }

  shape(text, variations, features, glyphObjects) {
    const glyphs = [];

    for (let i = 0; i < text.length; i++) {
      const codePoint = text.codePointAt(i);

      const glyphName = this._nominalGlyphFunc(codePoint) ?? ".notdef";

      const xAdvance = glyphObjects[glyphName]?.xAdvance ?? 500;

      glyphs.push({
        cl: i, // cluster
        gn: glyphName,
        ax: xAdvance,
        ay: 0,
        dx: 0,
        dy: 0,
        flags: 0,
      });

      if (codePoint >= 0x10000) {
        // UTF-16: this code point uses two two-byte chars
        i++;
      }
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

const PUA_BLOCKS = [
  [0xe000, 0xf8ff],
  [0xf0000, 0xffffd],
  [0x100000, 0x10fffd],
];

export class PUADispenser {
  // This class helps to assign arbitrary (but available) PUA code points for
  // unencoded glyphs, so we can use them in text we can feed the shaper.
  // This is because harfbuzzjs does not yet support hb_buffer_add_codepoints.
  // TODO: perhaps it is better to add support for hb_buffer_add_codepoints?

  constructor(nominalGlyphFunc) {
    this._baseNominalGlyphFunc = nominalGlyphFunc;
    this.puaCharacterMap = {};
    this.puaGlyphMapMap = {};
    this.nominalGlyph = (codePoint) =>
      this._baseNominalGlyphFunc(codePoint) ?? this.puaCharacterMap[codePoint];
    this._previousPUACodePoint = null;
  }

  getPUACharacter(glyphName) {
    // Return a PUA character

    if (glyphName in this.puaGlyphMapMap) {
      return this.puaGlyphMapMap[glyphName];
    }

    let codePoint = this._previousPUACodePoint ? this._previousPUACodePoint + 1 : 0;

    for (const [low, high] of PUA_BLOCKS) {
      if (codePoint < low) {
        codePoint = low;
      } else if (codePoint < low || codePoint > high) {
        continue;
      }

      while (this._baseNominalGlyphFunc(codePoint)) {
        codePoint++;
        if (codePoint > high) {
          continue;
        }
      }

      this._previousPUACodePoint = codePoint;
      this.puaCharacterMap[codePoint] = glyphName;

      const character = String.fromCodePoint(codePoint);
      this.puaGlyphMapMap[glyphName] = character;
      return character;
    }

    throw new Error("unable to find free PUA code point");
  }
}
