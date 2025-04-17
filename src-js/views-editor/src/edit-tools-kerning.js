import * as html from "@fontra/core/html-utils.js";
import { assert, round } from "@fontra/core/utils.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { equalGlyphSelection } from "./scene-controller.js";

export class KerningTool extends BaseTool {
  iconPath = "/images/kerning.svg";
  identifier = "kerning-tool";

  constructor(editor) {
    super(editor);
    this.handleContainer = document.querySelector("#metric-handle-container");
    assert(this.handleContainer);
    this.kerningHandles = new Map();

    this.sceneSettingsController.addKeyListener("viewBox", (event) => {
      if (this.hoveredKerningHandle) {
        this._updateHandle(this.hoveredKerningHandle, this.hoveredKerning);
      }
    });
  }

  handleHover(event) {
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(event);
    const size = sceneController.mouseClickMargin;

    const hoveredKerning = this.sceneModel.kerningAtPoint(point, size);
    if (!equalGlyphSelection(this.hoveredKerning, hoveredKerning)) {
      this.hoveredKerning = hoveredKerning;

      if (this.hoveredKerningHandle) {
        this.hoveredKerningHandle.remove();
        delete this.hoveredKerningHandle;
      }

      if (hoveredKerning) {
        this.hoveredKerningHandle = new KerningHandle(this.handleContainer);
        this._updateHandle(this.hoveredKerningHandle, hoveredKerning);
      }
      this.setCursor();
    }
  }

  _updateHandle(kerningHandle, kerningSelector) {
    if (!kerningSelector) {
      kerningHandle.remove();
      return;
    }

    const { lineIndex, glyphIndex } = kerningSelector;
    const positionedGlyph =
      this.sceneModel.positionedLines[lineIndex].glyphs[glyphIndex];
    kerningHandle.update(positionedGlyph, this.canvasController);
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.hoveredKerning) {
      return;
    }

    if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
      return;
    }

    // do drag
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = this.hoveredKerning ? "pointer" : null;
  }

  activate() {
    this.sceneSettings.selectedGlyph = null;
    this.sceneController.hoveredGlyph = null;
    this.setCursor();
  }

  deactivate() {
    delete this.hoveredKerning;
    this.hoveredKerningHandle?.remove();
    delete this.hoveredKerningHandle;
  }
}

class KerningHandle {
  constructor(container) {
    this.handleElement = html.div({ class: "kerning-handle" });
    container.appendChild(this.handleElement);
  }

  update(positionedGlyph, canvasController) {
    let { x, y } = canvasController.canvasPoint({
      x: positionedGlyph.x - positionedGlyph.kernValue / 2,
      y: positionedGlyph.y,
    });
    this.handleElement.style.left = `${x}px`;
    this.handleElement.style.top = `${y}px`;

    this.handleElement.classList.toggle("positive", positionedGlyph.kernValue > 0);
    this.handleElement.classList.toggle("negative", positionedGlyph.kernValue < 0);

    this.handleElement.innerText = formatKerningValue(positionedGlyph.kernValue);
  }

  remove() {
    this.handleElement.remove();
    delete this.handleElement;
  }
}

function formatKerningValue(n) {
  if (n === null) {
    return "–";
  }
  n = round(n, 1);
  return n == undefined ? "\u00A0" : n.toString();
}
