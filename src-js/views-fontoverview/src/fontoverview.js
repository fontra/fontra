import {
  doPerformAction,
  getActionIdentifierFromKeyEvent,
  registerActionCallbacks,
} from "@fontra/core/actions.js";
import { applicationSettingsController } from "@fontra/core/application-settings.js";
import { Backend } from "@fontra/core/backend-api.js";
import { recordChanges } from "@fontra/core/change-recorder.js";
import { reverseUndoRecord, UndoStack } from "@fontra/core/font-controller.js";
import { makeFontraMenuBar } from "@fontra/core/fontra-menus.js";
import { staticGlyphToGLIF } from "@fontra/core/glyph-glif.js";
import { GlyphOrganizer } from "@fontra/core/glyph-organizer.js";
import { pathToSVG } from "@fontra/core/glyph-svg.js";
import {
  getMyGlyphSets,
  GlyphSetsController,
  PROJECT_GLYPH_SETS_CUSTOM_DATA_KEY,
  readProjectGlyphSets,
  THIS_FONTS_GLYPHSET,
} from "@fontra/core/glyphsets-controller.js";
import * as html from "@fontra/core/html-utils.js";
import { loaderSpinner } from "@fontra/core/loader-spinner.js";
import { translate } from "@fontra/core/localization.js";
import { ObservableController } from "@fontra/core/observable-object.js";
import { labeledTextInput } from "@fontra/core/ui-utils.js";
import {
  assert,
  asyncMap,
  consolidateCalls,
  dumpURLFragment,
  glyphMapToItemList,
  isActiveElementTypeable,
  modulo,
  objectsEqual,
  range,
  readFromClipboard,
  readObjectFromURLFragment,
  scheduleCalls,
  sleepAsync,
  writeObjectToURLFragment,
  writeToClipboard,
} from "@fontra/core/utils.js";
import { VariableGlyph } from "@fontra/core/var-glyph.js";
import { ViewController } from "@fontra/core/view-controller.js";
import { GlyphCellView } from "@fontra/web-components/glyph-cell-view.js";
import { MenuItemDivider, showMenu } from "@fontra/web-components/menu-panel.js";
import { dialogSetup, message } from "@fontra/web-components/modal-dialog.js";
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
  static titlePattern(displayName) {
    return `Fontra Font Overview — ${displayName}`;
  }

  constructor(font) {
    super(font);

    this.undoStack = new UndoStack();

    this.initActions();

    const myMenuBar = makeFontraMenuBar(["File", "Edit", "View", "Font"], this);
    document.querySelector(".top-bar-container").appendChild(myMenuBar);

    this.updateGlyphSelection = consolidateCalls(() => this._updateGlyphSelection());

    this.updateWindowLocation = scheduleCalls(
      (event) => this._updateWindowLocation(),
      200
    );
  }

  getEditMenuItems() {
    const menuItems = [
      { actionIdentifier: "action.undo" },
      { actionIdentifier: "action.redo" },
      MenuItemDivider,
      { actionIdentifier: "action.cut" }, // TODO: see comment below
      { actionIdentifier: "action.copy" },
      { actionIdentifier: "action.paste" },
      { actionIdentifier: "action.delete" },
      MenuItemDivider,
      { actionIdentifier: "action.select-all" },
      { actionIdentifier: "action.select-none" },
    ];

    return menuItems;
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

    this.fontOverviewSettingsController = new ObservableController({
      ...getDefaultFontOverviewSettings(),
      projectGlyphSets: readProjectGlyphSets(this.fontController),
      myGlyphSets: getMyGlyphSets(),
    });
    this.fontOverviewSettings = this.fontOverviewSettingsController.model;

    this.glyphSetsController = new GlyphSetsController(
      this.fontController,
      this.fontOverviewSettingsController
    );

    this.glyphOrganizer = new GlyphOrganizer();
    this.glyphOrganizer.setSearchString(this.fontOverviewSettings.searchString);
    this.glyphOrganizer.setGroupByKeys(this.fontOverviewSettings.groupByKeys);

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

    this._setupLocationDependencies();

    this._updateFromWindowLocation();

    const { subscriptionPattern } = this.getSubscriptionPatterns();
    await this.fontController.subscribeChanges(subscriptionPattern, false);

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
    this.glyphCellView.oncontextmenu = (event) => this.handleContextMenu(event);

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

  async externalChange(change, isLiveChange) {
    await super.externalChange(change, isLiveChange);
    this.undoStack.clear();
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
    this._fontGlyphItemList = this.glyphOrganizer.sortGlyphs(
      glyphMapToItemList(this.fontController.glyphMap)
    );
    this.updateGlyphSelection();
  }

  async _updateGlyphSelection() {
    const { combinedGlyphMap, shouldSort } =
      await this.glyphSetsController.getCombinedGlyphMap(this._fontGlyphItemList);

    let combinedItemList = glyphMapToItemList(combinedGlyphMap);

    if (shouldSort) {
      combinedItemList = this.glyphOrganizer.sortGlyphs(combinedItemList);
    }

    const glyphItemList = this.glyphOrganizer.filterGlyphs(combinedItemList);
    const glyphSections = this.glyphOrganizer.groupGlyphs(glyphItemList);
    this.glyphCellView.setGlyphSections(glyphSections);

    // Show placeholder if no glyphs are found
    const noGlyphsElement = document.querySelector("#font-overview-no-glyphs");
    noGlyphsElement.classList.toggle("shown", !glyphSections.length);

    if (this.glyphCellView.glyphSelection?.size) {
      // If we have a selection, make sure the (beginning of) the selection
      // is visible. But wait until the next event cycle.
      // FIXME: this currently does not work if the first selected cell
      // does not exist yet (is too far out of view)
      await sleepAsync(0);
      const firstSelectedCell = this.glyphCellView.findFirstSelectedCell();
      firstSelectedCell?.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "nearest",
      });
    }
  }

  handleContextMenu(event) {
    event.preventDefault();

    const { x, y } = event;
    this.contextMenuPosition = { x: x, y: y };
    showMenu(this.getEditMenuItems(), { x: x + 1, y: y - 1 });
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
    if (document.activeElement === document.querySelector("menu-bar")) {
      return;
    }
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
      () => this.canUndoRedo(false),
      () => this.getUndoRedoLabel(false)
    );

    registerActionCallbacks(
      "action.redo",
      () => this.doUndoRedo(true),
      () => this.canUndoRedo(true),
      () => this.getUndoRedoLabel(true)
    );

    registerActionCallbacks(
      "action.cut",
      () => this.doCut(),
      () => this.canCutCopyOrDelete()
    );

    registerActionCallbacks(
      "action.copy",
      () => this.doCopy(),
      () => this.canCutCopyOrDelete()
    );

    registerActionCallbacks(
      "action.paste",
      () => this.doPaste(),
      () => this.canPaste()
    );

    registerActionCallbacks(
      "action.delete",
      (event) => this.doDelete(),
      () => this.canCutCopyOrDelete()
    );

    registerActionCallbacks(
      "action.select-all",
      () =>
        (this.glyphCellView.glyphSelection = new Set(
          Object.keys(this.fontController.glyphMap)
        )),
      () => true
    );

    registerActionCallbacks(
      "action.select-none",
      () => (this.glyphCellView.glyphSelection = new Set()),
      () => this.glyphCellView.glyphSelection?.size > 0
    );

    registerActionCallbacks("action.zoom-in", () => this.zoomIn());
    registerActionCallbacks("action.zoom-out", () => this.zoomOut());
  }

  getSubscriptionPatterns() {
    const subscriptionPattern = this.fontController.getRootSubscriptionPattern();
    subscriptionPattern["glyphs"] = null;
    return { subscriptionPattern };
  }

  getUndoRedoLabel(isRedo) {
    const info = this.undoStack.getTopUndoRedoRecord(isRedo)?.info;
    return (
      (isRedo ? translate("action.redo") : translate("action.undo")) +
      (info ? " " + info.label : "")
    );
  }

  canUndoRedo(isRedo) {
    return this.undoStack.getTopUndoRedoRecord(isRedo)?.info;
  }

  async doUndoRedo(isRedo) {
    let undoRecord = this.undoStack.popUndoRedoRecord(isRedo);
    if (!undoRecord) {
      return;
    }
    if (isRedo) {
      undoRecord = reverseUndoRecord(undoRecord);
    }
    this.fontController.applyChange(undoRecord.rollbackChange);

    await this.fontController.postChange(
      undoRecord.rollbackChange,
      undoRecord.change,
      undoRecord.info.label
    );

    await sleepAsync(0);
    undoRecord.info.contextCallbacks?.[isRedo ? "redoCallback" : "undoCallback"]?.();
  }

  doCut() {
    this.doCopy();
    this.doDelete();
  }

  doCopy() {
    const glyphNamesToCopy = this.getSelectedExistingGlyphNames();

    const jsonStringPromise = this.buildJSONStringForGlyphs(glyphNamesToCopy);

    let svgStringPromise;
    let glifStringPromise;

    if (glyphNamesToCopy.length == 1) {
      const stringPromises = this.buildPathStringsForGlyph(glyphNamesToCopy[0]);
      svgStringPromise = stringPromises.then((strings) => strings.svgString);
      glifStringPromise = stringPromises.then((strings) => strings.glifString);
    }

    const mapping = {
      "svg": svgStringPromise,
      "glif": glifStringPromise,
      "fontra-json": jsonStringPromise,
    };

    const plainTextStringPromise =
      mapping[applicationSettingsController.model.clipboardFormat] || jsonStringPromise;

    if (plainTextStringPromise == jsonStringPromise) {
      localStorage.removeItem("clipboardSelection.text-plain");
      localStorage.removeItem("clipboardSelection.fontra-json");
    } else {
      plainTextStringPromise.then((plainTextString) => {
        localStorage.setItem("clipboardSelection.text-plain", plainTextString);
      });
      jsonStringPromise.then((jsonString) => {
        localStorage.setItem("clipboardSelection.fontra-json", jsonString);
      });
    }

    const clipboardObject = {
      "text/plain": plainTextStringPromise,
      "web fontra/json-clipboard": jsonStringPromise,
    };

    if (svgStringPromise) {
      clipboardObject["text/html"] = svgStringPromise;
      clipboardObject["image/svg+xml"] = svgStringPromise;
      clipboardObject["web image/svg+xml"] = svgStringPromise;
    }

    writeToClipboard(clipboardObject).catch((error) =>
      console.error("error during clipboard write:", error)
    );

    this.glyphCellView.glyphSelection = new Set(glyphNamesToCopy);
  }

  async buildJSONStringForGlyphs(glyphNames) {
    const glyphs = await this.fontController.getMultipleGlyphs(glyphNames);
    const sourceLocations = this.fontController.getSourceLocations();
    // We need to freeze the glyphMap because it may otherwise have been changed
    const glyphMap = Object.fromEntries(
      glyphNames.map((glyphName) => [
        glyphName,
        this.fontController.glyphMap[glyphName],
      ])
    );

    const clipboardGlyphs = glyphNames.map((glyphName) => ({
      codePoints: glyphMap[glyphName],
      variableGlyph: glyphs[glyphName],
    }));

    const backgroundImageData = await this.fontController.collectBackgroundImageData(
      ...clipboardGlyphs.map((g) => g.variableGlyph)
    );

    const clipboardData = {
      type: "fontra-glyph-array",
      data: {
        glyphs: clipboardGlyphs,
        sourceLocations,
        backgroundImageData,
      },
    };

    return JSON.stringify(clipboardData);
  }

  async buildPathStringsForGlyph(glyphName) {
    const glyphController = await this.fontController.getGlyphInstance(
      glyphName,
      this.fontOverviewSettings.fontLocationSource
    );

    const flattenedPath = glyphController.flattenedPath;
    const bounds = flattenedPath.getControlBounds() || {
      xMin: 0,
      yMin: 0,
      xMax: 0,
      yMax: 0,
    };

    const svgString = pathToSVG(flattenedPath, bounds);
    const glifString = staticGlyphToGLIF(
      glyphName,
      glyphController.instance,
      this.fontController.glyphMap[glyphName] || []
    );

    return { svgString, glifString };
  }

  canPaste() {
    // TODO: do we have a pastable clipboard?
    // We need async support in the "canXxx" mechanism to find out.
    return true;
  }

  async doPaste() {
    const acceptableClipboardTypes = [
      "web fontra/json-clipboard",
      "web image/svg+xml",
      "image/svg+xml",
      "text/plain",
    ];

    const clipboardString = await readFromClipboard(acceptableClipboardTypes);

    if (!clipboardString) {
      return;
    }

    let jsonString = clipboardString.startsWith("{") ? clipboardString : null;

    if (
      !jsonString &&
      clipboardString === localStorage.getItem("clipboardSelection.text-plain")
    ) {
      jsonString = localStorage.getItem("clipboardSelection.fontra-json");
    }

    let clipboardData;

    const {
      glyphs: clipboardGlyphArray,
      sourceLocations,
      backgroundImageData,
    } = jsonString
      ? this._unpackJSONClipboard(jsonString)
      : await this._unpackOtherClipboard(clipboardString);

    if (!clipboardGlyphArray) {
      return;
    }

    let selectedGlyphInfos = this.glyphCellView.getSelectedGlyphInfo();
    let selectedGlyphNames = selectedGlyphInfos.map((info) => info.glyphName);

    const glyphMap = { ...this.fontController.glyphMap };

    if (!selectedGlyphInfos.length) {
      if (clipboardGlyphArray.some((glyphData) => !glyphData.variableGlyph.name)) {
        console.log("can't paste: clipboard has no glyph names");
        return;
      }

      selectedGlyphInfos = null;

      if (
        clipboardGlyphArray.some((glyphInfo) => glyphMap[glyphInfo.variableGlyph.name])
      ) {
        // At least some glyphs would be overwritten by the paste. Give the user some options.

        const newGlyphNames = await runDialogReplaceGlyphs(
          clipboardGlyphArray.map((glyphInfo) => glyphInfo.variableGlyph.name),
          glyphMap
        );
        if (!newGlyphNames) {
          // user cancelled
          return;
        }

        assert(newGlyphNames.length == clipboardGlyphArray.length);

        for (const i of range(clipboardGlyphArray.length)) {
          const glyphInfo = clipboardGlyphArray[i];
          const glyphName = newGlyphNames[i];

          if (glyphInfo.variableGlyph.name != glyphName) {
            glyphInfo.variableGlyph.name = glyphName;
            glyphInfo.codePoints = [];
          }
        }
      }

      selectedGlyphNames = clipboardGlyphArray.map(
        (glyphInfo) => glyphInfo.variableGlyph.name
      );
    }

    if (clipboardGlyphArray.length == 1 && selectedGlyphNames.length > 1) {
      // The clipboard contains a single glyph, yet multiple glyphs are selected.
      // Let's paste the copied glyph into all selected glyphs.
      for (const i of range(selectedGlyphNames.length - 1)) {
        clipboardGlyphArray.push(clipboardGlyphArray[0]);
      }
    }

    if (clipboardGlyphArray.length != selectedGlyphNames.length) {
      // TODO: warn if the source and target array lengths don't match?
    }

    const numGlyphs = Math.min(clipboardGlyphArray.length, selectedGlyphNames.length);
    selectedGlyphNames = selectedGlyphNames.slice(0, numGlyphs);

    const {
      glyphs: adjustedClipboardGlyphs,
      backgroundImageData: adjustedBackgroundImageData,
    } = this.fontController.adjustVariableGlyphsFromClipboard(
      clipboardGlyphArray
        .slice(0, numGlyphs)
        .map((clipboardGlyphInfo) => clipboardGlyphInfo.variableGlyph),
      sourceLocations || {},
      backgroundImageData
    );

    const clipboardGlyphsByName = Object.fromEntries(
      adjustedClipboardGlyphs.map((glyph) => [glyph.name, glyph])
    );

    const glyphs = await this.fontController.getMultipleGlyphs(selectedGlyphNames);
    const root = { glyphs, glyphMap };

    const changes = recordChanges(root, (root) => {
      for (const i of range(numGlyphs)) {
        const clipboardGlyphInfo = clipboardGlyphArray[i];
        const selectedGlyphInfo = selectedGlyphInfos?.[i];
        const destinationGlyphName = selectedGlyphNames[i];
        assert(clipboardGlyphInfo);
        assert(destinationGlyphName);
        const sourceGlyphName = clipboardGlyphInfo.variableGlyph.name;

        if (!selectedGlyphInfo) {
          root.glyphMap[destinationGlyphName] = clipboardGlyphInfo.codePoints || [];
        } else if (!glyphMap[destinationGlyphName]) {
          root.glyphMap[destinationGlyphName] = selectedGlyphInfo.codePoints || [];
        }

        const glyph = VariableGlyph.fromObject(clipboardGlyphsByName[sourceGlyphName]);
        glyph.name = destinationGlyphName;
        root.glyphs[destinationGlyphName] = glyph;
      }
    });

    this.glyphCellView.glyphSelection = new Set(selectedGlyphNames);

    this.fontController.applyChange(changes.change);

    {
      // glyphSelection closure
      const glyphSelection = this.glyphCellView.glyphSelection;
      const plural_s = numGlyphs > 1 ? "s" : "";
      await this.postChange(changes, `paste glyph${plural_s}`, {
        undoCallback: () => {
          this.glyphCellView.glyphSelection = glyphSelection;
        },
        redoCallback: () => {
          this.glyphCellView.glyphSelection = glyphSelection;
        },
      });
    }

    selectedGlyphNames.forEach((glyphName) =>
      this.fontController.glyphChanged(glyphName)
    );

    await this.fontController.writeBackgroundImages(adjustedBackgroundImageData);
  }

  _unpackJSONClipboard(jsonString) {
    let clipboardData;

    try {
      clipboardData = JSON.parse(jsonString);
    } catch (error) {
      console.error("can't parse JSON:", error);
      return {};
    }

    let clipboardGlyphs;

    if (clipboardData.type == "fontra-glyph-array") {
      clipboardGlyphs = clipboardData.data.glyphs;
    } else if (clipboardData.type == "fontra-variable-glyph") {
      clipboardGlyphs = [clipboardData.data];
    } else if (clipboardData.type == "fontra-layer-glyphs") {
      const glyphName = clipboardData.data.glyphName;
      const codePoints = clipboardData.data.codePoints || [];
      assert(glyphName);

      const glyph = clipboardData.data.layerGlyphs[0]?.glyph;
      assert(glyph);

      const variableGlyph = this.fontController.makeVariableGlyphFromSingleStaticGlyph(
        glyphName,
        glyph
      );

      clipboardGlyphs = [{ variableGlyph, glyphName, codePoints }];
    } else {
      console.log("Unrecognized JSON clipboard data format");
      return {};
    }

    return {
      glyphs: clipboardGlyphs,
      sourceLocations: clipboardData.data.sourceLocations,
      backgroundImageData: clipboardData.data.backgroundImageData,
    };
  }

  async _unpackOtherClipboard(clipboardString) {
    const glyph = await Backend.parseClipboard(clipboardString);
    if (!glyph) {
      return {};
    }

    const variableGlyph = this.fontController.makeVariableGlyphFromSingleStaticGlyph(
      undefined,
      glyph
    );
    return { glyphs: [{ variableGlyph }] };
  }

  canCutCopyOrDelete() {
    return this.getSelectedExistingGlyphNames().length > 0;
  }

  async doDelete() {
    const glyphMap = this.fontController.glyphMap;
    const glyphNamesToDelete = this.getSelectedExistingGlyphNames();
    // TODO: The following can take a long time for a big font with a big selection
    // Should there be:
    // - a warning?
    // - a progress dialog?
    const glyphs = await this.fontController.getMultipleGlyphs(glyphNamesToDelete);

    const root = { glyphs, glyphMap };
    const changes = recordChanges(root, (root) => {
      for (const glyphName of glyphNamesToDelete) {
        delete root.glyphMap[glyphName];
        delete root.glyphs[glyphName];
      }
    });
    {
      // glyphSelection closure
      const glyphSelection = this.glyphCellView.glyphSelection;
      const plural_s = glyphNamesToDelete.length > 1 ? "s" : "";
      await this.postChange(changes, `delete glyph${plural_s}`, {
        undoCallback: () => {
          this.glyphCellView.glyphSelection = glyphSelection;
        },
        redoCallback: () => {
          this.glyphCellView.glyphSelection = new Set();
        },
      });
    }
  }

  getSelectedGlyphNames(filterDuplicates = false) {
    const selectedGlyphInfo = this.glyphCellView.getSelectedGlyphInfo(filterDuplicates);
    return selectedGlyphInfo.map((info) => info.glyphName);
  }

  getSelectedExistingGlyphNames() {
    const glyphMap = this.fontController.glyphMap;
    return this.getSelectedGlyphNames().filter((glyphName) => glyphName in glyphMap);
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

  async postChange(changes, undoLabel, contextCallbacks) {
    const undoRecord = {
      change: changes.change,
      rollbackChange: changes.rollbackChange,
      info: {
        label: undoLabel,
        contextCallbacks: contextCallbacks,
      },
    };

    this.undoStack.pushUndoRecord(undoRecord);

    await this.fontController.postChange(
      changes.change,
      changes.rollbackChange,
      undoLabel
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

const PASTE_REPLACE = "replace";
const PASTE_ADD_SUFFIX_TO_DUPLICATES = "add-suffix-to-duplicates";
const PASTE_ADD_SUFFIX_TO_ALL = "add-suffix-to-all";

async function runDialogReplaceGlyphs(glyphNames, glyphMap) {
  let outputGlyphNames = glyphNames;

  const controller = new ObservableController({
    behavior: PASTE_REPLACE,
    suffix: ".alt",
  });

  controller.synchronizeWithLocalStorage("fontra-paste-replace-glyphs.");

  if (
    controller.model.behavior !== PASTE_REPLACE &&
    controller.model.behavior !== PASTE_ADD_SUFFIX_TO_DUPLICATES &&
    controller.model.behavior !== PASTE_ADD_SUFFIX_TO_ALL
  ) {
    controller.model.behavior = PASTE_REPLACE;
  }

  // TODO translation
  const dialog = await dialogSetup("Replace existing glyphs?", null, [
    { title: translate("dialog.cancel"), resultValue: "cancel", isCancelButton: true },
    { title: translate("dialog.okay"), resultValue: "ok", isDefaultButton: true },
  ]);

  const radioGroup = [];

  for (const [label, value] of [
    ["Replace existing glyphs", PASTE_REPLACE],
    ["Add a suffix to duplicate glyph names", PASTE_ADD_SUFFIX_TO_DUPLICATES],
    ["Add a suffix to all pasted glyph names", PASTE_ADD_SUFFIX_TO_ALL],
  ]) {
    radioGroup.push(
      html.input({
        type: "radio",
        id: value,
        value: value,
        name: "paste-replace-radio-group",
        checked: controller.model.behavior === value,
        onchange: (event) => (controller.model.behavior = event.target.value),
      }),
      html.label({ for: value }, [label]),
      html.br()
    );
  }

  radioGroup.push(
    html.div(
      {
        style: `
        margin-top: 0.5em;
        margin-bottom: 0.5em;
        display: grid;
        grid-template-columns: min-content auto;
        justify-items: start;
        align-items: center;
        align-content: start;
        gap: 0.25em;
      `,
      },
      labeledTextInput("Suffix:", controller, "suffix", { id: "suffix-text-input" })
    ),
    html.div({ id: "warning-string" }, [""])
  );

  const dialogContent = html.div({}, radioGroup);

  const updateAndValidate = () => {
    const { behavior, suffix } = controller.model;
    const cleanSuffix = suffix.trim();

    switch (behavior) {
      case PASTE_ADD_SUFFIX_TO_ALL:
        outputGlyphNames = glyphNames.map((glyphName) => glyphName + cleanSuffix);
        break;
      case PASTE_ADD_SUFFIX_TO_DUPLICATES:
        outputGlyphNames = glyphNames.map((glyphName) =>
          glyphMap[glyphName] ? glyphName + cleanSuffix : glyphName
        );
        break;
      default:
        outputGlyphNames = glyphNames;
    }

    const warningString = makeOverwriteGlyphsWarningString(outputGlyphNames, glyphMap);
    const warningElement = dialogContent.querySelector("#warning-string");
    warningElement.innerText = warningString;
  };

  controller.addKeyListener(["behavior", "suffix"], (event) => updateAndValidate());
  updateAndValidate();

  dialog.setContent(dialogContent);

  const result = await dialog.run();

  return result === "ok" ? outputGlyphNames : null;
}

function makeOverwriteGlyphsWarningString(
  glyphNames,
  glyphMap,
  numMentionedGlyphs = 3
) {
  glyphNames = glyphNames.filter((glyphName) => glyphMap[glyphName]);

  if (glyphNames.length <= 1) {
    return glyphNames.length
      ? `⚠️ Glyph '${glyphNames[0]}' will be overwritten.`
      : "No glyphs will be overwritten.";
  }

  const firstNames = glyphNames.slice(0, numMentionedGlyphs);
  const numMore =
    glyphNames.length > numMentionedGlyphs ? glyphNames.length - numMentionedGlyphs : 0;
  const lastMentioned = !numMore ? firstNames.pop() : undefined;

  return (
    "⚠️ Glyphs " +
    firstNames.map((glyphName) => `'${glyphName}'`).join(", ") +
    (numMore ? ` and ${numMore} more` : ` and '${lastMentioned}'`) +
    " will be overwritten."
  );
}
