export class LocalFontEngine {
  constructor(backend) {
    this.backend = backend;
  }

  async getGlyphMap() {
    return await this.backend.getGlyphMap();
  }

  async getAxes() {
    return await this.backend.getAxes();
  }

  async getSources() {
    return await this.backend.getSources();
  }

  async getUnitsPerEm() {
    return await this.backend.getUnitsPerEm();
  }

  async getCustomData() {
    return await this.backend.getCustomData();
  }

  async isReadOnly() {
    return true;
  }

  async getGlyph(glyphName) {
    return await this.backend.getGlyph(glyphName);
  }

  async getMetaInfo() {
    return {};
  }

  async getBackEndInfo() {
    return {};
  }
}
