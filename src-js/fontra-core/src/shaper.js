import harfbuzz from "harfbuzzjs";

let hb;

export async function getShaper(fontData) {
  hb = await harfbuzz;
  const shaper = new HBShaper(hb, fontData);
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
