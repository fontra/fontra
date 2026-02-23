import hbPromise from "harfbuzzjs";
import { assert, enumerate, range, reversed } from "./utils.js";

const hb = await hbPromise;

export function getShaper(shaperSupport) {
  const shaperClass = shaperSupport.fontData ? HBShaper : DumbShaper;

  return new shaperClass(shaperSupport);
}

export const MAX_UNICODE = 0x0110000;

const EMULATED_FEATURE_TAGS = ["curs", "kern", "mark", "mkmk"];

class ShaperBase {
  constructor(shaperSupport) {
    const { nominalGlyphFunc, glyphOrder, isGlyphMarkFunc, insertMarkers } =
      shaperSupport;

    this._baseNominalGlyphFunc = nominalGlyphFunc;
    this.glyphOrder = glyphOrder;
    this.isGlyphMarkFunc = isGlyphMarkFunc;
    this.insertMarkers = insertMarkers?.filter((marker) =>
      EMULATED_FEATURE_TAGS.includes(marker.tag)
    );
    this.emulatedDefaultValues = Object.fromEntries(
      EMULATED_FEATURE_TAGS.map((emulatedTag) => [
        emulatedTag,
        !!this.insertMarkers?.find(({ tag }) => tag === emulatedTag),
      ])
    );

    this.glyphNameToID = {};
    for (const [i, glyphName] of enumerate(glyphOrder)) {
      this.glyphNameToID[glyphName] = i;
    }
    this.nominalGlyph = (codePoint) =>
      codePoint >= MAX_UNICODE
        ? this.glyphOrder[codePoint - MAX_UNICODE]
        : this._baseNominalGlyphFunc(codePoint);
  }

  _getInitialSkipEmulatedFeatures(emulatedFeatures) {
    if (!emulatedFeatures) {
      emulatedFeatures = {};
    }
    return new Set(
      EMULATED_FEATURE_TAGS.filter(
        (tag) => !(emulatedFeatures[tag] ?? this.emulatedDefaultValues[tag])
      )
    );
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

  getFeatureInfo(otTableTag) {
    return otTableTag == "GPOS-emulated"
      ? this.insertMarkers
        ? Object.fromEntries(
            EMULATED_FEATURE_TAGS.map((tag) => [
              `${tag}-emulated`,
              {
                defaultOn: this.emulatedDefaultValues[tag],
              },
            ])
          )
        : {}
      : null;
  }

  applyEmulatedPositioning(
    glyphs,
    glyphObjects,
    skipFeatures,
    kerningPairFunc,
    direction
  ) {
    const isRTL = direction == "rtl";

    if (!skipFeatures?.has("curs")) {
      applyCursiveAttachments(glyphs, glyphObjects, isRTL);
    }

    if (kerningPairFunc && !skipFeatures?.has("kern")) {
      applyKerning(glyphs, kerningPairFunc);
    }

    if (!skipFeatures?.has("mark")) {
      applyMarkToBasePositioning(glyphs, glyphObjects, isRTL);
    }

    if (!skipFeatures?.has("mkmk")) {
      applyMarkToMarkPositioning(glyphs, glyphObjects, isRTL);
    }
  }
}

class HBShaper extends ShaperBase {
  constructor(shaperSupport) {
    super(shaperSupport);
    const { fontData } = shaperSupport;

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

    const skipFeatures = this.setupInsertFeatures(buffer, options);

    this._glyphObjects = glyphObjects;

    hb.shape(this.font, buffer, features);

    delete this._glyphObjects;

    const glyphs = this.getGlyphInfoFromBuffer(buffer);
    buffer.destroy();

    this.applyEmulatedPositioning(
      glyphs,
      glyphObjects,
      skipFeatures,
      options.kerningPairFunc,
      options.direction
    );

    return glyphs;
  }

  getGlyphInfoFromBuffer(buffer) {
    const glyphs = buffer.json();
    glyphs.forEach((glyph) => {
      glyph.gn = this.glyphOrder[glyph.g];
      glyph.mark = this.isGlyphMarkFunc(glyph.gn);
      if (glyph.mark) {
        glyph.ax = 0; // Force marks to be zero-width
      }
      return glyph;
    });
    return glyphs;
  }

  setupInsertFeatures(buffer, options) {
    const { emulatedFeatures, kerningPairFunc, direction } = options;

    const skipFeatures = this._getInitialSkipEmulatedFeatures(emulatedFeatures);

    if (!this.insertMarkers?.some(({ lookupId }) => lookupId !== undefined)) {
      // An "undefined" lookupId means "do the emulation after HB is done"
      // So if all lookupIds are undefined, we don't need to use the insertion
      // mechanism at all.
      return skipFeatures;
    }

    const isRTL = direction == "rtl";

    let gposPhase = false;

    buffer.setMessageFunc((buffer, font, message) => {
      if (gposPhase) {
        const match = message.match(/^start lookup (\d+)/);
        if (!match) {
          return true;
        }

        let glyphs;
        const glyphObjects = this._glyphObjects;
        let didModify = false;
        const beforeLookupId = parseInt(match[1]);

        for (const { tag, lookupId } of this.insertMarkers) {
          if (!skipFeatures.has(tag) && beforeLookupId >= lookupId) {
            if (glyphs == undefined) {
              glyphs = this.getGlyphInfoFromBuffer(buffer);
              if (isRTL) {
                glyphs.reverse();
              }
            }

            let applyDidModify = false;

            switch (tag) {
              case "curs":
                applyDidModify = applyCursiveAttachments(glyphs, glyphObjects, isRTL);
                break;
              case "kern":
                applyDidModify = applyKerning(glyphs, kerningPairFunc);
                break;
              case "mark":
                applyDidModify = applyMarkToBasePositioning(
                  glyphs,
                  glyphObjects,
                  isRTL
                );
                break;
              case "mkmk":
                applyDidModify = applyMarkToMarkPositioning(
                  glyphs,
                  glyphObjects,
                  isRTL
                );
                break;
            }

            didModify ||= applyDidModify;

            skipFeatures.add(tag);
          }
        }

        if (didModify) {
          if (isRTL) {
            glyphs.reverse();
          }
          buffer.updateGlyphPositions(
            glyphs.map((glyph) => ({
              x_advance: glyph.ax,
              y_advance: glyph.ay,
              x_offset: glyph.dx,
              y_offset: glyph.dy,
            }))
          );
        }
      } else if (message.startsWith("start table GPOS")) {
        gposPhase = true;
      }
      return true;
    });

    return skipFeatures;
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
    let info = super.getFeatureInfo(otTableTag);
    if (info) {
      return info;
    }

    const tags = this.face.getTableFeatureTags(otTableTag);
    info = {};

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
  shape(codePoints, glyphObjects, options) {
    const { direction } = options;
    const glyphs = [];

    for (const [i, codePoint] of enumerate(codePoints)) {
      const glyphName = this.nominalGlyph(codePoint);
      const xAdvance = glyphObjects[glyphName]?.xAdvance ?? 500;
      const isMark = this.isGlyphMarkFunc(glyphName);

      glyphs.push({
        g: glyphName ? this.glyphNameToID[glyphName] : 0,
        cl: i, // cluster
        gn: glyphName ?? ".notdef",
        mark: isMark,
        ax: isMark ? 0 : xAdvance,
        ay: 0,
        dx: 0,
        dy: 0,
        flags: 0,
      });
    }

    if (direction === "rtl") {
      glyphs.reverse();
    }

    const skipFeatures = this._getInitialSkipEmulatedFeatures(options.emulatedFeatures);
    this.applyEmulatedPositioning(
      glyphs,
      glyphObjects,
      skipFeatures,
      options.kerningPairFunc,
      options.direction
    );

    return glyphs;
  }

  getFeatureInfo(otTableTag) {
    return super.getFeatureInfo(otTableTag) ?? {};
  }

  getScriptAndLanguageInfo() {
    return {};
  }

  close() {
    // noop
  }
}

export function applyKerning(glyphs, pairFunc) {
  let didModify = false;

  for (let i = 1; i < glyphs.length; i++) {
    const kernValue = pairFunc(glyphs[i - 1].gn, glyphs[i].gn);
    if (kernValue) {
      glyphs[i - 1].ax += kernValue;
      glyphs[i].flags |= 1;
      didModify = true;
    }
  }

  return didModify;
}

export function applyCursiveAttachments(glyphs, glyphObjects, rightToLeft = false) {
  let didModify = false;

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

        didModify = true;
        break;
      }
    }

    previousGlyph = glyph;
    previousXAdvance = glyphObject.xAdvance;
    previousExitAnchors = collectAnchors(glyphObject.propagatedAnchors, rightPrefix);
  }

  return didModify;
}

export function applyMarkToBasePositioning(glyphs, glyphObjects, rightToLeft = false) {
  return _applyMarkPositioning(glyphs, glyphObjects, rightToLeft, false);
}

export function applyMarkToMarkPositioning(glyphs, glyphObjects, rightToLeft = false) {
  return _applyMarkPositioning(glyphs, glyphObjects, rightToLeft, true);
}

function _applyMarkPositioning(glyphs, glyphObjects, rightToLeft, markToMark) {
  let previousXAdvance;
  let baseAnchors = {};
  let didModify = false;

  const ordered = rightToLeft ? reversed : (v) => v;

  for (const glyph of ordered(glyphs)) {
    const glyphObject = glyphObjects[glyph.gn];
    if (!glyphObject) {
      baseAnchors = {};
      continue;
    }

    if (glyph.mark) {
      // NOTE: for marks, we *don't* use glyphObject.propagedAnchors, but
      // only the anchors defined in the glyph proper.
      const markBaseAnchors = collectAnchors(glyphObject.anchors);
      const markAnchors = collectAnchors(glyphObject.anchors, "_");
      for (const anchorName of Object.keys(markAnchors)) {
        const baseAnchor = baseAnchors[anchorName];
        if (baseAnchor) {
          const markAnchor = markAnchors[anchorName];
          glyph.dx = baseAnchor.x - markAnchor.x - previousXAdvance;
          glyph.dy = baseAnchor.y - markAnchor.y;
          didModify = true;
          break;
        }
      }

      if (markToMark) {
        for (const [anchorName, markAnchor] of Object.entries(markBaseAnchors)) {
          baseAnchors[anchorName] = {
            name: anchorName,
            x: markAnchor.x + glyph.dx + previousXAdvance,
            y: markAnchor.y + glyph.dy,
          };
        }
      }
    } else {
      baseAnchors = markToMark
        ? {}
        : collectAnchors(glyphObject.propagatedAnchors, "", glyph.dx, glyph.dy);
      previousXAdvance = rightToLeft ? 0 : glyphObject.xAdvance;
    }
  }

  return didModify;
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
