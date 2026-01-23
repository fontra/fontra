import hbPromise from "harfbuzzjs";
import { range } from "./utils.js";

const hb = await hbPromise;

export function getShaper(fontData, options) {
  let shaper;

  if (fontData) {
    shaper = new HBShaper(fontData, options);
  } else {
    return new DumbShaper();
  }

  return shaper;
}

class HBShaper {
  constructor(fontData, options) {
    this.blob = hb.createBlob(fontData);
    this.face = hb.createFace(this.blob, 0);
    this.font = hb.createFont(this.face);

    if (options?.useCharacterMapHook || options?.useMetricsHooks) {
      this.fontFuncs = hb.createFontFuncs();
      if (options.useCharacterMapHook) {
        this.fontFuncs.setNominalGlyphFunc((font, codePoint) =>
          this._getNominalGlyph(font, codePoint)
        );
      }
      const subFont = this.font.subFont();
      subFont.setFuncs(this.fontFuncs);
      this.font.destroy();
      this.font = subFont;
    }
  }

  shape(text, variations, features, characterMap, glyphObjects, kerning) {
    const buffer = hb.createBuffer();
    buffer.addText(text);
    buffer.guessSegmentProperties(); // Set script, language and direction

    this.font.setVariations(variations || {});

    this._characterMap = characterMap;

    hb.shape(this.font, buffer, features);

    delete this._characterMap;

    const output = buffer.json();
    buffer.destroy();

    for (const glyph of output) {
      glyph.gn = this.font.glyphName(glyph.g);
    }

    return output;
  }

  _getNominalGlyph(font, codePoint) {
    const glyphName = this._characterMap?.[codePoint];
    return glyphName ? this.font.glyphFromName(glyphName) : 0;
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
  shape(text, variations, features, characterMap, glyphObjects, kerning) {
    const output = [];

    let previousGlyphName = null;

    for (let i = 0; i < text.length; i++) {
      const codePoint = text.charCodeAt(i);
      if (codePoint >= 0x10000) {
        i++;
      }
      const glyphName = characterMap[codePoint] ?? ".notdef";

      const xAdvance = glyphObjects[glyphName]?.xAdvance ?? 500;

      output.push({
        cl: i, // cluster
        gn: glyphName,
        ax: xAdvance,
        ay: 0,
        dx: 0,
        dy: 0,
        flags: 0,
      });

      previousGlyphName = glyphName;
    }

    if (kerning) {
      applyKerning(output, kerning);
    }

    return output;
  }

  getFeatureTags(otTableTag) {
    return [];
  }

  close() {
    // noop
  }
}

function applyKerning(glyphs, kerning) {
  for (let i = 1; i < glyphs.length; i++) {
    const kernValue = kerning.getGlyphPairValue(glyphs[i - 1].gn, glyphs[i].gn);
    if (kernValue) {
      glyphs[i - 1].ax += kernValue;
      glyphs[i].flags |= 1;
    }
  }
}
