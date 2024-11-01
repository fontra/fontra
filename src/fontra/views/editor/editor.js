import {
  canPerformAction,
  doPerformAction,
  getActionIdentifierFromKeyEvent,
  registerAction,
} from "../core/actions.js";
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
import { isSuperset } from "../core/set-ops.js";
import { labeledCheckbox, labeledTextInput } from "../core/ui-utils.js";
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
  modulo,
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
import { makeDisplayPath } from "../core/view-utils.js";
import { CJKDesignFrame } from "./cjk-design-frame.js";
import { HandTool } from "./edit-tools-hand.js";
import { KnifeTool } from "./edit-tools-knife.js";
import { PenTool } from "./edit-tools-pen.js";
import { PointerTools } from "./edit-tools-pointer.js";
import { PowerRulerTool } from "./edit-tools-power-ruler.js";
import { ShapeTool } from "./edit-tools-shape.js";
import { SceneController } from "./scene-controller.js";
import { MIN_SIDEBAR_WIDTH, Sidebar } from "./sidebar.js";
import {
  allGlyphsCleanVisualizationLayerDefinition,
  visualizationLayerDefinitions,
} from "./visualization-layer-definitions.js";
import { VisualizationLayers } from "./visualization-layers.js";
import * as html from "/core/html-utils.js";
import { themeController } from "/core/theme-settings.js";
import { getDecomposedIdentity } from "/core/transform.js";
import { MenuBar } from "/web-components/menu-bar.js";
import { MenuItemDivider, showMenu } from "/web-components/menu-panel.js";
import { dialog, dialogSetup, message } from "/web-components/modal-dialog.js";
import { parsePluginBasePath } from "/web-components/plugin-manager.js";

import DesignspaceNavigationPanel from "./panel-designspace-navigation.js";
import GlyphNotePanel from "./panel-glyph-note.js";
import GlyphSearchPanel from "./panel-glyph-search.js";
import ReferenceFontPanel from "./panel-reference-font.js";
import RelatedGlyphsPanel from "./panel-related-glyphs.js";
import SelectionInfoPanel from "./panel-selection-info.js";
import TextEntryPanel from "./panel-text-entry.js";
import TransformationPanel from "./panel-transformation.js";
import Panel from "./panel.js";
import { applicationSettingsController } from "/core/application-settings.js";
import { ensureLanguageHasLoaded, translate } from "/core/localization.js";

const MIN_CANVAS_SPACE = 200;

const PASTE_BEHAVIOR_REPLACE = "replace";
const PASTE_BEHAVIOR_ADD = "add";

const EXPORT_FORMATS = ["ttf", "otf", "fontra", "designspace", "ufo", "rcjk"];

export class EditorController {
  static async fromWebSocket() {
    const pathItems = window.location.pathname.split("/").slice(3);
    const displayPath = makeDisplayPath(pathItems);
    document.title = `Fontra — ${decodeURI(displayPath)}`;
    const projectPath = pathItems.join("/");
    const protocol = window.location.protocol === "http:" ? "ws" : "wss";
    const wsURL = `${protocol}://${window.location.host}/websocket/${projectPath}`;

    await ensureLanguageHasLoaded;

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

    this.sceneController = new SceneController(
      this.fontController,
      canvasController,
      applicationSettingsController,
      this
    );

    this.sceneSettingsController = this.sceneController.sceneSettingsController;
    this.sceneSettings = this.sceneSettingsController.model;
    this.sceneModel = this.sceneController.sceneModel;

    this.sceneSettingsController.addKeyListener(
      [
        "align",
        "fontLocationUser",
        "glyphLocation",
        "fontAxesUseSourceCoordinates",
        "fontAxesShowEffectiveLocation",
        "fontAxesShowHidden",
        "fontAxesSkipMapping",
        "selectedGlyph",
        "selection",
        "text",
        "viewBox",
      ],
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

    this.sceneController.addEventListener("doubleClickedAnchors", async (event) => {
      this.doubleClickedAnchorsCallback(event);
    });

    this.sceneController.addEventListener("doubleClickedGuidelines", async (event) => {
      this.doubleClickedGuidelinesCallback(event);
    });

    // TODO: Font Guidelines
    // this.sceneController.addEventListener("doubleClickedFontGuidelines", async (event) => {
    //   this.doubleClickedFontGuidelinesCallback(event);
    // });

    this.sceneController.addEventListener("glyphEditCannotEditReadOnly", async () => {
      this.showDialogGlyphEditCannotEditReadOnly();
    });

    this.sceneController.addEventListener("glyphEditCannotEditLocked", async () => {
      this.showDialogGlyphEditCannotEditLocked();
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
    this.contextMenuPosition = { x: 0, y: 0 };

    this.initSidebars();
    this.initTools();
    this.initActions();
    this.initTopBar();
    this.initContextMenuItems();
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

  initActions() {
    {
      const topic = "0030-action-topics.menu.edit";

      registerAction(
        "action.undo",
        {
          topic,
          sortIndex: 0,
          defaultShortCuts: [{ baseKey: "z", commandKey: true, shiftKey: false }],
        },
        () => this.doUndoRedo(false),
        () => this.canUndoRedo(false)
      );

      registerAction(
        "action.redo",
        {
          topic,
          defaultShortCuts: [{ baseKey: "z", commandKey: true, shiftKey: true }],
        },
        () => this.doUndoRedo(true),
        () => this.canUndoRedo(true)
      );

      if (insecureSafariConnection()) {
        // In Safari, the async clipboard API only works in a secure context
        // (HTTPS). We apply a workaround using the clipboard event API, but
        // only in Safari, and when in an HTTP context
        this.initFallbackClipboardEventListeners();
      } else {
        registerAction(
          "action.cut",
          {
            topic,
            defaultShortCuts: [{ baseKey: "x", commandKey: true }],
          },
          () => this.doCut(),
          () => this.canCut()
        );

        registerAction(
          "action.copy",
          {
            topic,
            defaultShortCuts: [{ baseKey: "c", commandKey: true }],
          },
          () => this.doCopy(),
          () => this.canCopy()
        );

        registerAction(
          "action.paste",
          {
            topic,
            defaultShortCuts: [{ baseKey: "v", commandKey: true }],
          },
          () => this.doPaste(),
          () => this.canPaste()
        );
      }

      registerAction(
        "action.delete",
        {
          topic,
          defaultShortCuts: [
            { baseKey: "Delete" },
            { baseKey: "Delete", altKey: true },
            { baseKey: "Backspace" },
            { baseKey: "Backspace", altKey: true },
          ],
        },
        (event) => this.doDelete(event),
        () => this.canDelete()
      );

      registerAction(
        "action.select-all",
        {
          topic,
          defaultShortCuts: [{ baseKey: "a", commandKey: true }],
        },
        () => this.doSelectAllNone(false),
        () => this.sceneSettings.selectedGlyph?.isEditing
      );

      registerAction(
        "action.select-none",
        {
          topic,
          defaultShortCuts: [{ baseKey: "a", commandKey: true, shiftKey: true }],
        },
        () => this.doSelectAllNone(true),
        () =>
          this.sceneSettings.selectedGlyph?.isEditing &&
          this.sceneSettings.selection.size
      );

      registerAction(
        "action.add-component",
        { topic },
        () => this.doAddComponent(),
        () => this.canAddComponent()
      );

      registerAction(
        "action.add-anchor",
        { topic },
        () => this.doAddAnchor(),
        () => this.canAddAnchor()
      );

      registerAction(
        "action.add-guideline",
        { topic },
        () => this.doAddGuideline(),
        () => this.canAddGuideline()
      );

      registerAction(
        "action.lock-guidelines",
        { topic },
        () => this.doLockGuideline(!this.selectionHasLockedGuidelines()),
        () => this.canLockGuideline()
      );
    }

    {
      const topic = "0020-action-topics.menu.view";

      registerAction(
        "action.zoom-in",
        {
          topic,
          titleKey: "zoom-in",
          defaultShortCuts: [
            { baseKey: "+", commandKey: true },
            { baseKey: "=", commandKey: true },
          ],
          allowGlobalOverride: true,
        },
        () => this.zoomIn()
      );

      registerAction(
        "action.zoom-out",
        {
          topic,
          titleKey: "zoom-out",
          defaultShortCuts: [{ baseKey: "-", commandKey: true }],
          allowGlobalOverride: true,
        },
        () => this.zoomOut()
      );

      registerAction(
        "action.zoom-fit-selection",
        {
          topic,
          titleKey: "zoom-fit-selection",
          defaultShortCuts: [{ baseKey: "0", commandKey: true }],
          allowGlobalOverride: true,
        },
        () => this.zoomFit(),
        () => {
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
        }
      );

      registerAction(
        "action.select-previous-source",
        {
          topic,
          titleKey: "menubar.view.select-previous-source",
          defaultShortCuts: [{ baseKey: "ArrowUp", commandKey: true }],
        },
        () => this.doSelectPreviousNextSource(true)
      );

      registerAction(
        "action.select-next-source",
        {
          topic,
          titleKey: "menubar.view.select-next-source",
          defaultShortCuts: [{ baseKey: "ArrowDown", commandKey: true }],
        },
        () => this.doSelectPreviousNextSource(false)
      );

      registerAction(
        "action.find-glyphs-that-use",
        {
          topic,
          titleKey: "menubar.view.find-glyphs-that-use",
        },
        () => this.doFindGlyphsThatUseGlyph()
      );

      registerAction(
        "action.replace-selected-glyph-on-canvas",
        {
          topic,
          titleKey: "menubar.view.replace-selected-glyph-on-canvas",
        },
        () =>
          this.doCanvasInsertGlyph(
            translate("menubar.view.replace-selected-glyph-on-canvas"),
            translate("dialog.replace"),
            0
          )
      );

      registerAction(
        "action.remove-selected-glyph-from-canvas",
        {
          topic,
          titleKey: "menubar.view.remove-selected-glyph-from-canvas",
        },
        () => this.insertGlyphInfos([], 0) // empty array removes the selected glyph
      );

      registerAction(
        "action.add-glyph-before-selected-glyph",
        {
          topic,
          titleKey: "menubar.view.add-glyph-before-selected-glyph",
        },
        () =>
          this.doCanvasInsertGlyph(
            translate("menubar.view.add-glyph-before-selected-glyph"),
            translate("dialog.add"),
            -1
          )
      );

      registerAction(
        "action.add-glyph-after-selected-glyph",
        {
          topic,
          titleKey: "menubar.view.add-glyph-after-selected-glyph",
        },
        () =>
          this.doCanvasInsertGlyph(
            translate("menubar.view.add-glyph-after-selected-glyph"),
            translate("dialog.add"),
            1
          )
      );
    }

    {
      const topic = "0040-action-topics.sidebars";

      const sideBarShortCuts = {
        "glyph-search": "f",
        "selection-info": "i",
      };

      this.sidebars
        .map((sidebar) => sidebar.panelIdentifiers)
        .flat()
        .forEach((panelIdentifier) => {
          const titleKey = `sidebar.${panelIdentifier}`;
          const shortKey = sideBarShortCuts[panelIdentifier];

          const defaultShortCuts = shortKey
            ? [{ baseKey: shortKey, commandKey: shortKey }]
            : [];

          registerAction(
            `action.sidebars.toggle.${panelIdentifier}`,
            { topic, titleKey, defaultShortCuts, allowGlobalOverride: true },
            () => this.toggleSidebar(panelIdentifier, true)
          );
        });
    }

    {
      const topic = "0010-action-topics.tools";

      const defaultKeys = {};
      for (const [i, toolIdentifier] of enumerate(Object.keys(this.topLevelTools), 1)) {
        if (i <= 9) {
          defaultKeys[toolIdentifier] = `${i}`;
        }
      }

      for (const toolIdentifier of Object.keys(this.tools)) {
        const isSubTool = !this.topLevelTools[toolIdentifier];
        const titleKey = `editor.${toolIdentifier}`;
        const defaultKey = defaultKeys[toolIdentifier];
        const defaultShortCuts = defaultKey ? [{ baseKey: defaultKey }] : [];
        registerAction(
          `actions.tools.${toolIdentifier}`,
          {
            topic,
            titleKey,
            defaultShortCuts: defaultShortCuts,
          },
          () => {
            this.setSelectedTool(toolIdentifier, isSubTool);
          }
        );
      }
    }

    registerAction(
      "action.canvas.clean-view-and-hand-tool",
      {
        topic: "0020-action-topics.menu.view",
        titleKey: "canvas.clean-view-and-hand-tool",
        defaultShortCuts: [{ baseKey: "Space" }],
      },
      (event) => this.enterCleanViewAndHandTool(event)
    );

    {
      const topic = "0060-action-topics.glyph-editor-appearance";

      const layers = this.visualizationLayers.definitions.filter(
        (layer) => layer.userSwitchable
      );

      for (const layerDef of layers) {
        registerAction(
          `actions.glyph-editor-appearance.${layerDef.identifier}`,
          {
            topic,
            titleKey: layerDef.name,
          },
          () => {
            this.visualizationLayersSettings.model[layerDef.identifier] =
              !this.visualizationLayersSettings.model[layerDef.identifier];
          }
        );
      }
    }
  }

  initActionsAfterStart() {
    if (this.fontController.backendInfo.projectManagerFeatures["export-as"]) {
      for (const format of EXPORT_FORMATS) {
        registerAction(
          `action.export-as.${format}`,
          {
            topic: "0035-action-topics.export-as",
          },
          (event) => this.fontController.exportAs({ format })
        );
      }
    }
  }

  initTopBar() {
    const menuBar = new MenuBar([
      {
        title: "Fontra",
        bold: true,
        getItems: () => {
          const menuItems = [
            "shortcuts",
            "theme-settings",
            "display-language",
            "clipboard",
            "editor-behavior",
            "plugins-manager",
            "server-info",
          ];
          return menuItems.map((panelID) => ({
            title: translate(`application-settings.${panelID}.title`),
            enabled: () => true,
            callback: () => {
              window.open(
                `/applicationsettings/applicationsettings.html#${panelID}-panel`
              );
            },
          }));
        },
      },
      {
        title: translate("menubar.file"),
        getItems: () => {
          if (this.fontController.backendInfo.projectManagerFeatures["export-as"]) {
            return [
              {
                title: translate("menubar.file.export-as"),
                getItems: () =>
                  EXPORT_FORMATS.map((format) => ({
                    actionIdentifier: `action.export-as.${format}`,
                  })),
              },
            ];
          } else {
            return [
              {
                title: translate("menubar.file.new"),
                enabled: () => false,
                callback: () => {},
              },
              {
                title: translate("menubar.file.open"),
                enabled: () => false,
                callback: () => {},
              },
            ];
          }
        },
      },
      {
        title: translate("menubar.edit"),
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
        title: translate("menubar.view"),
        getItems: () => {
          const items = [
            {
              actionIdentifier: "action.zoom-in",
            },
            {
              actionIdentifier: "action.zoom-out",
            },
            {
              actionIdentifier: "action.zoom-fit-selection",
            },
          ];

          if (typeof this.sceneModel.selectedGlyph !== "undefined") {
            this.sceneController.updateContextMenuState();
            items.push(MenuItemDivider);
            items.push(...this.glyphSelectedContextMenuItems);
          }

          items.push(MenuItemDivider);
          items.push({
            title: translate("action-topics.glyph-editor-appearance"),
            getItems: () => {
              const layerDefs = this.visualizationLayers.definitions.filter(
                (layer) => layer.userSwitchable
              );

              return layerDefs.map((layerDef) => {
                return {
                  actionIdentifier: `actions.glyph-editor-appearance.${layerDef.identifier}`,
                  checked: this.visualizationLayersSettings.model[layerDef.identifier],
                };
              });
            },
          });

          return items;
        },
      },
      {
        title: translate("menubar.font"),
        enabled: () => true,
        getItems: () => {
          const menuItems = [
            [translate("font-info.title"), "#font-info-panel", true],
            [translate("axes.title"), "#axes-panel", true],
            [translate("cross-axis-mapping.title"), "#cross-axis-mapping-panel", true],
            [translate("sources.title"), "#sources-panel", true],
            [
              translate("development-status-definitions.title"),
              "#development-status-definitions-panel",
              true,
            ],
          ];
          return menuItems.map(([title, panelID, enabled]) => ({
            title,
            enabled: () => enabled,
            callback: () => {
              const url = new URL(window.location);
              url.pathname = url.pathname.replace("/editor/", "/fontinfo/");
              url.hash = panelID;
              window.open(url.toString());
            },
          }));
        },
      },
      {
        title: translate("menubar.glyph"),
        enabled: () => true,
        getItems: () => {
          return [
            {
              title: translate("menubar.glyph.add"),
              enabled: () => {
                return typeof this.sceneModel.selectedGlyph !== "undefined";
              },
              callback: () => {
                this.getSidebarPanel("designspace-navigation").addSource();
              },
            },
            {
              title: translate("menubar.glyph.delete"),
              enabled: () => {
                return typeof this.sceneModel.selectedGlyph !== "undefined";
              },
              callback: () => {
                const designspaceNavigationPanel = this.getSidebarPanel(
                  "designspace-navigation"
                );
                designspaceNavigationPanel.removeSource();
              },
            },
            {
              title: translate("menubar.glyph.edit-axes"),
              enabled: () => {
                return typeof this.sceneModel.selectedGlyph !== "undefined";
              },
              callback: () => {
                this.getSidebarPanel("designspace-navigation").editGlyphAxes();
              },
            },
          ];
        },
      },
      {
        title: translate("menubar.help"),
        enabled: () => true,
        getItems: () => {
          return [
            {
              title: translate("menubar.help.homepage"),
              enabled: () => true,
              callback: () => {
                window.open("https://fontra.xyz/");
              },
            },
            {
              title: translate("menubar.help.documentation"),
              enabled: () => true,
              callback: () => {
                window.open("https://docs.fontra.xyz");
              },
            },
            {
              title: translate("menubar.help.changelog"),
              enabled: () => true,
              callback: () => {
                window.open("https://fontra.xyz/changelog.html");
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

    const blankFont = new FontFace("AdobeBlank", `url("/fonts/AdobeBlank.woff2")`, {});
    document.fonts.add(blankFont);
    await blankFont.load();

    this.fontController.addChangeListener(
      { axes: null },
      async (change, isExternalChange) => {
        await this.sceneModel.updateScene();
        this.canvasController.requestUpdate();
      }
    );

    this.initActionsAfterStart();

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
      ? translate(
          "dialog.create-new-glyph.body.2",
          positionedGlyph.character,
          uniString
        )
      : "";
    const result = await dialog(
      translate("dialog.create-new-glyph.title", positionedGlyph.glyphName),
      translate("dialog.create-new-glyph.body", positionedGlyph.glyphName, charMsg),
      [
        { title: translate("dialog.cancel"), resultValue: "no", isCancelButton: true },
        { title: translate("dialog.create"), resultValue: "ok", isDefaultButton: true },
      ]
    );
    if (result === "ok") {
      const layerName = "default";
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

  async showDialogGlyphEditCannotEditLocked() {
    const glyphName = this.sceneSettings.selectedGlyphName;
    await message(`Can’t edit glyph “${glyphName}”`, "The glyph is locked.");
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
        const nearestSourceIndex = glyphController.findNearestSourceFromSourceLocation(
          {
            ...this.sceneSettings.fontLocationSourceMapped,
            ...this.sceneSettings.glyphLocation,
          },
          true
        );
        this.sceneSettings.selectedSourceIndex = nearestSourceIndex;
        break;
    }
  }

  initTools() {
    this.tools = {};
    this.topLevelTools = {};
    const editToolClasses = [
      PointerTools,
      PenTool,
      KnifeTool,
      ShapeTool,
      PowerRulerTool,
      HandTool,
    ];

    for (const editToolClass of editToolClasses) {
      this.addEditTool(new editToolClass(this));
    }

    this.setSelectedTool("pointer-tool");

    for (const zoomElement of document.querySelectorAll("#zoom-tools > .tool-button")) {
      const toolIdentifier = zoomElement.dataset.tool;
      zoomElement.dataset.tooltip = translate(toolIdentifier);
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
    this.topLevelTools[tool.identifier] = tool;

    let wrapperID = "edit-tools";

    const toolDefs = [];

    if (tool.subTools) {
      for (const subToolClass of tool.subTools) {
        const subTool = new subToolClass(this);
        toolDefs.push(subTool);
        this.tools[subTool.identifier] = subTool;
      }

      wrapperID = `edit-tools-multi-wrapper-${tool.identifier}`;
      const editToolsElement = document.querySelector("#edit-tools");
      editToolsElement.appendChild(
        html.div({
          "id": wrapperID,
          "data-tool": tool.identifier,
          "class": "tool-button multi-tool",
        })
      );
    } else {
      toolDefs.push(tool);
    }

    const editToolsElement = document.querySelector("#" + wrapperID);

    for (const [index, tool] of enumerate(toolDefs)) {
      const toolButton = html.div(
        {
          "class":
            wrapperID === "edit-tools" ? "tool-button selected" : "subtool-button",
          "data-tool": tool.identifier,
          "data-tooltip": translate("editor." + tool.identifier),
          "data-tooltipposition": index ? "right" : "bottom",
        },
        [
          html.createDomElement("inline-svg", {
            class: "tool-icon",
            src: tool.iconPath,
          }),
        ]
      );

      if (wrapperID === "edit-tools") {
        toolButton.onclick = () => {
          this.setSelectedTool(tool.identifier);
          this.canvasController.canvas.focus();
        };
      } else {
        const globalListener = {
          handleEvent: (event) => {
            if (event.type != "keydown" || event.key == "Escape") {
              collapseSubTools(editToolsElement);
            }
          },
        };

        toolButton.onmousedown = () => {
          clearTimeout(this._multiToolMouseDownTimer);
          this._multiToolMouseDownTimer = setTimeout(function () {
            // Show sub tools
            for (const child of editToolsElement.children) {
              child.style.visibility = "visible";
            }
            window.addEventListener("mousedown", globalListener, false);
            window.addEventListener("keydown", globalListener, false);
          }, 650);
        };

        toolButton.onmouseup = () => {
          event.stopImmediatePropagation();
          event.preventDefault();
          clearTimeout(this._multiToolMouseDownTimer);

          this.setSelectedTool(tool.identifier);
          this.canvasController.canvas.focus();

          if (toolButton === editToolsElement.children[0]) {
            // do nothing. Still the same tool
            return;
          }

          editToolsElement.prepend(toolButton);
          collapseSubTools(editToolsElement);
          window.removeEventListener("mousedown", globalListener, false);
          window.removeEventListener("keydown", globalListener, false);
        };
      }
      editToolsElement.appendChild(toolButton);
    }
  }

  initSidebars() {
    this.addSidebar(new Sidebar("left"));
    this.addSidebar(new Sidebar("right"));
    this.addSidebarPanel(new TextEntryPanel(this), "left");
    this.addSidebarPanel(new GlyphSearchPanel(this), "left");
    this.addSidebarPanel(new DesignspaceNavigationPanel(this), "left");
    this.addSidebarPanel(new ReferenceFontPanel(this), "left");
    this.addSidebarPanel(new SelectionInfoPanel(this), "right");
    this.addSidebarPanel(new TransformationPanel(this), "right");
    this.addSidebarPanel(new GlyphNotePanel(this), "right");
    this.addSidebarPanel(new RelatedGlyphsPanel(this), "right");

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

  setSelectedTool(toolIdentifier, isSubtool = false) {
    let selectedToolIdentifier = toolIdentifier;

    for (const editToolItem of document.querySelectorAll(
      "#edit-tools > .tool-button"
    )) {
      let shouldSelect = editToolItem.dataset.tool === toolIdentifier;

      if (editToolItem.classList.contains("multi-tool")) {
        if (shouldSelect) {
          selectedToolIdentifier = editToolItem.children[0].dataset.tool;
        } else {
          for (const childToolElement of editToolItem.children) {
            if (childToolElement.dataset.tool === toolIdentifier) {
              shouldSelect = true;
              if (isSubtool) {
                editToolItem.prepend(childToolElement);
                collapseSubTools(editToolItem);
              }
            }
          }
        }
      }
      editToolItem.classList.toggle("selected", shouldSelect);
    }
    this.sceneController.setSelectedTool(this.tools[selectedToolIdentifier]);
    this.selectedToolIdentifier = selectedToolIdentifier;
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

    const glyphLocations = {};
    const glyphInfos = [];

    for (const componentIndex of this.sceneController.doubleClickedComponentIndices) {
      const glyphName = instance.components[componentIndex].name;
      const location = instance.components[componentIndex].location;
      if (location) {
        glyphLocations[glyphName] = location;
      }
      glyphInfos.push(this.fontController.glyphInfoFromGlyphName(glyphName));
    }
    this.sceneController.updateGlyphLocations(glyphLocations);
    this.insertGlyphInfos(glyphInfos, 1, true);
  }

  insertGlyphInfos(glyphInfos, where = 0, select = false) {
    // where == 0: replace selected glyph
    // where == 1: insert after selected glyph
    // where == -1: insert before selected glyph
    const selectedGlyphInfo = this.sceneSettings.selectedGlyph;
    const glyphLines = [...this.sceneSettings.glyphLines];

    const insertIndex = selectedGlyphInfo.glyphIndex + (where == 1 ? 1 : 0);
    glyphLines[selectedGlyphInfo.lineIndex].splice(
      insertIndex,
      where ? 0 : 1,
      ...glyphInfos
    );
    this.sceneSettings.glyphLines = glyphLines;

    const glyphIndex =
      selectedGlyphInfo.glyphIndex +
      (select ? (where == 1 ? 1 : 0) : where == -1 ? glyphInfos.length : 0);

    this.sceneSettings.selectedGlyph = {
      lineIndex: selectedGlyphInfo.lineIndex,
      glyphIndex: glyphIndex,
      isEditing: where && select ? false : this.sceneSettings.selectedGlyph.isEditing,
    };
  }

  async doubleClickedAnchorsCallback(event) {
    const glyphController = await this.sceneModel.getSelectedStaticGlyphController();
    if (!glyphController.canEdit) {
      this.sceneController._dispatchEvent("glyphEditLocationNotAtSource");
      return;
    }

    const instance = glyphController.instance;

    const anchorIndex = this.sceneController.doubleClickedAnchorIndices[0];
    let anchor = instance.anchors[anchorIndex];
    const { anchor: newAnchor } = await this.doAddEditAnchorDialog(anchor);
    if (!newAnchor) {
      return;
    }

    await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      for (const layerGlyph of Object.values(layerGlyphs)) {
        const oldAnchor = layerGlyph.anchors[anchorIndex];
        layerGlyph.anchors[anchorIndex] = {
          name: newAnchor.name ? newAnchor.name : oldAnchor.name,
          x: !isNaN(newAnchor.x) ? newAnchor.x : oldAnchor.x,
          y: !isNaN(newAnchor.y) ? newAnchor.y : oldAnchor.y,
        };
      }
      this.sceneController.selection = new Set([`anchor/${anchorIndex}`]);
      return "Edit Anchor";
    });
  }

  async doubleClickedGuidelinesCallback(event) {
    const glyphController = await this.sceneModel.getSelectedStaticGlyphController();
    if (!glyphController.canEdit) {
      this.sceneController._dispatchEvent("glyphEditLocationNotAtSource");
      return;
    }

    const instance = glyphController.instance;

    const guidelineIndex = this.sceneController.doubleClickedGuidelineIndices[0];
    let guideline = instance.guidelines[guidelineIndex];
    const { guideline: newGuideline } = await this.doAddEditGuidelineDialog(guideline);
    if (!newGuideline) {
      return;
    }
    await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      for (const layerGlyph of Object.values(layerGlyphs)) {
        const oldGuideline = layerGlyph.guidelines[guidelineIndex];
        layerGlyph.guidelines[guidelineIndex] = {
          name: newGuideline.name,
          x: !isNaN(newGuideline.x) ? newGuideline.x : oldGuideline.x,
          y: !isNaN(newGuideline.y) ? newGuideline.y : oldGuideline.y,
          angle: !isNaN(newGuideline.angle) ? newGuideline.angle : oldGuideline.angle,
          locked: [true, false].includes(newGuideline.locked)
            ? newGuideline.locked
            : oldGuideline.locked,
        };
      }
      this.sceneController.selection = new Set([`guideline/${guidelineIndex}`]);
      return "Edit Guideline";
    });
  }

  initContextMenuItems() {
    this.basicContextMenuItems = [];
    this.basicContextMenuItems.push({
      title: () => this.getUndoRedoLabel(false),
      actionIdentifier: "action.undo",
    });
    this.basicContextMenuItems.push({
      title: () => this.getUndoRedoLabel(true),
      actionIdentifier: "action.redo",
    });

    this.basicContextMenuItems.push(MenuItemDivider);

    if (!insecureSafariConnection()) {
      // In Safari, the async clipboard API only works in a secure context
      // (HTTPS). We apply a workaround using the clipboard event API, but
      // only in Safari, and when in an HTTP context.
      // So, since the "actions" versions of cut/copy/paste won't work, we
      // do not add their menu items.
      this.basicContextMenuItems.push(
        {
          title: "Cut",
          actionIdentifier: "action.cut",
        },
        {
          title: "Copy",
          actionIdentifier: "action.copy",
        },
        {
          title: "Paste",
          actionIdentifier: "action.paste",
        }
      );
    }

    this.basicContextMenuItems.push({
      title: () =>
        this.sceneSettings.selectedGlyph?.isEditing
          ? translate("action.delete-selection")
          : translate("action.delete-glyph"),
      actionIdentifier: "action.delete",
    });

    this.basicContextMenuItems.push(MenuItemDivider);

    this.basicContextMenuItems.push({
      actionIdentifier: "action.select-all",
    });

    this.basicContextMenuItems.push({
      actionIdentifier: "action.select-none",
    });

    this.glyphEditContextMenuItems = [];

    this.glyphEditContextMenuItems.push({ actionIdentifier: "action.add-component" });
    this.glyphEditContextMenuItems.push({ actionIdentifier: "action.add-anchor" });
    this.glyphEditContextMenuItems.push({ actionIdentifier: "action.add-guideline" });

    this.glyphEditContextMenuItems.push({
      title: () => this.getLockGuidelineLabel(this.selectionHasLockedGuidelines()),
      actionIdentifier: "action.lock-guidelines",
    });

    this.glyphEditContextMenuItems.push(...this.sceneController.getContextMenuItems());

    this.glyphSelectedContextMenuItems = [];

    this.glyphSelectedContextMenuItems.push({
      actionIdentifier: "action.select-previous-source",
    });
    this.glyphSelectedContextMenuItems.push({
      actionIdentifier: "action.select-next-source",
    });
    this.glyphSelectedContextMenuItems.push({
      title: () =>
        translate(
          "menubar.view.find-glyphs-that-use",
          this.sceneSettings.selectedGlyphName
        ),
      actionIdentifier: "action.find-glyphs-that-use",
    });
    this.glyphSelectedContextMenuItems.push(MenuItemDivider);
    this.glyphSelectedContextMenuItems.push({
      actionIdentifier: "action.replace-selected-glyph-on-canvas",
    });
    this.glyphSelectedContextMenuItems.push({
      actionIdentifier: "action.remove-selected-glyph-from-canvas",
    });
    this.glyphSelectedContextMenuItems.push({
      actionIdentifier: "action.add-glyph-before-selected-glyph",
    });
    this.glyphSelectedContextMenuItems.push({
      actionIdentifier: "action.add-glyph-after-selected-glyph",
    });
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

  async keyDownHandler(event) {
    const actionIdentifier = getActionIdentifierFromKeyEvent(event);
    if (actionIdentifier) {
      this.sceneController.updateContextMenuState(null);
      event.preventDefault();
      event.stopImmediatePropagation();
      doPerformAction(actionIdentifier, event);
      return;
    }
  }

  getUndoRedoLabel(isRedo) {
    const info = this.sceneController.getUndoRedoInfo(isRedo);
    return (
      (isRedo ? translate("action.redo") : translate("action.undo")) +
      (info ? " " + info.label : "")
    );
  }

  canUndoRedo(isRedo) {
    return !!this.sceneController.getUndoRedoInfo(isRedo);
  }

  async doUndoRedo(isRedo) {
    await this.sceneController.doUndoRedo(isRedo);
  }

  canCut() {
    if (this.fontController.readOnly || this.sceneModel.isSelectedGlyphLocked()) {
      return false;
    }
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
    const codePoints = this.fontController.glyphMap[glyphName] || [];
    const glifString = staticGlyphToGLIF(glyphName, layerGlyphs[0].glyph, codePoints);
    const jsonString = JSON.stringify(
      varGlyph ? { variableGlyph: varGlyph } : { layerGlyphs: layerGlyphs }
    );

    const mapping = { "svg": svgString, "glif": glifString, "fontra-json": jsonString };
    const plainTextString =
      mapping[applicationSettingsController.model.clipboardFormat] || glifString;

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

    const {
      point: pointIndices,
      component: componentIndices,
      anchor: anchorIndices,
      guideline: guidelineIndices,
    } = parseSelection(this.sceneController.selection);
    let path;
    let components;
    let anchors;
    let guidelines;
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
    if (anchorIndices) {
      anchors = anchorIndices.map((i) => editInstance.anchors[i]);
      if (doCut) {
        for (const anchorIndex of reversed(anchorIndices)) {
          editInstance.anchors.splice(anchorIndex, 1);
        }
      }
    }
    if (guidelineIndices) {
      guidelines = guidelineIndices.map((i) => editInstance.guidelines[i]);
      if (doCut) {
        for (const guidelineIndex of reversed(guidelineIndices)) {
          editInstance.guidelines.splice(guidelineIndex, 1);
        }
      }
    }
    const instance = StaticGlyph.fromObject({
      ...editInstance,
      path: path,
      components: components,
      anchors: anchors,
      guidelines: guidelines,
    });
    return {
      instance: instance,
      flattenedPath: wantFlattenedPath ? joinPaths(flattenedPathList) : undefined,
    };
  }

  canPaste() {
    if (this.fontController.readOnly || this.sceneModel.isSelectedGlyphLocked()) {
      return false;
    }
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
        const layerName = "default";
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
      this.sceneSettings.fontLocationSourceMapped = {
        ...this.sceneSettings.fontLocationSourceMapped,
      };
      this.sceneSettings.glyphLocation = { ...this.sceneSettings.glyphLocation };
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

        for (const anchorIndex of range(
          firstLayerGlyph.anchors.length,
          firstLayerGlyph.anchors.length + defaultPasteGlyph.anchors.length
        )) {
          selection.add(`anchor/${anchorIndex}`);
        }

        for (const guidelineIndex of range(
          firstLayerGlyph.guidelines.length,
          firstLayerGlyph.guidelines.length + defaultPasteGlyph.guidelines.length
        )) {
          selection.add(`guideline/${guidelineIndex}`);
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
          layerGlyph.anchors.push(...pasteGlyph.anchors);
          layerGlyph.guidelines.push(...pasteGlyph.guidelines);
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
    if (this.fontController.readOnly || this.sceneModel.isSelectedGlyphLocked()) {
      return false;
    }
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
    const {
      point: pointSelection,
      component: componentSelection,
      anchor: anchorSelection,
      guideline: guidelineSelection,
      //fontGuideline: fontGuidelineSelection,
    } = parseSelection(this.sceneController.selection);
    // TODO: Font Guidelines
    // if (fontGuidelineSelection) {
    //   for (const guidelineIndex of reversed(fontGuidelineSelection)) {
    //     XXX
    //   }
    // }
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
          if (anchorSelection) {
            for (const anchorIndex of reversed(anchorSelection)) {
              layerGlyph.anchors.splice(anchorIndex, 1);
            }
          }
          if (guidelineSelection) {
            for (const guidelineIndex of reversed(guidelineSelection)) {
              const guideline = layerGlyph.guidelines[guidelineIndex];
              if (guideline.locked) {
                // don't delete locked guidelines
                continue;
              }
              layerGlyph.guidelines.splice(guidelineIndex, 1);
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
    const glyphName = await this.runGlyphSearchDialog(
      translate("action.add-component"),
      translate("dialog.add")
    );
    if (!glyphName) {
      return;
    }

    const baseGlyph = await this.fontController.getGlyph(glyphName);
    const location = Object.fromEntries(
      baseGlyph.glyph.axes.map((axis) => [axis.name, axis.defaultValue])
    );
    const newComponent = {
      name: glyphName,
      transformation: getDecomposedIdentity(),
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

  canAddAnchor() {
    return this.sceneModel.getSelectedPositionedGlyph()?.glyph.canEdit;
  }

  async doAddAnchor() {
    const point = this.sceneController.selectedGlyphPoint(this.contextMenuPosition);
    const { anchor: tempAnchor } = await this.doAddEditAnchorDialog(undefined, point);
    if (!tempAnchor) {
      return;
    }

    const newAnchor = {
      name: tempAnchor.name ? tempAnchor.name : "anchorName",
      x: !isNaN(tempAnchor.x) ? tempAnchor.x : Math.round(point.x),
      y: !isNaN(tempAnchor.y) ? tempAnchor.y : Math.round(point.y),
    };
    const instance = this.sceneModel.getSelectedPositionedGlyph().glyph.instance;
    const relativeScaleX = instance.xAdvance ? point.x / instance.xAdvance : null;

    await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
      for (const layerGlyph of Object.values(layerGlyphs)) {
        if (isNaN(tempAnchor.x) && relativeScaleX != null) {
          newAnchor.x = Math.round(layerGlyph.xAdvance * relativeScaleX);
        }
        layerGlyph.anchors.push({ ...newAnchor });
      }
      const newAnchorIndex = instance.anchors.length - 1;
      this.sceneController.selection = new Set([`anchor/${newAnchorIndex}`]);
      return "Add Anchor";
    });
  }

  async doAddEditAnchorDialog(anchor = undefined, point = undefined) {
    const titlePrefix = anchor ? "Edit" : "Add";
    if (!anchor && !point) {
      // Need at least one of the two
      return {};
    }

    const instance = this.sceneModel.getSelectedPositionedGlyph().glyph.instance;

    const validateInput = () => {
      const warnings = [];
      const editedAnchorName =
        nameController.model.anchorName || nameController.model.suggestedAnchorName;
      if (!editedAnchorName.length) {
        warnings.push("⚠️ The name must not be empty");
      }
      if (
        !(
          nameController.model.anchorName ||
          nameController.model.anchorX ||
          nameController.model.anchorY
        )
      ) {
        warnings.push("");
      }
      for (const n of ["X", "Y"]) {
        const value = nameController.model[`anchor${n}`];
        if (isNaN(value)) {
          if (value !== undefined) {
            warnings.push(`⚠️ The ${n.toLowerCase()} value must be a number`);
          }
        }
      }
      if (
        editedAnchorName !== anchor?.name &&
        instance.anchors.some((anchor) => anchor.name === editedAnchorName)
      ) {
        warnings.push("⚠️ The anchor name should be unique");
      }
      warningElement.innerText = warnings.length ? warnings.join("\n") : "";
      dialog.defaultButton.classList.toggle("disabled", warnings.length);
    };

    const anchorNameDefault = anchor ? anchor.name : "anchorName";
    const nameController = new ObservableController({
      anchorName: anchorNameDefault,
      anchorX: undefined,
      anchorY: undefined,
      suggestedAnchorName: anchorNameDefault,
      suggestedAnchorX: anchor ? anchor.x : Math.round(point.x),
      suggestedAnchorY: anchor ? anchor.y : Math.round(point.y),
    });

    nameController.addKeyListener("anchorName", (event) => {
      validateInput();
    });
    nameController.addKeyListener("anchorX", (event) => {
      validateInput();
    });
    nameController.addKeyListener("anchorY", (event) => {
      validateInput();
    });

    const disable =
      nameController.model.anchorName ||
      nameController.model.anchorX ||
      nameController.model.anchorY
        ? false
        : true;
    const { contentElement, warningElement } =
      this._anchorPropertiesContentElement(nameController);
    const dialog = await dialogSetup(`${titlePrefix} Anchor`, null, [
      { title: "Cancel", isCancelButton: true },
      { title: titlePrefix, isDefaultButton: true, disabled: disable },
    ]);

    dialog.setContent(contentElement);

    setTimeout(() => {
      const inputNameElement = contentElement.querySelector("#anchor-name-text-input");
      inputNameElement.focus();
      inputNameElement.select();
    }, 0);

    validateInput();

    if (!(await dialog.run())) {
      // User cancelled
      return {};
    }

    const newAnchor = {
      name: nameController.model.anchorName,
      x: Number(nameController.model.anchorX),
      y: Number(nameController.model.anchorY),
    };

    return { anchor: newAnchor };
  }

  _anchorPropertiesContentElement(controller) {
    const warningElement = html.div({
      id: "warning-text-anchor-name",
      style: `grid-column: 1 / -1; min-height: 1.5em;`,
    });
    const contentElement = html.div(
      {
        style: `overflow: hidden;
          white-space: nowrap;
          display: grid;
          gap: 0.5em;
          grid-template-columns: auto auto;
          align-items: center;
          height: 100%;
          min-height: 0;
        `,
      },
      [
        ...labeledTextInput("Name:", controller, "anchorName", {
          placeholderKey: "suggestedAnchorName",
          id: "anchor-name-text-input",
        }),
        ...labeledTextInput("x:", controller, "anchorX", {
          placeholderKey: "suggestedAnchorX",
        }),
        ...labeledTextInput("y:", controller, "anchorY", {
          placeholderKey: "suggestedAnchorY",
        }),
        html.br(),
        warningElement,
      ]
    );
    return { contentElement, warningElement };
  }

  selectionHasLockedGuidelines() {
    const {
      guideline: guidelineSelection,
      //fontGuideline: fontGuidelineSelection,
    } = parseSelection(this.sceneController.selection);

    const instance = this.sceneModel.getSelectedPositionedGlyph()?.glyph.instance;
    if (guidelineSelection?.some((index) => instance.guidelines[index]?.locked)) {
      return true;
    }

    // TODO: Font Guidelines
    // check if any of the selected guidelines are locked

    return false;
  }

  getLockGuidelineLabel(hasLockedGuidelines) {
    const {
      guideline: guidelineSelection,
      //fontGuideline: fontGuidelineSelection,
    } = parseSelection(this.sceneController.selection);
    const numGuidelines = guidelineSelection?.length || 0;
    // + (fontGuidelineSelection?.length || 0);

    const s = numGuidelines > 1 ? "s" : "";
    return `${hasLockedGuidelines ? "Unlock" : "Lock"} Guideline${s}`;
  }

  canLockGuideline() {
    if (this.fontController.readOnly || this.sceneModel.isSelectedGlyphLocked()) {
      return false;
    }
    const {
      guideline: guidelineSelection,
      //fontGuideline: fontGuidelineSelection,
    } = parseSelection(this.sceneController.selection);
    const numGuidelines = guidelineSelection?.length || 0;
    // + (fontGuidelineSelection?.length || 0);

    return numGuidelines;
  }

  async doLockGuideline(locking = false) {
    const {
      guideline: guidelineSelection,
      //fontGuideline: fontGuidelineSelection,
    } = parseSelection(this.sceneController.selection);
    const identifier = locking ? "Unlock" : "Lock";

    // Lock glyph guidelines
    if (guidelineSelection) {
      await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
        for (const layerGlyph of Object.values(layerGlyphs)) {
          for (const guidelineIndex of guidelineSelection) {
            const guideline = layerGlyph.guidelines[guidelineIndex];
            if (!guideline) {
              continue;
            }
            guideline.locked = locking;
          }
        }
        return `${identifier} Guideline(s)`;
      });
    }
    // TODO: Font Guidelines locking
    // Lock font guidelines
    // if (fontGuidelineSelection) {
    //   XXX
    // }
  }

  // TODO: We may want to make a more general code for adding and editing
  // so we can handle both anchors and guidelines with the same code
  // Guidelines
  canAddGuideline() {
    return this.sceneModel.getSelectedPositionedGlyph()?.glyph.canEdit;
  }

  async doAddGuideline(global = false) {
    this.visualizationLayersSettings.model["fontra.guidelines"] = true;
    const point = this.sceneController.selectedGlyphPoint(this.contextMenuPosition);
    const { guideline: tempGuideline } = await this.doAddEditGuidelineDialog(
      undefined,
      point,
      global
    );
    if (!tempGuideline) {
      return;
    }

    const newGuideline = {
      x: !isNaN(tempGuideline.x) ? tempGuideline.x : Math.round(point.x),
      y: !isNaN(tempGuideline.y) ? tempGuideline.y : Math.round(point.y),
      angle: !isNaN(tempGuideline.angle) ? tempGuideline.angle : 0,
      locked: tempGuideline.locked !== undefined ? tempGuideline.locked : false,
    };
    if (tempGuideline.name) {
      newGuideline.name = tempGuideline.name;
    }

    if (!global) {
      const instance = this.sceneModel.getSelectedPositionedGlyph().glyph.instance;
      await this.sceneController.editLayersAndRecordChanges((layerGlyphs) => {
        for (const layerGlyph of Object.values(layerGlyphs)) {
          layerGlyph.guidelines.push({ ...newGuideline });
        }
        const newGuidelineIndex = instance.guidelines.length - 1;
        this.sceneController.selection = new Set([`guideline/${newGuidelineIndex}`]);
        return "Add Guideline";
      });
    }
    // TODO: Font Guidelines
  }

  async doAddEditGuidelineDialog(
    guideline = undefined,
    point = undefined,
    global = false
  ) {
    const titlePrefix = guideline ? "Edit" : "Add";
    if (!guideline && !point) {
      // Need at least one of the two
      return {};
    }

    const instance = this.sceneModel.getSelectedPositionedGlyph().glyph.instance;

    const validateInput = () => {
      const warnings = [];
      const editedGuidelineName =
        nameController.model.guidelineName ||
        nameController.model.suggestedGuidelineName;
      for (const n of ["X", "Y", "Angle"]) {
        const value = nameController.model[`guideline${n}`];
        if (isNaN(value)) {
          if (value !== undefined) {
            warnings.push(`⚠️ The ${n.toLowerCase()} value must be a number`);
          }
        }
      }
      if (
        editedGuidelineName &&
        editedGuidelineName !== guideline?.name &&
        instance.guidelines.some(
          (guideline) => guideline.name === editedGuidelineName.trim()
        )
      ) {
        warnings.push("⚠️ The guideline name should be unique");
      }
      warningElement.innerText = warnings.length ? warnings.join("\n") : "";
      dialog.defaultButton.classList.toggle("disabled", warnings.length);
    };

    const nameController = new ObservableController({
      guidelineName: guideline ? guideline.name : undefined,
      guidelineX: guideline ? guideline.x : Math.round(point.x),
      guidelineY: guideline ? guideline.y : Math.round(point.y),
      guidelineAngle: guideline ? guideline.angle : 0,
      guidelineLocked: guideline ? guideline.locked : false,
    });

    nameController.addKeyListener("guidelineName", (event) => {
      validateInput();
    });
    nameController.addKeyListener("guidelineX", (event) => {
      validateInput();
    });
    nameController.addKeyListener("guidelineY", (event) => {
      validateInput();
    });
    nameController.addKeyListener("guidelineAngle", (event) => {
      validateInput();
    });
    nameController.addKeyListener("guidelineLocked", (event) => {
      validateInput();
    });

    const disable =
      nameController.model.guidelineName ||
      nameController.model.guidelineX ||
      nameController.model.guidelineY ||
      nameController.model.guidelineAngle
        ? false
        : true;
    const { contentElement, warningElement } =
      this._guidelinePropertiesContentElement(nameController);
    const dialog = await dialogSetup(
      `${titlePrefix} ${global ? "Font " : ""}Guideline`,
      null,
      [
        { title: "Cancel", isCancelButton: true },
        { title: titlePrefix, isDefaultButton: true, disabled: disable },
      ]
    );

    dialog.setContent(contentElement);

    setTimeout(
      () => contentElement.querySelector("#guideline-name-text-input")?.focus(),
      0
    );

    validateInput();

    if (!(await dialog.run())) {
      // User cancelled
      return {};
    }

    const newGuideline = {
      name: nameController.model.guidelineName
        ? nameController.model.guidelineName.trim()
        : undefined,
      x: Number(nameController.model.guidelineX),
      y: Number(nameController.model.guidelineY),
      angle: Number(nameController.model.guidelineAngle),
      locked: nameController.model.guidelineLocked,
    };

    return { guideline: newGuideline };
  }

  _guidelinePropertiesContentElement(controller) {
    const warningElement = html.div({
      id: "warning-text-guideline-name",
      style: `grid-column: 1 / -1; min-height: 1.5em;`,
    });
    const contentElement = html.div(
      {
        style: `overflow: hidden;
          white-space: nowrap;
          display: grid;
          gap: 0.5em;
          grid-template-columns: auto auto;
          align-items: center;
          height: 100%;
          min-height: 0;
        `,
      },
      [
        ...labeledTextInput("Name:", controller, "guidelineName", {
          id: "guideline-name-text-input",
        }),
        ...labeledTextInput("x:", controller, "guidelineX", {}),
        ...labeledTextInput("y:", controller, "guidelineY", {}),
        ...labeledTextInput("angle:", controller, "guidelineAngle", {}),
        html.div(),
        labeledCheckbox("locked", controller, "guidelineLocked", {}),
        html.br(),
        warningElement,
      ]
    );
    return { contentElement, warningElement };
  }

  doSelectAllNone(selectNone) {
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph || !this.sceneSettings.selectedGlyph?.isEditing) {
      return;
    }

    if (selectNone) {
      this.sceneController.selection = new Set();
      return;
    }

    let {
      point: pointIndices,
      component: componentIndices,
      anchor: anchorIndices,
      guideline: guidelineIndices,
      //fontGuideline: fontGuidelineIndices,
    } = parseSelection(this.sceneController.selection);
    pointIndices = pointIndices || [];
    componentIndices = componentIndices || [];
    anchorIndices = anchorIndices || [];
    guidelineIndices = guidelineIndices || [];
    //fontGuidelineIndices = fontGuidelineIndices || [];

    let selectObjects = false;
    let selectAnchors = false;
    let selectGuidelines = false;

    const instance = positionedGlyph.glyph.instance;
    const hasObjects =
      instance.components.length > 0 || instance.path.pointTypes.length > 0;
    const hasAnchors = instance.anchors.length > 0;
    const hasGuidelines = instance.guidelines.length > 0;

    const glyphPath = positionedGlyph.glyph.path;
    let onCurvePoints = [];
    for (const [pointIndex, pointType] of enumerate(glyphPath.pointTypes)) {
      if ((pointType & VarPackedPath.POINT_TYPE_MASK) === VarPackedPath.ON_CURVE) {
        onCurvePoints.push(pointIndex);
      }
    }

    const allOnCurvePointsSelected = isSuperset(new Set(pointIndices), onCurvePoints);
    if (
      (!allOnCurvePointsSelected ||
        componentIndices.length < instance.components.length) &&
      !anchorIndices.length &&
      !guidelineIndices.length
      //&& !fontGuidelineIndices.length
    ) {
      if (hasObjects) {
        selectObjects = true;
      } else if (hasAnchors) {
        selectAnchors = true;
      } else if (hasGuidelines) {
        selectGuidelines = true;
      }
    }

    if (
      allOnCurvePointsSelected &&
      componentIndices.length == instance.components.length &&
      !anchorIndices.length &&
      !guidelineIndices.length
      //&& !fontGuidelineIndices.length
    ) {
      if (hasAnchors) {
        selectObjects = true;
        selectAnchors = true;
      } else if (hasGuidelines) {
        selectGuidelines = true;
      }
    }

    if (
      (pointIndices.length || componentIndices.length) &&
      anchorIndices.length &&
      !guidelineIndices.length
      //&& !fontGuidelineIndices.length
    ) {
      if (hasAnchors) {
        selectAnchors = true;
      }
    }

    if (
      !pointIndices.length &&
      !componentIndices.length &&
      anchorIndices.length &&
      !guidelineIndices.length
      //&& !fontGuidelineIndices.length
    ) {
      if (hasGuidelines) {
        selectGuidelines = true;
      }
    }

    let newSelection = new Set();

    if (selectObjects) {
      for (const pointIndex of onCurvePoints) {
        newSelection.add(`point/${pointIndex}`);
      }
      for (const componentIndex of range(positionedGlyph.glyph.components.length)) {
        newSelection.add(`component/${componentIndex}`);
      }
    }

    if (selectAnchors) {
      for (const anchorIndex of range(positionedGlyph.glyph.anchors.length)) {
        newSelection.add(`anchor/${anchorIndex}`);
      }
    }

    if (selectGuidelines) {
      for (const guidelineIndex of range(positionedGlyph.glyph.guidelines.length)) {
        const guideline = positionedGlyph.glyph.guidelines[guidelineIndex];
        if (!guideline.locked) {
          newSelection.add(`guideline/${guidelineIndex}`);
        }
      }
      // TODO: Font Guidelines selection
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
      newSourceIndex = varGlyphController.findNearestSourceFromSourceLocation({
        ...this.sceneSettings.fontLocationSourceMapped,
        ...this.sceneSettings.glyphLocation,
      });
    } else {
      newSourceIndex = modulo(
        sourceIndex + (selectPrevious ? -1 : 1),
        varGlyphController.sources.length
      );
    }
    this.sceneController.scrollAdjustBehavior = "pin-glyph-center";
    this.sceneSettings.selectedSourceIndex = newSourceIndex;
  }

  async doFindGlyphsThatUseGlyph() {
    const glyphName = this.sceneSettings.selectedGlyphName;

    const usedBy = await loaderSpinner(
      this.fontController.findGlyphsThatUseGlyph(glyphName)
    );

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

  async runGlyphSearchDialog(
    titleLabel = translate("dialog.glyphs.search"),
    okLabel = translate("dialog.add")
  ) {
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

    const dialog = await dialogSetup(titleLabel, null, [
      { title: translate("dialog.cancel"), isCancelButton: true },
      { title: okLabel, isDefaultButton: true, resultValue: "ok", disabled: true },
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

    return glyphName;
  }

  async doCanvasInsertGlyph(titleLabel, okLabel, where) {
    const glyphName = await this.runGlyphSearchDialog(titleLabel, okLabel);
    if (!glyphName) {
      return;
    }
    const glyphInfo = this.fontController.glyphInfoFromGlyphName(glyphName);
    this.insertGlyphInfos([glyphInfo], where, true);
  }

  keyUpHandler(event) {
    if (this._matchingKeyUpHandler && this._matchingKeyUpHandler.code == event.code) {
      this._matchingKeyUpHandler.callback(event);
      delete this._matchingKeyUpHandler;
    }
  }

  enterCleanViewAndHandTool(event) {
    this.canvasController.sceneView = this.cleanSceneView;
    this.canvasController.requestUpdate();
    for (const overlay of document.querySelectorAll(".cleanable-overlay")) {
      overlay.classList.add("overlay-layer-hidden");
    }
    this.savedSelectedToolIdentifier = this.selectedToolIdentifier;
    this.setSelectedTool("hand-tool");
    this._matchingKeyUpHandler = {
      code: event.code,
      callback: () => this.leaveCleanViewAndHandTool(),
    };
  }

  leaveCleanViewAndHandTool() {
    this.canvasController.sceneView = this.defaultSceneView;
    this.canvasController.requestUpdate();
    for (const overlay of document.querySelectorAll(".cleanable-overlay")) {
      overlay.classList.remove("overlay-layer-hidden");
    }
    this.setSelectedTool(this.savedSelectedToolIdentifier);
    delete this.savedSelectedToolIdentifier;
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
    this.contextMenuPosition = { x: x, y: y };
    showMenu(this.buildContextMenuItems(event), { x: x + 1, y: y - 1 }, event.target);
  }

  async newGlyph(glyphName, codePoint, varGlyph, undoLabel = null) {
    await this.fontController.newGlyph(glyphName, codePoint, varGlyph, undoLabel);
  }

  async externalChange(change, isLiveChange) {
    await this.fontController.applyChange(change, true);
    this.fontController.notifyChangeListeners(change, isLiveChange, true);

    // Force sync between location and selectedSourceIndex, as the glyph's
    // source list may have changed
    this.sceneSettings.fontLocationSourceMapped = {
      ...this.sceneSettings.fontLocationSourceMapped,
    };
    this.sceneSettings.glyphLocation = { ...this.sceneSettings.glyphLocation };
    await this.sceneModel.updateScene();
    this.canvasController.requestUpdate();
  }

  async reloadData(reloadPattern) {
    if (!reloadPattern) {
      // A reloadPattern of undefined or null means: reload all the things
      await this.reloadEverything();
      return;
    }

    for (const rootKey of Object.keys(reloadPattern)) {
      if (rootKey == "glyphs") {
        const glyphNames = Object.keys(reloadPattern["glyphs"] || {});
        if (glyphNames.length) {
          await this.reloadGlyphs(glyphNames);
        }
      } else {
        // TODO
        // console.log(`reloading of non-glyph data is not yet implemented: ${rootKey}`);
        await this.reloadEverything();
        return;
      }
    }
  }

  async reloadEverything() {
    await this.fontController.reloadEverything();
    await this.sceneModel.updateScene();
    this.canvasController.requestUpdate();
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
      if (!viewInfo) {
        viewInfo = {};
        message("The URL is malformed", "The UI settings could not be restored.");
      }
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

    this.sceneModel.setGlyphLocations(viewInfo["glyphLocations"]);

    if (viewInfo["fontAxesUseSourceCoordinates"]) {
      this.sceneSettings.fontAxesUseSourceCoordinates = true;
    }
    if (viewInfo["fontAxesShowEffectiveLocation"]) {
      this.sceneSettings.fontAxesShowEffectiveLocation = true;
    }
    if (viewInfo["fontAxesShowHidden"]) {
      this.sceneSettings.fontAxesShowHidden = true;
    }
    if (viewInfo["fontAxesSkipMapping"]) {
      this.sceneSettings.fontAxesSkipMapping = true;
    }
    if (viewInfo["location"]) {
      this.sceneSettings.fontLocationUser = viewInfo["location"];
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
    viewInfo["location"] = this.sceneSettings.fontLocationUser;
    if (this.sceneSettings.fontAxesUseSourceCoordinates) {
      viewInfo["fontAxesUseSourceCoordinates"] = true;
    }
    if (this.sceneSettings.fontAxesShowEffectiveLocation) {
      viewInfo["fontAxesShowEffectiveLocation"] = true;
    }
    if (this.sceneSettings.fontAxesShowHidden) {
      viewInfo["fontAxesShowHidden"] = true;
    }
    if (this.sceneSettings.fontAxesSkipMapping) {
      viewInfo["fontAxesSkipMapping"] = true;
    }
    const glyphLocations = this.sceneController.getGlyphLocations(true);
    if (Object.keys(glyphLocations).length) {
      viewInfo["glyphLocations"] = glyphLocations;
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

function insecureSafariConnection() {
  return window.safari !== undefined && window.location.protocol === "http:";
}

function collapseSubTools(editToolsElement) {
  // Hide sub tools
  for (const [index, child] of enumerate(editToolsElement.children)) {
    child.style.visibility = index ? "hidden" : "visible";
    child.dataset.tooltipposition = index ? "right" : "bottom";
  }
}
