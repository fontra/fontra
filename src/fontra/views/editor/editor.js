import { CanvasController } from "../core/canvas-controller.js";
import { applyChange, matchChangePath } from "../core/changes.js";
import { recordChanges } from "../core/change-recorder.js";
import { ContextMenu, MenuItemDivider } from "../core/context-menu.js";
import { FontController } from "../core/font-controller.js";
import { loaderSpinner } from "../core/loader-spinner.js";
import {
  centeredRect,
  insetRect,
  offsetRect,
  rectCenter,
  rectFromArray,
  rectToArray,
  rectSize,
  scaleRect,
} from "../core/rectangle.js";
import { getRemoteProxy } from "../core/remote.js";
import { SceneView } from "../core/scene-view.js";
import { dialog } from "../core/ui-dialog.js";
import { Form } from "../core/ui-form.js";
import { List } from "../core/ui-list.js";
import { Sliders } from "../core/ui-sliders.js";
import { ValueController } from "../core/value-controller.js";
import { StaticGlyph } from "../core/var-glyph.js";
import { addItemwise, subItemwise, mulScalar } from "../core/var-funcs.js";
import { joinPaths } from "../core/var-path.js";
import {
  THEME_KEY,
  makeUPlusStringFromCodePoint,
  hasShortcutModifierKey,
  hyphenatedToCamelCase,
  parseSelection,
  scheduleCalls,
  themeSwitchFromLocalStorage,
  throttleCalls,
  range,
  readFromClipboard,
  reversed,
  writeToClipboard,
} from "../core/utils.js";
import { SceneController } from "./scene-controller.js";
import { SceneModel } from "./scene-model.js";
import { HandTool } from "./edit-tools-hand.js";
import { PenTool } from "./edit-tools-pen.js";
import { PointerTool } from "./edit-tools-pointer.js";
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
import { AddRemoveButtons } from "../web-components/add-remove-buttons.js";
import { AddComponentDialog } from "/web-components/add-component-dialog.js";

const drawingParametersLight = {
  glyphFillColor: "#000",
  undefinedFlyphFillColor: "#0006",
  hoveredGlyphStrokeColor: "#BBB8",
  selectedGlyphStrokeColor: "#7778",
  nodeFillColor: "#BBB",
  selectedNodeFillColor: "#000",
  hoveredNodeStrokeColor: "#BBB",
  handleColor: "#BBB",
  pathStrokeColor: "#000",
  ghostPathStrokeColor: "#0002",
  pathFillColor: "#0001",
  selectedComponentStrokeColor: "#888",
  hoveredComponentStrokeColor: "#CCC",
  cjkFrameStrokeColor: "#0004",
  cjkFrameOvershootColor: "#00BFFF26",
  cjkFrameSecondLineColor: "#A6296344",
  sidebearingBarColor: "#0004",
  startPointIndicatorColor: "#989898A0",
  connectPointIndicatorColor: "#3080FF80",
  hoveredEmptyGlyphColor: "#E8E8E8", // Must be six hex digits
  selectedEmptyGlyphColor: "#D8D8D8", // Must be six hex digits
  onePixelUnit: 1,
  cornerNodeSize: 8,
  smoothNodeSize: 8,
  handleNodeSize: 6.5,
  hoveredNodeLineWidth: 1,
  handleLineWidth: 1,
  pathLineWidth: 1,
  rectSelectLineWidth: 1,
  rectSelectLineDash: [10, 10],
  cjkFrameLineWidth: 1,
  selectedComponentLineWidth: 3,
  hoveredComponentLineWidth: 3,
  sidebearingBarExtent: 16,
  startPointIndicatorLineWidth: 2,
  startPointIndicatorRadius: 9,
  connectPointIndicatorRadius: 11,
  insertHandlesIndicatorRadius: 5,
};

const drawingParametersDark = {
  ...drawingParametersLight,
  glyphFillColor: "#FFF",
  undefinedFlyphFillColor: "#FFF6",
  hoveredGlyphStrokeColor: "#CCC8",
  selectedGlyphStrokeColor: "#FFF8",
  nodeFillColor: "#BBB",
  selectedNodeFillColor: "#FFF",
  hoveredNodeStrokeColor: "#BBB",
  handleColor: "#777",
  pathStrokeColor: "#FFF",
  ghostPathStrokeColor: "#FFF4",
  pathFillColor: "#FFF3",
  selectedComponentStrokeColor: "#BBB",
  hoveredComponentStrokeColor: "#777",
  cjkFrameStrokeColor: "#FFF6",
  cjkFrameSecondLineColor: "#A62963AA",
  sidebearingBarColor: "#FFF6",
  startPointIndicatorColor: "#989898A0",
  connectPointIndicatorColor: "#50A0FF80",
  hoveredEmptyGlyphColor: "#484848",
  selectedEmptyGlyphColor: "#585858",
};

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
    await editorController.start();
    return editorController;
  }

  constructor(font) {
    themeSwitchFromLocalStorage();
    this.fontController = new FontController(font, {});
    this.fontController.addEditListener(
      async (...args) => await this.editListenerCallback(...args)
    );
    this.autoViewBox = true;
    const canvas = document.querySelector("#edit-canvas");
    canvas.focus();

    const canvasController = new CanvasController(canvas, (magnification) =>
      this.canvasMagnificationChanged(magnification)
    );
    this.canvasController = canvasController;
    // We need to do isPointInPath without having a context, we'll pass a bound method
    const isPointInPath = canvasController.context.isPointInPath.bind(
      canvasController.context
    );

    this.visualizationLayers = new VisualizationLayers(
      visualizationLayerDefinitions,
      this.isThemeDark
    );

    const sceneModel = new SceneModel(this.fontController, isPointInPath);

    const sceneView = new SceneView(sceneModel, (model, controller) =>
      this.visualizationLayers.drawVisualizationLayers(model, controller)
    );
    canvasController.sceneView = sceneView;

    this.defaultSceneView = sceneView;

    this.cleanGlyphsLayers = new VisualizationLayers([
      allGlyphsCleanVisualizationLayerDefinition,
      this.isThemeDark,
    ]);
    this.cleanSceneView = new SceneView(sceneModel, (model, controller) => {
      this.cleanGlyphsLayers.drawVisualizationLayers(model, controller);
    });

    this.sceneController = new SceneController(sceneModel, canvasController);
    // TODO move event stuff out of here
    this.sceneController.addEventListener("selectedGlyphChanged", async (event) => {
      await this.updateSlidersAndSources();
      this.sourcesList.setSelectedItemIndex(
        await this.sceneController.getSelectedSource()
      );
    });
    this.sceneController.addEventListener(
      "selectedGlyphIsEditingChanged",
      async (event) => {
        this.updateWindowLocation();
      }
    );
    this.sceneController.addEventListener("doubleClickedComponents", async (event) => {
      this.doubleClickedComponentsCallback(event);
    });

    this.initContextMenuItems();
    this.initShortCuts();
    this.initSidebars();
    this.initMiniConsole();
    this.infoForm = new Form("selection-info");

    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addListener((event) => this.themeChanged(event));
    window.addEventListener("fontra-theme-switch", (event) => {
      this.themeChanged(event);
    });

    this.canvasController.canvas.addEventListener("contextmenu", (event) =>
      this.contextMenuHandler(event)
    );
    window.addEventListener("mousedown", (event) => this.dismissContextMenu(event));
    window.addEventListener("blur", (event) => this.dismissContextMenu(event));

    window.addEventListener("keydown", (event) => this.keyDownHandler(event));
    window.addEventListener("keyup", (event) => this.keyUpHandler(event));

    this.enteredText = "";
    this.updateWindowLocation = scheduleCalls(
      (event) => this._updateWindowLocation(),
      200
    );
    this.updateSelectionInfo = throttleCalls(
      async (event) => await this._updateSelectionInfo(),
      100
    );
    canvas.addEventListener("viewBoxChanged", (event) => {
      if (event.detail === "canvas-size") {
        this.setAutoViewBox();
      } else {
        this.autoViewBox = false;
      }
      this.updateWindowLocation();
    });
    this.sceneController.addEventListener("selectedGlyphChanged", () =>
      this.updateWindowLocationAndSelectionInfo()
    );
    this.sceneController.addEventListener("selectionChanged", async () => {
      this.updateWindowLocationAndSelectionInfo();
    });

    window.addEventListener("popstate", (event) => {
      this.setupFromWindowLocation();
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
    setTimeout(() => this.canvasController.setNeedsUpdate(), 50);
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
    await this.initGlyphNames();
    await this.initSliders();
    this.initTools();
    this.initSourcesList();
    await this.setupFromWindowLocation();
  }

  async initGlyphNames() {
    const columnDescriptions = [
      {
        key: "char",
        width: "2em",
        get: (item) => getCharFromUnicode(item.unicodes[0]),
      },
      { key: "glyphName", width: "10em" },
      {
        key: "unicode",
        width: "5em",
        get: (item) => makeUPlusStringFromCodePoint(item.unicodes[0]),
      },
    ];
    this.glyphNamesList = new List("glyphs-list", columnDescriptions);
    this.glyphNamesList.itemEqualFunc = (itemA, itemB) =>
      itemA.glyphName === itemB.glyphName;
    this.glyphNamesList.addEventListener("listSelectionChanged", async (event) => {
      const list = event.detail;
      const item = list.items[list.selectedItemIndex];
      await this.glyphNameChangedCallback(item.glyphName);
    });
    this.glyphNamesListFilterFunc = (item) => true; // pass all through
    this.buildGlyphNamesListContent();
  }

  buildGlyphNamesListContent() {
    const glyphMap = this.fontController.glyphMap;
    this.glyphsListItems = [];
    for (const glyphName in glyphMap) {
      this.glyphsListItems.push({
        glyphName: glyphName,
        unicodes: glyphMap[glyphName],
      });
    }
    this.glyphsListItems.sort(glyphItemSortFunc);
    this.setFilteredGlyphNamesListContent();
  }

  setFilteredGlyphNamesListContent() {
    const filteredGlyphItems = this.glyphsListItems.filter(
      this.glyphNamesListFilterFunc
    );
    const selectedItem = this.glyphNamesList.getSelectedItem();
    this.glyphNamesList.setItems(filteredGlyphItems);
    this.glyphNamesList.setSelectedItem(selectedItem);
  }

  async initSliders() {
    this.sliders = new Sliders(
      "axis-sliders",
      await this.sceneController.getAxisInfo()
    );
    this.sliders.addEventListener(
      "slidersChanged",
      scheduleCalls(async (event) => {
        await this.sceneController.setLocation(event.detail.values);
        this.sourcesList.setSelectedItemIndex(
          await this.sceneController.getSelectedSource()
        );
        this.updateWindowLocationAndSelectionInfo();
        this.autoViewBox = false;
      })
    );
  }

  initTools() {
    this.tools = {
      "pointer-tool": new PointerTool(this),
      "pen-tool": new PenTool(this),
      "hand-tool": new HandTool(this),
    };
    for (const toolElement of document.querySelectorAll(
      "#edit-tools > .tool-button > div"
    )) {
      const toolIdentifier = toolElement.id;
      toolElement.onclick = () => {
        this.setSelectedTool(toolIdentifier);
      };
    }
    this.setSelectedTool("pointer-tool");

    for (const zoomElement of document.querySelectorAll(
      "#zoom-tools > .tool-button > div"
    )) {
      const toolIdentifier = zoomElement.id;
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
        }
      };
    }
  }

  initSourcesList() {
    const columnDescriptions = [
      { key: "sourceName", width: "14em" },
      // {"key": "sourceIndex", "width": "2em"},
    ];
    this.sourcesList = new List("sources-list", columnDescriptions);
    // TODO: relocate those to somewhere more appropriate after implementation
    const addSourceCallback = () => {
      console.log("add a source");
    };
    const removeSourceCallback = () => {
      console.log("remove a source");
    };

    const designspaceSliders = document.querySelector(".designspace-sliders");
    this.addRemoveSourceButtons = new AddRemoveButtons();
    this.addRemoveSourceButtons.className = "";
    this.addRemoveSourceButtons.addButtonCallback = addSourceCallback;
    this.addRemoveSourceButtons.removeButtonCallback = removeSourceCallback;
    this.addRemoveSourceButtons.hidden = true;
    designspaceSliders.appendChild(this.addRemoveSourceButtons);

    this.sourcesList.addEventListener("listSelectionChanged", async (event) => {
      await this.sceneController.setSelectedSource(
        event.detail.getSelectedItem().sourceIndex
      );
      this.sliders.values = this.sceneController.getLocation();
      this.updateWindowLocationAndSelectionInfo();
      this.autoViewBox = false;
    });
  }

  initSidebars() {
    for (const sidebarTab of document.querySelectorAll(".sidebar-tab")) {
      const methodName = hyphenatedToCamelCase(
        "toggle-" + sidebarTab.dataset.sidebarName
      );
      const side = sidebarTab.parentElement.classList.contains("left")
        ? "left"
        : "right";
      sidebarTab.addEventListener("click", (event) => {
        this.tabClick(event, side);
        const onOff = event.target.classList.contains("selected");
        this[methodName]?.call(this, onOff);
      });
    }

    this.textEntryElement = document.querySelector("#text-entry-textarea");
    this.textEntryElement.addEventListener(
      "input",
      () => {
        this.textFieldChangedCallback(this.textEntryElement);
        this.fixTextEntryHeight();
      },
      false
    );

    const textAlignMenuElement = document.querySelector("#text-align-menu");
    this.textAlignValueController = new ValueController();

    this.textAlignValueController.addObserver("editor", (align) => {
      this.setTextAlignment(align);
      for (const el of textAlignMenuElement.children) {
        el.classList.toggle("selected", align === el.innerText.slice(5));
      }
    });

    for (const el of textAlignMenuElement.children) {
      el.onclick = (event) => {
        if (event.target.classList.contains("selected")) {
          return;
        }
        this.textAlignValueController.set(el.innerText.slice(5));
      };
    }
  }

  tabClick(event, side) {
    const sidebarContainer = document.querySelector(`.sidebar-container.${side}`);
    const clickedTab = event.target;
    const sidebars = {};
    for (const sideBarContent of document.querySelectorAll(
      `.sidebar-container.${side} > .sidebar-content`
    )) {
      sidebars[sideBarContent.dataset.sidebarName] = sideBarContent;
    }

    for (const item of document.querySelectorAll(
      `.tab-overlay-container.${side} > .sidebar-tab`
    )) {
      const sidebarContent = sidebars[item.dataset.sidebarName];
      if (item === clickedTab) {
        const isSidebarVisible = sidebarContainer.classList.contains("visible");
        const isSelected = item.classList.contains("selected");
        if (isSelected == isSidebarVisible) {
          // Sidebar visibility will change
          this.updateWindowLocation();
          // dispatch event?
        }
        item.classList.toggle("selected", !isSelected);
        sidebarContainer.classList.toggle("visible", !isSelected);
        const shadowBox = document.querySelector(
          `.tab-overlay-container.${side} > .sidebar-shadow-box`
        );
        if (isSelected) {
          setTimeout(() => {
            sidebarContent?.classList.remove("selected");
            shadowBox?.classList.remove("visible");
          }, 120); // timing should match sidebar-container transition
        } else {
          sidebarContent?.classList.add("selected");
          shadowBox?.classList.add("visible");
        }
      } else {
        item.classList.remove("selected");
        sidebarContent?.classList.remove("selected");
      }
    }
  }

  fixTextEntryHeight() {
    // This adapts the text entry height to its content
    this.textEntryElement.style.height = "auto";
    this.textEntryElement.style.height = this.textEntryElement.scrollHeight + 14 + "px";
  }

  async setTextAlignment(align) {
    const [minXPre, maxXPre] =
      this.sceneController.sceneModel.getTextHorizontalExtents();
    if (minXPre === 0 && maxXPre === 0) {
      // It's early, the scene is still empty, don't manipulate the view box
      await this.sceneController.setTextAlignment(align);
      return;
    }
    const viewBox = this.canvasController.getViewBox();
    await this.sceneController.setTextAlignment(align);
    const [minXPost, maxXPost] =
      this.sceneController.sceneModel.getTextHorizontalExtents();
    this.canvasController.setViewBox(offsetRect(viewBox, minXPost - minXPre, 0));
    this.updateWindowLocation();
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
        editToolItem.firstElementChild.id === toolIdentifier
      );
    }
    this.sceneController.setSelectedTool(this.tools[toolIdentifier]);
  }

  themeChanged(event) {
    this.visualizationLayers.darkTheme = this.isThemeDark;
    this.cleanGlyphsLayers.darkTheme = this.isThemeDark;
  }

  get isThemeDark() {
    const themeValue = localStorage.getItem(THEME_KEY) || "automatic";
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

  async glyphSearchFieldChanged(value) {
    const searchItems = value.split(/\s+/).filter((item) => item.length);
    this.glyphNamesListFilterFunc = (item) => glyphFilterFunc(item, searchItems);
    this.setFilteredGlyphNamesListContent();
  }

  async glyphNameChangedCallback(glyphName) {
    const codePoint = this.fontController.codePointForGlyph(glyphName);
    const glyphInfo = { glyphName: glyphName };
    if (codePoint !== undefined) {
      glyphInfo["character"] = getCharFromUnicode(codePoint);
    }
    const selectedGlyphState = this.sceneController.getSelectedGlyphState();
    const glyphLines = this.sceneController.getGlyphLines();
    if (selectedGlyphState) {
      glyphLines[selectedGlyphState.lineIndex][selectedGlyphState.glyphIndex] =
        glyphInfo;
      await this.setGlyphLines(glyphLines);
      this.sceneController.setSelectedGlyphState(selectedGlyphState);
    } else {
      if (!glyphLines.length) {
        glyphLines.push([]);
      }
      const lineIndex = glyphLines.length - 1;
      glyphLines[lineIndex].push(glyphInfo);
      await this.setGlyphLines(glyphLines);
      this.sceneController.setSelectedGlyphState({
        lineIndex: lineIndex,
        glyphIndex: glyphLines[lineIndex].length - 1,
        isEditing: false,
      });
    }
    this.updateTextEntryFromGlyphLines();
    await this.updateSlidersAndSources();
    this.setAutoViewBox();
  }

  updateTextEntryFromGlyphLines() {
    this.enteredText = textFromGlyphLines(this.sceneController.getGlyphLines());
    this.textEntryElement.value = this.enteredText;
  }

  async textFieldChangedCallback(element) {
    this.setGlyphLinesFromText(element.value);
  }

  async setGlyphLines(glyphLines) {
    await loaderSpinner(this.sceneController.setGlyphLines(glyphLines));
  }

  async setGlyphLinesFromText(text) {
    this.enteredText = text;
    await this.fontController.ensureInitialized;
    const glyphLines = await glyphLinesFromText(
      this.enteredText,
      this.fontController.characterMap,
      this.fontController.glyphMap,
      (codePoint) => this.fontController.getSuggestedGlyphName(codePoint),
      (glyphName) => this.fontController.getUnicodeFromGlyphName(glyphName)
    );
    await this.setGlyphLines(glyphLines);
    await this.updateSlidersAndSources();
    this.setAutoViewBox();
  }

  async updateSlidersAndSources() {
    const axisInfo = await this.sceneController.getAxisInfo();
    const numGlobalAxes = this.fontController.globalAxes.length;
    if (numGlobalAxes && axisInfo.length != numGlobalAxes) {
      axisInfo.splice(numGlobalAxes, 0, { isDivider: true });
    }
    this.sliders.setSliderDescriptions(axisInfo);
    this.sliders.values = this.sceneController.getLocation();
    const sourceItems = await this.sceneController.getSourcesInfo();
    this.sourcesList.setItems(sourceItems || []);
    this.addRemoveSourceButtons.hidden = !sourceItems;
    this.updateWindowLocationAndSelectionInfo();
  }

  async doubleClickedComponentsCallback(event) {
    const glyphController =
      this.sceneController.sceneModel.getSelectedStaticGlyphController();
    const instance = glyphController.instance;
    const localLocations = {};
    const glyphInfos = [];

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
    const selectedGlyphInfo = this.sceneController.getSelectedGlyphState();
    const glyphLines = this.sceneController.getGlyphLines();
    glyphLines[selectedGlyphInfo.lineIndex].splice(
      selectedGlyphInfo.glyphIndex + 1,
      0,
      ...glyphInfos
    );
    await this.setGlyphLines(glyphLines);
    this.sceneController.selectedGlyph = `${selectedGlyphInfo.lineIndex}/${
      selectedGlyphInfo.glyphIndex + 1
    }`;
    this.updateTextEntryFromGlyphLines();
    await this.updateSlidersAndSources();
    this.setAutoViewBox();
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

    this.basicContextMenuItems.push({
      title: "Add Component",
      enabled: () => this.canAddComponent(),
      callback: () => this.doAddComponent(),
      shortCut: undefined,
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
    this.glyphEditContextMenuItems = this.sceneController.getContextMenuItems();
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

    for (const menuItem of this.basicContextMenuItems) {
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
      if (isTypeableInput(document.activeElement) && !handlerDef.globalOverride) {
        continue;
      }
      if (
        handlerDef.metaKey !== undefined &&
        handlerDef.metaKey !== hasShortcutModifierKey(event)
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
    // Hmmm would be nice if the following was done automatically
    await this.updateSlidersAndSources();
    this.sourcesList.setSelectedItemIndex(
      await this.sceneController.getSelectedSource()
    );
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
    return this.sceneController.selectedGlyph;
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
    const glyphName = this.sceneController.getSelectedGlyphName();
    const unicodes = this.fontController.glyphMap[glyphName] || [];
    const glifString = staticGlyphToGLIF(glyphName, instance, unicodes);
    const jsonString = JSON.stringify(instance);

    const clipboardExportFormat =
      localStorage.getItem("fontra-clipboard-format") || "glif";

    const mapping = { "svg": svgString, "glif": glifString, "fontra-json": jsonString };
    const plainTextString = mapping[clipboardExportFormat] || glifString;

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
    const positionedGlyph =
      this.sceneController.sceneModel.getSelectedPositionedGlyph();
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
        pastedGlyph = await this.fontController.parseClipboard(plainText);
      }
    }

    if (!pastedGlyph) {
      return;
    }
    await this.sceneController.editInstanceAndRecordChanges((instance) => {
      const selection = new Set();
      for (const pointIndex of range(
        instance.path.numPoints,
        instance.path.numPoints + pastedGlyph.path.numPoints
      )) {
        selection.add(`point/${pointIndex}`);
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

  canDeepPaste() {
    return true;
  }

  doDeepPaste() {
    console.log("deep paste");
  }

  canDelete() {
    return (
      this.sceneController.selectedGlyphIsEditing &&
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
    // TODO: implementation needed
    return true;
  }
  doAddComponent() {
    const container = document.querySelector("#ui-dialog-container");
    const addComponentDialogElement = new AddComponentDialog(container);
    addComponentDialogElement.addComponentCallback = () => {
      console.log("add component");
    };
    // console.log(this.glyphNamesList.contents);
    // TODO: implementation needed
  }

  canSelectAllNone(selectNone) {
    return this.sceneController.selectedGlyphIsEditing;
  }

  doSelectAllNone(selectNone) {
    const positionedGlyph =
      this.sceneController.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph || !this.sceneController.selectedGlyphIsEditing) {
      return;
    }

    const newSelection = new Set();

    if (!selectNone) {
      const glyphPath = positionedGlyph.glyph.path;
      const glyphComponents = positionedGlyph.glyph.components;

      for (const [pointIndex] of glyphPath.pointTypes.entries()) {
        newSelection.add(`point/${pointIndex}`);
      }

      for (const [componentIndex] of glyphComponents.entries()) {
        newSelection.add(`component/${componentIndex}`);
      }
    }

    this.sceneController.selection = newSelection;
  }

  keyUpHandler(event) {
    if (event.code === "Space") {
      this.spaceKeyUpHandler();
      return;
    }
  }

  spaceKeyDownHandler(event) {
    if (isTypeableInput(document.activeElement)) {
      return;
    }
    this.canvasController.sceneView = this.cleanSceneView;
    this.canvasController.setNeedsUpdate();
    for (const overlay of document.querySelectorAll(".cleanable-overlay")) {
      overlay.classList.add("overlay-layer-hidden");
    }
  }

  spaceKeyUpHandler(event) {
    this.canvasController.sceneView = this.defaultSceneView;
    this.canvasController.setNeedsUpdate();
    for (const overlay of document.querySelectorAll(".cleanable-overlay")) {
      overlay.classList.remove("overlay-layer-hidden");
    }
  }

  contextMenuHandler(event) {
    event.preventDefault();
    const menuItems = [...this.basicContextMenuItems];
    if (this.sceneController.selectedGlyphIsEditing) {
      this.sceneController.updateContextMenuState(event);
      menuItems.push(MenuItemDivider);
      menuItems.push(...this.glyphEditContextMenuItems);
    }
    this.contextMenu = new ContextMenu("context-menu", menuItems);
  }

  dismissContextMenu(event) {
    if (!this.contextMenu || event.ctrlKey) {
      return;
    }
    if (event) {
      const el = this.contextMenu.element;
      if (event.target === el || event.target.offsetParent === el) {
        return;
      }
    }
    this.contextMenu.dismiss();
    delete this.contextMenu;
  }

  async newGlyph(glyphName, codePoint, templateInstance) {
    await this.fontController.newGlyph(glyphName, codePoint, templateInstance);
    this.sceneController.sceneModel.updateGlyphLinesCharacterMapping();
    await this.sceneController.sceneModel.updateScene();
    this.canvasController.setNeedsUpdate();
    this.buildGlyphNamesListContent();
    this.updateWindowLocationAndSelectionInfo();
  }

  async externalChange(change) {
    const selectedGlyphName = this.sceneController.sceneModel.getSelectedGlyphName();
    const editState = this.sceneController.sceneModel.getSelectedGlyphState();

    await this.fontController.applyChange(change, true);

    if (matchChangePath(change, ["glyphMap"])) {
      this.sceneController.sceneModel.updateGlyphLinesCharacterMapping();
      if (editState?.isEditing && !this.fontController.hasGlyph(selectedGlyphName)) {
        // The glyph being edited got deleted, change state merely "selected"
        this.sceneController.sceneModel.setSelectedGlyphState({
          ...editState,
          isEditing: false,
        });
      }
      this.buildGlyphNamesListContent();
    }
    await this.sceneController.sceneModel.updateScene();
    if (
      selectedGlyphName !== undefined &&
      matchChangePath(change, ["glyphs", selectedGlyphName])
    ) {
      this.updateSelectionInfo();
    }
    this.canvasController.setNeedsUpdate();
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
        console.log("reloading of non-glyph data is not yet implemented");
      }
    }
  }

  async reloadGlyphs(glyphNames) {
    if (glyphNames.includes(this.sceneController.getSelectedGlyphName())) {
      // If the glyph being edited is among the glyphs to be reloaded,
      // cancel the edit, but wait for the cancellation to be completed,
      // or else the reload and edit can get mixed up and the glyph data
      // will be out of sync.
      await this.sceneController.cancelEditing(
        "Someone else made an edit just before you."
      );
    }
    await this.fontController.reloadGlyphs(glyphNames);
    await this.sceneController.sceneModel.updateScene();
    const selectedGlyphName = this.sceneController.sceneModel.getSelectedGlyphName();
    if (selectedGlyphName !== undefined && glyphNames.includes(selectedGlyphName)) {
      this.updateSelectionInfo();
    }
    this.canvasController.setNeedsUpdate();
  }

  async messageFromServer(headline, message) {
    // don't await the dialog result, the server doesn't need an answer
    dialog(headline, message, [{ title: "Okay", isDefaultButton: true }]);
  }

  async setupFromWindowLocation() {
    const url = new URL(window.location);
    const viewInfo = {};
    for (const key of url.searchParams.keys()) {
      viewInfo[key] = JSON.parse(url.searchParams.get(key));
    }
    this.textAlignValueController.set(viewInfo["align"] || "center");
    if (viewInfo["viewBox"]) {
      this.autoViewBox = false;
      const viewBox = viewInfo["viewBox"];
      if (viewBox.every((value) => !isNaN(value))) {
        this.canvasController.setViewBox(rectFromArray(viewBox));
      }
    }
    this.textEntryElement.value = viewInfo["text"] || "";
    if (viewInfo["text"]) {
      await this.setGlyphLinesFromText(viewInfo["text"]);
    } else {
      // Doing this directly avoids triggering rebuilding the window location
      this.sceneController.setGlyphLines([]);
    }
    this.sceneController.selectedGlyph = viewInfo["selectedGlyph"];
    await this.sceneController.setGlobalAndLocalLocations(
      viewInfo["location"],
      viewInfo["localLocations"]
    );
    if (viewInfo["location"]) {
      this.sliders.values = viewInfo["location"];
    }
    this.sceneController.selectedGlyphIsEditing =
      viewInfo["editing"] && !!viewInfo["selectedGlyph"];
    this.sourcesList.setSelectedItemIndex(
      await this.sceneController.getSelectedSource()
    );
    if (viewInfo["selection"]) {
      this.sceneController.selection = new Set(viewInfo["selection"]);
    }
    this.canvasController.setNeedsUpdate();
  }

  _updateWindowLocation() {
    const viewInfo = {};
    const viewBox = this.canvasController.getViewBox();
    const url = new URL(window.location);
    let previousText = url.searchParams.get("text");
    if (previousText) {
      previousText = JSON.parse(previousText);
    }
    clearSearchParams(url.searchParams);

    if (Object.values(viewBox).every((value) => !isNaN(value))) {
      viewInfo["viewBox"] = rectToArray(viewBox).map(Math.round);
    }
    if (this.enteredText) {
      viewInfo["text"] = this.enteredText;
    }
    if (this.sceneController.selectedGlyph) {
      viewInfo["selectedGlyph"] = this.sceneController.selectedGlyph;
    }
    if (this.sceneController.selectedGlyphIsEditing) {
      viewInfo["editing"] = true;
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
    if (this.sceneController.sceneModel.textAlignment !== "center") {
      viewInfo["align"] = this.sceneController.sceneModel.textAlignment;
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

  updateWindowLocationAndSelectionInfo() {
    this.updateSelectionInfo();
    this.updateWindowLocation();
  }

  toggleSidebarSelectionInfo(onOff) {
    if (onOff) {
      this.updateSelectionInfo();
    }
  }

  toggleTextEntry(onOff) {
    if (onOff) {
      this.fixTextEntryHeight();
      this.textEntryElement.focus();
    }
  }

  async editListenerCallback(editMethodName, senderID, ...args) {
    if (senderID === this) {
      // The edit comes from the selection info box itself, so we shouldn't update it
      return;
    }
    if (editMethodName === "editIncremental" || editMethodName === "editFinal") {
      this.updateSelectionInfo();
    }
    if (editMethodName === "editFinal") {
      this.sceneController.updateHoverState();
    }
  }

  async _updateSelectionInfo() {
    if (!this.infoForm.container.offsetParent) {
      // If the info form is not visible, do nothing
      return;
    }
    const varGlyphController =
      await this.sceneController.sceneModel.getSelectedVariableGlyphController();
    const positionedGlyph =
      this.sceneController.sceneModel.getSelectedPositionedGlyph();
    const glyphController = positionedGlyph?.glyph;
    const instance = glyphController?.instance;
    const glyphName = glyphController?.name;
    let unicodes = this.fontController.glyphMap[glyphName] || [];
    if (positionedGlyph?.isUndefined && positionedGlyph.character && !unicodes.length) {
      // Glyph does not yet exist in the font, so varGlyphController is undefined,
      // But we can grab the unicode from positionedGlyph.character anyway.
      unicodes = [positionedGlyph.character.codePointAt(0)];
    }
    const unicodesStr = unicodes
      .map((code) => makeUPlusStringFromCodePoint(code))
      .join(" ");
    const canEdit = glyphController?.canEdit;

    const formContents = [];
    if (glyphName) {
      formContents.push({
        key: "glyphName",
        type: "text",
        label: "Glyph name",
        value: glyphName,
      });
      formContents.push({
        key: "unicodes",
        type: "text",
        label: "Unicode",
        value: unicodesStr,
      });
      formContents.push({
        type: "edit-number",
        key: '["xAdvance"]',
        label: "Advance width",
        value: instance.xAdvance,
        disabled: !canEdit,
      });
    }
    const { component: componentIndices } = parseSelection(
      this.sceneController.selection
    );

    for (const index of componentIndices || []) {
      const componentKey = (...path) => JSON.stringify(["components", index, ...path]);

      formContents.push({ type: "divider" });
      const component = instance.components[index];
      formContents.push({ type: "header", label: `Component #${index}` });
      formContents.push({
        type: "edit-text",
        key: componentKey("name"),
        label: "Base glyph",
        value: component.name,
      });
      formContents.push({ type: "header", label: "Transformation" });

      for (const key of [
        "translateX",
        "translateY",
        "rotation",
        "scaleX",
        "scaleY",
        "skewX",
        "skewY",
        "tCenterX",
        "tCenterY",
      ]) {
        const value = component.transformation[key];
        formContents.push({
          type: "edit-number",
          key: componentKey("transformation", key),
          label: key,
          value: value,
          disabled: !canEdit,
        });
      }
      const baseGlyph = await this.fontController.getGlyph(component.name);
      if (baseGlyph && component.location) {
        const locationItems = [];
        const axes = Object.fromEntries(
          baseGlyph.axes.map((axis) => [axis.name, axis])
        );
        // Add global axes, if in location and not in baseGlyph.axes
        // TODO: this needs more thinking, as the axes of *nested* components
        // may also be of interest. Also: we need to be able to *add* such a value
        // to component.location.
        for (const axis of this.fontController.globalAxes) {
          if (axis.name in component.location && !(axis.name in axes)) {
            axes[axis.name] = axis;
          }
        }
        for (const axis of Object.values(axes)) {
          let value = component.location[axis.name];
          if (value === undefined) {
            value = axis.defaultValue;
          }
          locationItems.push({
            type: "edit-number-slider",
            key: componentKey("location", axis.name),
            label: axis.name,
            value: value,
            minValue: axis.minValue,
            maxValue: axis.maxValue,
            disabled: !canEdit,
          });
        }
        if (locationItems.length) {
          formContents.push({ type: "header", label: "Location" });
          formContents.push(...locationItems);
        }
      }
    }
    if (!formContents.length) {
      this.infoForm.setFieldDescriptions([{ type: "text", value: "(No selection)" }]);
    } else {
      this.infoForm.setFieldDescriptions(formContents);
      await this._setupSelectionInfoHandlers(glyphName);
    }
  }

  async _setupSelectionInfoHandlers(glyphName) {
    this.infoForm.onFieldChange = async (fieldKey, value, valueStream) => {
      const changePath = JSON.parse(fieldKey);
      await this.sceneController.editInstance(
        async (sendIncrementalChange, instance) => {
          let changes;

          if (valueStream) {
            // Continuous changes (eg. slider drag)
            const orgValue = getNestedValue(instance, changePath);
            for await (const value of valueStream) {
              setNestedValue(instance, changePath, orgValue); // Ensure getting the correct undo change
              changes = recordChanges(instance, (instance) => {
                setNestedValue(instance, changePath, value);
              });
              await sendIncrementalChange(changes.change, true); // true: "may drop"
            }
          } else {
            // Simple, atomic change
            changes = recordChanges(instance, (instance) => {
              setNestedValue(instance, changePath, value);
            });
          }

          const plen = changePath.length;
          const undoLabel =
            plen == 1
              ? `${changePath[plen - 1]}`
              : `${changePath[plen - 2]}.${changePath[plen - 1]}`;
          return {
            changes: changes,
            undoLabel: undoLabel,
            broadcast: true,
          };
        },
        this
      );
    };
  }

  setAutoViewBox() {
    if (!this.autoViewBox) {
      return;
    }
    let bounds = this.sceneController.getSceneBounds();
    if (!bounds) {
      return;
    }
    bounds = rectAddMargin(bounds, 0.1);
    this.canvasController.setViewBox(bounds);
  }

  zoomIn() {
    this._zoom(1 / Math.sqrt(2));
  }

  zoomOut() {
    this._zoom(Math.sqrt(2));
  }

  _zoom(factor) {
    let viewBox = this.canvasController.getViewBox();
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
  }

  animateToViewBox(viewBox) {
    const startViewBox = this.canvasController.getViewBox();
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
        this.canvasController.setViewBox(animatingViewBox);
        requestAnimationFrame(animate);
      } else {
        this.canvasController.setViewBox(viewBox);
        this.updateWindowLocation();
      }
    };
    requestAnimationFrame(animate);
  }
}

function rectAddMargin(rect, relativeMargin) {
  const size = rectSize(rect);
  const inset =
    size.width > size.height
      ? size.width * relativeMargin
      : size.height * relativeMargin;
  return insetRect(rect, -inset, -inset);
}

function rectScaleAroundCenter(rect, scaleFactor, center) {
  rect = offsetRect(rect, -center.x, -center.y);
  rect = scaleRect(rect, scaleFactor);
  rect = offsetRect(rect, center.x, center.y);
  return rect;
}

function getCharFromUnicode(codePoint) {
  return codePoint !== undefined ? String.fromCodePoint(codePoint) : "";
}

function glyphItemSortFunc(item1, item2) {
  const uniCmp = compare(item1.unicodes[0], item2.unicodes[0]);
  const glyphNameCmp = compare(item1.glyphName, item2.glyphName);
  return uniCmp ? uniCmp : glyphNameCmp;
}

function glyphFilterFunc(item, searchItems) {
  if (!searchItems.length) {
    return true;
  }
  for (const searchString of searchItems) {
    if (item.glyphName.indexOf(searchString) >= 0) {
      return true;
    }
    if (item.unicodes[0] !== undefined) {
      const char = String.fromCodePoint(item.unicodes[0]);
      if (searchString === char) {
        return true;
      }
    }
  }
  return false;
}

// utils, should perhaps move to utils.js

function compare(a, b) {
  // sort undefined at the end
  if (a === b) {
    return 0;
  } else if (a === undefined) {
    return 1;
  } else if (b === undefined) {
    return -1;
  } else if (a < b) {
    return -1;
  } else {
    return 1;
  }
}

async function glyphLinesFromText(
  text,
  characterMap,
  glyphMap,
  getSuggestedGlyphNameFunc,
  getUnicodeFromGlyphNameFunc
) {
  const glyphLines = [];
  for (const line of text.split(/\r?\n/)) {
    glyphLines.push(
      await glyphNamesFromText(
        line,
        characterMap,
        glyphMap,
        getSuggestedGlyphNameFunc,
        getUnicodeFromGlyphNameFunc
      )
    );
  }
  return glyphLines;
}

const glyphNameRE = /[//\s]/g;

async function glyphNamesFromText(
  text,
  characterMap,
  glyphMap,
  getSuggestedGlyphNameFunc,
  getUnicodeFromGlyphNameFunc
) {
  const glyphNames = [];
  for (let i = 0; i < text.length; i++) {
    let glyphName;
    let char = text[i];
    if (char == "/") {
      i++;
      if (text[i] == "/") {
        glyphName = characterMap[char.charCodeAt(0)];
      } else {
        glyphNameRE.lastIndex = i;
        glyphNameRE.test(text);
        let j = glyphNameRE.lastIndex;
        if (j == 0) {
          glyphName = text.slice(i);
          i = text.length - 1;
        } else {
          j--;
          glyphName = text.slice(i, j);
          if (text[j] == "/") {
            i = j - 1;
          } else {
            i = j;
          }
        }
        char = undefined;
        for (const codePoint of glyphMap[glyphName] || []) {
          if (characterMap[codePoint] === glyphName) {
            char = String.fromCodePoint(codePoint);
            break;
          }
        }
        if (!char && !glyphMap[glyphName]) {
          // Glyph doesn't exist in the font, try to find a unicode value
          const codePoint = await getUnicodeFromGlyphNameFunc(glyphName);
          if (codePoint) {
            char = String.fromCodePoint(codePoint);
          }
        }
      }
    } else {
      const charCode = text.codePointAt(i);
      glyphName = characterMap[charCode];
      if (charCode >= 0x10000) {
        i++;
      }
      char = String.fromCodePoint(charCode);
    }
    if (glyphName !== "") {
      let isUndefined = false;
      if (!glyphName && char) {
        glyphName = await getSuggestedGlyphNameFunc(char.codePointAt(0));
        isUndefined = true;
      }
      glyphNames.push({
        character: char,
        glyphName: glyphName,
        isUndefined: isUndefined,
      });
    }
  }
  return glyphNames;
}

function textFromGlyphLines(glyphLines) {
  const textLines = [];
  for (const glyphLine of glyphLines) {
    let textLine = "";
    for (let i = 0; i < glyphLine.length; i++) {
      const glyphInfo = glyphLine[i];
      if (glyphInfo.character) {
        textLine += glyphInfo.character;
      } else {
        textLine += "/" + glyphInfo.glyphName;
        if (glyphLine[i + 1]?.character) {
          textLine += " ";
        }
      }
    }
    textLines.push(textLine);
  }
  return textLines.join("\n");
}

function clearSearchParams(searchParams) {
  for (const key of Array.from(searchParams.keys())) {
    searchParams.delete(key);
  }
}

function getNestedValue(subject, path) {
  for (const pathElement of path) {
    subject = subject[pathElement];
    if (subject === undefined) {
      throw new Error(`assert -- invalid change path: ${path}`);
    }
  }
  return subject;
}

function setNestedValue(subject, path, value) {
  const key = path.slice(-1)[0];
  path = path.slice(0, -1);
  subject = getNestedValue(subject, path);
  subject[key] = value;
}

function isTypeableInput(element) {
  if (element.contentEditable === "true") {
    return true;
  }
  if (element.tagName.toLowerCase() === "textarea") {
    return true;
  }
  if (element.tagName.toLowerCase() === "input" && element.type !== "range") {
    return true;
  }
  return false;
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
