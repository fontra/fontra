import { buildShaperFont } from "build-shaper-font";
import { collectGlyphNames } from "./changes.js";
import { getGlyphInfoFromCodePoint, getGlyphInfoFromGlyphName } from "./glyph-data.js";
import { ObservableController } from "./observable-object.js";
import { getShaper } from "./shaper.js";
import { consolidateCalls, filterObject, scheduleCalls } from "./utils.js";
import { piecewiseLinearMap } from "./var-model.js";

export class ShaperController {
  constructor(fontController, applicationSettingsController) {
    this.fontController = fontController;
    this.applicationSettingsController = applicationSettingsController;
    this.applicationSettings = applicationSettingsController.model;

    this.invalidateShaper = new ObservableController({ counter: 0 });

    this._adHocMarkGlyphs = {};

    this.fontController.addChangeListener(
      { glyphMap: null },
      (change, isExternalChange) => {
        this.purgeGlyphClassesCache();
      },
      false,
      true // immediate
    );

    this.fontController.addChangeListener(
      { glyphs: null },
      consolidateCalls((change, isExternalChange) => {
        if (!change) {
          // reload everything
          this.purgeGlyphClassesCache();
          return;
        }
        const glyphNames = collectGlyphNames(change);
        const extendedGlyphNames = new Set(glyphNames);

        for (const glyphName of glyphNames) {
          for (const dependentGlyphName of this.fontController.iterGlyphsUsedByRecursively(
            glyphName
          )) {
            extendedGlyphNames.add(dependentGlyphName);
          }
        }

        this.updateAdHocMarkSet(extendedGlyphNames);
      }),
      false,
      true // immediate
    );

    this.fontController.addGlyphCacheListener(
      scheduleCalls(() => {
        this.updateAdHocMarkSetFromCachedGlyphs([
          ...this.fontController.getCachedGlyphNames(),
        ]);
      }, 10)
    );

    applicationSettingsController.addKeyListener("disableAdHocMarks", (event) => {
      delete this._glyphClasses;
      this.invalidateShaper.model.counter++;
    });
  }

  addInvalidateShaperListener(listener) {
    this.invalidateShaper.addListener(listener);
  }

  async getShaper(textShaping) {
    await this.fontController.ensureInitialized;

    const { mark: markGlyphs } = await this.getGlyphClasses();
    const markGlyphsSet = new Set(markGlyphs);

    const {
      glyphOrder,
      fontData,
      messages,
      formattedMessages,
      insertMarkers,
      canEmulateSomeGPOS,
    } = await this.getShaperFontData(textShaping);

    {
      // characterMap closure
      const characterMap = this.fontController.characterMap;
      const shaperSupport = {
        fontData,
        nominalGlyphFunc: (codePoint) => characterMap[codePoint],
        glyphOrder,
        isGlyphMarkFunc: (glyphName) => markGlyphsSet.has(glyphName),
        insertMarkers,
      };

      // If compiling the font failed (!fontData) and we have a previous
      // working shaper, use that one.
      const shaper =
        textShaping && !fontData && this._previousShaper
          ? this._previousShaper
          : getShaper(shaperSupport);

      if (textShaping && fontData) {
        // The new shaper is good
        this._previousShaper = shaper;
      }

      return { shaper, messages, formattedMessages, canEmulateSomeGPOS };
    }
  }

  async getShaperFontData(textShaping) {
    let fontData = null;
    let messages = [];
    let formattedMessages = "";
    let insertMarkers = null;
    let canEmulateSomeGPOS = false;

    const glyphOrder = Object.keys(this.fontController.glyphMap);

    if (textShaping) {
      // First see if the backend has a shaper font for us
      let shaperFontData = await this.fontController.getShaperFontData();

      if (shaperFontData) {
        const fontDataBase64 = shaperFontData.data;

        if (shaperFontData.glyphOrderSorting == "sorted") {
          glyphOrder.sort();
        }

        if (fontDataBase64) {
          const blob = await (
            await fetch(`data:font/opentype;base64,${fontDataBase64}`)
          ).blob();
          fontData = await blob.arrayBuffer();
        }
      } else {
        glyphOrder.sort();
        ensureNotdef(glyphOrder);
        ({ fontData, messages, formattedMessages, insertMarkers } =
          await this.buildShaperFont(glyphOrder));
        canEmulateSomeGPOS = true;
      }
    } else {
      glyphOrder.sort();
      ensureNotdef(glyphOrder);
      insertMarkers = [
        { tag: "curs", lookupId: undefined },
        { tag: "kern", lookupId: undefined },
        { tag: "mark", lookupId: undefined },
        { tag: "mkmk", lookupId: undefined },
      ];
    }

    return {
      fontData,
      glyphOrder,
      messages,
      formattedMessages,
      insertMarkers,
      canEmulateSomeGPOS,
    };
  }

  async buildShaperFont(glyphOrder) {
    const features = await this.fontController.getFeatures();
    const conditionalSubstitutions = prepareConditionalSubstitutions(
      await this.fontController.getConditionalSubstitutions(),
      this.fontController.fontAxes,
      this.fontController.fontAxesSourceSpace,
      this.fontController.glyphMap
    );

    const glyphClasses = await this.getGlyphClasses();

    try {
      return buildShaperFont(this.fontController.unitsPerEm, glyphOrder, {
        featureSource: features.text,
        axes: this.fontController.axes.axes
          .filter((axis) => !axis.values) // Filter out discrete axes
          .map((axis) => ({
            tag: axis.tag,
            minValue: axis.minValue,
            defaultValue: axis.defaultValue,
            maxValue: axis.maxValue,
          })),
        glyphClasses,
        conditionalSubstitutions: [conditionalSubstitutions],
        compileDebg: true,
      });
    } catch (e) {
      console.error(e);
      return {
        fontData: null,
        messages: [
          { text: e.message || e.toString(), span: [0, 0], level: "exception" },
        ],
        formattedMessages: e.message || e.toString(),
        insertMarkers: [],
      };
    }
  }

  purgeGlyphClassesCache() {
    delete this._glyphClasses;
    this._adHocMarkGlyphs = {};
  }

  async updateAdHocMarkSet(glyphNames) {
    let didChange = false;

    for (const glyphName of glyphNames) {
      const glyph = await this.fontController.getGlyphInstance(glyphName, {});

      if (!glyph) {
        if (this._adHocMarkGlyphs[glyphName]) {
          didChange = true;
        }
        delete this._adHocMarkGlyphs[glyphName];
        continue;
      }

      const isAdHocMark = glyph.propagatedAnchors.some((anchor) =>
        anchor.name?.startsWith("_")
      );

      if (isAdHocMark != !!this._adHocMarkGlyphs[glyphName]) {
        this._adHocMarkGlyphs[glyphName] = isAdHocMark;
        didChange = true;
      }
    }

    if (didChange) {
      delete this._glyphClasses;
      this.invalidateShaper.model.counter++;
    }
  }

  async updateAdHocMarkSetFromCachedGlyphs(glyphNames) {
    // We only need to look at glyphs that we haven't seen before
    this.updateAdHocMarkSet(
      glyphNames.filter((glyphName) => !(glyphName in this._adHocMarkGlyphs))
    );
  }

  async getGlyphClasses() {
    if (!this._glyphClasses) {
      this._glyphClasses = await this._getGlyphClasses();
    }
    return this._glyphClasses;
  }

  async _getGlyphClasses() {
    const glyphInfos = await this.fontController.getGlyphInfos();

    const isAdHocMark = this.applicationSettings.disableAdHocMarks
      ? (glyphName) => false
      : (glyphName) => {
          return this._adHocMarkGlyphs[glyphName];
        };

    const isMark = (glyphName) => {
      const customInfo = glyphInfos[glyphName];
      if (customInfo?.category === "Mark" && customInfo?.subcategory === "Nonspacing") {
        return true;
      } else if (customInfo?.category) {
        // There is an explicit category, but it's not Mark/Nonspacing so this is not a mark
        return false;
      }

      let info = getGlyphInfoFromGlyphName(glyphName);
      const codePoints = this.fontController.glyphMap[glyphName] || [];

      if (!info && codePoints.length) {
        for (const codePoint of codePoints) {
          const info =
            getGlyphInfoFromCodePoint(codePoint) ??
            getGlyphInfoFromGlyphName(glyphName);
          if (info) {
            break;
          }
        }
      }

      // Note "subcategory" (lowercase, Fontra glyph infos API) and "subCategory" (camelCase),
      // as inherited from the Glyph Data database.
      if (info?.category === "Mark" && info?.subCategory === "Nonspacing") {
        return true;
      } else if (info?.category) {
        // There is an explicit category, but it's not Mark/Nonspacing so this is not a mark
        return false;
      }

      // As a last resort, use the ad-hoc mark heuristic
      return isAdHocMark(glyphName);
    };

    const glyphClasses = {
      base: [],
      ligature: [],
      mark: Object.keys(this.fontController.glyphMap).filter(isMark),
      component: [],
    };

    return glyphClasses;
  }
}

function ensureNotdef(glyphOrder) {
  if (glyphOrder[0] === ".notdef") {
    return;
  }
  const index = glyphOrder.indexOf(".notdef");
  if (index != -1) {
    glyphOrder.splice(index, 1);
  }
  glyphOrder.unshift(".notdef");
}

function prepareConditionalSubstitutions(
  substitutions,
  fontAxes,
  fontAxesSourceSpace,
  glyphMap
) {
  const axesByName = Object.fromEntries(fontAxes.map((axis) => [axis.name, axis]));
  const mapFuncs = Object.fromEntries(
    fontAxesSourceSpace.map((axisSourceSpace) => {
      const axis = axesByName[axisSourceSpace.name];
      // We don't "unapply" avar mapping, we just *scale* from source space to user space
      const mapping =
        axis.mapping && axis.minValue != undefined
          ? {
              [axisSourceSpace.minValue]: axis.minValue,
              [axisSourceSpace.defaultValue]: axis.defaultValue,
              [axisSourceSpace.maxValue]: axis.maxValue,
            }
          : null;
      return [axis.name, mapping ? (v) => piecewiseLinearMap(v, mapping) : (v) => v];
    })
  );

  const getMapFunc = (axisName) => mapFuncs[axisName] ?? ((v) => v);

  return {
    featureTags: substitutions.featureTags,
    rules: substitutions.rules.map(({ conditionSets, substitutions }) => [
      conditionSets.map(({ conditions }) =>
        Object.fromEntries(
          conditions.map(({ name, minValue, maxValue }) => {
            const axis = axesByName[name];
            const mapFunc = getMapFunc(name);
            return [
              axis.tag,
              [mapFunc(minValue ?? axis.minValue), mapFunc(maxValue ?? axis.maxValue)],
            ];
          })
        )
      ),
      filterObject(
        substitutions,
        (glyph1, glyph2) => glyph1 in glyphMap && glyph2 in glyphMap
      ),
    ]),
  };
}
