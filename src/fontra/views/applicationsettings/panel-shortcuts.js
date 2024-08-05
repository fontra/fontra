// import { label } from "../../client/core/html-utils.js";
// import { recordChanges } from "../core/change-recorder.js";
// import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { translate } from "/core/localization.js";
import { buildShortCutString } from "/web-components/menu-panel.js";
import { Form } from "/web-components/ui-form.js";

// import { fetchJSON } from "./utils.js";
// let shortcutsData = {};
// let resolveShortcutsHasLoaded;
// export const ensureShortcutsHasLoaded = new Promise((resolve) => {
//   resolveShortcutsHasLoaded = resolve;
// });
// function shortcutsChanged() {
//   // "all possible entries": { keysOrCodes: "p", metaKey: false, shiftKey: false, ctrlKey: false, altKey: false, globalOverride: true },
//   fetchJSON(`/data/shortcuts.json`).then((data) => {
//     shortcutsData = data;
//     resolveShortcutsHasLoaded();
//   });
// }
// shortcutsChanged();
// const shortcutsGrouped = {
//   "shortcuts.tools": [
//     "editor.pointer-tool",
//     "editor.pen-tool"
//   ],
//   "shortcuts.views": [
//     "zoom-in",
//     "zoom-out",
//   ],
// };

const shortcutsGrouped = {
  "shortcuts.tools": {
    // "all possible entries": { keysOrCodes: "p", metaKey: false, shiftKey: false, ctrlKey: false, altKey: false, globalOverride: true },
    "editor.pointer-tool": { keysOrCodes: "v", globalOverride: true },
    "editor.pen-tool": { keysOrCodes: "p", globalOverride: true },
  },
  "shortcuts.views": {
    "zoom-in": { keysOrCodes: "+=", metaKey: true, globalOverride: true },
    "zoom-out": { keysOrCodes: "-", metaKey: true, globalOverride: true },
  },
  "shortcuts.edit": {
    "action.delete-glyph": {
      keysOrCodes: ["Delete", "Backspace"],
      globalOverride: true,
    },
    "action.decompose-component": { keysOrCodes: "d", metaKey: true, shiftKey: true },
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

  async setupUI() {
    this.panelElement.innerHTML = "";
    for (const [categoryKey, shortcuts] of Object.entries(shortcutsGrouped)) {
      this.infoForm = new Form();
      this.infoForm.className = "fontra-ui-shortcuts-panel";
      this.infoForm.labelWidth = "20%";

      const formContents = [];

      formContents.push({
        type: "header",
        label: translate(categoryKey),
      });

      for (const key of Object.keys(shortcuts)) {
        const shortCutDefinition = shortcuts[key];
        if (shortCutDefinition === undefined) {
          continue;
        }
        formContents.push({
          type: "edit-text",
          key: JSON.stringify(["shortcuts", key]),
          label: translate(key, ""), // replace quantity with empty string for shortcuts
          value: buildShortCutString(shortCutDefinition),
          width: "6em",
          style: `text-align: center;`,
        });
      }

      this.infoForm.setFieldDescriptions(formContents);
      this.panelElement.appendChild(this.infoForm);
    }
  }
}
