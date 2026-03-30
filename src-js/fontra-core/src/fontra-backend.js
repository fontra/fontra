import { assert, enumerate } from "./utils.js";

export class FontraBackend {
  static glyphInfoFileName = "glyph-info.csv";
  static fontDataFileName = "font-data.json";
  static kerningFileName = "kerning.csv";
  static featureTextFileName = "features.txt";
  static glyphsDirName = "glyphs";
  static backgroundImagesDirName = "background-images";

  constructor(path) {
    this.path = path;
  }

  async initialize() {
    await this._readGlyphFileNames();
    await this._readGlyphInfo();
    await this._readFontData();
  }

  async _readGlyphFileNames() {
    this._glyphPaths = {};
    for await (const glyphPath of this.path
      .joinpath(FontraBackend.glyphsDirName)
      .glob("*.json")) {
      this._glyphPaths[fileNameToString(glyphPath.stem)] = glyphPath;
    }
  }

  async _readGlyphInfo() {
    this.glyphMap = {};
    this.glyphInfos = {};

    const glyphInfoPath = this.path.joinpath(FontraBackend.glyphInfoFileName);
    const rows = parseCSVData(await glyphInfoPath.readText());

    const header = rows.shift();
    assert(header[0] == "glyph name");
    assert(header[1] == "code points");
    const infoKeys = header.slice(2);

    for (const row of rows) {
      const [glyphName, codePointsString, ...rest] = row;

      this.glyphMap[glyphName] = codePointsString
        ? parseCodePoints(codePointsString)
        : [];

      if (infoKeys.length) {
        const info = readGlyphInfo(infoKeys, rest);
        if (info) {
          this.glyphInfos[glyphName] = info;
        }
      }
    }
  }

  async _readFontData() {
    const fontDataPath = this.path.joinpath(FontraBackend.fontDataFileName);
    this.fontData = JSON.parse(await fontDataPath.readText());
  }

  _getGlyphFilePath(self, glyphName) {
    return this.path.joinpath(
      FontraBackend.glyphsDirName,
      stringToFileName(glyphName) + ".json"
    );
  }

  async getGlyphMap() {
    return this.glyphMap;
  }

  async getAxes() {
    return this.fontData.axes;
  }

  async getSources() {
    return this.fontData.sources;
  }

  async getCustomData() {
    return this.fontData.customData;
  }

  async getUnitsPerEm() {
    return this.fontData.unitsPerEm;
  }

  async getKerning() {
    return {};
  }

  async getFeatures() {
    const featuresPath = this.path.joinpath(FontraBackend.featureTextFileName);
    if (featuresPath.exists()) {
      return { language: "fea", text: await featuresPath.readText() };
    } else {
      return {};
    }
  }

  async getGlyph(glyphName) {
    const glyphPath = this._glyphPaths[glyphName];
    return JSON.parse(await glyphPath.readText());
  }
}

function parseCSVData(data, delimiter = ";") {
  const rows = [];
  for (const line of data.split(/\r\n|\n|\r/)) {
    rows.push(line.split(delimiter));
  }
  return rows;
}

function parseCodePoints(cell) {
  const codePoints = [];
  cell = cell.trim();
  if (cell) {
    for (let s of cell.split(",")) {
      s = s.trim();
      assert(s.startsWith("U+"), s);
      s = s.slice(2);
      codePoints.push(parseInt(s, 16));
    }
  }
  return codePoints;
}

function readGlyphInfo(infoKeys, cells) {
  info = {};

  for (const [i, key] of enumerate(infoKeys)) {
    const cellValue = cells[i];
    if (cellValue) {
      let infoValue;
      try {
        infoValue = JSON.parse(cellValue);
      } catch (e) {
        infoValue = cellValue;
      }
      info[key] = infoValue;
    }
  }

  return info;
}

const separatorChar = "^";

function fileNameToString(fileName) {
  return decodeURIComponent(fileName.split(separatorChar, 1)[0]);
}
