import {
  doPerformAction,
  getActionIdentifierFromKeyEvent,
} from "@fontra/core/actions.js";
import { UndoStack, reverseUndoRecord } from "@fontra/core/font-controller.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { MultiPanelBasePanel } from "@fontra/core/multi-panel.js";
import { commandKeyProperty, sleepAsync } from "@fontra/core/utils.js";

export class BaseInfoPanel extends MultiPanelBasePanel {
  constructor(viewController, panelElement) {
    super(viewController, panelElement);

    this.fontController = viewController.fontController;
  }

  initializePanel() {
    super.initializePanel();

    this.undoStack = new UndoStack();

    const subscribePattern = Object.fromEntries(
      this.constructor.fontAttributes.map((fontAttr) => [fontAttr, null])
    );
    this.fontController.addChangeListener(
      subscribePattern,
      (change, isExternalChange) => {
        if (isExternalChange) {
          this.setupUI();
          this.undoStack.clear();
        }
      },
      false
    );
  }

  handleKeyDown(event) {
    const actionIdentifier = getActionIdentifierFromKeyEvent(event);
    if (actionIdentifier) {
      event.preventDefault();
      event.stopImmediatePropagation();
      doPerformAction(actionIdentifier, event);
    }
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
    // TODO handle error
    this.fontController.notifyEditListeners("editFinal", this);

    this.setupUI();

    await sleepAsync(0);
    undoRecord.info.contextCallbacks?.[isRedo ? "redoCallback" : "undoCallback"]?.();
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

  async postChange(change, rollbackChange, undoLabel, contextCallbacks) {
    const undoRecord = {
      change: change,
      rollbackChange: rollbackChange,
      info: {
        label: undoLabel,
        contextCallbacks: contextCallbacks,
      },
    };

    this.undoStack.pushUndoRecord(undoRecord);

    const error = await this.fontController.editFinal(
      change,
      rollbackChange,
      undoLabel,
      true
    );
    // TODO handle error
    this.fontController.notifyEditListeners("editFinal", this);
  }
}
