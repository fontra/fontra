import {
  doPerformAction,
  getActionIdentifierFromKeyEvent,
  registerActionCallbacks,
} from "@fontra/core/actions.js";
import { getGlyphMapProxy } from "@fontra/core/cmap.js";
import { makeFontraMenuBar } from "@fontra/core/fontra-menus.js";
import { GlyphOrganizer } from "@fontra/core/glyph-organizer.js";
import * as html from "@fontra/core/html-utils.js";
import { loaderSpinner } from "@fontra/core/loader-spinner.js";
import { translate } from "@fontra/core/localization.js";
import { ObservableController } from "@fontra/core/observable-object.js";
import { parseGlyphSet, redirectGlyphSetURL } from "@fontra/core/parse-glyphset.js";
import {
  assert,
  dumpURLFragment,
  friendlyHttpStatus,
  glyphMapToItemList,
  isActiveElementTypeable,
  modulo,
  range,
  readObjectFromURLFragment,
  scheduleCalls,
  sleepAsync,
  throttleCalls,
  writeObjectToURLFragment,
} from "@fontra/core/utils.js";
import { ViewController } from "@fontra/core/view-controller.js";
import { GlyphCellView } from "@fontra/web-components/glyph-cell-view.js";
import { message } from "@fontra/web-components/modal-dialog.js";
import { FontOverviewNavigation } from "./panel-navigation.js";

const persistentSettings = [
  { key: "searchString" },
  { key: "fontLocationUser" },
  { key: "glyphSelection", toJSON: (v) => [...v], fromJSON: (v) => new Set(v) },
  { key: "closedGlyphSections", toJSON: (v) => [...v], fromJSON: (v) => new Set(v) },
  {
    key: "closedNavigationSections",
    toJSON: (v) => [...v],
    fromJSON: (v) => new Set(v),
  },
  { key: "groupByKeys" },
  { key: "projectGlyphSetSelection" },
  { key: "myGlyphSetSelection" },
  { key: "cellMagnification" },
];

const THIS_FONTS_GLYPHSET = "";
const PROJECT_GLYPH_SETS_CUSTOM_DATA_KEY = "fontra.projectGlyphSets";

function getDefaultFontOverviewSettings() {
  return {
    searchString: "",
    fontLocationUser: {},
    fontLocationSource: {},
    glyphSelection: new Set(),
    closedGlyphSections: new Set(),
    closedNavigationSections: new Set(),
    groupByKeys: [],
    projectGlyphSets: {},
    myGlyphSets: {},
    projectGlyphSetSelection: [],
    myGlyphSetSelection: [],
    glyphSetErrors: {},
    cellMagnification: 1,
  };
}

const CELL_MAGNIFICATION_FACTOR = 2 ** (1 / 4);
const CELL_MAGNIFICATION_MIN = 0.25;
const CELL_MAGNIFICATION_MAX = 4;

export class FontOverviewController extends ViewController {
  constructor(font) {
    super(font);

    this._loadedGlyphSets = {};

    this.initActions();

    const myMenuBar = makeFontraMenuBar(["File", "Edit", "View", "Font"], this);
    document.querySelector(".top-bar-container").appendChild(myMenuBar);

    this.updateGlyphSelection = throttleCalls(() => this._updateGlyphSelection(), 50);

    this.updateWindowLocation = scheduleCalls(
      (event) => this._updateWindowLocation(),
      200
    );
  }

  getViewMenuItems() {
    return [
      { actionIdentifier: "action.zoom-in" },
      { actionIdentifier: "action.zoom-out" },
    ];
  }

  async start() {
    await loaderSpinner(this._start());
  }

  async _start() {
    await super.start();

    this.fontSources = await this.fontController.getSources();

    window.addEventListener("popstate", (event) => {
      this._updateFromWindowLocation();
    });

    this.myGlyphSetsController = new ObservableController({ settings: {} });
    this.myGlyphSetsController.synchronizeWithLocalStorage("fontra-my-glyph-sets-");

    this.fontOverviewSettingsController = new ObservableController({
      ...getDefaultFontOverviewSettings(),
      projectGlyphSets: readProjectGlyphSets(this.fontController),
      myGlyphSets: this.myGlyphSetsController.model.settings,
    });
    this.fontOverviewSettings = this.fontOverviewSettingsController.model;

    this._setupProjectGlyphSetsDependencies();
    this._setupMyGlyphSetsDependencies();
    this._setupLocationDependencies();

    this._updateFromWindowLocation();

    this.fontOverviewSettingsController.addKeyListener(
      persistentSettings.map(({ key }) => key),
      (event) => {
        if (event.senderInfo?.senderID !== this) {
          this.updateWindowLocation();
        }
      }
    );

    this.fontOverviewSettingsController.addKeyListener("searchString", (event) => {
      this.glyphOrganizer.setSearchString(event.newValue);
      this.updateGlyphSelection();
    });

    this.fontOverviewSettingsController.addKeyListener("groupByKeys", (event) => {
      this.glyphOrganizer.setGroupByKeys(event.newValue);
      this.updateGlyphSelection();
    });

    this.fontOverviewSettingsController.addKeyListener(
      [
        "projectGlyphSets",
        "myGlyphSets",
        "projectGlyphSetSelection",
        "myGlyphSetSelection",
      ],
      (event) => {
        this.updateGlyphSelection();
      }
    );

    this.glyphOrganizer = new GlyphOrganizer();
    this.glyphOrganizer.setSearchString(this.fontOverviewSettings.searchString);
    this.glyphOrganizer.setGroupByKeys(this.fontOverviewSettings.groupByKeys);

    const rootSubscriptionPattern = {};
    for (const rootKey of this.fontController.getRootKeys()) {
      rootSubscriptionPattern[rootKey] = null;
    }
    rootSubscriptionPattern["glyphs"] = null;
    await this.fontController.subscribeChanges(rootSubscriptionPattern, false);

    const sidebarContainer = document.querySelector("#sidebar-container");
    const glyphCellViewContainer = document.querySelector("#glyph-cell-view-container");

    glyphCellViewContainer.appendChild(
      html.div({ id: "font-overview-no-glyphs" }, [
        translate("(No glyphs found)"), // TODO: translation
      ])
    );

    this.navigation = new FontOverviewNavigation(this);

    this.glyphCellView = new GlyphCellView(
      this.fontController,
      this.fontOverviewSettingsController,
      { locationKey: "fontLocationSource" }
    );

    this.fontOverviewSettingsController.addKeyListener("cellMagnification", (event) => {
      this.glyphCellView.magnification = event.newValue;
    });
    this.glyphCellView.magnification = this.fontOverviewSettings.cellMagnification;

    this.glyphCellView.onOpenSelectedGlyphs = (event) => this.openSelectedGlyphs();

    sidebarContainer.appendChild(this.navigation);
    glyphCellViewContainer.appendChild(this.glyphCellView);

    this.fontController.addChangeListener({ glyphMap: null }, () => {
      this._updateGlyphItemList();
    });

    this.fontController.addChangeListener(
      { sources: null, customData: { "fontra.sourceStatusFieldDefinitions": null } },
      () => {
        /*
         * The glyph cells may need updating because of changes in the font sources
         * (eg. the ascender/descender values determine the relative glyph size in
         * the cells) or because the status definitions changed.
         * Trigger active cell update by setting the location again. It has to be
         * a distinct object, as the ObservableController ignores "same" objects
         */
        this.fontOverviewSettings.fontLocationUser = {
          ...this.fontOverviewSettings.fontLocationUser,
        };
      }
    );

    document.addEventListener("keydown", (event) => this.handleKeyDown(event));

    this._updateGlyphItemList();
  }

  _setupProjectGlyphSetsDependencies() {
    this.fontController.addChangeListener(
      { customData: { [PROJECT_GLYPH_SETS_CUSTOM_DATA_KEY]: null } },
      (change, isExternalChange) => {
        if (isExternalChange) {
          this.fontOverviewSettingsController.setItem(
            "projectGlyphSets",
            readProjectGlyphSets(this.fontController),
            { sentFromExternalChange: true }
          );
        }
      }
    );

    this.fontOverviewSettingsController.addKeyListener(
      "projectGlyphSets",
      async (event) => {
        if (event.senderInfo?.sentFromExternalChange) {
          return;
        }
        this._updateLoadedGlyphSets(event.oldValue, event.newValue);

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

        this.fontOverviewSettings.projectGlyphSetSelection =
          this.fontOverviewSettings.projectGlyphSetSelection.filter(
            (name) => !!event.newValue[name]
          );
      }
    );
  }

  _setupMyGlyphSetsDependencies() {
    // This synchronizes the myGlyphSets object with local storage
    this.fontOverviewSettingsController.addKeyListener("myGlyphSets", (event) => {
      this._updateLoadedGlyphSets(event.oldValue, event.newValue);

      if (!event.senderInfo?.sentFromLocalStorage) {
        this.myGlyphSetsController.setItem("settings", event.newValue, {
          sentFromSettings: true,
        });

        this.fontOverviewSettings.myGlyphSetSelection =
          this.fontOverviewSettings.myGlyphSetSelection.filter(
            (name) => !!event.newValue[name]
          );
      }
    });

    this.myGlyphSetsController.addKeyListener("settings", (event) => {
      if (!event.senderInfo?.sentFromSettings) {
        this.fontOverviewSettingsController.setItem("myGlyphSets", event.newValue, {
          sentFromLocalStorage: true,
        });
      }
    });
  }

  _updateLoadedGlyphSets(oldGlyphSets, newGlyphSets) {
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

  _setupLocationDependencies() {
    // TODO: This currently does *not* do avar-2 / cross-axis-mapping
    // - We need the "user location" to send to the editor
    // - We would need the "mapped source location" for the glyph cells
    // - We use the "user location" to store in the fontoverview URL fragment
    // - Mapping from "user" to "source" to "mapped source" is easy
    // - The reverse is not: see CrossAxisMapping.unmapLocation()

    this.fontOverviewSettingsController.addKeyListener(
      "fontLocationSource",
      (event) => {
        if (!event.senderInfo?.fromFontLocationUser) {
          this.fontOverviewSettingsController.setItem(
            "fontLocationUser",
            this.fontController.mapSourceLocationToUserLocation(event.newValue),
            { fromFontLocationSource: true }
          );
        }
      }
    );

    this.fontOverviewSettingsController.addKeyListener("fontLocationUser", (event) => {
      if (!event.senderInfo?.fromFontLocationSource) {
        this.fontOverviewSettingsController.setItem(
          "fontLocationSource",
          this.fontController.mapUserLocationToSourceLocation(event.newValue),
          { fromFontLocationUser: true }
        );
      }
    });
  }

  _updateFromWindowLocation() {
    const viewInfo = readObjectFromURLFragment();
    if (!viewInfo) {
      message("The URL is malformed", "The UI settings could not be restored."); // TODO: translation
      return;
    }
    const defaultSettings = getDefaultFontOverviewSettings();
    this.fontOverviewSettingsController.withSenderInfo({ senderID: this }, () => {
      for (const { key, fromJSON } of persistentSettings) {
        const value = viewInfo[key];
        if (value !== undefined) {
          this.fontOverviewSettings[key] = fromJSON?.(value) || value;
        } else {
          this.fontOverviewSettings[key] = defaultSettings[key];
        }
      }
    });
    if (
      !this.fontOverviewSettings.myGlyphSetSelection.length &&
      !this.fontOverviewSettings.projectGlyphSetSelection.length
    ) {
      this.fontOverviewSettings.projectGlyphSetSelection = [
        THIS_FONTS_GLYPHSET,
        ...Object.values(this.fontOverviewSettings.projectGlyphSets)
          .map(({ url }) => url)
          .filter((url) => url),
      ];
    }
  }

  _updateWindowLocation() {
    const viewInfo = Object.fromEntries(
      persistentSettings.map(({ key, toJSON }) => [
        key,
        toJSON?.(this.fontOverviewSettings[key]) || this.fontOverviewSettings[key],
      ])
    );
    writeObjectToURLFragment(viewInfo);
  }

  _updateGlyphItemList() {
    this._glyphItemList = this.glyphOrganizer.sortGlyphs(
      glyphMapToItemList(this.fontController.glyphMap)
    );
    this._updateGlyphSelection();
  }

  async _updateGlyphSelection() {
    // We possibly need to be smarter about this:
    this.glyphCellView.parentElement.scrollTop = 0;

    const combinedGlyphItemList = await this._getCombineGlyphItemList();
    const glyphItemList = this.glyphOrganizer.filterGlyphs(combinedGlyphItemList);
    const glyphSections = this.glyphOrganizer.groupGlyphs(glyphItemList);
    this.glyphCellView.setGlyphSections(glyphSections);

    // Show placeholder if no glyphs are found
    const noGlyphsElement = document.querySelector("#font-overview-no-glyphs");
    noGlyphsElement.classList.toggle("shown", !glyphSections.length);
  }

  async _getCombineGlyphItemList() {
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
        ...this.fontOverviewSettings.projectGlyphSetSelection,
        ...this.fontOverviewSettings.myGlyphSetSelection,
      ]),
    ];
    glyphSetKeys.sort();

    const glyphSets = (
      await Promise.all(
        glyphSetKeys.map((glyphSetKey) => this._loadGlyphSet(glyphSetKey))
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
    return glyphSetKeys.length > 1
      ? this.glyphOrganizer.sortGlyphs(combinedItemList)
      : combinedItemList;
  }

  async _loadGlyphSet(glyphSetKey) {
    await sleepAsync(0);
    let glyphSet;
    if (glyphSetKey === "") {
      glyphSet = this._glyphItemList;
    } else {
      const glyphSetInfo =
        this.fontOverviewSettings.projectGlyphSets[glyphSetKey] ||
        this.fontOverviewSettings.myGlyphSets[glyphSetKey];

      if (!glyphSetInfo) {
        // console.log(`can't find glyph set info for ${glyphSetKey}`);
        return;
      }

      glyphSet = await this._fetchGlyphSet(glyphSetInfo);
    }
    return glyphSet;
  }

  async _fetchGlyphSet(glyphSetInfo) {
    assert(glyphSetInfo.url);

    let glyphSet = this._loadedGlyphSets[glyphSetInfo.url];
    if (!glyphSet) {
      let glyphSetData;
      this._setErrorMessageForGlyphSet(glyphSetInfo.url, "...");
      const redirectedURL = redirectGlyphSetURL(glyphSetInfo.url);
      try {
        const response = await fetch(redirectedURL);
        if (response.ok) {
          glyphSetData = await response.text();
          this._setErrorMessageForGlyphSet(glyphSetInfo.url, null);
        } else {
          this._setErrorMessageForGlyphSet(
            glyphSetInfo.url,
            `Could not fetch glyph set: ${friendlyHttpStatus[response.status]} (${
              response.status
            })`
          );
        }
      } catch (e) {
        console.log(`could not fetch ${glyphSetInfo.url}`);
        console.error();
        this._setErrorMessageForGlyphSet(
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
          this._setErrorMessageForGlyphSet(
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

  _setErrorMessageForGlyphSet(url, message) {
    const glyphSetErrors = { ...this.fontOverviewSettings.glyphSetErrors };
    if (message) {
      glyphSetErrors[url] = message;
    } else {
      delete glyphSetErrors[url];
    }

    this.fontOverviewSettings.glyphSetErrors = glyphSetErrors;
  }

  openSelectedGlyphs() {
    const selectedGlyphInfo = this.glyphCellView.getSelectedGlyphInfo();
    if (!selectedGlyphInfo.length) {
      return;
    }
    openGlyphsInEditor(
      selectedGlyphInfo,
      this.fontOverviewSettings.fontLocationUser,
      this.fontController.glyphMap
    );
  }

  handleKeyDown(event) {
    const actionIdentifier = getActionIdentifierFromKeyEvent(event);
    if (actionIdentifier) {
      event.preventDefault();
      event.stopImmediatePropagation();
      doPerformAction(actionIdentifier, event);
    } else {
      if (isActiveElementTypeable()) {
        // The cell area for sure doesn't have the focus
        return;
      }
      this.glyphCellView.handleKeyDown(event);
    }
  }

  initActions() {
    registerActionCallbacks(
      "action.undo",
      () => this.doUndoRedo(false),
      () => this.canUndoRedo(false)
    );

    registerActionCallbacks(
      "action.redo",
      () => this.doUndoRedo(true),
      () => this.canUndoRedo(true)
    );

    registerActionCallbacks("action.zoom-in", () => this.zoomIn());
    registerActionCallbacks("action.zoom-out", () => this.zoomOut());
  }

  canUndoRedo(isRedo) {
    // For now we have no undo
    return false;
  }

  doUndoRedo(isRedo) {
    // Stub
    console.log(isRedo ? "redo" : "undo");
  }

  zoomIn() {
    this.fontOverviewSettings.cellMagnification = Math.min(
      this.fontOverviewSettings.cellMagnification * CELL_MAGNIFICATION_FACTOR,
      CELL_MAGNIFICATION_MAX
    );
  }

  zoomOut() {
    this.fontOverviewSettings.cellMagnification = Math.max(
      this.fontOverviewSettings.cellMagnification / CELL_MAGNIFICATION_FACTOR,
      CELL_MAGNIFICATION_MIN
    );
  }
}

function openGlyphsInEditor(glyphsInfo, userLocation, glyphMap) {
  const url = new URL(window.location);
  url.pathname = url.pathname.replace("/fontoverview.html", "/editor.html");

  const viewInfo = {
    location: userLocation,
    text: "",
  };

  if (glyphsInfo.length === 1) {
    viewInfo.selectedGlyph = {
      lineIndex: 0,
      glyphIndex: 0,
      isEditing: glyphsInfo[0].glyphName in glyphMap,
    };
  }

  for (const { glyphName, codePoints } of glyphsInfo) {
    if (codePoints.length) {
      viewInfo.text +=
        0x002f === codePoints[0] ? "//" : String.fromCodePoint(codePoints[0]);
    } else {
      viewInfo.text += `/${glyphName}`;
    }
  }

  url.hash = dumpURLFragment(viewInfo);
  window.open(url.toString());
}

function readProjectGlyphSets(fontController) {
  return Object.fromEntries(
    [
      { name: "This font's glyphs", url: THIS_FONTS_GLYPHSET },
      ...(fontController.customData[PROJECT_GLYPH_SETS_CUSTOM_DATA_KEY] || []),
    ].map((glyphSet) => [glyphSet.url, glyphSet])
  );
}
