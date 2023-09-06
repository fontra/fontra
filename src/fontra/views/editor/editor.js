import { CanvasController } from "../core/canvas-controller.js";
import { applyChange, matchChangePath } from "../core/changes.js";
import { recordChanges } from "../core/change-recorder.js";
import { FontController } from "../core/font-controller.js";
import { loaderSpinner } from "../core/loader-spinner.js";
import { ObservableController } from "../core/observable-object.js";
import {
  centeredRect,
  rectAddMargin,
  rectCenter,
  rectFromArray,
  rectRound,
  rectToArray,
  rectScaleAroundCenter,
  rectSize,
} from "../core/rectangle.js";
import { getRemoteProxy } from "../core/remote.js";
import * as html from "/core/unlit.js";
import { SceneView } from "../core/scene-view.js";
import { StaticGlyph } from "../core/var-glyph.js";
import { addItemwise, subItemwise, mulScalar } from "../core/var-funcs.js";
import { VarPackedPath, joinPaths } from "../core/var-path.js";
import {
  commandKeyProperty,
  enumerate,
  getCharFromUnicode,
  hyphenatedToCamelCase,
  isActiveElementTypeable,
  parseSelection,
  scheduleCalls,
  range,
  readFromClipboard,
  reversed,
  writeToClipboard,
} from "../core/utils.js";
import { themeController } from "/core/theme-settings.js";
import { showMenu, MenuItemDivider } from "/web-components/menu-panel.js";
import { dialog, dialogSetup } from "/web-components/modal-dialog.js";
import { CJKDesignFrame } from "./cjk-design-frame.js";
import { SceneController } from "./scene-controller.js";
import { HandTool } from "./edit-tools-hand.js";
import { PenTool } from "./edit-tools-pen.js";
import { PointerTool } from "./edit-tools-pointer.js";
import { PowerRulerTool } from "./edit-tools-power-ruler.js";
import { ShapeTool } from "./edit-tools-shape.js";
import { VisualizationLayers } from "./visualization-layers.js";
import {
  allGlyphsCleanVisualizationLayerDefinition,
  visualizationLayerDefinitions,
} from "./visualization-layer-definitions.js";
import {
  deleteSelectedPoints,
  filterPathByPointIndices,
} from "../core/path-functions.js";
import { staticGlyphToGLIF } from "../core/glyph-glif.js";
import { pathToSVG } from "../core/glyph-svg.js";
import { parseClipboard } from "../core/server-utils.js";
import Sidebar from "./sidebar.js";

import TextEntryPanel from "./panel-text-entry.js";
import GlyphSearchPanel from "./panel-glyph-search.js";
import DesignspaceNavigationPanel from "./panel-designspace-navigation.js";
import UserSettingsPanel from "./panel-user-settings.js";
import ReferenceFontPanel from "./panel-reference-font.js";
import SelectionInfoPanel from "./panel-selection-info.js";

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

    this.sceneController.addEventListener("glyphEditLocationNotAtSource", async () => {
      this.showDialogGlyphEditLocationNotAtSource();
    });

    this.sidebars = [];

    this.initSidebars();
    this.initContextMenuItems();
    this.initShortCuts();
    this.initMiniConsole();

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
    this.initGlyphsSearch();
    this.initTools();
    await this.initSidebarDesignspace();

    const blankFont = new FontFace("AdobeBlank", `url("/fonts/AdobeBlank.woff2")`, {});
    document.fonts.add(blankFont);
    await blankFont.load();

    // Delay a tiny amount to account for a delay in the sidebars being set up,
    // which affects the available viewBox
    setTimeout(() => this.setupFromWindowLocation(), 20);
  }

  initGlyphsSearch() {
    this.glyphsSearch =
      this.getSidebarPanel("glyph-search").contentElement.querySelector(
        "#glyphs-search"
      );
    this.glyphsSearch.glyphMap = this.fontController.glyphMap;
    this.glyphsSearch.addEventListener("selectedGlyphNameChanged", (event) =>
      this.glyphNameChangedCallback(event.detail)
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
    const editToolClasses = [PointerTool, PenTool, ShapeTool, PowerRulerTool, HandTool];
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
      { "class": "tool-button selected", "data-tool": tool.identifier },
      [html.createDomElement("inline-svg", { class: "tool-icon", src: tool.iconPath })]
    );

    toolButton.onclick = () => {
      this.setSelectedTool(tool.identifier);
      this.canvasController.canvas.focus();
    };

    editToolsElement.appendChild(toolButton);
  }

  async initSidebarDesignspace() {
    this.getSidebarPanel("designspace-navigation").setup();
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

    // Restore the sidebar selection/visible state from localStorage.
    // (Due to the previous step only being visible after an event loop iteration,
    // ensure we postpone just enough.)
    setTimeout(() => {
      for (const side of ["left", "right"]) {
        const selectedSidebar = localStorage.getItem(`fontra-selected-sidebar-${side}`);
        if (selectedSidebar) {
          this.toggleSidebar(selectedSidebar, false);
        }
      }
    }, 0);

    // After the initial set up we want clicking the sidebar tabs to animate in and out
    // (Here we can afford a longer delay.)
    setTimeout(() => {
      for (const sidebarContainer of document.querySelectorAll(".sidebar-container")) {
        sidebarContainer.classList.add("animating");
      }
    }, 100);
  }

  addSidebar(sidebar) {
    const editorContainer = document.querySelector(".editor-container");
    sidebar.attach(editorContainer);
    this.sidebars.push(sidebar);
  }

  addSidebarPanel(panelElement, sidebarName) {
    const sidebar = this.sidebars.find((sidebar) => sidebar.identifier === sidebarName);
    sidebar.addPanel(panelElement);
    panelElement.attach();
    const tabElement = document.querySelector(
      `.sidebar-tab[data-sidebar-name="${panelElement.identifier}"]`
    );
    tabElement.addEventListener("click", () => {
      this.toggleSidebar(panelElement.identifier, true);
    });
  }

  getSidebarPanel(panelName) {
    for (const sidebar of this.sidebars) {
      for (const panel of sidebar.panels) {
        if (panel.identifier === panelName) {
          return panel;
        }
      }
    }
  }

  toggleSidebar(panelName, doFocus = false) {
    const sidebar = this.sidebars.find((sidebar) =>
      sidebar.panels.find((panel) => panel.identifier === panelName)
    );
    if (!sidebar) {
      return;
    }
    const onOff = sidebar.toggle(panelName);
    localStorage.setItem(
      `fontra-selected-sidebar-${sidebar.identifier}`,
      onOff ? panelName : ""
    );
    this.getSidebarPanel(panelName).toggle(onOff, doFocus);
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

  glyphNameChangedCallback(glyphName) {
    if (!glyphName) {
      return;
    }
    const codePoint = this.fontController.codePointForGlyph(glyphName);
    const glyphInfo = { glyphName: glyphName };
    if (codePoint !== undefined) {
      glyphInfo["character"] = getCharFromUnicode(codePoint);
    }
    let selectedGlyphState = this.sceneSettings.selectedGlyph;
    const glyphLines = [...this.sceneSettings.glyphLines];
    if (selectedGlyphState) {
      glyphLines[selectedGlyphState.lineIndex][selectedGlyphState.glyphIndex] =
        glyphInfo;
      this.sceneSettings.glyphLines = glyphLines;
    } else {
      if (!glyphLines.length) {
        glyphLines.push([]);
      }
      const lineIndex = glyphLines.length - 1;
      glyphLines[lineIndex].push(glyphInfo);
      this.sceneSettings.glyphLines = glyphLines;
      selectedGlyphState = {
        lineIndex: lineIndex,
        glyphIndex: glyphLines[lineIndex].length - 1,
        isEditing: false,
      };
    }

    this.sceneSettings.selectedGlyph = selectedGlyphState;
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
      const glyphInfo = { glyphName: glyphName };
      const codePoint = this.fontController.codePointForGlyph(glyphName);
      if (codePoint !== undefined) {
        glyphInfo["character"] = getCharFromUnicode(codePoint);
      }
      glyphInfos.push(glyphInfo);
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

    this.basicContextMenuItems.push(
      // {
      //   title: "Deep Paste",
      //   enabled: () => this.canDeepPaste(),
      //   callback: () => this.doDeepPaste(),
      //   shortCut: { keysOrCodes: "v", metaKey: true, shiftKey: true },
      // },
      {
        title: "Delete",
        enabled: () => this.canDelete(),
        callback: (event) => this.doDelete(event),
        shortCut: {
          keysOrCodes: ["Delete", "Backspace"],
          metaKey: false,
          shiftKey: false,
        },
      }
    );

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

    for (const menuItem of [
      ...this.basicContextMenuItems,
      ...this.glyphSelectedContextMenuItems,
    ]) {
      if (menuItem.shortCut) {
        this.registerShortCut(
          menuItem.shortCut.keysOrCodes,
          menuItem.shortCut,
          menuItem.callback
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

  registerShortCut(keysOrCodes, modifiers, callback) {
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

    for (const keyOrCode of keysOrCodes) {
      const handlerDef = { ...modifiers, callback };
      if (!this.shortCutHandlers[keyOrCode]) {
        this.shortCutHandlers[keyOrCode] = [];
      }
      this.shortCutHandlers[keyOrCode].push(handlerDef);
    }
  }

  async keyDownHandler(event) {
    const callback = this._getShortCutCallback(event);
    if (callback !== undefined) {
      event.preventDefault();
      event.stopImmediatePropagation();
      await callback(event);
    }
  }

  _getShortCutCallback(event) {
    let handlerDefs = this.shortCutHandlers[event.key.toLowerCase()];
    if (!handlerDefs) {
      handlerDefs = this.shortCutHandlers[event.code];
    }
    if (!handlerDefs) {
      return undefined;
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
      return handlerDef.callback;
    }
    return undefined;
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
    return !!this.sceneController.selection.size;
  }

  async doCut(event = null) {
    if (!this.sceneController.selection.size) {
      return;
    }
    if (event) {
      // We *have* to do this first, as it won't work after any
      // await (Safari insists on that). So we have to do a bit
      // of redundant work by calling _prepareCopyOrCut twice.
      const { instance, path } = this._prepareCopyOrCut();
      await this._writeInstanceToClipboard(instance, path, event);
    }
    let copyResult;
    await this.sceneController.editInstanceAndRecordChanges((instance) => {
      copyResult = this._prepareCopyOrCut(instance, true);
      this.sceneController.selection = new Set();
      return "Cut Selection";
    });
    if (copyResult && !event) {
      const { instance, path } = copyResult;
      await this._writeInstanceToClipboard(instance, path);
    }
  }

  canCopy() {
    return this.sceneSettings.selectedGlyph;
  }

  async doCopy(event) {
    const { instance, path } = this._prepareCopyOrCut();
    if (!instance) {
      return;
    }
    await this._writeInstanceToClipboard(instance, path, event);
  }

  async _writeInstanceToClipboard(instance, path, event) {
    const bounds = path.getControlBounds();
    if (!bounds) {
      // nothing to do
      return;
    }

    const svgString = pathToSVG(path, bounds);
    const glyphName = this.sceneSettings.selectedGlyphName;
    const unicodes = this.fontController.glyphMap[glyphName] || [];
    const glifString = staticGlyphToGLIF(glyphName, instance, unicodes);
    const jsonString = JSON.stringify(instance);

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

  _prepareCopyOrCut(editInstance, doCut = false) {
    if (doCut !== !!editInstance) {
      throw new Error("assert -- inconsistent editInstance vs doCut argument");
    }
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
            instance: glyphController.instance,
            path: glyphController.flattenedPath,
          };
    }

    const { point: pointIndices, component: componentIndices } = parseSelection(
      this.sceneController.selection
    );
    let path;
    let components;
    const paths = [];
    if (pointIndices) {
      path = filterPathByPointIndices(editInstance.path, pointIndices, doCut);
      paths.push(path);
    }
    if (componentIndices) {
      paths.push(...componentIndices.map((i) => glyphController.components[i].path));
      components = componentIndices.map((i) => glyphController.instance.components[i]);
      if (doCut) {
        for (const componentIndex of reversed(componentIndices)) {
          editInstance.components.splice(componentIndex, 1);
        }
      }
    }
    const instance = StaticGlyph.fromObject({
      ...glyphController.instance,
      path: path,
      components: components,
    });
    return { instance: instance, path: joinPaths(paths) };
  }

  canPaste() {
    return true;
  }

  async doPaste() {
    let pastedGlyph;

    const plainText = await readFromClipboard("text/plain");
    if (!plainText) {
      return;
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

    if (customJSON) {
      pastedGlyph = StaticGlyph.fromObject(JSON.parse(customJSON));
    } else {
      if (plainText[0] == "{") {
        try {
          pastedGlyph = StaticGlyph.fromObject(JSON.parse(plainText));
        } catch (error) {
          console.log("couldn't paste from JSON:", error.toString());
        }
      } else {
        pastedGlyph = await this.parseClipboard(plainText);
      }
    }

    if (!pastedGlyph) {
      return;
    }
    await this.sceneController.editInstanceAndRecordChanges((instance) => {
      const selection = new Set();
      for (const pointIndex of range(pastedGlyph.path.numPoints)) {
        const pointType =
          pastedGlyph.path.pointTypes[pointIndex] & VarPackedPath.POINT_TYPE_MASK;
        if (pointType === VarPackedPath.ON_CURVE) {
          selection.add(`point/${pointIndex + instance.path.numPoints}`);
        }
      }
      for (const componentIndex of range(
        instance.components.length,
        instance.components.length + pastedGlyph.components.length
      )) {
        selection.add(`component/${componentIndex}`);
      }
      instance.path.appendPath(pastedGlyph.path);
      instance.components.splice(
        instance.components.length,
        0,
        ...pastedGlyph.components
      );
      this.sceneController.selection = selection;
      return "Paste";
    });
  }

  async parseClipboard(data) {
    const result = await parseClipboard(data);
    return result ? StaticGlyph.fromObject(result) : undefined;
  }

  canDeepPaste() {
    return true;
  }

  doDeepPaste() {
    console.log("deep paste");
  }

  canDelete() {
    return (
      this.sceneSettings.selectedGlyph?.isEditing &&
      this.sceneController.selection.size > 0
    );
  }

  async doDelete(event) {
    await this.sceneController.editInstanceAndRecordChanges((instance) => {
      if (event.altKey) {
        // Behave like "cut", but don't put anything on the clipboard
        this._prepareCopyOrCut(instance, true);
      } else {
        const { point: pointSelection, component: componentSelection } = parseSelection(
          this.sceneController.selection
        );
        if (pointSelection) {
          deleteSelectedPoints(instance.path, pointSelection);
        }
        if (componentSelection) {
          for (const componentIndex of reversed(componentSelection)) {
            instance.components.splice(componentIndex, 1);
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
      { title: "Add", isDefaultButton: true, result: "ok", disabled: true },
    ]);
    const addToAllSourcesLocalStorageKey = "fontra-add-the-component-to-all-sources";
    let addToAllSources =
      localStorage.getItem(addToAllSourcesLocalStorageKey) === "true";

    dialog.setContent(
      html.div(
        {
          style: `
          grid-row: 2 / -1;
          display: flex;
          flex-direction: column;
          gap: 0.5em;
        `,
        },
        [
          glyphsSearch,
          html.div({}, [
            html.input({
              type: "checkbox",
              id: "add-to-all-sources",
              checked: addToAllSources,
              onclick: (event) => {
                addToAllSources = event.target.checked;
                localStorage.setItem(
                  addToAllSourcesLocalStorageKey,
                  addToAllSources ? "true" : "false"
                );
              },
            }),
            html.label(
              {
                for: "add-to-all-sources",
              },
              ["Add the component to all sources"]
            ),
          ]),
        ]
      )
    );
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
    if (addToAllSources) {
      await this.sceneController.editGlyphAndRecordChanges((glyph) => {
        const layerNames = new Set();
        for (const source of glyph.sources) {
          layerNames.add(source.layerName);
        }
        for (const layerName of layerNames) {
          const layer = glyph.layers[layerName];
          layer.glyph.components.push({
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
    } else {
      await this.sceneController.editInstanceAndRecordChanges((instance) => {
        const newComponentIndex = instance.components.length;
        instance.components.push(newComponent);
        this.sceneController.selection = new Set([`component/${newComponentIndex}`]);
        return "Add Component";
      });
    }
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
    this.sceneSettings.selectedSourceIndex = newSourceIndex;
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

  contextMenuHandler(event) {
    event.preventDefault();
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
    const { x, y } = event;
    showMenu(menuItems, { x: x + 1, y: y - 1 }, event.target);
  }

  async newGlyph(glyphName, codePoint, templateInstance) {
    await this.fontController.newGlyph(glyphName, codePoint, templateInstance);
    this.sceneModel.updateGlyphLinesCharacterMapping();
    await this.sceneModel.updateScene();
    this.canvasController.requestUpdate();
    this.glyphsSearch.updateGlyphNamesListContent();
  }

  async externalChange(change) {
    const selectedGlyphName = this.sceneSettings.selectedGlyphName;

    await this.fontController.applyChange(change, true);

    if (matchChangePath(change, ["glyphMap"])) {
      const selectedGlyph = this.sceneSettings.selectedGlyph;
      this.sceneModel.updateGlyphLinesCharacterMapping();
      if (
        selectedGlyph?.isEditing &&
        !this.fontController.hasGlyph(selectedGlyphName)
      ) {
        // The glyph being edited got deleted, change state merely "selected"
        this.sceneSettings.selectedGlyph = {
          ...selectedGlyph,
          isEditing: false,
        };
      }
      this.glyphsSearch.updateGlyphNamesListContent();
    }
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

  async messageFromServer(headline, message) {
    // don't await the dialog result, the server doesn't need an answer
    dialog(headline, message, [{ title: "Okay", isDefaultButton: true }]);
  }

  async setupFromWindowLocation() {
    this.sceneSettingsController.withSenderInfo({ senderID: this }, () =>
      this._setupFromWindowLocation()
    );
  }

  async _setupFromWindowLocation() {
    const url = new URL(window.location);
    const viewInfo = {};
    for (const key of url.searchParams.keys()) {
      viewInfo[key] = JSON.parse(url.searchParams.get(key));
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
    const url = new URL(window.location);
    let previousText = url.searchParams.get("text");
    if (previousText) {
      previousText = JSON.parse(previousText);
    }
    clearSearchParams(url.searchParams);

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
    for (const [key, value] of Object.entries(viewInfo)) {
      url.searchParams.set(key, JSON.stringify(value));
    }
    if (previousText !== viewInfo["text"]) {
      window.history.pushState({}, "", url);
    } else {
      window.history.replaceState({}, "", url);
    }
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

function makeDisplayPath(pathItems) {
  const displayPathItems = !pathItems[0].includes(":")
    ? ["", ...pathItems]
    : [...pathItems];
  let displayPath = displayPathItems.join("/");
  while (displayPathItems.length > 2 && displayPath.length > 60) {
    displayPathItems.splice(1, 1);
    displayPath = [displayPathItems[0], "...", ...displayPathItems.slice(1)].join("/");
  }
  return displayPath;
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
