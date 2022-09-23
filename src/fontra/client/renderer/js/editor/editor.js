import { CanvasController } from "../core/canvas-controller.js";
import { matchChange } from "../core/changes.js";
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
import { SceneView } from "../core/scene-view.js"
import { Form } from "../core/ui-form.js";
import { List } from "../core/ui-list.js";
import { Sliders } from "../core/ui-sliders.js";
import { addItemwise, subItemwise, mulScalar } from "../core/var-funcs.js"
import {
  THEME_KEY,
  autoReload,
  hasShortcutModifierKey,
  hyphenatedToCamelCase,
  scheduleCalls,
  themeSwitchFromLocalStorage,
  throttleCalls,
} from "../core/utils.js";
import { SceneController } from "./scene-controller.js"
import * as sceneDraw from "./scene-draw-funcs.js";
import { SceneModel } from "./scene-model.js";


const drawingParametersLight = {
  glyphFillColor: "#000",
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
  hoveredEmptyGlyphColor: "#E8E8E8",  // Must be six hex digits
  selectedEmptyGlyphColor: "#D8D8D8",  // Must be six hex digits
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
}


const drawingParametersDark = {
  ...drawingParametersLight,
  glyphFillColor: "#FFF",
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
  hoveredEmptyGlyphColor: "#484848",
  selectedEmptyGlyphColor: "#585858",
}


export class EditorController {

  static async fromWebSocket() {
    if (autoReload()) {
      // Will reload
      return;
    }
    const pathItems = window.location.pathname.split("/");
    // assert pathItems[0] === ""
    // assert pathItems[1] === "editor"
    // assert pathItems[2] === "-"
    const projectPath = pathItems.slice(3).join("/");
    document.title = `Fontra — ${projectPath}`;
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
    this.fontController.addEditListener(async (...args) => await this.editListenerCallback(...args));
    this.autoViewBox = true;
    const canvas = document.querySelector("#edit-canvas");
    canvas.focus()

    const canvasController = new CanvasController(canvas, this.drawingParameters);
    this.canvasController = canvasController;
    // We need to do isPointInPath without having a context, we'll pass a bound method
    const isPointInPath = canvasController.context.isPointInPath.bind(canvasController.context);

    const sceneModel = new SceneModel(this.fontController, isPointInPath);
    const drawFuncs = this.getDrawingFunctions();
    const sceneView = new SceneView();
    sceneView.subviews = drawFuncs.map(
      drawFunc => new SceneView(sceneModel, drawFunc)
    );
    canvasController.sceneView = sceneView;

    this.defaultSceneView = sceneView;
    this.cleanSceneView = new SceneView(sceneModel, sceneDraw.drawMultiGlyphsLayerClean);

    this.sceneController = new SceneController(sceneModel, canvasController)
    // TODO move event stuff out of here
    this.sceneController.addEventListener("selectedGlyphChanged", async event => {
      await this.updateSlidersAndSources();
      this.sourcesList.setSelectedItemIndex(await this.sceneController.getSelectedSource());
    });
    this.sceneController.addEventListener("selectedGlyphIsEditingChanged", async event => {
      // console.log("selectedGlyphIsEditingChanged");
    });
    this.sceneController.addEventListener("doubleClickedComponents", async event => {
      this.doubleClickedComponentsCallback(event)
    });

    this.initOverlayItems(canvas);
    this.initMiniConsole();
    this.infoForm = new Form("selection-info");

    window.matchMedia("(prefers-color-scheme: dark)").addListener(event => this.themeChanged(event));
    window.addEventListener("storage", event => {
      if (event.key === THEME_KEY) {
        this.themeChanged(event);
      }
    });

    window.addEventListener("keydown", event => this.keyDownHandler(event));
    window.addEventListener("keyup", event => this.keyUpHandler(event));

    this.enteredText = "";
    this.updateWindowLocation = scheduleCalls(event => this._updateWindowLocation(), 200);
    this.updateSelectionInfo = throttleCalls(async event => await this._updateSelectionInfo(), 100);
    canvas.addEventListener("viewBoxChanged", event => {
      if (event.detail === "canvas-size") {
        this.setAutoViewBox();
      } else {
        this.autoViewBox = false;
      }
      this.updateWindowLocation();
    });
    this.sceneController.addEventListener("selectedGlyphChanged", () => this.updateWindowLocationAndSelectionInfo());
    this.sceneController.addEventListener("selectionChanged", () => this.updateWindowLocationAndSelectionInfo());

    window.addEventListener('popstate', event => {
      this.setupFromWindowLocation();
    });
  }

  getDrawingFunctions() {
    return [
      sceneDraw.drawSelectedEmptyGlyphLayer,
      sceneDraw.drawHoveredEmptyGlyphLayer,
      sceneDraw.drawMultiGlyphsLayer,
      sceneDraw.drawCJKDesignFrameLayer,
      // sceneDraw.drawSelectedBaselineLayer,
      sceneDraw.drawSidebearingsLayer,
      sceneDraw.drawGhostPathLayer,
      sceneDraw.drawPathFillLayer,
      sceneDraw.drawSelectedGlyphLayer,
      sceneDraw.drawHoveredGlyphLayer,
      sceneDraw.drawComponentSelectionLayer,
      sceneDraw.drawStartPointsLayer,
      sceneDraw.drawHandlesLayer,
      sceneDraw.drawNodesLayer,
      sceneDraw.drawPathSelectionLayer,
      sceneDraw.drawPathStrokeLayer,
      sceneDraw.drawRectangleSelectionLayer,
    ]
  }

  async start() {
    await loaderSpinner(this._start());
  }

  async _start() {
    await this.fontController.initialize();
    await this.initGlyphNames();
    await this.initSliders();
    this.initTools();
    this.initSourcesList();
    await this.setupFromWindowLocation();
  }

  async initGlyphNames() {
    const columnDescriptions = [
      {"key": "char", "width": "2em", "get": item => getCharFromUnicode(item.unicodes[0])},
      {"key": "glyphName", "width": "10em", },
      {"key": "unicode", "width": "5em", "get": item => getUniStringFromUnicode(item.unicodes[0])},
    ];
    this.glyphNamesList = new List("glyphs-list", columnDescriptions);
    this.glyphNamesList.addEventListener("listSelectionChanged", async event => {
      const list = event.detail;
      const item = list.items[list.selectedItemIndex];
      await this.glyphNameChangedCallback(item.glyphName);
    });
    const reverseCmap = this.fontController.reverseCmap;
    this.glyphsListItems = [];
    for (const glyphName in reverseCmap) {
      this.glyphsListItems.push({"glyphName": glyphName, "unicodes": reverseCmap[glyphName]});
    }
    this.glyphsListItems.sort(glyphItemSortFunc);
    this.glyphNamesList.setItems(this.glyphsListItems);
  }

  async initSliders() {
    this.sliders = new Sliders("axis-sliders", await this.sceneController.getAxisInfo());
    this.sliders.addEventListener("slidersChanged", scheduleCalls(async event => {
      await this.sceneController.setLocation(event.detail.values);
      this.sourcesList.setSelectedItemIndex(await this.sceneController.getSelectedSource());
      this.updateWindowLocationAndSelectionInfo();
    }));
  }

  initTools() {
    const editTools = document.querySelector("#edit-tools");
    for (const editToolItem of editTools.children) {
      const toolElement = editToolItem.firstChild;
      const toolIdentifier = toolElement.id;
      toolElement.onclick = () => {
        this.setSelectedTool(toolElement.id);
      }
    }

    const zoomTools = document.querySelector("#zoom-tools");
    for (const zoomToolItem of zoomTools.children) {
      const zoomElement = zoomToolItem.firstChild;
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
      {"key": "sourceName", "width": "14em"},
      // {"key": "sourceIndex", "width": "2em"},
    ];
    this.sourcesList = new List("sources-list", columnDescriptions);
    this.sourcesList.addEventListener("listSelectionChanged", async event => {
      await this.sceneController.setSelectedSource(event.detail.getSelectedItem().sourceIndex);
      this.sliders.values = this.sceneController.getLocation();
      this.updateWindowLocationAndSelectionInfo();
    });
  }

  initOverlayItems(canvas) {
    // The following execCommand seems to make empty lines behave a bit better
    document.execCommand("defaultParagraphSeparator", false, "br");

    const overlayItems = Array.from(document.querySelectorAll(".overlay-item"));
    this.textEntryElement = document.querySelector("#text-entry-textarea");

    const collapseAll = () => {
      for (const item of overlayItems) {
        item.classList.remove("overlay-item-expanded");
        this._callToggleOverlayItem(item.id, false);
      }
      this.canvasController.canvas.focus();
    }

    const collapseOnEscapeKey = event => {
      if (event.key === "Escape") {
        collapseAll();
      }
    }

    this.textEntryElement.addEventListener("input", () => {
      this.textFieldChangedCallback(this.textEntryElement);
      this.fixTextEntryHeight();
    }, false);

    for (const item of overlayItems) {
      item.onkeydown = event => collapseOnEscapeKey(event);
      const overlayClick = overlayItem => {
        if (overlayItems.indexOf(overlayItem) == -1) {
          return;
        }
        for (const item of overlayItems) {
          if (item.classList.contains("overlay-item-expanded") !== (item === overlayItem)) {
            const v = item.classList.toggle("overlay-item-expanded", item === overlayItem);
            if (item === overlayItem && item.id === "text-entry-overlay") {
              this.textEntryElement.focus();
            }
            this._callToggleOverlayItem(item.id, item === overlayItem);
          }
        }
      };
      item.onclick = event => overlayClick(item);
      for (const child of item.children) {
        if (child.className === "overlay-item-fontra-icon") {
          child.onclick = event => overlayClick(item);
        }
      }
    }

    canvas.addEventListener("mousedown", event => {
      const point = this.sceneController.localPoint(event);
      const sel = this.sceneController.sceneModel.glyphAtPoint(point, false);
      if (!sel) {
        collapseAll();
      }
    });
    window.addEventListener("keydown", event => collapseOnEscapeKey(event));
  }

  fixTextEntryHeight() {
    this.textEntryElement.style.height = "auto";
    this.textEntryElement.style.height = this.textEntryElement.scrollHeight + "px";
  }

  _callToggleOverlayItem(itemId, onOff) {
    const methodName = hyphenatedToCamelCase("toggle-" + itemId);
    this[methodName]?.call(this, onOff);
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
      this.miniConsole.innerText = args.map(
        item => {
          try {
            return typeof item == "string" ? item : JSON.stringify(item);
          } catch(error) {
            return item;
          }
        }
      ).join(" ");
      this.miniConsole.style.display = "inherit";
      clearMiniConsole();
    }
  }

  setSelectedTool(toolIdentifier) {
    const editTools = document.querySelector("#edit-tools");
    for (const editToolItem of editTools.children) {
      editToolItem.classList.toggle("selected", editToolItem.firstChild.id === toolIdentifier);
    }
    this.sceneController.setSelectedTool(toolIdentifier);
  }

  themeChanged(event) {
    this.canvasController.setDrawingParameters(this.drawingParameters);
  }

  get isThemeDark() {
    const themeValue = localStorage.getItem(THEME_KEY);
    if (themeValue === "automatic") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } else {
      return themeValue === "dark";
    }
  }

  get drawingParametersLight() {
    return drawingParametersLight;
  }

  get drawingParametersDark() {
    return drawingParametersDark;
  }

  get drawingParameters() {
    return this.isThemeDark ? this.drawingParametersDark : this.drawingParametersLight;
  }

  async glyphSearchFieldChanged(value) {
    const searchItems = value.split(/\s+/).filter(item => item.length);
    const filteredGlyphItems = this.glyphsListItems.filter(item => glyphFilterFunc(item, searchItems));
    const selectedItem = this.glyphNamesList.getSelectedItem();
    this.glyphNamesList.setItems(filteredGlyphItems);
    this.glyphNamesList.setSelectedItem(selectedItem);
  }

  async glyphNameChangedCallback(glyphName) {
    const codePoint = this.fontController.codePointForGlyph(glyphName);
    const glyphInfo = {"glyphName": glyphName};
    if (codePoint !== undefined) {
      glyphInfo["character"] = getCharFromUnicode(codePoint);
    }
    const selectedGlyphState = this.sceneController.getSelectedGlyphState();
    const glyphLines = this.sceneController.getGlyphLines();
    if (selectedGlyphState) {
      glyphLines[selectedGlyphState.lineIndex][selectedGlyphState.glyphIndex] = glyphInfo;
      await this.setGlyphLines(glyphLines);
      this.sceneController.setSelectedGlyphState(selectedGlyphState);
    } else {
      if (!glyphLines.length) {
        glyphLines.push([]);
      }
      const lineIndex = glyphLines.length - 1;
      glyphLines[lineIndex].push(glyphInfo);
      await this.setGlyphLines(glyphLines);
      this.sceneController.setSelectedGlyphState(
        {"lineIndex": lineIndex, "glyphIndex": glyphLines[lineIndex].length - 1, "isEditing": false}
      );
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
    const glyphLines = glyphLinesFromText(
      this.enteredText,
      this.fontController.cmap,
      this.fontController.reverseCmap,
    );
    await this.setGlyphLines(glyphLines);
    await this.updateSlidersAndSources();
    this.setAutoViewBox();
  }

  async updateSlidersAndSources() {
    const axisInfo = await this.sceneController.getAxisInfo();
    const numGlobalAxes = this.fontController.globalAxes.length;
    if (numGlobalAxes && axisInfo.length != numGlobalAxes) {
      axisInfo.splice(numGlobalAxes, 0, {"isDivider": true});
    }
    this.sliders.setSliderDescriptions(axisInfo);
    this.sliders.values = this.sceneController.getLocation();
    this.sourcesList.setItems(await this.sceneController.getSourcesInfo());
    this.updateWindowLocationAndSelectionInfo();
  }

  async doubleClickedComponentsCallback(event) {
    const glyphController = this.sceneController.sceneModel.getSelectedStaticGlyphController();
    const instance = glyphController.instance;
    const localLocations = {};
    const glyphInfos = [];

    for (const componentIndex of this.sceneController.doubleClickedComponentIndices) {
      const glyphName = instance.components[componentIndex].name;
      const location = instance.components[componentIndex].location;
      if (location) {
        localLocations[glyphName] = location;
      }
      const glyphInfo = {"glyphName": glyphName};
      const codePoint = this.fontController.codePointForGlyph(glyphName);
      if (codePoint !== undefined) {
        glyphInfo["character"] = getCharFromUnicode(codePoint);
      }
      glyphInfos.push(glyphInfo);
    }
    this.sceneController.updateLocalLocations(localLocations);
    const selectedGlyphInfo = this.sceneController.getSelectedGlyphState();
    const glyphLines = this.sceneController.getGlyphLines();
    glyphLines[selectedGlyphInfo.lineIndex].splice(selectedGlyphInfo.glyphIndex + 1, 0, ...glyphInfos);
    await this.setGlyphLines(glyphLines);
    this.sceneController.selectedGlyph = `${selectedGlyphInfo.lineIndex}/${selectedGlyphInfo.glyphIndex + 1}`;
    this.updateTextEntryFromGlyphLines();
    await this.updateSlidersAndSources();
    this.setAutoViewBox();
  };

  async keyDownHandler(event) {
    if (event.key === " " && !event.repeat) {
      this.spaceKeyDownHandler();
      return;
    }
    if (hasShortcutModifierKey(event)) {
      // console.log("shortcut?", event.key);
      let didHandleShortcut = false;
      switch (event.key) {
        case "-":
          this.zoomOut();
          didHandleShortcut = true;
          break;
        case "+":
        case "=":
          this.zoomIn();
          didHandleShortcut = true;
          break;
        case "0":
          this.zoomFit();
          didHandleShortcut = true;
          break;
        case "z":
          const isRedo = event.shiftKey;
          const undoInfo = this.sceneController.getUndoRedoInfo(isRedo);
          if (undoInfo && !isTypeableInput(document.activeElement)) {
            // with the await below, we must immediately stop propagation, or
            // the undo shortcut will still reach text elements
            event.preventDefault();
            event.stopImmediatePropagation();
            await this.sceneController.doUndoRedo(isRedo);
            didHandleShortcut = true;
            // Hmmm would be nice if the following was done automatically
            await this.updateSlidersAndSources();
            this.sourcesList.setSelectedItemIndex(await this.sceneController.getSelectedSource());
          }
          break;
        default:
          // console.log("unhandled", event);
          break;
      }
      if (didHandleShortcut) {
        event.preventDefault();
      }
    }
  }

  keyUpHandler(event) {
    if (event.key === " ") {
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
    const overlay = document.querySelector("#overlay-layer");
    overlay.classList.add("overlay-layer-hidden");
  }

  spaceKeyUpHandler(event) {
    this.canvasController.sceneView = this.defaultSceneView;
    this.canvasController.setNeedsUpdate();
    const overlay = document.querySelector("#overlay-layer");
    overlay.classList.remove("overlay-layer-hidden");
  }

  async externalChange(change) {
    await this.fontController.applyChange(change, true);
    await this.sceneController.sceneModel.updateScene();
    const selectedGlyphName = this.sceneController.sceneModel.getSelectedGlyphName();
    if (selectedGlyphName !== undefined && matchChange(change, ["glyphs", selectedGlyphName])) {
      this.updateSelectionInfo();
    }
    this.canvasController.setNeedsUpdate();
  }

  async reloadGlyphs(glyphNames) {
    await this.fontController.reloadGlyphs(glyphNames);
    await this.sceneController.sceneModel.updateScene();
    const selectedGlyphName = this.sceneController.sceneModel.getSelectedGlyphName();
    if (selectedGlyphName !== undefined && glyphNames.includes(selectedGlyphName)) {
      this.updateSelectionInfo();
    }
    this.canvasController.setNeedsUpdate();
  }

  async setupFromWindowLocation() {
    const url = new URL(window.location);
    const viewInfo = {};
    for (const key of url.searchParams.keys()) {
      viewInfo[key] = JSON.parse(url.searchParams.get(key));
    }
    if (viewInfo["viewBox"]) {
      this.autoViewBox = false;
      this.canvasController.setViewBox(rectFromArray(viewInfo["viewBox"]));
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
      viewInfo["location"], viewInfo["localLocations"],
    );
    if (viewInfo["location"]) {
      this.sliders.values = viewInfo["location"];
    }
    this.sceneController.selectedGlyphIsEditing = viewInfo["editing"] && !!viewInfo["selectedGlyph"];
    this.sourcesList.setSelectedItemIndex(await this.sceneController.getSelectedSource());
    if (viewInfo["selection"]) {
      this.sceneController.selection = new Set(viewInfo["selection"]);
    }
    this.canvasController.setNeedsUpdate()
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

    viewInfo["viewBox"] = rectToArray(viewBox).map(Math.round);
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
    const localLocations = this.sceneController.getLocalLocations(true)
    if (Object.keys(localLocations).length) {
      viewInfo["localLocations"] = localLocations;
    }
    const selArray = Array.from(this.sceneController.selection);
    if (selArray.length) {
      viewInfo["selection"] = Array.from(selArray);
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

  toggleSelectionInfoOverlay(onOff) {
    if (onOff) {
      this.updateSelectionInfo();
    }
  }

  toggleTextEntryOverlay(onOff) {
    if (onOff) {
      this.fixTextEntryHeight();
    }
  }

  async editListenerCallback(editMethodName, senderID, ...args) {
    if (senderID === this) {
      // The edit comes from the selection info box itself, so we shouldn't update it
      return;
    }
    if (editMethodName === "editDo" || editMethodName === "editAtomic") {
      this.updateSelectionInfo();
    }
  }

  async _updateSelectionInfo() {
    if (!this.infoForm.container.offsetParent) {
      // If the info form is not visible, do nothing
      return;
    }
    const glyphController = this.sceneController.sceneModel.getSelectedStaticGlyphController();
    const instance = glyphController?.instance;
    const glyphName = glyphController?.name;
    const canEdit = glyphController?.canEdit;

    const formContents = [];
    if (glyphName) {
      formContents.push({"key": "glyphName", "type": "text", "label": "Glyph name", "value": glyphName});
      formContents.push({
        "type": "edit-number",
        "key": "[\"xAdvance\"]",
        "label": "Advance width",
        "value": instance.xAdvance,
        "disabled": !canEdit,
      });
    }
    const selection = Array.from(this.sceneController.selection || []);
    selection.sort(selectionCompare);

    for (const selItem of selection) {
      let [tp, index] = selItem.split("/");

      const componentKey = (...path) => JSON.stringify(["components", index, ...path]);

      if (tp === "component") {
        index = parseInt(index);
        formContents.push({"type": "divider"});
        const component = instance.components[index];
        formContents.push({"type": "header", "label": `Component #${index}`});
        formContents.push({
          "type": "edit-text",
          "key": componentKey("name"),
          "label": "Base glyph",
          "value": component.name,
        });
        formContents.push({"type": "header", "label": "Transformation"});

        for (const key of ["x", "y", "rotation", "scalex", "scaley", "tcenterx", "tcentery"]) {
          const value = component.transformation[key];
          formContents.push({
            "type": "edit-number",
            "key": componentKey("transformation", key),
            "label": key,
            "value": value,
            "disabled": !canEdit,
          });
        }
        const baseGlyph = await this.fontController.getGlyph(component.name);
        if (baseGlyph?.axes && baseGlyph.axes.length && component.location) {
          formContents.push({"type": "header", "label": "Location"});
          for (const axis of baseGlyph.axes) {
            let value = component.location[axis.name];
            if (value === undefined) {
              value = axis.defaultValue;
            }
            formContents.push({
              "type": "edit-number-slider",
              "key": componentKey("location", axis.name),
              "label": axis.name,
              "value": value,
              "minValue": axis.minValue,
              "maxValue": axis.maxValue,
              "disabled": !canEdit,
            });
          }
        }
      }
    }
    if (!formContents.length) {
      this.infoForm.setFieldDescriptions([{"type": "text", "value": "(No selection)"}]);
    } else {
      this.infoForm.setFieldDescriptions(formContents);
      await this._setupSelectionInfoHandlers(glyphName);
    }
  }

  async _setupSelectionInfoHandlers(glyphName) {
    let editContext;
    let keyString;
    let localChangePath;
    let change;
    let rollbackChange;

    const setup = async info => {
      keyString = info.key;
      localChangePath = JSON.parse(keyString);
      const plen = localChangePath.length;
      const undoLabelField = plen == 1 ? `${localChangePath[plen - 1]}` : `${localChangePath[plen - 2]}.${localChangePath[plen - 1]}`;
      const undoInfo = {
        "label": `edit ${undoLabelField}`,
        "selection": this.sceneController.selection,
        "location": this.sceneController.getLocation(),
      }
      editContext = await this.sceneController.getGlyphEditContext(this, undoInfo);
      if (!editContext) {
        console.log(`can't edit glyph '${glyphController.name}': location is not a source`);
        return false;
      }
      rollbackChange = makeFieldChange(localChangePath, getNestedValue(editContext.instance, localChangePath));
      return true;
    };

    const breakdown = () => {
      editContext = undefined;
      keyString = undefined;
      localChangePath = undefined;
      change = undefined;
      rollbackChange = undefined;
    };

    this.infoForm.onBeginChange = async info => {
      if (!(await setup(info))) {
        return;
      }
      await editContext.editBegin();
      await editContext.editSetRollback(rollbackChange);
    };

    this.infoForm.onDoChange = async info => {
      let isAtomicEdit = (editContext === undefined);
      if (isAtomicEdit) {
        if (!(await setup(info))) {
          return;
        }
        change = makeFieldChange(localChangePath, info.value);
        await editContext.editAtomic(change, rollbackChange);
        breakdown();
      } else {
        if (keyString !== info.key) {
          throw new Error(`assert -- non-matching key ${keyString} vs. ${info.key}`);
        }
        change = makeFieldChange(localChangePath, info.value);
        await editContext.editDo(change);
      }
    };

    this.infoForm.onEndChange = async info => {
      if (!editContext) {
        return;
      }
      if (keyString !== info.key) {
        throw new Error(`assert -- non-matching key ${keyString} vs. ${info.key}`);
      }
      await editContext.editEnd(change);
      breakdown();
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

    const animate = timestamp => {
      if (start === undefined) {
        start = timestamp;
      }
      let t = (timestamp - start) / duration;
      if (t > 1.0) {
        t = 1.0;
      }
      const animatingViewBox = addItemwise(startViewBox, mulScalar(deltaViewBox, easeOutQuad(t)));
      if (t < 1.0) {
        this.canvasController.setViewBox(animatingViewBox);
        requestAnimationFrame(animate);
      } else {
        this.canvasController.setViewBox(viewBox);
        this.updateWindowLocation();
      }
    }
    requestAnimationFrame(animate);
  }

}


function rectAddMargin(rect, relativeMargin) {
  const size = rectSize(rect);
  const inset = size.width > size.height ? size.width * relativeMargin : size.height * relativeMargin;
  return insetRect(rect, -inset, -inset);
}


function rectScaleAroundCenter(rect, scaleFactor, center) {
  rect = offsetRect(rect, -center.x, -center.y);
  rect = scaleRect(rect, scaleFactor);
  rect = offsetRect(rect, center.x, center.y);
  return rect;
}


function getCharFromUnicode(codePoint) {
  return codePoint !== undefined ? String.fromCodePoint(codePoint) : ""

}


function getUniStringFromUnicode(codePoint) {
  return codePoint !== undefined ? "U+" + codePoint.toString(16).toUpperCase().padStart(4, "0") : ""
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


function glyphLinesFromText(text, cmap, reverseCmap) {
  const glyphLines = [];
  for (const line of text.split(/\r?\n/)) {
    glyphLines.push(glyphNamesFromText(line, cmap, reverseCmap));
  }
  return glyphLines;
}


const glyphNameRE = /[//\s]/g;

function glyphNamesFromText(text, cmap, reverseCmap) {
  const glyphNames = [];
  for (let i = 0; i < text.length; i++) {
    let glyphName;
    let char = text[i];
    if (char == "/") {
      i++;
      if (text[i] == "/") {
        glyphName = cmap[char.charCodeAt(0)];
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
        for (const codePoint of reverseCmap[glyphName] || []) {
          if (cmap[codePoint] === glyphName) {
            char = String.fromCodePoint(codePoint);
            break;
          }
        }
      }
    } else {
      const charCode = text.codePointAt(i);
      glyphName = cmap[charCode];
      if (charCode >= 0x10000) {
        i++;
      }
      char = String.fromCodePoint(charCode);
    }
    if (glyphName !== "") {
      glyphNames.push({character: char, glyphName: glyphName});
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


function makeFieldChange(path, value) {
  const key = path.slice(-1)[0];
  path = path.slice(0, -1);
  return {
    "p": path,
    "f": "=",
    "k": key,
    "v": value,
  };
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


function selectionCompare(a, b) {
  const [a0, a1] = a.split("/");
  const [b0, b1] = b.split("/");
  if (a0 === b0) {
    return parseInt(a1) - parseInt(b1);
  } else if (a0 < b0) {
    return -1;
  } else {
    return 1;
  }
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
