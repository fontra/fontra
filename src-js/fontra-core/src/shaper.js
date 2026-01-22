import hbPromise from "harfbuzzjs";
import { range } from "./utils.js";

const hb = await hbPromise;

export function getShaper(fontData) {
  let shaper;

  if (fontData) {
    shaper = new HBShaper(hb, fontData);
  } else {
    return new DumbShaper();
  }

  return shaper;
}

class HBShaper {
  constructor(hb, fontData) {
    this.blob = hb.createBlob(fontData);
    this.face = hb.createFace(this.blob, 0);
    this.font = hb.createFont(this.face);
  }

  shape(text, variations = null, features = null) {
    const buffer = hb.createBuffer();
    buffer.addText(text);
    buffer.guessSegmentProperties(); // Set script, language and direction

    this.font.setVariations(variations || {});

    hb.shape(this.font, buffer, features);
    const output = buffer.json();
    buffer.destroy();

    for (const glyph of output) {
      glyph.gn = this.font.glyphName(glyph.g);
    }

    return output;
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
      const kernValue = kerning?.getGlyphPairValue(previousGlyphName, glyphName) ?? 0;

      if (kernValue) {
        output.at(-1).ax += kernValue;
      }

      output.push({
        cl: i, // cluster
        gn: glyphName,
        ax: xAdvance,
        ay: 0,
        dx: 0,
        dy: 0,
        flags: kernValue ? 1 : 0,
      });

      previousGlyphName = glyphName;
    }

    return output;
  }

  getFeatureTags(otTableTag) {
    return [];
  }
}
