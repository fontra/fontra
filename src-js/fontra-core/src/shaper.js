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
    const glyphs = buffer.getGlyphInfosAndPositions();
    glyphs.forEach((glyph) => {
      glyph.glyphname = this.glyphOrder[glyph.codepoint];
      glyph.mark = this.isGlyphMarkFunc(glyph.glyphname);
      if (glyph.mark) {
        glyph.x_advance = 0; // Force marks to be zero-width
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
          buffer.updateGlyphPositions(glyphs);
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
    return Math.round(this._glyphObjects[glyphName]?.xAdvance ?? 500);
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
      const xAdvance = Math.round(glyphObjects[glyphName]?.xAdvance ?? 500);
      const isMark = this.isGlyphMarkFunc(glyphName);

      glyphs.push({
        codepoint: glyphName ? this.glyphNameToID[glyphName] : 0,
        cluster: i,
        glyphname: glyphName ?? ".notdef",
        mark: isMark,
        x_advance: isMark ? 0 : xAdvance,
        y_advance: 0,
        x_offset: 0,
        y_offset: 0,
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
    const kernValue = pairFunc(glyphs[i - 1].glyphname, glyphs[i].glyphname);
    if (kernValue) {
      glyphs[i - 1].x_advance += Math.round(kernValue);
      didModify = true;
    }
  }

  return didModify;
}

export function applyCursiveAttachments(glyphs, glyphObjects, rightToLeft = false) {
  let didModify = false;

  const [leftPrefix, rightPrefix] = rightToLeft ? ["exit", "entry"] : ["entry", "exit"];

  let previousGlyph;
  let previousXAdvance = 0;
  let previousExitAnchors = {};

  for (const glyph of glyphs) {
    if (glyph.mark) {
      continue;
    }

    const glyphObject = glyphObjects[glyph.glyphname];
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
        previousGlyph.x_advance = Math.max(
          0,
          Math.round(previousGlyph.x_advance + exitAnchor.x - previousXAdvance)
        );
        glyph.x_advance = Math.max(0, glyph.x_advance - Math.round(entryAnchor.x));
        glyph.x_offset -= Math.round(entryAnchor.x);

        // Vertical adjustment
        glyph.y_offset = Math.round(
          previousGlyph.y_offset + exitAnchor.y - entryAnchor.y
        );

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

// hb-ot-layout.hh
const IS_LIG_BASE = 0x10;

function _applyMarkPositioning(glyphs, glyphObjects, rightToLeft, markToMark) {
  // For simplicity, we treat non-ligatures as ligatures with a single component
  let previousXAdvance = 0;
  let baseAnchors = [{}];
  let didModify = false;
  let baseLigatureId = 0;

  const ordered = rightToLeft ? reversed : (v) => v;

  for (const glyph of ordered(glyphs)) {
    const glyphObject = glyphObjects[glyph.glyphname];
    if (!glyphObject) {
      baseAnchors = [{}];
      continue;
    }

    // Digging into HarfBuzz internals to get ligature info so we can do
    // mark-to-ligature positioning
    const ligatureProps = (glyph.var1 >> 16) & 0xff;
    const componentLigatureId = ligatureProps >> 5;
    const componentIndexOneBased = ligatureProps & 0x0f;

    if (!glyph.mark) {
      baseLigatureId = ligatureProps >> 5;
      const numLigatureComponents =
        ligatureProps & IS_LIG_BASE ? ligatureProps & 0x0f : 1;

      if (markToMark) {
        // Set up an array with empty anchor dicts, to be populated by
        // marks, for mark-to-mark positioning
        baseAnchors = splitLigatureAnchors(numLigatureComponents, {});
      } else {
        if (ligatureProps & IS_LIG_BASE) {
          // This glyph is a ligature
          baseAnchors = splitLigatureAnchors(
            numLigatureComponents,
            collectAnchors(
              glyphObject.propagatedAnchors,
              "",
              "",
              glyph.x_offset,
              glyph.y_offset
            )
          );
        } else {
          baseLigatureId = 0;
          baseAnchors = [
            collectAnchors(
              glyphObject.propagatedAnchors,
              "",
              "",
              glyph.x_offset,
              glyph.y_offset
            ),
          ];
        }
      }
      previousXAdvance = rightToLeft ? 0 : glyphObject.xAdvance;
    } else {
      // NOTE: for marks, we *don't* use glyphObject.propagedAnchors, but
      // only the anchors defined in the glyph proper.
      const markAnchors = collectAnchors(glyphObject.anchors, "_");

      // If a mark has the same ligature id as the ligature, it attaches to it
      // and it will have a (1-based) ligature component indicating which component
      // it attaches to. If it has a different ligature id or the component is 0,
      // then it attaches to the last component in the ligature.

      const componentIndex =
        baseLigatureId == componentLigatureId && componentIndexOneBased
          ? componentIndexOneBased - 1
          : baseAnchors.length - 1;

      for (const anchorName of Object.keys(markAnchors)) {
        const baseAnchor = baseAnchors[componentIndex][anchorName];
        if (baseAnchor) {
          const markAnchor = markAnchors[anchorName];
          glyph.x_offset = Math.round(baseAnchor.x - markAnchor.x - previousXAdvance);
          glyph.y_offset = Math.round(baseAnchor.y - markAnchor.y);
          didModify = true;
          break;
        }
      }

      if (markToMark) {
        // We don't use glyphObject.propagedAnchors for marks
        const markBaseAnchors = collectAnchors(glyphObject.anchors, "", "_");
        for (const [anchorName, markAnchor] of Object.entries(markBaseAnchors)) {
          baseAnchors[componentIndex][anchorName] = {
            name: anchorName,
            x: markAnchor.x + glyph.x_offset + previousXAdvance,
            y: markAnchor.y + glyph.y_offset,
          };
        }
      }
    }
  }

  return didModify;
}

function collectAnchors(anchors, prefix = "", skipPrefix = "", dx = 0, dy = 0) {
  const lenPrefix = prefix.length;
  const anchorsBySuffix = {};

  for (const { name, x, y } of anchors || []) {
    if (name.startsWith(prefix) && (!skipPrefix || !name.startsWith(skipPrefix))) {
      const suffix = name.slice(lenPrefix);
      if (!(suffix in anchorsBySuffix)) {
        anchorsBySuffix[suffix] = { name, x: x + dx, y: y + dy };
      }
    }
  }

  return anchorsBySuffix;
}

function splitLigatureAnchors(numLigatureComponents, anchors) {
  const ligatureAnchors = new Array(numLigatureComponents).fill(null).map(() => ({}));

  for (const [anchorName, anchor] of Object.entries(anchors)) {
    const match = anchorName.match(/^(.+)_(\d+)$/);
    if (!match) {
      continue;
    }
    const baseAnchorName = match[1];
    const componentIndex = parseInt(match[2]) - 1; // base 1
    if (componentIndex >= numLigatureComponents || baseAnchorName == "caret") {
      // Invalid anchor number or caret anchor
      continue;
    }
    ligatureAnchors[componentIndex][baseAnchorName] = anchor;
  }

  return ligatureAnchors;
}

export function characterGlyphMapping(clusters, numChars) {
  /*
   * This implements character to glyph mapping and vice versa, using
   * cluster information from HarfBuzz. It should be correct for HB
   * clustering support levels 0 and 1, see:
   *
   *     https://harfbuzz.github.io/working-with-harfbuzz-clusters.html
   *
   * "Each character belongs to the cluster that has the highest cluster
   * value not larger than its initial cluster value.""
   *
   * (ported from FontGoggles)
   */

  const sortedUniqueClusters = [...new Set(clusters)].sort((a, b) => a - b);
  assert(!sortedUniqueClusters.length || sortedUniqueClusters.at(-1) < numChars);
  assert(!sortedUniqueClusters.length || sortedUniqueClusters[0] == 0);

  const clusterToChars = new Map();

  for (let i = 0; i < sortedUniqueClusters.length; i++) {
    const cl = sortedUniqueClusters[i];
    const clNext = sortedUniqueClusters[i + 1] ?? numChars;
    const chars = [...range(cl, clNext)];
    clusterToChars.set(cl, chars);
  }

  const glyphToChars = clusters.map((cl) => clusterToChars.get(cl));
  const charToGlyphs = new Array(numChars).fill(null).map((item) => []);

  glyphToChars.forEach((charIndices, glyphIndex) => {
    charIndices.forEach((ci) => {
      charToGlyphs[ci].push(glyphIndex);
    });
  });

  charToGlyphs.forEach((glyphIndices) => glyphIndices.sort((a, b) => a - b));

  return { glyphToChars, charToGlyphs };
}
