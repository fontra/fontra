// import { label } from "../../client/core/html-utils.js";
// import { recordChanges } from "../core/change-recorder.js";
// import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { translate } from "/core/localization.js";
import { Form } from "/web-components/ui-form.js";

const fontraShortcuts = {
  "shortcuts.tools": {
    // "all possible entries": { keysOrCodes: "p", metaKey: false, shiftKey: false, ctrlKey: false, altKey: false, globalOverride: true },
    "editor.pointer-tool": { keysOrCodes: "v", globalOverride: true },
    "editor.pen-tool": { keysOrCodes: "p", globalOverride: true },
  },
  "shortcuts.views": {
    "zoom-in": { keysOrCodes: "+=", metaKey: true, globalOverride: true },
    "zoom-out": { keysOrCodes: "-", metaKey: true, globalOverride: true },
  },
};

addStyleSheet(`
.fontra-ui-shortcuts-panel {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
  margin-bottom: 1em;
}
`);

export class ShortcutsPanel extends BaseInfoPanel {
  static title = "shortcuts.title";
  static id = "shortcuts-panel";

  getShortcutString(shortcutAttributes) {
    const keys = [];
    if (shortcutAttributes.ctrlKey) {
      keys.push("Ctrl");
    }
    if (shortcutAttributes.metaKey) {
      keys.push("Cmd");
    }
    if (shortcutAttributes.altKey) {
      keys.push("Alt");
    }
    if (shortcutAttributes.shiftKey) {
      keys.push("Shift");
    }
    keys.push(shortcutAttributes.keysOrCodes);
    return keys.join("  +  ");
  }

  async setupUI() {
    this.panelElement.innerHTML = "";
    for (const [categoryKey, shortcuts] of Object.entries(fontraShortcuts)) {
      this.infoForm = new Form();
      this.infoForm.className = "fontra-ui-shortcuts-panel";
      this.infoForm.labelWidth = "8em";

      const formContents = [];

      formContents.push({
        type: "header",
        label: translate(categoryKey),
      });

      for (const [key, attributes] of Object.entries(shortcuts)) {
        formContents.push({
          type: "edit-text",
          key: JSON.stringify(["shortcuts", key]),
          label: translate(key),
          value: this.getShortcutString(attributes),
          width: "8em",
        });
      }

      this.infoForm.setFieldDescriptions(formContents);
      this.panelElement.appendChild(this.infoForm);
    }
  }
}
