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

    this.sceneSettingsController.addKeyListener(
      ["viewBox", "positionedLines"],
      (event) => {
        this.handles.forEach((handle) => {
          this._updateHandle(handle);
        });
      }
    );
  }

  handleHover(event) {
    const sceneController = this.sceneController;
    const point = sceneController.localPoint(event);
    const size = sceneController.mouseClickMargin;

    const hoveredKerning = this.sceneModel.kerningAtPoint(point, size);
    if (!equalGlyphSelection(this.hoveredKerning, hoveredKerning)) {
      this.hoveredKerning = hoveredKerning;

      const hoveredHandleId = hoveredKerning ? selectorToString(hoveredKerning) : null;

      this.handles.forEach((handle) => {
        if (handle.id !== hoveredHandleId && !handle.selected) {
          handle.remove();
        }
      });

      if (hoveredKerning) {
        let handle = document.getElementById(hoveredHandleId);
        if (!handle) {
          handle = new KerningHandle(hoveredKerning);
          this._updateHandle(handle);
          this.handleContainer.appendChild(handle);
        }
      }
      this.setCursor();
    }
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.hoveredKerning) {
      return;
    }

    this._selectHandle(this.hoveredKerning, event.shiftKey);

    if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
      return;
    }

    // do drag
  }

  _updateHandle(kerningHandle) {
    const { lineIndex, glyphIndex } = kerningHandle.selector;
    const positionedGlyph =
      this.sceneModel.positionedLines[lineIndex].glyphs[glyphIndex];
    kerningHandle.update(positionedGlyph, this.canvasController);
  }

  _selectHandle(selector, shiftKey) {
    const handleId = selectorToString(selector);
    const selectedHandle = document.getElementById(handleId);

    if (shiftKey) {
      selectedHandle.selected = !selectedHandle.selected;
    } else {
      this.handles.forEach((handle) => {
        if (handle.id === handleId) {
          handle.selected = true;
        } else if (!selectedHandle.selected) {
          handle.remove();
        }
      });
    }
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
    this.handles.forEach((handle) => handle.remove());
  }

  get handles() {
    return [...this.handleContainer.querySelectorAll("kerning-handle")];
  }
}

class KerningHandle extends HTMLElement {
  constructor(selector) {
    super();

    this.selector = selector;

    this.id = selectorToString(selector);
    this.classList.add("kerning-handle");
  }

  update(positionedGlyph, canvasController) {
    let { x, y } = canvasController.canvasPoint({
      x: positionedGlyph.x - positionedGlyph.kernValue / 2,
      y: positionedGlyph.y,
    });
    this.style.left = `${x}px`;
    this.style.top = `${y}px`;

    this.classList.toggle("positive", positionedGlyph.kernValue > 0);
    this.classList.toggle("negative", positionedGlyph.kernValue < 0);

    this.innerText = formatKerningValue(positionedGlyph.kernValue);
  }

  get selected() {
    return this.classList.contains("selected");
  }

  set selected(onOff) {
    this.classList.toggle("selected", onOff);
  }
}

customElements.define("kerning-handle", KerningHandle);

function formatKerningValue(n) {
  if (n === null) {
    return "–";
  }
  n = round(n, 1);
  return n == undefined ? "\u00A0" : n.toString();
}

function selectorToString(kerningSelector) {
  const { lineIndex, glyphIndex } = kerningSelector;
  return `kerning-selector-${lineIndex}/${glyphIndex}`;
}
