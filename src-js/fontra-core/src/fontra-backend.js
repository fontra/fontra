import { assert, enumerate } from "./utils.js";

const fontDefaults = { unitsPerEm: 1000 };

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
    this.fontData = { ...fontDefaults, ...JSON.parse(await fontDataPath.readText()) };
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

  async getFontInfo() {
    return this.fontData.fontInfo;
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
    const kerningPath = this.path.joinpath(FontraBackend.kerningFileName);
    if (kerningPath.exists()) {
      return parseKerningData(await kerningPath.readText());
    } else {
      return {};
    }
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

function parseKerningData(kerningData) {
  const rows = parseCSVData(kerningData);

  const kerning = {};

  const rowIter = enumerate(rows, 1);

  while (true) {
    const kernType = kerningReadType(rowIter);
    if (!kernType) {
      break;
    }

    const groupsSide1 = kerningReadGroups(rowIter, "GROUPS1");
    const groupsSide2 = kerningReadGroups(rowIter, "GROUPS2");

    const [sourceIdentifiers, values] = kerningReadValues(rowIter);

    kerning[kernType] = {
      groupsSide1: groupsSide1,
      groupsSide2: groupsSide2,
      sourceIdentifiers: sourceIdentifiers,
      values: values,
    };
  }

  return kerning;
}

class KerningParseError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

function kerningReadType(rowIter) {
  let [lineNumber, row] = nextNonBlankRow(rowIter);
  if (lineNumber == undefined) {
    return null;
  }

  if (!row || row[0] != "TYPE") {
    throw new KerningParseError(`expected TYPE keyword (line ${lineNumber})`);
  }

  [lineNumber, row] = next(rowIter);

  if (!row || !row[0]) {
    throw new KerningParseError(`expected TYPE value string (line ${lineNumber})`);
  }

  return row[0];
}

function kerningReadGroups(rowIter, keyword) {
  let [lineNumber, row] = nextNonBlankRow(rowIter);
  if (!row || row[0] != keyword) {
    throw new KerningParseError(`expected {keyword} keyword (line ${lineNumber})`);
  }

  const groups = {};

  for ([lineNumber, row] of iterNoClose(rowIter)) {
    if (!row || !row[0]) {
      break;
    }
    groups[row[0]] = row.slice(1);
  }

  return groups;
}

function kerningReadValues(rowIter) {
  let [lineNumber, row] = nextNonBlankRow(rowIter);
  if (!row || row[0] != "VALUES") {
    throw new KerningParseError(`expected VALUES keyword (line ${lineNumber})`);
  }

  [lineNumber, row] = next(rowIter);
  if (!row || row.length < 3 || row[0] != "side1" || row[1] != "side2") {
    throw new KerningParseError(`"expected source identifier row (line ${lineNumber})`);
  }

  const sourceIdentifiers = row.slice(2);

  const values = {};

  for (const [lineNumber, row] of iterNoClose(rowIter)) {
    if (!row || !row[0]) {
      break;
    }
    if (row.length < 2) {
      throw new KerningParseError(`expected kern values (line ${lineNumber})`);
    }

    const left = row[0];
    const right = row[1];
    let rowValues;

    try {
      rowValues = row.slice(2).map((v) => (v ? parseFloat(v) : null));
    } catch (e) {
      throw new KerningParseError(`parse error: ${e} (line ${lineNumber})`);
    }

    if (!values[left]) {
      values[left] = {};
    }

    values[left][right] = rowValues;
  }

  return [sourceIdentifiers, values];
}

function nextNonBlankRow(rowIter) {
  for (const [lineNumber, row] of iterNoClose(rowIter)) {
    if (row && row[0]) {
      return [lineNumber, row];
    }
  }
  return [null, null];
}

class StopIterationError extends Error {}

function next(iterator) {
  const result = iterator.next();
  if (result.done) {
    throw new StopIterationError();
  }
  return result.value;
}

function* iterNoClose(iterator) {
  while (true) {
    const result = iterator.next();
    if (result.done) {
      break;
    }

    yield result.value;
  }
}
