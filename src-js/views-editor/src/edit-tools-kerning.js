import { UndoStack, reverseUndoRecord } from "@fontra/core/font-controller.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { arrowKeyDeltas, assert, round } from "@fontra/core/utils.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import { equalGlyphSelection } from "./scene-controller.js";

const KERNING_VISUALIZATION_IDENTIFIER = "fontra.kerning-indicators";

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
    this.sceneSettingsController.addKeyListener("applyKerning", (event) => {
      if (!event.newValue && this.sceneController.selectedTool === this) {
        this.editor.setSelectedTool("pointer-tool");
      }
    });
    this.showKerningWhileActive = true;
    this.undoStack = new UndoStack();
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
        const handle = document.getElementById(hoveredHandleId);
        if (!handle) {
          this.addHandle(hoveredKerning);
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

    const undoLabel = "edit kerning";
    const changes = await editContext.editContinuous(generateValues(), undoLabel);
    this.pushUndoItem(changes, undoLabel);
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
    const undoLabel = "edit kerning";
    const changes = await editContext.edit(newValues, "edit kerning");
    this.pushUndoItem(changes, undoLabel);
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

  addHandle(selector, select = false) {
    const handle = new KerningHandle(selector);
    this._updateHandle(handle);
    this.handleContainer.appendChild(handle);
    handle.selected = select;
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
    if (this._selectionState?.glyphLines === this.sceneSettings.glyphLines) {
      this._selectionState.selectors.forEach((selector) =>
        this.addHandle(selector, true)
      );
    }
    if (!this.sceneSettings.applyKerning) {
      this.sceneSettings.applyKerning = true;
    }

    this.showKerningWhileInactive = this.showKerning;
    this.showKerning = this.showKerningWhileActive;

    this.setCursor();
  }

  deactivate() {
    this._selectionState = {
      glyphLines: this.sceneSettings.glyphLines,
      selectors: this.selectedHandles.map((h) => h.selector),
    };
    delete this.hoveredKerning;
    this.removeAllHandles();

    this.showKerningWhileActive = this.showKerning;
    this.showKerning = this.showKerningWhileInactive;
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

  get showKerning() {
    return this.editor.visualizationLayersSettings.model[
      KERNING_VISUALIZATION_IDENTIFIER
    ];
  }

  set showKerning(onOff) {
    this.editor.visualizationLayersSettings.model[KERNING_VISUALIZATION_IDENTIFIER] =
      onOff;
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

    const error = await this.fontController.editFinal(
      undoRecord.rollbackChange,
      undoRecord.change,
      undoRecord.info.label,
      true
    );
  }

  pushUndoItem(changes, undoLabel) {
    const undoRecord = {
      change: changes.change,
      rollbackChange: changes.rollbackChange,
      info: {
        label: undoLabel,
      },
    };

    this.undoStack.pushUndoRecord(undoRecord);
  }

  canDelete() {
    return !!this.selectedHandles.length;
  }

  async doDelete() {
    const { editContext, values } = await this.getEditContext();
    if (!editContext) {
      return;
    }

    const undoLabel = "delete kerning";
    const changes = await editContext.delete(undoLabel);
    this.pushUndoItem(changes, undoLabel);
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
