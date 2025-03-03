import { assert, enumerate } from "./utils.js";

let glyphDataCSV;

if (typeof process !== "undefined") {
  // Node.js
  const fs = await import("fs");
  const { dirname, join } = await import("path");
  const { fileURLToPath } = await import("url");

  const path = join(
    dirname(dirname(fileURLToPath(import.meta.url))),
    "assets",
    "data",
    "glyph-data.csv"
  );
  glyphDataCSV = fs.readFileSync(path, "utf8");
} else {
  // Browser
  const response = await fetch("/data/glyph-data.csv");
  glyphDataCSV = await response.text();
}

glyphDataCSV = glyphDataCSV.replaceAll("\r\n", "\n");

let glyphData;
let glyphDataByName = new Map();
let glyphDataByCodePoint = new Map();

function parseGlyphDataCSV() {
  if (glyphData) {
    return;
  }
  const [license, data] = glyphDataCSV.split("\n\n");
  glyphData = [];
  const lines = data.split("\n");
  const header = lines.shift();

  const attributeNames = header.split(";");
  assert((attributeNames[0] = "unicode"));
  assert((attributeNames[1] = "name"));

  for (const line of lines) {
    if (!line) {
      // skip blank line
      continue;
    }
    const fields = line.split(";");

    const glyphInfo = {};
    for (const [i, attrName] of enumerate(attributeNames)) {
      const fieldValue = fields[i];
      if (fieldValue !== undefined && fieldValue !== "") {
        glyphInfo[attrName] =
          attrName === "unicode" ? parseInt(fieldValue, 16) : fieldValue;
      }
    }
    glyphData.push(glyphInfo);
    assert(glyphInfo.name);
    glyphDataByName.set(glyphInfo.name, glyphInfo);
    if (glyphInfo.unicode) {
      glyphDataByCodePoint.set(glyphInfo.unicode, glyphInfo);
    }
  }
}

export function getSuggestedGlyphName(codePoint) {
  parseGlyphDataCSV();

  const glyphInfo = glyphDataByCodePoint.get(codePoint);
  if (glyphInfo) {
    return glyphInfo.name;
  }

  return codePoint >= 0x10000
    ? `u${codePoint.toString(16).toUpperCase()}`
    : `uni${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function getCodePointFromGlyphName(glyphName) {
  parseGlyphDataCSV();

  const glyphInfo = glyphDataByName.get(glyphName);

  let codePoint = null;

  if (glyphInfo) {
    codePoint = glyphInfo.unicode || null;
  } else if (/^uni[A-F0-9]{4,5}$/.test(glyphName)) {
    const uniStr = glyphName.slice(3);
    codePoint = parseInt(uniStr, 16);
  } else if (/^u[A-F0-9]{5,6}$/.test(glyphName)) {
    const uniStr = glyphName.slice(1);
    codePoint = parseInt(uniStr, 16);
    if (codePoint > 0x10ffff) {
      codePoint = null;
    }
  }

  assert(!isNaN(codePoint));

  return codePoint;
}

export function getGlyphInfoFromCodePoint(codePoint) {
  parseGlyphDataCSV();
  return glyphDataByCodePoint.get(codePoint);
}

export function getGlyphInfoFromGlyphName(glyphName) {
  parseGlyphDataCSV();
  return glyphDataByName.get(glyphName);
}
