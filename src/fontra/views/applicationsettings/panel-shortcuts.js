// import { label } from "../../client/core/html-utils.js";
// import { recordChanges } from "../core/change-recorder.js";
// import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { fetchJSON } from "../core/utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { translate } from "/core/localization.js";
import { buildShortCutString } from "/web-components/menu-panel.js";
import { Form } from "/web-components/ui-form.js";

// for details please see https://tecadmin.net/javascript-detect-os/
let userAgent = window.navigator.userAgent;
const isMac = userAgent.indexOf("Mac") != -1;
const isWin = userAgent.indexOf("Win") != -1;
const isLinux = userAgent.indexOf("Linux") != -1;

let shortcutsData = {};
let resolveShortcutsHasLoaded;

export const ensureShortcutsHasLoaded = new Promise((resolve) => {
  resolveShortcutsHasLoaded = resolve;
});

function createShortcutsData() {
  // "all possible entries": { keysOrCodes: "p", metaKey: false, shiftKey: false, ctrlKey: false, altKey: false, globalOverride: true },

  // first load default data:
  fetchJSON(`./data/shortcuts.json`).then((data) => {
    shortcutsData = { ...shortcutsData, ...data };
  });

  // second load OS specific data:
  if (isMac) {
    // skip, because is equal to default
  } else if (isWin) {
    fetchJSON(`./data/shortcuts-win.json`).then((data) => {
      shortcutsData = { ...shortcutsData, ...data };
    });
  } else if (isLinux) {
    // skip, because no clue if there are differences to any system.
  }

  // last load custom data:
  fetchJSON(`./data/shortcuts-custom.json`).then((data) => {
    shortcutsData = { ...shortcutsData, ...data };
    resolveShortcutsHasLoaded();
  });
}

createShortcutsData();

const shortcutsGrouped = {
  "shortcuts.tools": ["editor.pointer-tool", "editor.pen-tool"],
  "shortcuts.views": ["zoom-in", "zoom-out"],
  "shortcuts.edit": ["action.delete-glyph", "action.decompose-component"],
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
    await ensureShortcutsHasLoaded;

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

      for (const key of shortcuts) {
        const shortCutDefinition = shortcutsData[key];
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
