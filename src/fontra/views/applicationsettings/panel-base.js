import { UndoStack, reverseUndoRecord } from "../core/font-controller.js";
import * as html from "../core/html-utils.js";
import { commandKeyProperty } from "../core/utils.js";

export class BaseInfoPanel {
  constructor(applicationSettingsController, panelElement) {
    this.applicationSettingsController = applicationSettingsController;
    //this.fontController = applicationSettingsController.fontController;
    this.panelElement = panelElement;
  }

  visibilityChanged(onOff) {
    this.visible = onOff;
    if (onOff && !this.initialized) {
      this.initializePanel();
      this.initialized = true;
    }
  }

  initializePanel() {
    this.undoStack = new UndoStack();

    // const subscribePattern = Object.fromEntries(
    //   this.constructor.fontAttributes.map((fontAttr) => [fontAttr, null])
    // );
    // this.fontController.addChangeListener(
    //   subscribePattern,
    //   (change, isExternalChange) => {
    //     if (isExternalChange) {
    //       this.setupUI();
    //       this.undoStack.clear();
    //     }
    //   },
    //   false
    // );
    this.setupUI();
  }

  handleKeyDown(event) {
    if (event[commandKeyProperty]) {
      if (event.key == "z") {
        event.stopImmediatePropagation();
        event.preventDefault();
        this.doUndoRedo(event.shiftKey);
      }
    }
  }

  async doUndoRedo(isRedo) {
    let undoRecord = this.undoStack.popUndoRedoRecord(isRedo);
    if (!undoRecord) {
      return;
    }
    if (isRedo) {
      undoRecord = reverseUndoRecord(undoRecord);
    }
    // this.fontController.applyChange(undoRecord.rollbackChange);

    // const error = await this.fontController.editFinal(
    //   undoRecord.rollbackChange,
    //   undoRecord.change,
    //   undoRecord.info.label,
    //   true
    // );
    // // TODO handle error
    // this.fontController.notifyEditListeners("editFinal", this);

    this.setupUI();
  }

  async postChange(change, rollbackChange, undoLabel) {
    const undoRecord = {
      change: change,
      rollbackChange: rollbackChange,
      info: {
        label: undoLabel,
      },
    };

    this.undoStack.pushUndoRecord(undoRecord);

    // const error = await this.fontController.editFinal(
    //   change,
    //   rollbackChange,
    //   undoLabel,
    //   true
    // );
    // // TODO handle error
    // this.fontController.notifyEditListeners("editFinal", this);
  }
}
