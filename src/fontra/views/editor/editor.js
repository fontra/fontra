import { CanvasController } from "../core/canvas-controller.js";
import { recordChanges } from "../core/change-recorder.js";
import { applyChange } from "../core/changes.js";
import { FontController } from "../core/font-controller.js";
import { staticGlyphToGLIF } from "../core/glyph-glif.js";
import { pathToSVG } from "../core/glyph-svg.js";
import { loaderSpinner } from "../core/loader-spinner.js";
import { ObservableController } from "../core/observable-object.js";
import {
  deleteSelectedPoints,
  filterPathByPointIndices,
} from "../core/path-functions.js";
import {
  centeredRect,
  rectAddMargin,
  rectCenter,
  rectFromArray,
  rectRound,
  rectScaleAroundCenter,
  rectSize,
  rectToArray,
} from "../core/rectangle.js";
import { getRemoteProxy } from "../core/remote.js";
import { SceneView } from "../core/scene-view.js";
import { parseClipboard } from "../core/server-utils.js";
import {
  commandKeyProperty,
  dumpURLFragment,
  enumerate,
  fetchJSON,
  hyphenatedToCamelCase,
  hyphenatedToLabel,
  isActiveElementTypeable,
  isObjectEmpty,
  loadURLFragment,
  makeUPlusStringFromCodePoint,
  parseSelection,
  range,
  readFromClipboard,
  reversed,
  scheduleCalls,
  writeToClipboard,
} from "../core/utils.js";
import { addItemwise, mulScalar, subItemwise } from "../core/var-funcs.js";
import { StaticGlyph, VariableGlyph, copyComponent } from "../core/var-glyph.js";
import { locationToString, makeSparseLocation } from "../core/var-model.js";
import { VarPackedPath, joinPaths } from "../core/var-path.js";
import { makeDisplayPath } from "../core/view-tools.js";
import { CJKDesignFrame } from "./cjk-design-frame.js";
import { HandTool } from "./edit-tools-hand.js";
import { PenTool } from "./edit-tools-pen.js";
import { PointerTool } from "./edit-tools-pointer.js";
import { PowerRulerTool } from "./edit-tools-power-ruler.js";
import { SceneController } from "./scene-controller.js";
import { MIN_SIDEBAR_WIDTH, Sidebar } from "./sidebar.js";
import {
  allGlyphsCleanVisualizationLayerDefinition,
  visualizationLayerDefinitions,
} from "./visualization-layer-definitions.js";
import { VisualizationLayers } from "./visualization-layers.js";
import * as html from "/core/html-utils.js";
import { themeController } from "/core/theme-settings.js";
import { MenuBar } from "/web-components/menu-bar.js";
import { MenuItemDivider, showMenu } from "/web-components/menu-panel.js";
import { dialog, dialogSetup, message } from "/web-components/modal-dialog.js";
import { parsePluginBasePath } from "/web-components/plugin-manager.js";

import DesignspaceNavigationPanel from "./panel-designspace-navigation.js";
import GlyphSearchPanel from "./panel-glyph-search.js";
import ReferenceFontPanel from "./panel-reference-font.js";
import SelectionInfoPanel from "./panel-selection-info.js";
import TextEntryPanel from "./panel-text-entry.js";
import UserSettingsPanel from "./panel-user-settings.js";
import Panel from "./panel.js";

const MIN_CANVAS_SPACE = 200;

const PASTE_BEHAVIOR_REPLACE = "replace";
const PASTE_BEHAVIOR_ADD = "add";

export class EditorController {
  static async fromWebSocket() {
    const pathItems = window.location.pathname.split("/").slice(3);
    const displayPath = makeDisplayPath(pathItems);
    document.title = `Fontra — ${decodeURI(displayPath)}`;
    const projectPath = pathItems.join("/");
    const protocol = window.location.protocol === "http:" ? "ws" : "wss";
    const wsURL = `${protocol}://${window.location.host}/websocket/${projectPath}`;

    const remoteFontEngine = await getRemoteProxy(wsURL);
    const editorController = new EditorController(remoteFontEngine);
    remoteFontEngine.receiver = editorController;
    remoteFontEngine.onclose = (event) => editorController.handleRemoteClose(event);
    remoteFontEngine.onerror = (event) => editorController.handleRemoteError(event);
    await editorController.start();
    return editorController;
  }

  constructor(font) {
    const canvas = document.querySelector("#edit-canvas");
    canvas.focus();

    const canvasController = new CanvasController(canvas, (magnification) =>
      this.canvasMagnificationChanged(magnification)
    );
    this.canvasController = canvasController;

    this.fontController = new FontController(font);
    this.fontController.addEditListener(
      async (...args) => await this.editListenerCallback(...args)
    );

    this.clipboardFormatController = new ObservableController({ format: "glif" });
    this.clipboardFormatController.synchronizeWithLocalStorage("fontra-clipboard-");

    this.experimentalFeaturesController = new ObservableController({
      scalingEditBehavior: false,
      quadPenTool: false,
      rectSelectLiveModifiers: false,
    });
    this.experimentalFeaturesController.synchronizeWithLocalStorage(
      "fontra-editor-experimental-features."
    );

    this.sceneController = new SceneController(
      this.fontController,
      canvasController,
      this.experimentalFeaturesController
    );

    this.sceneSettingsController = this.sceneController.sceneSettingsController;
    this.sceneSettings = this.sceneSettingsController.model;
    this.sceneModel = this.sceneController.sceneModel;

    this.sceneSettingsController.addKeyListener(
      ["align", "location", "selectedGlyph", "selection", "text", "viewBox"],
      (event) => {
        if (event.senderInfo?.senderID !== this && !event.senderInfo?.adjustViewBox) {
          this.updateWindowLocation(); // scheduled with delay
        }
      }
    );

    this.cjkDesignFrame = new CJKDesignFrame(this);

    this.visualizationLayers = new VisualizationLayers(
      visualizationLayerDefinitions,
      this.isThemeDark
    );

    this.visualizationLayersSettings = newVisualizationLayersSettings(
      this.visualizationLayers
    );
    this.visualizationLayersSettings.addListener((event) => {
      this.visualizationLayers.toggle(event.key, event.newValue);
      this.canvasController.requestUpdate();
    }, true);

    const sceneView = new SceneView(this.sceneModel, (model, controller) =>
      this.visualizationLayers.drawVisualizationLayers(model, controller)
    );
    canvasController.sceneView = sceneView;

    this.defaultSceneView = sceneView;

    this.cleanGlyphsLayers = new VisualizationLayers(
      [allGlyphsCleanVisualizationLayerDefinition],
      this.isThemeDark
    );
    this.cleanSceneView = new SceneView(this.sceneModel, (model, controller) => {
      this.cleanGlyphsLayers.drawVisualizationLayers(model, controller);
    });

    // TODO move event stuff out of here
    this.sceneController.addEventListener("doubleClickedComponents", async (event) => {
      this.doubleClickedComponentsCallback(event);
    });

    this.sceneController.addEventListener("glyphEditCannotEditReadOnly", async () => {
      this.showDialogGlyphEditCannotEditReadOnly();
    });

    this.sceneController.addEventListener("glyphEditLocationNotAtSource", async () => {
      this.showDialogGlyphEditLocationNotAtSource();
    });

    this.sceneController.addEventListener("doubleClickedUndefinedGlyph", () => {
      if (this.fontController.readOnly) {
        this.showDialogGlyphEditCannotEditReadOnly(true);
      } else {
        this.showDialogNewGlyph();
      }
    });

    this.sidebars = [];

    this.initSidebars();
    this.initTopBar();
    this.initContextMenuItems();
    this.initShortCuts();
    this.initMiniConsole();

    // If a stored active panel is not a plug-in, we can restore it before the plug-ins
    // are loaded. Else, it has to wait until after.
    const deferRestoreOpenTabs = [];
    for (const sidebar of this.sidebars) {
      const panelName = localStorage.getItem(
        `fontra-selected-sidebar-${sidebar.identifier}`
      );
      if (sidebar.panelIdentifiers.includes(panelName)) {
        this.restoreOpenTabs(sidebar.identifier);
      } else {
        deferRestoreOpenTabs.push(sidebar.identifier);
      }
    }

    this.initPlugins().then(() => {
      for (const identifier of deferRestoreOpenTabs) {
        this.restoreOpenTabs(identifier);
      }
    });

    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addListener((event) => this.themeChanged());
    themeController.addListener((event) => {
      this.themeChanged();
    });

    this.canvasController.canvas.addEventListener("contextmenu", (event) =>
      this.contextMenuHandler(event)
    );
    window.addEventListener("keydown", (event) => this.keyDownHandler(event));
    window.addEventListener("keyup", (event) => this.keyUpHandler(event));

    this.enteredText = "";
    this.updateWindowLocation = scheduleCalls(
      (event) => this._updateWindowLocation(),
      200
    );

    window.addEventListener("popstate", (event) => {
      this.setupFromWindowLocation();
    });

    document.addEventListener("visibilitychange", (event) => {
      if (this._reconnectDialog) {
        if (document.visibilityState === "visible") {
          this._reconnectDialog.cancel();
        } else {
          this._reconnectDialog.hide();
        }
      }
    });

    this.updateWithDelay();
  }

  initTopBar() {
    const menuBar = new MenuBar([
      {
        title: "File",
        getItems() {
          return [
            {
              title: "New...",
              enabled: () => false,
              callback: () => {},
              shortCut: undefined,
            },
            {
              title: "Open...",
              enabled: () => false,
              callback: () => {},
              shortCut: undefined,
            },
          ];
        },
      },
      {
        title: "Edit",
        getItems: () => {
          const menuItems = [...this.basicContextMenuItems];
          if (this.sceneSettings.selectedGlyph?.isEditing) {
            this.sceneController.updateContextMenuState(event);
            menuItems.push(MenuItemDivider);
            menuItems.push(...this.glyphEditContextMenuItems);
          }
          return menuItems;
        },
      },
      {
        title: "View",
        getItems: () => {
          const items = [
            {
              title: "Zoom in",
              enabled: () => true,
              shortCut: { keysOrCodes: "+=", metaKey: true, globalOverride: true },
              callback: () => {
                this.zoomIn();
              },
            },
            {
              title: "Zoom out",
              shortCut: { keysOrCodes: "-", metaKey: true, globalOverride: true },
              enabled: () => true,
              callback: () => {
                this.zoomOut();
              },
            },
            {
              title: "Zoom to fit",
              enabled: () => {
                let viewBox = this.sceneController.getSelectionBox();
                if (!viewBox) {
                  return false;
                }

                const size = rectSize(viewBox);
                if (size.width < 4 && size.height < 4) {
                  const center = rectCenter(viewBox);
                  viewBox = centeredRect(center.x, center.y, 10, 10);
                } else {
                  viewBox = rectAddMargin(viewBox, 0.1);
                }
                return !this.canvasController.isActualViewBox(viewBox);
              },
              shortCut: { keysOrCodes: "0", metaKey: true, globalOverride: true },
              callback: () => {
                this.zoomFit();
              },
            },
          ];
          if (typeof this.sceneModel.selectedGlyph !== "undefined") {
            this.sceneController.updateContextMenuState();
            items.push(MenuItemDivider);
            items.push(...this.glyphSelectedContextMenuItems);
          }
          return items;
        },
      },
      {
        title: "Glyph",
        enabled: () => true,
        getItems: () => {
          return [
            {
              title: "Add source...",
              enabled: () => {
                return typeof this.sceneModel.selectedGlyph !== "undefined";
              },
              callback: () => {
                this.getSidebarPanel("designspace-navigation").addSource();
              },
            },
            {
              title: "Delete source...",
              enabled: () => {
                return typeof this.sceneModel.selectedGlyph !== "undefined";
              },
              callback: () => {
                const designspaceNavigationPanel = this.getSidebarPanel(
                  "designspace-navigation"
                );
                designspaceNavigationPanel.removeSource(
                  designspaceNavigationPanel.sourcesList.getSelectedItemIndex()
                );
              },
            },
            {
              title: "Edit local axes...",
              enabled: () => {
                return typeof this.sceneModel.selectedGlyph !== "undefined";
              },
              callback: () => {
                this.getSidebarPanel("designspace-navigation").editLocalAxes();
              },
            },
          ];
        },
      },
      {
        title: "Extensions",
        enabled: () => true,
        getItems: () => {
          return [
            {
              title: "Plugin manager",
              enabled: () => true,
              callback: () => {
                window.open("/plugins/plugins.html");
              },
            },
          ];
        },
      },
      {
        title: "Help",
        enabled: () => true,
        getItems: () => {
          return [
            {
              title: "Homepage",
              enabled: () => true,
              callback: () => {
                window.open("https://fontra.xyz/");
              },
            },
            {
              title: "Documentation",
              enabled: () => true,
              callback: () => {
                window.open("https://gferreira.github.io/fontra-docs/");
              },
            },
            {
              title: "GitHub",
              enabled: () => true,
              callback: () => {
                window.open("https://github.com/googlefonts/fontra");
              },
            },
          ];
        },
      },
    ]);
    document.querySelector(".top-bar-container").appendChild(menuBar);
  }

  restoreOpenTabs(sidebarName) {
    // Restore the sidebar selection/visible state from localStorage.
    const panelName = localStorage.getItem(`fontra-selected-sidebar-${sidebarName}`);
    if (panelName) {
      this.toggleSidebar(panelName, false);
    }
  }

  async initPlugins() {
    const observablePlugins = new ObservableController({
      plugins: [],
    });
    observablePlugins.synchronizeWithLocalStorage("fontra.plugins");
    for (const { address } of observablePlugins.model.plugins) {
      const pluginPath = parsePluginBasePath(address);
      let meta;
      try {
        meta = await fetchJSON(`${pluginPath}/plugin.json`);
      } catch (e) {
        console.error(`${address} Plugin metadata not found.`);
        continue;
      }
      const initScript = meta.init;
      const functionName = meta.function;
      let module;
      try {
        module = await import(`${pluginPath}/${initScript}`);
      } catch (e) {
        console.error("Module didn't load");
        console.log(e);
        continue;
      }
      try {
        module[functionName](this, pluginPath);
      } catch (e) {
        console.error(`Error occured when running (${meta.name || address}) plugin.`);
        console.log(e);
        continue;
      }
    }
  }

  async updateWithDelay() {
    // The first time ever on the page (or after a deep reload), we draw before
    // all webfonts are fully loaded, and any undefined glyphs show the wrong UI
    // font. Let's just reload after a tiny delay.
    //
    // Doing the following should help, but it doesn't, unless we add the delay.
    // await document.fonts.ready;
    setTimeout(() => this.canvasController.requestUpdate(), 50);
  }

  async start() {
    await loaderSpinner(this._start());
  }

  async _start() {
    await this.fontController.initialize();
    const rootSubscriptionPattern = {};
    for (const rootKey of this.fontController.getRootKeys()) {
      rootSubscriptionPattern[rootKey] = null;
    }
    await this.fontController.subscribeChanges(rootSubscriptionPattern, false);
    this.initTools();

    const blankFont = new FontFace("AdobeBlank", `url("/fonts/AdobeBlank.woff2")`, {});
    document.fonts.add(blankFont);
    await blankFont.load();

    // Delay a tiny amount to account for a delay in the sidebars being set up,
    // which affects the available viewBox
    setTimeout(() => this.setupFromWindowLocation(), 20);
  }

  async showDialogNewGlyph() {
    const positionedGlyph =
      this.sceneController.sceneModel.getSelectedPositionedGlyph();
    this.sceneSettings.selectedGlyph = {
      ...this.sceneSettings.selectedGlyph,
      isEditing: false,
    };
    const uniString = makeUPlusStringFromCodePoint(
      positionedGlyph.character?.codePointAt(0)
    );
    const charMsg = positionedGlyph.character
      ? ` for character “${positionedGlyph.character}” (${uniString})`
      : "";
    const result = await dialog(
      `Create a new glyph “${positionedGlyph.glyphName}”?`,
      `Click “Create” if you want to create a new glyph named “${positionedGlyph.glyphName}”${charMsg}.`,
      [
        { title: "Cancel", resultValue: "no", isCancelButton: true },
        { title: "Create", resultValue: "ok", isDefaultButton: true },
      ]
    );
    if (result === "ok") {
      const layerName = "<default>";
      await this.newGlyph(
        positionedGlyph.glyphName,
        positionedGlyph.character?.codePointAt(0),
        VariableGlyph.fromObject({
          name: positionedGlyph.glyphName,
          sources: [{ name: layerName, location: {}, layerName: layerName }],
          layers: { [layerName]: { glyph: positionedGlyph.glyph.instance } },
        })
      );
      this.sceneSettings.selectedGlyph = {
        ...this.sceneSettings.selectedGlyph,
        isEditing: true,
      };
      this.sceneSettings.selectedSourceIndex = 0;
    }
  }

  async showDialogGlyphEditCannotEditReadOnly(create = false) {
    const glyphName = this.sceneSettings.selectedGlyphName;
    await message(
      `Can’t ${create ? "create" : "edit"} glyph “${glyphName}”`,
      "The font is read-only."
    );
  }

  async showDialogGlyphEditLocationNotAtSource() {
    const glyphName = this.sceneSettings.selectedGlyphName;
    const result = await dialog(
      `Can’t edit glyph “${glyphName}”`,
      "The location is not at a source.",
      [
        { title: "Cancel", resultValue: "cancel", isCancelButton: true },
        { title: "New source", resultValue: "createNewSource" },
        {
          title: "Go to nearest source",
          resultValue: "goToNearestSource",
          isDefaultButton: true,
        },
      ]
    );
    switch (result) {
      case "createNewSource":
        this.getSidebarPanel("designspace-navigation").addSource();
        break;
      case "goToNearestSource":
        const glyphController =
          await this.sceneModel.getSelectedVariableGlyphController();
        const nearestSourceIndex = glyphController.findNearestSourceFromGlobalLocation(
          this.sceneSettings.location,
          true
        );
        this.sceneSettings.selectedSourceIndex = nearestSourceIndex;
        break;
    }
  }

  initTools() {
    this.tools = {};
    const editToolClasses = [PointerTool, PenTool, PowerRulerTool, HandTool];
    for (const editToolClass of editToolClasses) {
      this.addEditTool(new editToolClass(this));
    }
    this.setSelectedTool("pointer-tool");

    for (const zoomElement of document.querySelectorAll("#zoom-tools > .tool-button")) {
      const toolIdentifier = zoomElement.dataset.tool;
      zoomElement.onclick = () => {
        switch (toolIdentifier) {
          case "zoom-in":
            this.zoomIn();
            break;
          case "zoom-out":
            this.zoomOut();
            break;
          case "zoom-fit-selection":
            this.zoomFit();
            break;
          case "toggle-fullscreen":
            this.toggleFullscreen();
            break;
        }
        this.canvasController.canvas.focus();
      };
    }

    // init fullscreen button
    this.updateFullscreenButton();
    document.addEventListener("fullscreenchange", () => {
      this.updateFullscreenButton();
    });
  }

  addEditTool(tool) {
    this.tools[tool.identifier] = tool;

    const editToolsElement = document.querySelector("#edit-tools");
    const toolButton = html.div(
      {
        "class": "tool-button selected",
        "data-tool": tool.identifier,
        "data-tooltip": hyphenatedToLabel(tool.identifier),
        "data-tooltipposition": "bottom",
      },
      [html.createDomElement("inline-svg", { class: "tool-icon", src: tool.iconPath })]
    );

    toolButton.onclick = () => {
      this.setSelectedTool(tool.identifier);
      this.canvasController.canvas.focus();
    };

    editToolsElement.appendChild(toolButton);
  }

  initSidebars() {
    this.addSidebar(new Sidebar("left"));
    this.addSidebar(new Sidebar("right"));
    this.addSidebarPanel(new TextEntryPanel(this), "left");
    this.addSidebarPanel(new GlyphSearchPanel(this), "left");
    this.addSidebarPanel(new DesignspaceNavigationPanel(this), "left");
    this.addSidebarPanel(new UserSettingsPanel(this), "left");
    this.addSidebarPanel(new ReferenceFontPanel(this), "left");
    this.addSidebarPanel(new SelectionInfoPanel(this), "right");

    // Upon reload, the "animating" class may still be set (why?), so remove it
    for (const sidebarContainer of document.querySelectorAll(".sidebar-container")) {
      sidebarContainer.classList.remove("animating");
    }

    // After the initial set up we want clicking the sidebar tabs to animate in and out
    // (Here we can afford a longer delay.)
    setTimeout(() => {
      for (const sidebarContainer of document.querySelectorAll(".sidebar-container")) {
        sidebarContainer.classList.add("animating");
      }
    }, 100);

    const resizeObserver = new ResizeObserver(([element]) => {
      const totalWidth = this.sidebars.reduce(
        (total, sidebar) => total + sidebar.getDOMWidth(),
        0
      );
      if (element.contentRect.width < totalWidth + MIN_CANVAS_SPACE) {
        for (const sidebar of this.sidebars) {
          sidebar.applyWidth(MIN_SIDEBAR_WIDTH, true);
        }
      }
    });
    resizeObserver.observe(document.documentElement);
  }

  addSidebar(sidebar) {
    const editorContainer = document.querySelector(".editor-container");
    sidebar.attach(editorContainer);
    this.sidebars.push(sidebar);
  }

  addSidebarPanel(panelElement, sidebarName) {
    const sidebar = this.sidebars.find((sidebar) => sidebar.identifier === sidebarName);

    if (!sidebar) {
      throw new Error(
        `"${sidebarName}" not a valid sidebar name. Available sidebars: ${this.sidebars
          .map((sidebar) => `"${sidebar.identifier}"`)
          .join(", ")}`
      );
    }

    if (sidebar.panelIdentifiers.includes(panelElement.name)) {
      throw new Error(
        `Panel "${panelElement.identifier}" in "${sidebarName}" sidebar exists.`
      );
    }

    sidebar.addPanel(panelElement);

    const tabElement = document.querySelector(
      `.sidebar-tab[data-sidebar-name="${panelElement.identifier}"]`
    );

    tabElement.addEventListener("click", () => {
      this.toggleSidebar(panelElement.identifier, true);
    });
  }

  getSidebarPanel(panelName) {
    return document.querySelector(`.sidebar-content[data-sidebar-name="${panelName}"]`)
      .children[0];
  }

  toggleSidebar(panelName, doFocus = false) {
    const sidebar = this.sidebars.find((sidebar) =>
      sidebar.panelIdentifiers.includes(panelName)
    );
    if (!sidebar) {
      return;
    }
    const onOff = sidebar.toggle(panelName);
    localStorage.setItem(
      `fontra-selected-sidebar-${sidebar.identifier}`,
      onOff ? panelName : ""
    );
    const panel = this.getSidebarPanel(panelName);
    if (typeof panel.toggle === "function") {
      panel.toggle(onOff, doFocus);
    }
    return onOff;
  }

  initMiniConsole() {
    this.miniConsole = document.querySelector("#mini-console");
    this._console_log = console.log.bind(console);
    const clearMiniConsole = scheduleCalls(() => {
      this.miniConsole.innerText = "";
      this.miniConsole.style.display = "none";
    }, 5000);
    console.log = (...args) => {
      this._console_log(...args);
      this.miniConsole.innerText = args
        .map((item) => {
          try {
            return typeof item == "string" ? item : JSON.stringify(item);
          } catch (error) {
            return item;
          }
        })
        .join(" ");
      this.miniConsole.style.display = "inherit";
      clearMiniConsole();
    };
  }

  setSelectedTool(toolIdentifier) {
    for (const editToolItem of document.querySelectorAll(
      "#edit-tools > .tool-button"
    )) {
      editToolItem.classList.toggle(
        "selected",
        editToolItem.dataset.tool === toolIdentifier
      );
    }
    this.sceneController.setSelectedTool(this.tools[toolIdentifier]);
  }

  themeChanged() {
    this.visualizationLayers.darkTheme = this.isThemeDark;
    this.cleanGlyphsLayers.darkTheme = this.isThemeDark;
    this.canvasController.requestUpdate();
  }

  get isThemeDark() {
    const themeValue = themeController.model.theme;
    if (themeValue === "automatic") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } else {
      return themeValue === "dark";
    }
  }

  canvasMagnificationChanged(magnification) {
    this.visualizationLayers.scaleFactor = 1 / magnification;
    this.cleanGlyphsLayers.scaleFactor = 1 / magnification;
  }

  async doubleClickedComponentsCallback(event) {
    const glyphController = await this.sceneModel.getSelectedStaticGlyphController();
    const instance = glyphController.instance;
    const localLocations = {};
    const glyphInfos = [];

    const compoStrings = this.sceneController.doubleClickedComponentIndices.map(
      (componentIndex) =>
        `${instance.components[componentIndex].name} (#${componentIndex})`
    );
    const result = await dialog(
      `Would you like to add the selected component${
        compoStrings.length != 1 ? "s" : ""
      } to the text string?`,
      compoStrings.join("\n"),
      [
        { title: "Cancel", isCancelButton: true },
        { title: "Add", isDefaultButton: true },
      ]
    );
    if (!result) {
      // User cancelled
      return;
    }

    for (const componentIndex of this.sceneController.doubleClickedComponentIndices) {
      const glyphName = instance.components[componentIndex].name;
      const location = instance.components[componentIndex].location;
      if (location) {
        localLocations[glyphName] = location;
      }
      glyphInfos.push(this.fontController.glyphInfoFromGlyphName(glyphName));
    }
    this.sceneController.updateLocalLocations(localLocations);
    const selectedGlyphInfo = this.sceneSettings.selectedGlyph;
    const glyphLines = [...this.sceneSettings.glyphLines];
    glyphLines[selectedGlyphInfo.lineIndex].splice(
      selectedGlyphInfo.glyphIndex + 1,
      0,
      ...glyphInfos
    );
    this.sceneSettings.glyphLines = glyphLines;

    this.sceneSettings.selectedGlyph = {
      lineIndex: selectedGlyphInfo.lineIndex,
      glyphIndex: selectedGlyphInfo.glyphIndex + 1,
    };
  }

  initContextMenuItems() {
    this.basicContextMenuItems = [];
    for (const isRedo of [false, true]) {
      this.basicContextMenuItems.push({
        title: () => this.getUndoRedoLabel(isRedo),
        enabled: () => this.canUndoRedo(isRedo),
        callback: () => this.doUndoRedo(isRedo),
        shortCut: { keysOrCodes: "z", metaKey: true, shiftKey: isRedo },
      });
    }
    this.basicContextMenuItems.push(MenuItemDivider);

    if (window.safari !== undefined && window.location.protocol === "http:") {
      // In Safari, the async clipboard API only works in a secure context
      // (HTTPS). We apply a workaround using the clipboard event API, but
      // only in Safari, and when in an HTTP context
      this.initFallbackClipboardEventListeners();
    } else {
      this.basicContextMenuItems.push(
        {
          title: "Cut",
          enabled: () => this.canCut(),
          callback: () => this.doCut(),
          shortCut: { keysOrCodes: "x", metaKey: true, shiftKey: false },
        },
        {
          title: "Copy",
          enabled: () => this.canCopy(),
          callback: () => this.doCopy(),
          shortCut: { keysOrCodes: "c", metaKey: true, shiftKey: false },
        },
        {
          title: "Paste",
          enabled: () => this.canPaste(),
          callback: () => this.doPaste(),
          shortCut: { keysOrCodes: "v", metaKey: true, shiftKey: false },
        }
      );
    }

    this.basicContextMenuItems.push({
      title: () =>
        this.sceneSettings.selectedGlyph?.isEditing
          ? "Delete selection"
          : "Delete glyph",
      enabled: () => this.canDelete(),
      callback: (event) => this.doDelete(event),
      shortCut: {
        keysOrCodes: ["Delete", "Backspace"],
        metaKey: false,
        shiftKey: false,
      },
    });

    this.basicContextMenuItems.push(MenuItemDivider);

    for (const selectNone of [false, true]) {
      this.basicContextMenuItems.push({
        title: selectNone ? "Select None" : "Select All",
        enabled: () => this.canSelectAllNone(selectNone),
        callback: () => this.doSelectAllNone(selectNone),
        shortCut: { keysOrCodes: "a", metaKey: true, shiftKey: selectNone },
      });
    }

    this.glyphEditContextMenuItems = [];

    this.glyphEditContextMenuItems.push({
      title: "Add Component",
      enabled: () => this.canAddComponent(),
      callback: () => this.doAddComponent(),
      shortCut: undefined,
    });

    this.glyphEditContextMenuItems.push(...this.sceneController.getContextMenuItems());

    this.glyphSelectedContextMenuItems = [];
    for (const selectPrevious of [true, false]) {
      const prevNext = selectPrevious ? "previous" : "next";
      this.glyphSelectedContextMenuItems.push({
        title: `Select ${prevNext} source`,
        enabled: () => true,
        callback: () => this.doSelectPreviousNextSource(selectPrevious),
        shortCut: {
          keysOrCodes: [selectPrevious ? "ArrowUp" : "ArrowDown"],
          metaKey: true,
          altKey: false,
          shiftKey: false,
        },
      });
    }

    this.glyphSelectedContextMenuItems.push({
      title: () => `Find glyphs that use '${this.sceneSettings.selectedGlyphName}'`,
      enabled: () => this.fontController.backendInfo.features["glyphs-used-by"],
      callback: () => this.doFindGlyphsUsedBy(),
    });
  }

  initShortCuts() {
    this.shortCutHandlers = {};

    this.registerShortCut(["Space"], { metaKey: false, repeat: false }, () => {
      this.spaceKeyDownHandler();
    });

    this.registerShortCut("-", { metaKey: true, globalOverride: true }, () => {
      this.zoomOut();
    });
    this.registerShortCut("+=", { metaKey: true, globalOverride: true }, () => {
      this.zoomIn();
    });
    this.registerShortCut("0", { metaKey: true, globalOverride: true }, () => {
      this.zoomFit();
    });
    this.registerShortCut("123456789", { metaKey: false }, (event) => {
      const toolIndex = parseInt(event.key) - 1;
      if (toolIndex < Object.keys(this.tools).length) {
        this.setSelectedTool(Object.keys(this.tools)[toolIndex]);
      }
    });
    this.registerShortCut("f", { metaKey: true, globalOverride: true }, () => {
      this.toggleSidebar("glyph-search", true);
    });
    this.registerShortCut("i", { metaKey: true, globalOverride: true }, () => {
      this.toggleSidebar("selection-info", true);
    });
    this.registerShortCut("e", { metaKey: true, globalOverride: true }, () => {
      this.getSidebarPanel("designspace-navigation").onEditHeaderClick();
    });

    for (const menuItem of [
      ...this.basicContextMenuItems,
      ...this.glyphEditContextMenuItems,
      ...this.glyphSelectedContextMenuItems,
    ]) {
      if (menuItem.shortCut) {
        this.registerShortCut(
          menuItem.shortCut.keysOrCodes,
          menuItem.shortCut,
          menuItem.callback,
          menuItem.enabled
        );
      }
    }
  }

  initFallbackClipboardEventListeners() {
    window.addEventListener("paste", async (event) => {
      if (document.activeElement === this.canvasController.canvas) {
        event.preventDefault();
        this.doPaste();
      }
    });

    window.addEventListener("copy", async (event) => {
      if (document.activeElement === this.canvasController.canvas) {
        event.preventDefault();
        await this.doCopy(event);
      }
    });

    window.addEventListener("cut", async (event) => {
      if (document.activeElement === this.canvasController.canvas) {
        event.preventDefault();
        await this.doCut(event);
      }
    });
  }

  registerShortCut(keysOrCodes, modifiers, callback, enabled = null) {
    //
    // Register a shortcut handler
    //
    // `keysOrCodes` is a list of event codes or a string or list of key strings.
    // Any item in the list or string will be seen as a trigger for the handler.
    //
    // `modifiers` is an object that allows you to match a specific boolean event
    // property. For example, { shiftKey: false } requires that the shift key must
    // not be pressed. If shiftKey is undefined, the state of the shift key is not
    // taken into account when matching the handler.
    //
    // `callback` is a callable that will be called with the event as its single
    // argument.
    //
    // `enabled` is an optional callable that should return true if the action is
    // enabled. If `enabled()` returns false, `callback` will not be called.
    // If `enabled` is not given, `callback` will be called unconditionally.
    //

    for (const keyOrCode of keysOrCodes) {
      const handlerDef = { ...modifiers, callback, enabled };
      if (!this.shortCutHandlers[keyOrCode]) {
        this.shortCutHandlers[keyOrCode] = [];
      }
      this.shortCutHandlers[keyOrCode].push(handlerDef);
    }
  }

  async keyDownHandler(event) {
    const { callback, enabled } = this._getShortCutCallback(event);
    if (callback !== undefined) {
      this.sceneController.updateContextMenuState(null);
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!enabled || enabled()) {
        await callback(event);
      }
    }
  }

  _getShortCutCallback(event) {
    let handlerDefs = this.shortCutHandlers[event.key.toLowerCase()];
    if (!handlerDefs) {
      handlerDefs = this.shortCutHandlers[event.code];
    }
    if (!handlerDefs) {
      return {};
    }
    for (const handlerDef of handlerDefs) {
      if (
        (isActiveElementTypeable() || window.getSelection().toString()) &&
        !handlerDef.globalOverride
      ) {
        continue;
      }
      if (
        handlerDef.metaKey !== undefined &&
        handlerDef.metaKey !== event[commandKeyProperty]
      ) {
        continue;
      }
      if (!matchEvent(handlerDef, event)) {
        continue;
      }
      return { callback: handlerDef.callback, enabled: handlerDef.enabled };
    }
    return {};
  }

  getUndoRedoLabel(isRedo) {
    const info = this.sceneController.getUndoRedoInfo(isRedo);
    return (isRedo ? "Redo" : "Undo") + (info ? " " + info.label : "");
  }

  canUndoRedo(isRedo) {
    return !!this.sceneController.getUndoRedoInfo(isRedo);
  }

  async doUndoRedo(isRedo) {
    await this.sceneController.doUndoRedo(isRedo);
  }

  canCut() {
    return (
      (this.sceneSettings.selectedGlyph &&
        !this.sceneSettings.selectedGlyph.isEditing) ||
      this.sceneController.selection.size
    );
  }

  async doCut(event = null) {
    if (
      this.sceneSettings.selectedGlyph.isEditing &&
      !this.sceneController.selection.size
    ) {
      return;
    }
    if (!this.sceneSettings.selectedGlyph.isEditing) {
      await this.doCopy(event);
      this.fontController.deleteGlyph(
        this.sceneSettings.selectedGlyphName,
        `cut glyph "${this.sceneSettings.selectedGlyphName}"`
      );
      return;
    }
    if (event) {
      // We *have* to do this first, as it won't work after any
      // await (Safari insists on that). So we have to do a bit
      // of redundant work by calling _prepareCopyOrCut twice.
      const { layerGlyphs, flattenedPath } = this._prepareCopyOrCutLayers(
        undefined,
        false
      );
      await this._writeLayersToClipboard(null, layerGlyphs, flattenedPath, event);
    }
    let copyResult;
    await this.sceneController.editGlyphAndRecordChanges(
      (glyph) => {
        copyResult = this._prepareCopyOrCutLayers(glyph, true);
        this.sceneController.selection = new Set();
        return "Cut Selection";
      },
      undefined,
      true
    );
    if (copyResult && !event) {
      const { layerGlyphs, flattenedPath } = copyResult;
      await this._writeLayersToClipboard(null, layerGlyphs, flattenedPath);
    }
  }

  canCopy() {
    return this.sceneSettings.selectedGlyph;
  }

  async doCopy(event) {
    if (!this.canCopy()) {
      return;
    }

    if (this.sceneSettings.selectedGlyph.isEditing) {
      const { layerGlyphs, flattenedPath } = this._prepareCopyOrCutLayers(
        undefined,
        false
      );
      await this._writeLayersToClipboard(null, layerGlyphs, flattenedPath, event);
    } else {
      const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
      const varGlyph = positionedGlyph.varGlyph.glyph;
      const glyphController = positionedGlyph.glyph;
      await this._writeLayersToClipboard(
        varGlyph,
        [{ glyph: glyphController.instance }],
        glyphController.flattenedPath,
        event
      );
    }
  }

  async _writeLayersToClipboard(varGlyph, layerGlyphs, flattenedPath, event) {
    if (!layerGlyphs?.length) {
      // nothing to do
      return;
    }

    let bounds = flattenedPath?.getControlBounds();
    if (!bounds) {
      bounds = { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
    }

    const svgString = pathToSVG(flattenedPath, bounds);
    const glyphName = this.sceneSettings.selectedGlyphName;
    const unicodes = this.fontController.glyphMap[glyphName] || [];
    const glifString = staticGlyphToGLIF(glyphName, layerGlyphs[0].glyph, unicodes);
    const jsonString = JSON.stringify(
      varGlyph ? { variableGlyph: varGlyph } : { layerGlyphs: layerGlyphs }
    );

    const mapping = { "svg": svgString, "glif": glifString, "fontra-json": jsonString };
    const plainTextString =
      mapping[this.clipboardFormatController.model.format] || glifString;

    localStorage.setItem("clipboardSelection.text-plain", plainTextString);
    localStorage.setItem("clipboardSelection.glyph", jsonString);

    if (event) {
      // This *has* to be called before anything is awaited, or
      // Safari won't recognize it as part of the same event handler
      event.clipboardData.setData("text/plain", plainTextString);
    } else {
      const clipboardObject = {
        "text/plain": plainTextString,
        "text/html": svgString,
        "web image/svg+xml": svgString,
        "web fontra/static-glyph": jsonString,
      };
      await writeToClipboard(clipboardObject);
    }
  }

  _prepareCopyOrCutLayers(varGlyph, doCut) {
    let varGlyphController;
    if (!varGlyph) {
      varGlyphController = this.sceneModel.getSelectedPositionedGlyph().varGlyph;
      varGlyph = varGlyphController.glyph;
    } else {
      varGlyphController = this.fontController.makeVariableGlyphController(varGlyph);
    }
    if (!varGlyph) {
      return;
    }

    const layerLocations = {};
    for (const source of varGlyph.sources) {
      if (!(source.layerName in layerLocations)) {
        layerLocations[source.layerName] = makeSparseLocation(
          source.location,
          varGlyphController.combinedAxes
        );
      }
    }

    const layerGlyphs = [];
    let flattenedPath;
    for (const [layerName, layerGlyph] of Object.entries(
      this.sceneController.getEditingLayerFromGlyphLayers(varGlyph.layers)
    )) {
      const copyResult = this._prepareCopyOrCut(layerGlyph, doCut, !flattenedPath);
      if (!copyResult.instance) {
        return;
      }
      if (!flattenedPath) {
        flattenedPath = copyResult.flattenedPath;
      }
      layerGlyphs.push({
        layerName,
        location: layerLocations[layerName],
        glyph: copyResult.instance,
      });
    }
    if (!layerGlyphs.length && !doCut) {
      const { instance, flattenedPath: instancePath } = this._prepareCopyOrCut(
        undefined,
        false,
        true
      );
      flattenedPath = instancePath;
      if (!instance) {
        return;
      }
      layerGlyphs.push({ glyph: instance });
    }
    return { layerGlyphs, flattenedPath };
  }

  _prepareCopyOrCut(editInstance, doCut = false, wantFlattenedPath = false) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    const glyphController = positionedGlyph?.glyph;
    if (!glyphController) {
      return {};
    }

    if (!editInstance) {
      editInstance = glyphController.instance;
    }

    if (!this.sceneController.selection.size) {
      // No selection, fall back to "all", unless doCut is true
      return doCut
        ? {}
        : {
            instance: editInstance,
            flattenedPath: wantFlattenedPath
              ? glyphController.flattenedPath
              : undefined,
          };
    }

    const { point: pointIndices, component: componentIndices } = parseSelection(
      this.sceneController.selection
    );
    let path;
    let components;
    const flattenedPathList = wantFlattenedPath ? [] : undefined;
    if (pointIndices) {
      path = filterPathByPointIndices(editInstance.path, pointIndices, doCut);
      flattenedPathList?.push(path);
    }
    if (componentIndices) {
      flattenedPathList?.push(
        ...componentIndices.map((i) => glyphController.components[i].path)
      );
      components = componentIndices.map((i) => editInstance.components[i]);
      if (doCut) {
        for (const componentIndex of reversed(componentIndices)) {
          editInstance.components.splice(componentIndex, 1);
        }
      }
    }
    const instance = StaticGlyph.fromObject({
      ...editInstance,
      path: path,
      components: components,
    });
    return {
      instance: instance,
      flattenedPath: wantFlattenedPath ? joinPaths(flattenedPathList) : undefined,
    };
  }

  canPaste() {
    return true;
  }

  async doPaste() {
    let { pasteVarGlyph, pasteLayerGlyphs } = await this._unpackClipboard();
    if (!pasteVarGlyph && !pasteLayerGlyphs?.length) {
      return;
    }

    if (pasteVarGlyph && this.sceneSettings.selectedGlyph.isEditing) {
      const result = await runDialogWholeGlyphPaste();
      if (!result) {
        return;
      }
      if (result === PASTE_BEHAVIOR_ADD) {
        // We will paste an entire variable glyph onto the existing layers.
        // Build pasteLayerGlyphs from the glyph's sources.
        const varGlyphController =
          this.fontController.makeVariableGlyphController(pasteVarGlyph);
        const combinedAxes = varGlyphController.combinedAxes;
        pasteLayerGlyphs = pasteVarGlyph.sources.map((source) => {
          return {
            layerName: source.layerName,
            location: makeSparseLocation(source.location, combinedAxes),
            glyph: pasteVarGlyph.layers[source.layerName].glyph,
          };
        });
        // Sort so the default source comes first, as it is used as a fallback
        pasteLayerGlyphs.sort((a, b) =>
          !isObjectEmpty(a.location) && isObjectEmpty(b.location) ? 1 : -1
        );
        pasteVarGlyph = null;
      }
    } else if (!pasteVarGlyph && !this.sceneSettings.selectedGlyph.isEditing) {
      // We're pasting layers onto a glyph in select mode. Build a VariableGlyph
      // from the layers as good as we can.
      const layers = {};
      const sources = [];
      if (pasteLayerGlyphs.length === 1) {
        const layerName = "<default>";
        layers[layerName] = { glyph: pasteLayerGlyphs[0].glyph };
        sources.push({ name: layerName, layerName });
      } else {
        for (const { layerName, location, glyph } of pasteLayerGlyphs) {
          if (layerName) {
            layers[layerName] = { glyph };
            sources.push({ name: layerName, layerName, location: location || {} });
          }
        }
      }
      pasteVarGlyph = VariableGlyph.fromObject({ layers, sources });
      pasteLayerGlyphs = null;
    }

    if (pasteVarGlyph) {
      const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
      if (positionedGlyph.isUndefined) {
        await this.newGlyph(
          positionedGlyph.glyphName,
          positionedGlyph.character?.codePointAt(0),
          pasteVarGlyph,
          `paste new glyph "${positionedGlyph.glyphName}"`
        );
      } else {
        await this._pasteReplaceGlyph(pasteVarGlyph);
      }
      // Force sync between location and selectedSourceIndex, as the glyph's
      // source list may have changed
      this.sceneSettings.location = { ...this.sceneSettings.location };
    } else {
      await this._pasteLayerGlyphs(pasteLayerGlyphs);
    }
  }

  async _unpackClipboard() {
    const plainText = await readFromClipboard("text/plain");
    if (!plainText) {
      return {};
    }

    let customJSON;
    try {
      customJSON = await readFromClipboard("web fontra/static-glyph");
    } catch (error) {
      // fall through, try localStorage clipboard
    }

    if (
      !customJSON &&
      plainText === localStorage.getItem("clipboardSelection.text-plain")
    ) {
      customJSON = localStorage.getItem("clipboardSelection.glyph");
    }
    if (!customJSON && plainText[0] == "{") {
      customJSON = plainText;
    }

    let pasteLayerGlyphs;
    let pasteVarGlyph;

    if (customJSON) {
      try {
        const clipboardObject = JSON.parse(customJSON);
        pasteLayerGlyphs = clipboardObject.layerGlyphs?.map((layer) => {
          return {
            layerName: layer.layerName,
            location: layer.location,
            glyph: StaticGlyph.fromObject(layer.glyph),
          };
        });
        if (clipboardObject.variableGlyph) {
          pasteVarGlyph = VariableGlyph.fromObject(clipboardObject.variableGlyph);
        }
      } catch (error) {
        console.log("couldn't paste from JSON:", error.toString());
      }
    } else {
      pasteLayerGlyphs = [{ glyph: await this.parseClipboard(plainText) }];
    }
    return { pasteVarGlyph, pasteLayerGlyphs };
  }

  async _pasteReplaceGlyph(varGlyph) {
    await this.sceneController.editGlyphAndRecordChanges(
      (glyph) => {
        for (const [property, value] of Object.entries(varGlyph)) {
          if (property !== "name") {
            glyph[property] = value;
          }
        }
        return "Paste";
      },
      undefined,
      false
    );
  }

  async _pasteLayerGlyphs(pasteLayerGlyphs) {
    const defaultPasteGlyph = pasteLayerGlyphs[0].glyph;
    const pasteLayerGlyphsByLayerName = Object.fromEntries(
      pasteLayerGlyphs.map((layer) => [layer.layerName, layer.glyph])
    );

    const pasteLayerGlyphsByLocationString = Object.fromEntries(
      pasteLayerGlyphs
        .filter((layer) => layer.location)
        .map((layer) => [locationToString(layer.location), layer.glyph])
    );

    const varGlyphController =
      await this.sceneModel.getSelectedVariableGlyphController();
    const locationStringsBySourceLayerName = Object.fromEntries(
      varGlyphController.sources.map((source) => [
        source.layerName,
        locationToString(
          makeSparseLocation(source.location, varGlyphController.combinedAxes)
        ),
      ])
    );

    await this.sceneController.editGlyphAndRecordChanges(
      (glyph) => {
        const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
          glyph.layers
        );
        const firstLayerGlyph = Object.values(editLayerGlyphs)[0];

        const selection = new Set();
        for (const pointIndex of range(defaultPasteGlyph.path.numPoints)) {
          const pointType =
            defaultPasteGlyph.path.pointTypes[pointIndex] &
            VarPackedPath.POINT_TYPE_MASK;
          if (pointType === VarPackedPath.ON_CURVE) {
            selection.add(`point/${pointIndex + firstLayerGlyph.path.numPoints}`);
          }
        }
        for (const componentIndex of range(
          firstLayerGlyph.components.length,
          firstLayerGlyph.components.length + defaultPasteGlyph.components.length
        )) {
          selection.add(`component/${componentIndex}`);
        }

        for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
          const pasteGlyph =
            pasteLayerGlyphsByLayerName[layerName] ||
            pasteLayerGlyphsByLocationString[
              locationStringsBySourceLayerName[layerName]
            ] ||
            defaultPasteGlyph;
          layerGlyph.path.appendPath(pasteGlyph.path);
          layerGlyph.components.push(...pasteGlyph.components.map(copyComponent));
        }
        this.sceneController.selection = selection;
        return "Paste";
      },
      undefined,
      true
    );
  }

  async parseClipboard(data) {
    const result = await parseClipboard(data);
    return result ? StaticGlyph.fromObject(result) : undefined;
  }

  canDelete() {
    return (
      (this.sceneSettings.selectedGlyph &&
        !this.sceneSettings.selectedGlyph.isEditing) ||
      (this.sceneSettings.selectedGlyph?.isEditing &&
        this.sceneController.selection.size > 0)
    );
  }

  async doDelete(event) {
    if (
      this.sceneSettings.selectedGlyph &&
      !this.sceneSettings.selectedGlyph.isEditing
    ) {
      await this._deleteCurrentGlyph(event);
    } else {
      await this._deleteSelection(event);
    }
  }

  async _deleteCurrentGlyph(event) {
    const glyphName = this.sceneSettings.selectedGlyphName;
    const result = await dialog(
      `Are you sure you want to delete glyph "${glyphName}" from the font project?`,
      "",
      [
        { title: "Cancel", isCancelButton: true },
        { title: "Delete glyph", isDefaultButton: true, resultValue: "ok" },
      ]
    );
    if (!result) {
      return;
    }
    this.fontController.deleteGlyph(glyphName);
  }

  async _deleteSelection(event) {
    const { point: pointSelection, component: componentSelection } = parseSelection(
      this.sceneController.selection
    );
    await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      for (const layerGlyph of Object.values(layerGlyphs)) {
        if (event.altKey) {
          // Behave like "cut", but don't put anything on the clipboard
          this._prepareCopyOrCut(layerGlyph, true, false);
        } else {
          if (pointSelection) {
            deleteSelectedPoints(layerGlyph.path, pointSelection);
          }
          if (componentSelection) {
            for (const componentIndex of reversed(componentSelection)) {
              layerGlyph.components.splice(componentIndex, 1);
            }
          }
        }
      }
      this.sceneController.selection = new Set();
      return "Delete Selection";
    });
  }

  canAddComponent() {
    return this.sceneModel.getSelectedPositionedGlyph()?.glyph.canEdit;
  }

  async doAddComponent() {
    const glyphsSearch = document.createElement("glyphs-search");
    glyphsSearch.glyphMap = this.fontController.glyphMap;

    glyphsSearch.addEventListener("selectedGlyphNameChanged", (event) => {
      dialog.defaultButton.classList.toggle(
        "disabled",
        !glyphsSearch.getSelectedGlyphName()
      );
    });

    glyphsSearch.addEventListener("selectedGlyphNameDoubleClicked", (event) => {
      dialog.defaultButton.click();
    });

    const dialog = await dialogSetup("Add Component", null, [
      { title: "Cancel", isCancelButton: true },
      { title: "Add", isDefaultButton: true, resultValue: "ok", disabled: true },
    ]);

    dialog.setContent(glyphsSearch);

    setTimeout(() => glyphsSearch.focusSearchField(), 0); // next event loop iteration

    if (!(await dialog.run())) {
      // User cancelled
      return;
    }

    const glyphName = glyphsSearch.getSelectedGlyphName();
    if (!glyphName) {
      // Invalid selection
      return;
    }

    const transformation = {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      tCenterX: 0,
      tCenterY: 0,
    };
    const baseGlyph = await this.fontController.getGlyph(glyphName);
    const location = Object.fromEntries(
      baseGlyph.glyph.axes.map((axis) => [axis.name, axis.defaultValue])
    );
    const newComponent = {
      name: glyphName,
      transformation: transformation,
      location: location,
    };
    await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      for (const layerGlyph of Object.values(layerGlyphs)) {
        layerGlyph.components.push({
          name: newComponent.name,
          transformation: { ...newComponent.transformation },
          location: { ...newComponent.location },
        });
      }
      const instance = this.sceneModel.getSelectedPositionedGlyph().glyph.instance;
      const newComponentIndex = instance.components.length - 1;
      this.sceneController.selection = new Set([`component/${newComponentIndex}`]);
      return "Add Component";
    });
  }

  canSelectAllNone(selectNone) {
    return this.sceneSettings.selectedGlyph?.isEditing;
  }

  doSelectAllNone(selectNone) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph || !this.sceneSettings.selectedGlyph?.isEditing) {
      return;
    }

    const newSelection = new Set();

    if (!selectNone) {
      const glyphPath = positionedGlyph.glyph.path;
      const glyphComponents = positionedGlyph.glyph.components;

      for (const [pointIndex, pointType] of enumerate(glyphPath.pointTypes)) {
        if ((pointType & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.ON_CURVE) {
          newSelection.add(`point/${pointIndex}`);
        }
      }

      for (const [componentIndex] of glyphComponents.entries()) {
        newSelection.add(`component/${componentIndex}`);
      }
    }

    this.sceneController.selection = newSelection;
  }

  async doSelectPreviousNextSource(selectPrevious) {
    const instance = this.sceneModel.getSelectedPositionedGlyph()?.glyph;
    if (!instance) {
      return;
    }
    const varGlyphController =
      await this.sceneModel.getSelectedVariableGlyphController();
    const sourceIndex = this.sceneSettings.selectedSourceIndex;
    let newSourceIndex;
    if (sourceIndex === undefined) {
      newSourceIndex = varGlyphController.findNearestSourceFromGlobalLocation(
        this.sceneSettings.location
      );
    } else {
      const numSources = varGlyphController.sources.length;
      newSourceIndex =
        (selectPrevious ? sourceIndex + numSources - 1 : sourceIndex + 1) % numSources;
    }
    this.sceneController.scrollAdjustBehavior = "pin-glyph-center";
    this.sceneSettings.selectedSourceIndex = newSourceIndex;
  }

  async doFindGlyphsUsedBy() {
    const glyphName = this.sceneSettings.selectedGlyphName;

    const usedBy = await loaderSpinner(this.fontController.getGlyphsUsedBy(glyphName));

    if (!usedBy.length) {
      await message(
        `Glyph '${glyphName}' is not used as a component by any glyph.`,
        null
      );
      return;
    }

    usedBy.sort();

    const glyphMap = Object.fromEntries(
      usedBy.map((glyphName) => [glyphName, this.fontController.glyphMap[glyphName]])
    );

    const glyphsSearch = document.createElement("glyphs-search");
    glyphsSearch.glyphMap = glyphMap;

    glyphsSearch.addEventListener("selectedGlyphNameDoubleClicked", (event) => {
      theDialog.defaultButton.click();
    });

    const theDialog = await dialogSetup(
      `Glyphs that use glyph '${glyphName}' as a component`,
      null,
      [
        { title: "Cancel", isCancelButton: true },
        { title: "Copy names", resultValue: "copy" },
        {
          title: "Add to text",
          isDefaultButton: true,
          resultValue: "add",
        },
      ]
    );

    theDialog.setContent(glyphsSearch);

    setTimeout(() => glyphsSearch.focusSearchField(), 0); // next event loop iteration

    switch (await theDialog.run()) {
      case "copy": {
        const glyphNamesString = chunks(usedBy, 16)
          .map((chunked) => chunked.map((glyphName) => "/" + glyphName).join(""))
          .join("\n");
        const clipboardObject = {
          "text/plain": glyphNamesString,
        };
        await writeToClipboard(clipboardObject);
        break;
      }
      case "add": {
        const glyphName = glyphsSearch.getSelectedGlyphName();
        const MAX_NUM_GLYPHS = 100;
        const truncate = !glyphName && usedBy.length > MAX_NUM_GLYPHS;
        const glyphNames = glyphName
          ? [glyphName]
          : truncate
          ? usedBy.slice(0, MAX_NUM_GLYPHS)
          : usedBy;

        const glyphInfos = glyphNames.map((glyphName) =>
          this.fontController.glyphInfoFromGlyphName(glyphName)
        );
        const selectedGlyphInfo = this.sceneSettings.selectedGlyph;
        const glyphLines = [...this.sceneSettings.glyphLines];
        glyphLines[selectedGlyphInfo.lineIndex].splice(
          selectedGlyphInfo.glyphIndex + 1,
          0,
          ...glyphInfos
        );
        this.sceneSettings.glyphLines = glyphLines;
        if (truncate) {
          await message(
            `The number of added glyphs was truncated to ${MAX_NUM_GLYPHS}`,
            null
          );
        }
        break;
      }
    }
  }

  keyUpHandler(event) {
    if (event.code === "Space") {
      this.spaceKeyUpHandler();
      return;
    }
  }

  spaceKeyDownHandler(event) {
    if (isActiveElementTypeable()) {
      return;
    }
    this.canvasController.sceneView = this.cleanSceneView;
    this.canvasController.requestUpdate();
    for (const overlay of document.querySelectorAll(".cleanable-overlay")) {
      overlay.classList.add("overlay-layer-hidden");
    }
  }

  spaceKeyUpHandler(event) {
    this.canvasController.sceneView = this.defaultSceneView;
    this.canvasController.requestUpdate();
    for (const overlay of document.querySelectorAll(".cleanable-overlay")) {
      overlay.classList.remove("overlay-layer-hidden");
    }
  }

  buildContextMenuItems(event) {
    const menuItems = [...this.basicContextMenuItems];
    if (this.sceneSettings.selectedGlyph?.isEditing) {
      this.sceneController.updateContextMenuState(event);
      menuItems.push(MenuItemDivider);
      menuItems.push(...this.glyphEditContextMenuItems);
    }
    if (this.sceneSettings.selectedGlyph) {
      menuItems.push(MenuItemDivider);
      menuItems.push(...this.glyphSelectedContextMenuItems);
    }
    return menuItems;
  }

  contextMenuHandler(event) {
    event.preventDefault();

    const { x, y } = event;
    showMenu(this.buildContextMenuItems(event), { x: x + 1, y: y - 1 }, event.target);
  }

  async newGlyph(glyphName, codePoint, varGlyph, undoLabel = null) {
    await this.fontController.newGlyph(glyphName, codePoint, varGlyph, undoLabel);
  }

  async externalChange(change, isLiveChange) {
    await this.fontController.applyChange(change, true);
    this.fontController.notifyChangeListeners(change, isLiveChange);

    // Force sync between location and selectedSourceIndex, as the glyph's
    // source list may have changed
    this.sceneSettings.location = { ...this.sceneSettings.location };
    await this.sceneModel.updateScene();
    this.canvasController.requestUpdate();
  }

  async reloadData(reloadPattern) {
    for (const rootKey of Object.keys(reloadPattern)) {
      if (rootKey == "glyphs") {
        const glyphNames = Object.keys(reloadPattern["glyphs"] || {});
        if (glyphNames.length) {
          await this.reloadGlyphs(glyphNames);
        }
      } else {
        // TODO
        console.log(`reloading of non-glyph data is not yet implemented: ${rootKey}`);
      }
    }
  }

  async reloadGlyphs(glyphNames) {
    if (glyphNames.includes(this.sceneSettings.selectedGlyphName)) {
      // If the glyph being edited is among the glyphs to be reloaded,
      // cancel the edit, but wait for the cancellation to be completed,
      // or else the reload and edit can get mixed up and the glyph data
      // will be out of sync.
      await this.sceneController.cancelEditing(
        "Someone else made an edit just before you."
      );
    }
    await this.fontController.reloadGlyphs(glyphNames);
    await this.sceneModel.updateScene();
    const selectedGlyphName = this.sceneSettings.selectedGlyphName;
    this.canvasController.requestUpdate();
  }

  async messageFromServer(headline, msg) {
    // don't await the dialog result, the server doesn't need an answer
    message(headline, msg);
  }

  async setupFromWindowLocation() {
    this.sceneSettingsController.withSenderInfo({ senderID: this }, () =>
      this._setupFromWindowLocation()
    );
  }

  async _setupFromWindowLocation() {
    let viewInfo;
    const url = new URL(window.location);
    if (url.hash) {
      viewInfo = loadURLFragment(url.hash);
    } else {
      // Legacy URL format
      viewInfo = {};
      for (const key of url.searchParams.keys()) {
        viewInfo[key] = JSON.parse(url.searchParams.get(key));
      }
    }
    this.sceneSettings.align = viewInfo["align"] || "center";
    if (viewInfo["viewBox"]) {
      this.sceneController.autoViewBox = false;
      const viewBox = viewInfo["viewBox"];
      if (viewBox.every((value) => !isNaN(value))) {
        this.sceneSettings.viewBox = rectFromArray(viewBox);
      }
    }

    if (viewInfo["text"]) {
      this.sceneSettings.text = viewInfo["text"];
      // glyphLines is computed from text asynchronously, but its result is needed
      // to for selectedGlyphName, so we'll wait until it's done
      await this.sceneSettingsController.waitForKeyChange("glyphLines");
    }
    this._previousURLText = viewInfo["text"];

    this.sceneModel.setLocalLocations(viewInfo["localLocations"]);

    if (viewInfo["location"]) {
      this.sceneSettings.location = viewInfo["location"];
    }

    this.sceneSettings.selectedGlyph = viewInfo["selectedGlyph"];

    if (viewInfo["selection"]) {
      this.sceneSettings.selection = new Set(viewInfo["selection"]);
    }
    this.canvasController.requestUpdate();
    this._didFirstSetup = true;
  }

  _updateWindowLocation() {
    if (!this._didFirstSetup) {
      // We shall not change the window location ever before we've done
      // an initial setup _from_ the window location
      return;
    }
    const viewInfo = {};
    const viewBox = this.sceneSettings.viewBox;

    if (viewBox && Object.values(viewBox).every((value) => !isNaN(value))) {
      viewInfo["viewBox"] = rectToArray(rectRound(viewBox));
    }
    if (this.sceneSettings.text?.length) {
      viewInfo["text"] = this.sceneSettings.text;
    }
    if (this.sceneSettings.selectedGlyph) {
      viewInfo["selectedGlyph"] = this.sceneSettings.selectedGlyph;
    }
    viewInfo["location"] = this.sceneController.getGlobalLocation();
    const localLocations = this.sceneController.getLocalLocations(true);
    if (Object.keys(localLocations).length) {
      viewInfo["localLocations"] = localLocations;
    }
    const selArray = Array.from(this.sceneController.selection);
    if (selArray.length) {
      viewInfo["selection"] = Array.from(selArray);
    }
    if (this.sceneSettings.align !== "center") {
      viewInfo["align"] = this.sceneSettings.align;
    }

    const url = new URL(window.location);
    clearSearchParams(url.searchParams); /* clear legacy URL format */
    url.hash = dumpURLFragment(viewInfo);
    if (this._previousURLText !== viewInfo["text"]) {
      window.history.pushState({}, "", url);
    } else if (this._previousURLHash !== url.hash) {
      window.history.replaceState({}, "", url);
    }
    this._previousURLText = viewInfo["text"];
    this._previousURLHash = url.hash;
  }

  async editListenerCallback(editMethodName, senderID, ...args) {
    if (editMethodName === "editFinal") {
      this.sceneController.updateHoverState();
    }
  }

  zoomIn() {
    this._zoom(1 / Math.sqrt(2));
  }

  zoomOut() {
    this._zoom(Math.sqrt(2));
  }

  _zoom(factor) {
    let viewBox = this.sceneSettings.viewBox;
    const selBox = this.sceneController.getSelectionBox();
    const center = rectCenter(selBox || viewBox);
    viewBox = rectScaleAroundCenter(viewBox, factor, center);

    const adjustFactor =
      this.canvasController.getProposedViewBoxClampAdjustment(viewBox);
    if (adjustFactor !== 1) {
      // The viewBox is too large or too small
      if (Math.abs(adjustFactor * factor - 1) < 0.00000001) {
        // Already at min/max magnification
        return;
      }
      viewBox = rectScaleAroundCenter(viewBox, adjustFactor, center);
    }

    this.animateToViewBox(viewBox);
    this.sceneController.autoViewBox = false;
  }

  zoomFit() {
    let viewBox = this.sceneController.getSelectionBox();
    if (viewBox) {
      let size = rectSize(viewBox);
      if (size.width < 4 && size.height < 4) {
        const center = rectCenter(viewBox);
        viewBox = centeredRect(center.x, center.y, 10, 10);
      } else {
        viewBox = rectAddMargin(viewBox, 0.1);
      }
      this.animateToViewBox(viewBox);
    }
    this.sceneController.autoViewBox = false;
  }

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      const element = document.documentElement;
      element.requestFullscreen();
    }
  }

  updateFullscreenButton() {
    // hide button in case fullscreen is not enabled on device
    const fullscreenButtonEl = document.querySelector(
      ".tool-button[data-tool='toggle-fullscreen']"
    );
    if (!document.fullscreenEnabled) {
      fullscreenButtonEl.style.display = "none";
      return;
    }
    // fullscreen is enabled, show the right icon depending on the fullscreen state
    const fullscreenEnterIconEl = fullscreenButtonEl.querySelector(
      ".tool-icon--fullscreen-enter"
    );
    const fullscreenExitIconEl = fullscreenButtonEl.querySelector(
      ".tool-icon--fullscreen-exit"
    );
    if (document.fullscreenElement) {
      // fullscreen state is on, display exit-fullscreen button icon
      fullscreenEnterIconEl.classList.add("tool-icon--hidden");
      fullscreenExitIconEl.classList.remove("tool-icon--hidden");
    } else {
      // fullscreen state is off, display enter-fullscreen button icon
      fullscreenEnterIconEl.classList.remove("tool-icon--hidden");
      fullscreenExitIconEl.classList.add("tool-icon--hidden");
    }
  }

  animateToViewBox(viewBox) {
    const startViewBox = this.sceneSettings.viewBox;
    const deltaViewBox = subItemwise(viewBox, startViewBox);
    let start;
    const duration = 200;

    const animate = (timestamp) => {
      if (start === undefined) {
        start = timestamp;
      }
      let t = (timestamp - start) / duration;
      if (t > 1.0) {
        t = 1.0;
      }
      const animatingViewBox = addItemwise(
        startViewBox,
        mulScalar(deltaViewBox, easeOutQuad(t))
      );
      if (t < 1.0) {
        this.sceneSettings.viewBox = animatingViewBox;
        requestAnimationFrame(animate);
      } else {
        this.sceneSettings.viewBox = viewBox;
      }
    };
    requestAnimationFrame(animate);
  }

  async handleRemoteClose(event) {
    this._reconnectDialog = await dialogSetup(
      "Connection closed",
      "The connection to the server closed unexpectedly.",
      [{ title: "Reconnect", resultValue: "ok" }]
    );
    const result = await this._reconnectDialog.run();
    delete this._reconnectDialog;

    if (!result && location.hostname === "localhost") {
      // The dialog was cancelled by the "wake" event handler
      // Dubious assumption:
      // Running from localhost most likely means were looking at local data,
      // which unlikely changed while we were away. So let's not bother reloading
      // anything.
      return;
    }

    if (this.fontController.font.websocket.readyState > 1) {
      // The websocket isn't currently working, let's try to do a page reload
      location.reload();
      return;
    }

    // Reload only the data, not the UI (the page)
    const reloadPattern = { glyphs: {} };
    const glyphReloadPattern = reloadPattern.glyphs;
    for (const glyphName of this.fontController.getCachedGlyphNames()) {
      glyphReloadPattern[glyphName] = null;
    }
    // TODO: fix reloadData so we can do this:
    //   reloadPattern["glyphMap"] = null; // etc.
    // so we won't have to re-initialize the font controller to reload
    // all non-glyph data:
    await this.fontController.initialize();
    await this.reloadData(reloadPattern);
  }

  async handleRemoteError(event) {
    console.log("remote error", event);
    await dialog(
      "Connection problem",
      `There was a problem with the connection to the server.
      See the JavaScript Console for details.`,
      [{ title: "Reconnect", resultValue: "ok" }]
    );
    location.reload();
  }
}

function clearSearchParams(searchParams) {
  for (const key of Array.from(searchParams.keys())) {
    searchParams.delete(key);
  }
}

function easeOutQuad(t) {
  return 1 - (1 - t) ** 2;
}

function matchEvent(handlerDef, event) {
  for (const prop of ["ctrlKey", "shiftKey", "altKey", "repeat"]) {
    if (handlerDef[prop] !== undefined && handlerDef[prop] !== event[prop]) {
      return false;
    }
  }
  return true;
}

function newVisualizationLayersSettings(visualizationLayers) {
  const settings = [];
  for (const definition of visualizationLayers.definitions) {
    if (!definition.userSwitchable) {
      continue;
    }
    if (!(definition.identifier in settings)) {
      settings[definition.identifier] = !!definition.defaultOn;
    }
  }
  const controller = new ObservableController(settings);
  controller.synchronizeWithLocalStorage("fontra-editor-visualization-layers.");
  for (const [key, onOff] of Object.entries(controller.model)) {
    visualizationLayers.toggle(key, onOff);
  }
  return controller;
}

async function runDialogWholeGlyphPaste() {
  const controller = new ObservableController({ behavior: PASTE_BEHAVIOR_REPLACE });
  controller.synchronizeWithLocalStorage("fontra-glyph-paste");
  if (
    controller.model.behavior !== PASTE_BEHAVIOR_REPLACE &&
    controller.model.behavior !== PASTE_BEHAVIOR_ADD
  ) {
    controller.model.behavior = PASTE_BEHAVIOR_REPLACE;
  }

  const dialog = await dialogSetup("You are about to paste an entire glyph", null, [
    { title: "Cancel", resultValue: "cancel", isCancelButton: true },
    { title: "Okay", resultValue: "ok", isDefaultButton: true },
  ]);

  const radioGroup = [
    html.div({}, "What would you like to do with the glyph on the clipboard?"),
    html.br(),
  ];

  for (const [label, value] of [
    ["Replace the current glyph", PASTE_BEHAVIOR_REPLACE],
    ["Add to the current glyph (match layers)", PASTE_BEHAVIOR_ADD],
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
  radioGroup.push(html.br());

  dialog.setContent(html.div({}, radioGroup));
  const result = await dialog.run();

  return result === "ok" ? controller.model.behavior : null;
}

function chunks(array, n) {
  const chunked = [];
  for (const i of range(0, array.length, n)) {
    chunked.push(array.slice(i, i + n));
  }
  return chunked;
}
