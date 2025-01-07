import { FontOverviewNavigation } from "./panel-navigation.js";
import { GlyphOrganizer } from "/core/glyph-organizer.js";
import * as html from "/core/html-utils.js";
import { loaderSpinner } from "/core/loader-spinner.js";
import { translate } from "/core/localization.js";
import { ObservableController } from "/core/observable-object.js";
import {
  dumpURLFragment,
  glyphMapToItemList,
  isActiveElementTypeable,
  modulo,
  range,
  readObjectFromURLFragment,
  scheduleCalls,
  throttleCalls,
  writeObjectToURLFragment,
} from "/core/utils.js";
import { ViewController } from "/core/view-controller.js";
import { GlyphCellView } from "/web-components/glyph-cell-view.js";
import { message } from "/web-components/modal-dialog.js";

const persistentSettings = [
  { key: "searchString" },
  { key: "fontLocationUser" },
  { key: "glyphSelection", toJSON: (v) => [...v], fromJSON: (v) => new Set(v) },
  { key: "closedGlyphSections", toJSON: (v) => [...v], fromJSON: (v) => new Set(v) },
  { key: "groupByKeys" },
];

function getDefaultFontOverviewSettings() {
  return {
    searchString: "",
    fontLocationUser: {},
    fontLocationSource: {},
    glyphSelection: new Set(),
    closedGlyphSections: new Set(),
    groupByKeys: [],
  };
}

export class FontOverviewController extends ViewController {
  constructor(font) {
    super(font);

    this.updateGlyphSelection = throttleCalls(() => this._updateGlyphSelection(), 50);

    this.updateWindowLocation = scheduleCalls(
      (event) => this._updateWindowLocation(),
      200
    );
    this.initTopBar();
  }

  async start() {
    await loaderSpinner(this._start());
  }

  async _start() {
    await this.fontController.initialize();

    this.fontSources = await this.fontController.getSources();

    window.addEventListener("popstate", (event) => {
      this._updateFromWindowLocation();
    });

    this.fontOverviewSettingsController = new ObservableController(
      getDefaultFontOverviewSettings()
    );
    this.fontOverviewSettings = this.fontOverviewSettingsController.model;

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

    this.navigation = new FontOverviewNavigation(this);

    this.glyphCellView = new GlyphCellView(
      this.fontController,
      this.fontOverviewSettingsController,
      { locationKey: "fontLocationSource" }
    );

    this.glyphCellView.onOpenSelectedGlyphs = (event) => this.openSelectedGlyphs();

    sidebarContainer.appendChild(this.navigation);
    glyphCellViewContainer.appendChild(this.glyphCellView);

    this.fontController.addChangeListener({ glyphMap: null }, () => {
      this._updateGlyphItemList();
    });

    document.addEventListener("keydown", (event) => this.handleKeyDown(event));

    this._updateGlyphItemList();
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
          this.fontOverviewSettingsController.withSenderInfo(
            { fromFontLocationSource: true },
            () => {
              this.fontOverviewSettingsController.model.fontLocationUser =
                this.fontController.mapSourceLocationToUserLocation(event.newValue);
            }
          );
        }
      }
    );

    this.fontOverviewSettingsController.addKeyListener("fontLocationUser", (event) => {
      if (!event.senderInfo?.fromFontLocationSource) {
        this.fontOverviewSettingsController.withSenderInfo(
          { fromFontLocationUser: true },
          () => {
            this.fontOverviewSettingsController.model.fontLocationSource =
              this.fontController.mapUserLocationToSourceLocation(event.newValue);
          }
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

  _updateGlyphSelection() {
    // We possibly need to be smarter about this:
    this.glyphCellView.parentElement.scrollTop = 0;

    const glyphItemList = this.glyphOrganizer.filterGlyphs(this._glyphItemList);
    const glyphSections = this.glyphOrganizer.groupGlyphs(glyphItemList);
    this.glyphCellView.setGlyphSections(glyphSections);
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
    if (isActiveElementTypeable()) {
      // The cell area for sure doesn't have the focus
      return;
    }
    this.glyphCellView.handleKeyDown(event);
  }

  handleRemoteClose(event) {
    //
  }

  handleRemoteError(event) {
    //
  }
}

function openGlyphsInEditor(glyphsInfo, userLocation, glyphMap) {
  const url = new URL(window.location);
  url.pathname = url.pathname.replace("/fontoverview/", "/editor/");

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
