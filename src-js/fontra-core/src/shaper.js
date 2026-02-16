import hbPromise from "harfbuzzjs";
import { assert, enumerate, range, reversed } from "./utils.js";

const hb = await hbPromise;

export function getShaper(fontData, nominalGlyphFunc, glyphOrder, insertMarkers) {
  let shaper;

  if (fontData) {
    shaper = new HBShaper(fontData, nominalGlyphFunc, glyphOrder, insertMarkers);
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
  constructor(fontData, nominalGlyphFunc, glyphOrder, insertMarkers) {
    super(nominalGlyphFunc, glyphOrder);
    this.insertMarkers = insertMarkers;
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

  shape(codePoints, glyphObjects, options) {
    if (!codePoints.length) {
      return [];
    }
    const { variations, features, direction, script, language } = options;

    const buffer = hb.createBuffer();
    buffer.addCodePoints(codePoints);
    buffer.guessSegmentProperties(); // Set script, language and direction

    buffer.setClusterLevel(1); // HB_BUFFER_CLUSTER_LEVEL_MONOTONE_CHARACTERS
    if (direction) {
      buffer.setDirection(direction);
    }
    if (script) {
      buffer.setScript(hb.otTagToScript(script));
    }
    if (language) {
      buffer.setLanguage(hb.otTagToLanguage(language));
    }

    this.font.setVariations(variations || {});

    this._glyphObjects = glyphObjects;

    hb.shape(this.font, buffer, features);

    delete this._glyphObjects;

    const glyphs = this.getGlyphInfoFromBuffer(buffer);
    buffer.destroy();

    for (const glyph of glyphs) {
      glyph.gn = this.glyphOrder[glyph.g];
    }

    return glyphs;
  }

  getGlyphInfoFromBuffer(buffer) {
    return buffer.json().map((glyph) => {
      glyph.gn = this.glyphOrder[glyph.g];
      return glyph;
    });
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

  shape(codePoints, glyphObjects, options) {
    const { direction } = options;
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

    if (direction === "rtl") {
      glyphs.reverse();
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

export function applyCursiveAttachments(glyphs, glyphObjects, rightToLeft = false) {
  const [leftPrefix, rightPrefix] = rightToLeft ? ["exit", "entry"] : ["entry", "exit"];

  let previousGlyph;
  let previousXAdvance;
  let previousExitAnchors = {};

  for (const glyph of glyphs) {
    if (glyph.mark) {
      continue;
    }

    const glyphObject = glyphObjects[glyph.gn];
    if (!glyphObject) {
      previousExitAnchors = {};
      continue;
    }

    const entryAnchors = collectAnchors(glyphObject.propagatedAnchors, leftPrefix);

    for (const suffix of Object.keys(entryAnchors)) {
      const exitAnchor = previousExitAnchors[suffix];
      if (exitAnchor) {
        const entryAnchor = entryAnchors[suffix];

        // Horizontal adjustment
        previousGlyph.ax = Math.max(
          0,
          previousGlyph.ax + exitAnchor.x - previousXAdvance
        );
        glyph.ax = Math.max(0, glyph.ax - entryAnchor.x);
        glyph.dx -= entryAnchor.x;

        // Vertical adjustment
        glyph.dy = previousGlyph.dy + exitAnchor.y - entryAnchor.y;

        break;
      }
    }

    previousGlyph = glyph;
    previousXAdvance = glyphObject.xAdvance;
    previousExitAnchors = collectAnchors(glyphObject.propagatedAnchors, rightPrefix);
  }
}

export function applyMarkPositioning(glyphs, glyphObjects, rightToLeft = false) {
  let previousXAdvance;
  let baseAnchors = {};

  const ordered = rightToLeft ? reversed : (v) => v;

  for (const glyph of ordered(glyphs)) {
    const glyphObject = glyphObjects[glyph.gn];
    if (!glyphObject) {
      baseAnchors = {};
      continue;
    }

    if (glyph.mark) {
      const markBaseAnchors = collectAnchors(glyphObject.propagatedAnchors);
      const markAnchors = collectAnchors(glyphObject.propagatedAnchors, "_");
      for (const anchorName of Object.keys(markAnchors)) {
        const baseAnchor = baseAnchors[anchorName];
        if (baseAnchor) {
          const markAnchor = markAnchors[anchorName];
          glyph.dx = baseAnchor.x - markAnchor.x - previousXAdvance;
          glyph.dy = baseAnchor.y - markAnchor.y;
          for (const [anchorName, markAnchor] of Object.entries(markBaseAnchors)) {
            baseAnchors[anchorName] = {
              name: anchorName,
              x: markAnchor.x + glyph.dx + previousXAdvance,
              y: markAnchor.y + glyph.dy,
            };
          }
          break;
        }
      }
    } else {
      baseAnchors = collectAnchors(
        glyphObject.propagatedAnchors,
        "",
        glyph.dx,
        glyph.dy
      );
      previousXAdvance = rightToLeft ? 0 : glyphObject.xAdvance;
    }
  }
}

function collectAnchors(anchors, prefix = "", dx = 0, dy = 0) {
  const lenPrefix = prefix.length;
  const anchorsBySuffix = {};

  for (const { name, x, y } of anchors || []) {
    if (name.startsWith(prefix)) {
      const suffix = name.slice(lenPrefix);
      if (!(suffix in anchorsBySuffix)) {
        anchorsBySuffix[suffix] = { name, x: x + dx, y: y + dy };
      }
    }
  }

  return anchorsBySuffix;
}
