import harfbuzz from "harfbuzzjs";

let hb;

export async function getShaper(fontData) {
  let shaper;

  if (fontData) {
    hb = await harfbuzz;
    shaper = new HBShaper(hb, fontData);
  } else {
    return new DumbShaper();
  }

  return shaper;
}

class HBShaper {
  constructor(hb, fontData) {
    this.hb = hb;
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
}
