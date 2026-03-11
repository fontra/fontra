import { getGlyphMapProxy } from "./cmap.js";
import { ObservableController } from "./observable-object.js";
import { parseGlyphSet, redirectGlyphSetURL } from "./parse-glyphset.js";
import { assert, friendlyHttpStatus, glyphMapToItemList, sleepAsync } from "./utils.js";

export const THIS_FONTS_GLYPHSET = "";
export const PROJECT_GLYPH_SETS_CUSTOM_DATA_KEY = "fontra.projectGlyphSets";

export class GlyphSetsController {
  constructor(fontController, settingsController) {
    this.fontController = fontController;
    this.settingsController = settingsController;
    this.settings = settingsController.model;
    this.myGlyphSetsController = getMyGlyphSetsController();

    this._loadedGlyphSets = {};

    this.setupProjectGlyphSetsDependencies();
    this.setupMyGlyphSetsDependencies();
  }

  async getCombinedGlyphItemList(fontGlyphItemList) {
    /*
      Merge selected glyph sets. When multiple glyph sets define a character
      but the glyph name does not match:
      - If the font defines this character, take the font's glyph name for it
      - Else take the glyph name from the first glyph set that defines the
        character
      The latter is arbitrary, but should still be deterministic, as glyph sets
      should be sorted.
      If the conflicting glyph name references multiple code points, we bail,
      as it is not clear how to resolve.
    */
    const fontCharacterMap = this.fontController.characterMap;
    const combinedCharacterMap = {};
    const combinedGlyphMap = getGlyphMapProxy({}, combinedCharacterMap);

    const glyphSetKeys = [
      ...new Set([
        ...this.settings.projectGlyphSetSelection,
        ...this.settings.myGlyphSetSelection,
      ]),
    ];
    glyphSetKeys.sort();

    const glyphSets = (
      await Promise.all(
        glyphSetKeys.map((glyphSetKey) =>
          glyphSetKey ? this.loadGlyphSet(glyphSetKey) : fontGlyphItemList
        )
      )
    ).filter((glyphSet) => glyphSet);

    for (const glyphSet of glyphSets) {
      for (const { glyphName, codePoints } of glyphSet) {
        const singleCodePoint = codePoints.length === 1 ? codePoints[0] : null;
        const foundGlyphName =
          singleCodePoint !== null
            ? combinedCharacterMap[singleCodePoint] || fontCharacterMap[singleCodePoint]
            : null;

        if (foundGlyphName) {
          if (!combinedGlyphMap[foundGlyphName]) {
            combinedGlyphMap[foundGlyphName] = codePoints;
          }
        } else if (!combinedGlyphMap[glyphName]) {
          combinedGlyphMap[glyphName] = codePoints;
        }
      }
    }

    const combinedItemList = glyphMapToItemList(combinedGlyphMap);
    // When overlaying multiple glyph sets, sort the list, or else we
    // may end up with a garbled mess of ordering
    return { combinedItemList, shouldSort: glyphSetKeys.length > 1 };
  }

  async loadGlyphSet(glyphSetKey) {
    assert(glyphSetKey);
    await sleepAsync(0);

    const glyphSetInfo =
      this.settings.projectGlyphSets[glyphSetKey] ||
      this.settings.myGlyphSets[glyphSetKey];

    if (!glyphSetInfo) {
      // console.log(`can't find glyph set info for ${glyphSetKey}`);
      return;
    }

    return await this.fetchGlyphSet(glyphSetInfo);
  }

  async fetchGlyphSet(glyphSetInfo) {
    assert(glyphSetInfo.url);

    let glyphSet = this._loadedGlyphSets[glyphSetInfo.url];
    if (!glyphSet) {
      let glyphSetData;
      this.setErrorMessageForGlyphSet(glyphSetInfo.url, "...");
      const redirectedURL = redirectGlyphSetURL(glyphSetInfo.url);
      try {
        const response = await fetch(redirectedURL);
        if (response.ok) {
          glyphSetData = await response.text();
          this.setErrorMessageForGlyphSet(glyphSetInfo.url, null);
        } else {
          this.setErrorMessageForGlyphSet(
            glyphSetInfo.url,
            `Could not fetch glyph set: ${friendlyHttpStatus[response.status]} (${
              response.status
            })`
          );
        }
      } catch (e) {
        console.log(`could not fetch ${glyphSetInfo.url}`);
        console.error();
        this.setErrorMessageForGlyphSet(
          glyphSetInfo.url,
          `Could not fetch glyph set: ${e.toString()}`
        );
      }

      if (glyphSetData) {
        try {
          glyphSet = parseGlyphSet(glyphSetData, glyphSetInfo.dataFormat, {
            commentChars: glyphSetInfo.commentChars,
            hasHeader: glyphSetInfo.hasHeader,
            glyphNameColumn: glyphSetInfo.glyphNameColumn,
            codePointColumn: glyphSetInfo.codePointColumn,
            codePointIsDecimal: glyphSetInfo.codePointIsDecimal,
          });
        } catch (e) {
          this.setErrorMessageForGlyphSet(
            glyphSetInfo.url,
            `Could not parse glyph set: ${e.toString()}`
          );
          console.error(e);
        }
      }

      if (glyphSet) {
        this._loadedGlyphSets[glyphSetInfo.url] = glyphSet;
      }
    }

    return glyphSet || [];
  }

  setErrorMessageForGlyphSet(url, message) {
    const glyphSetErrors = { ...this.settings.glyphSetErrors };
    if (message) {
      glyphSetErrors[url] = message;
    } else {
      delete glyphSetErrors[url];
    }

    this.settings.glyphSetErrors = glyphSetErrors;
  }

  setupProjectGlyphSetsDependencies() {
    this.fontController.addChangeListener(
      { customData: { [PROJECT_GLYPH_SETS_CUSTOM_DATA_KEY]: null } },
      (change, isExternalChange) => {
        if (isExternalChange) {
          this.settingsController.setItem(
            "projectGlyphSets",
            readProjectGlyphSets(this.fontController),
            { sentFromExternalChange: true }
          );
        }
      }
    );

    this.settingsController.addKeyListener("projectGlyphSets", async (event) => {
      if (event.senderInfo?.sentFromExternalChange) {
        return;
      }
      this.updateLoadedGlyphSets(event.oldValue, event.newValue);

      const changes = await this.fontController.performEdit(
        "edit glyph sets",
        "customData",
        (root) => {
          const projectGlyphSets = Object.values(event.newValue).filter(
            (glyphSet) => glyphSet.url !== THIS_FONTS_GLYPHSET
          );
          root.customData[PROJECT_GLYPH_SETS_CUSTOM_DATA_KEY] = projectGlyphSets;
        },
        this
      );

      this.settings.projectGlyphSetSelection =
        this.settings.projectGlyphSetSelection.filter((name) => !!event.newValue[name]);
    });
  }

  setupMyGlyphSetsDependencies() {
    // This synchronizes the myGlyphSets object with local storage
    this.settingsController.addKeyListener("myGlyphSets", (event) => {
      this.updateLoadedGlyphSets(event.oldValue, event.newValue);

      if (!event.senderInfo?.sentFromLocalStorage) {
        this.myGlyphSetsController.setItem("settings", event.newValue, {
          sentFromSettings: true,
        });

        this.settings.myGlyphSetSelection = this.settings.myGlyphSetSelection.filter(
          (name) => !!event.newValue[name]
        );
      }
    });

    this.myGlyphSetsController.addKeyListener("settings", (event) => {
      if (!event.senderInfo?.sentFromSettings) {
        this.settingsController.setItem("myGlyphSets", event.newValue, {
          sentFromLocalStorage: true,
        });
      }
    });
  }

  updateLoadedGlyphSets(oldGlyphSets, newGlyphSets) {
    const oldAndNewGlyphSets = { ...oldGlyphSets, ...newGlyphSets };

    for (const key of Object.keys(oldAndNewGlyphSets)) {
      if (oldGlyphSets[key] !== newGlyphSets[key]) {
        if (oldGlyphSets[key]) {
          delete this._loadedGlyphSets[oldGlyphSets[key].url];
        }
        if (newGlyphSets[key]) {
          delete this._loadedGlyphSets[newGlyphSets[key].url];
        }
      }
    }
  }
}

export function readProjectGlyphSets(fontController) {
  return Object.fromEntries(
    [
      { name: "This font's glyphs", url: THIS_FONTS_GLYPHSET },
      ...(fontController.customData[PROJECT_GLYPH_SETS_CUSTOM_DATA_KEY] || []),
    ].map((glyphSet) => [glyphSet.url, glyphSet])
  );
}

const myGlyphSetsController = new ObservableController({ settings: {} });
myGlyphSetsController.synchronizeWithLocalStorage("fontra-my-glyph-sets-");

function getMyGlyphSetsController() {
  return myGlyphSetsController;
}

export function getMyGlyphSets() {
  return myGlyphSetsController.model.settings;
}
