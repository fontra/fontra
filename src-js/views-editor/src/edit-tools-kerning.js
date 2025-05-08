import * as html from "@fontra/core/html-utils.js";
import { arrowKeyDeltas, assert, round } from "@fontra/core/utils.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { equalGlyphSelection } from "./scene-controller.js";

export class KerningTool extends BaseTool {
  iconPath = "/images/kerning.svg";
  identifier = "kerning-tool";

  constructor(editor) {
    super(editor);
    this.fontController = editor.fontController;
    this.handleContainer = document.querySelector("#metric-handle-container");
    assert(this.handleContainer);

    this.sceneSettingsController.addKeyListener("glyphLines", (event) => {
      this.handles.forEach((handle) => handle.remove());
    });
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

      const hoveredHandleId = hoveredKerning ? selectorToId(hoveredKerning) : null;

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
      if (!event.shiftKey) {
        this.removeAllHandles();
      }
      return;
    }

    this._selectHandle(this.hoveredKerning, event.shiftKey);

    const { editContext, values } = await this.getEditContext();
    if (!editContext) {
      return;
    }

    if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
      return;
    }

    const initialPoint = this.canvasController.localPoint(initialEvent);

    const localPoint = (pt) => this.canvasController.localPoint(pt);
    async function* generateValues() {
      for await (const event of eventStream) {
        if (event.x == undefined && event.pageX == undefined) {
          continue;
        }
        const point = localPoint(event);
        const deltaX = Math.round(point.x - initialPoint.x);
        yield values.map((v) => v + deltaX);
      }
    }

    const change = await editContext.editContinuous(generateValues(), "edit kerning");
    // TODO: keep undo stack for kerning
    // console.log(">", change.change);
    // console.log("undo", change.rollbackChange);
  }

  async handleArrowKeys(event) {
    let [deltaX, deltaY] = arrowKeyDeltas[event.key];
    if (deltaY) {
      return;
    }
    if (event.shiftKey) {
      deltaX *= 10;
    }

    const { editContext, values } = await this.getEditContext();
    if (!editContext) {
      return;
    }

    const newValues = values.map((v) => v + deltaX);
    const change = await editContext.edit(newValues, "edit kerning");
    // TODO: keep undo stack for kerning
    // console.log(">", change.change);
    // console.log("undo", change.rollbackChange);
  }

  async getEditContext() {
    const sourceIdentifier = this.getSourceIdentifier();
    if (!sourceIdentifier) {
      return {};
    }

    const kerningController = await this.fontController.getKerningController("kern");

    const pairSelectors = [];
    const values = [];
    for (const handle of this.selectedHandles) {
      const { lineIndex, glyphIndex } = handle.selector;
      assert(glyphIndex > 0);
      const glyphs = this.sceneModel.positionedLines[lineIndex].glyphs;
      const leftGlyph = glyphs[glyphIndex - 1].glyphName;
      const rightGlyph = glyphs[glyphIndex].glyphName;
      const [leftName, rightName] = kerningController.getPairNames(
        leftGlyph,
        rightGlyph
      );
      pairSelectors.push({ leftName, rightName, sourceIdentifier });
      values.push(
        kerningController.getPairValueForSource(
          leftName,
          rightName,
          sourceIdentifier
        ) || 0
      );
    }

    if (!pairSelectors.length) {
      return {};
    }

    const editContext = kerningController.getEditContext(pairSelectors);

    return { editContext, values };
  }

  getSourceIdentifier() {
    return this.fontController.fontSourcesInstancer.getSourceIdentifierForLocation(
      this.sceneSettings.fontLocationSourceMapped
    );
  }

  _updateHandle(kerningHandle) {
    const { lineIndex, glyphIndex } = kerningHandle.selector;
    const positionedGlyph =
      this.sceneModel.positionedLines[lineIndex].glyphs[glyphIndex];
    kerningHandle.update(positionedGlyph, this.canvasController);
  }

  _selectHandle(selector, shiftKey) {
    const handleId = selectorToId(selector);
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
    this.removeAllHandles();
  }

  get handles() {
    return [...this.handleContainer.querySelectorAll("kerning-handle")];
  }

  get selectedHandles() {
    return this.handles.filter((handle) => handle.selected);
  }

  removeAllHandles() {
    this.handles.forEach((handle) => handle.remove());
  }
}

class KerningHandle extends HTMLElement {
  constructor(selector) {
    super();

    this.selector = selector;

    this.id = selectorToId(selector);
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

function selectorToId(kerningSelector) {
  const { lineIndex, glyphIndex } = kerningSelector;
  return `kerning-selector-${lineIndex}/${glyphIndex}`;
}
