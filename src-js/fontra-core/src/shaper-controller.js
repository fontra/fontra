import { buildShaperFont } from "build-shaper-font";
import { getGlyphInfoFromCodePoint, getGlyphInfoFromGlyphName } from "./glyph-data.js";
import { getShaper } from "./shaper.js";

export class ShaperController {
  constructor(fontController) {
    this.fontController = fontController;

    this.fontController.addChangeListener(
      { glyphMap: null },
      (change, isExternalChange) => {
        delete this._glyphClasses;
      },
      false,
      true // immediate
    );
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

  async getGlyphClasses() {
    if (!this._glyphClasses) {
      this._glyphClasses = await this._getGlyphClasses();
    }
    return this._glyphClasses;
  }

  async _getGlyphClasses() {
    const glyphInfos = await this.fontController.getGlyphInfos();

    const isMark = (glyphName) => {
      const customInfo = glyphInfos[glyphName];
      if (customInfo?.category === "Mark" && customInfo?.subcategory === "Nonspacing") {
        return true;
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
      return info?.category === "Mark" && info?.subCategory === "Nonspacing";
    };

    const glyphClasses = {
      base: [],
      ligature: [],
      mark: Object.keys(this.fontController.glyphMap).filter((glyphName) =>
        isMark(glyphName)
      ),
      component: [],
    };

    return glyphClasses;
  }

  async buildShaperFont(glyphOrder) {
    const features = await this.fontController.getFeatures();

    const glyphClasses = await this.getGlyphClasses();

    try {
      return buildShaperFont(
        this.fontController.unitsPerEm,
        glyphOrder,
        features.text,
        this.fontController.axes.axes
          .filter((axis) => !axis.values) // Filter out discrete axes
          .map((axis) => ({
            tag: axis.tag,
            minValue: axis.minValue,
            defaultValue: axis.defaultValue,
            maxValue: axis.maxValue,
          })),
        glyphClasses
      );
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
      const shaper = getShaper(shaperSupport);
      return { shaper, messages, formattedMessages, canEmulateSomeGPOS };
    }
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
