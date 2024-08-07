// import { label } from "../../client/core/html-utils.js";
// import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import { labeledCheckbox, labeledTextInput } from "../core/ui-utils.js";
import { fetchJSON } from "../core/utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { translate } from "/core/localization.js";
import {
  buildShortCutString,
  getKeyMap,
  getKeyMapSwapped,
  getNiceKey,
} from "/web-components/menu-panel.js";
import { dialog, dialogSetup, message } from "/web-components/modal-dialog.js";
import { Form } from "/web-components/ui-form.js";

// TODOs:
// How do we want to save custom edited shortcuts? Please see: saveShortcut() function.
// Does it make sense at all to have a custom json file for shortcuts or is it stored on the cache at the end?
// Do we need a reset to default button?
// Shortcuts from editor.js are included (as examples), but it must be extended with all shortcuts.
// There are general information like isMac – do we want to stored them in a better way and if so, where/how?

// For details please see https://tecadmin.net/javascript-detect-os/
const isMac = window.navigator.userAgent.indexOf("Mac") != -1;

let shortcutsData = {};
let shortcutsDataCustom = {};
let resolveShortcutsHasLoaded;

export const ensureShortcutsHasLoaded = new Promise((resolve) => {
  resolveShortcutsHasLoaded = resolve;
});

function createShortcutsData() {
  // first load default data:
  fetchJSON(`./data/shortcuts.json`).then((data) => {
    if (!isMac) {
      // If not Mac (Windows or Linux) then
      // replace metaKey with ctrlKey
      for (const key in data) {
        if (data[key].metaKey) {
          data[key].ctrlKey = true;
          delete data[key].metaKey;
        }
      }
    }
    shortcutsData = { ...shortcutsData, ...data };
  });

  // then load custom data:
  fetchJSON(`./data/shortcuts-custom.json`).then((data) => {
    shortcutsData = { ...shortcutsData, ...data };
    shortcutsDataCustom = data;
    resolveShortcutsHasLoaded();
  });
}

createShortcutsData();

const shortcutsGrouped = {
  "shortcuts.tools": [
    "editor.pointer-tool",
    "editor.pen-tool",
    "editor.knife-tool",
    "editor.shape-tool-rectangle",
    "editor.shape-tool-ellipse",
    "editor.power-ruler-tool",
    "editor.hand-tool",
  ],
  "shortcuts.views": [
    "zoom-in",
    "zoom-out",
    "zoom-fit-selection",
    "menubar.view.select.part.next",
    "menubar.view.select.part.previous",
  ],
  "shortcuts.panels": [
    "sidebar.glyph-search",
    "sidebar.selection-info",
    "sidebar.designspace-navigation",
  ],
  "shortcuts.edit": [
    "action.undo",
    "action.redo",
    "action.cut",
    "action.copy",
    "action.paste",
    "action.select-all",
    "action.select-none",
    "action.delete-glyph",
    "action.add-component",
    "action.decompose-component",
    "action.join-contours",
    "action.add-anchor",
    "action.add-guideline",
  ],
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

        formContents.push({
          type: "universal-row",
          field1: {
            type: "auxiliaryElement",
            key: ["label", key],
            auxiliaryElement: html.createDomElement("div", {
              "class": "ui-form-label universal-row",
              "style": `cursor: pointer;`,
              "innerHTML": translate(key, ""),
              "data-tooltip": "click for editing",
              "data-tooltipposition": "top",
              "onclick": (event) => this.doEditShortcut(key),
            }),
          },
          field2: {
            type: "edit-text",
            key: [key],
            value: buildShortCutString(shortCutDefinition),
            shortCutDefinition: buildShortCutString(shortCutDefinition),
            globalOverride: shortCutDefinition
              ? shortCutDefinition.globalOverride || false
              : false,
            shortcutKey: key,
            allowEmptyField: true,
            style: `width: 6em; text-align: center;`,
          },
          field3: {
            "type": "checkbox",
            "key": ["globalOverride", key],
            "value": shortCutDefinition
              ? shortCutDefinition.globalOverride || false
              : false,
            "shortCutDefinition": buildShortCutString(shortCutDefinition),
            "globalOverride": shortCutDefinition
              ? shortCutDefinition.globalOverride || false
              : false,
            "shortcutKey": key,
            "data-tooltip": "Global Override",
            "data-tooltipposition": "top",
          },
        });
      }

      this.infoForm.setFieldDescriptions(formContents);

      this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
        const shortCutDef =
          fieldItem.key[0] === "globalOverride" ? fieldItem.shortCutDefinition : value;
        const globalOverrideDef =
          fieldItem.key[0] === "globalOverride" ? value : fieldItem.globalOverride;

        const shortCutDefinition = parseShortCutString(
          fieldItem.shortcutKey,
          shortCutDef,
          globalOverrideDef
        );
        if (shortCutDefinition === undefined) {
          this.setupUI();
          return;
        }

        fieldItem.shortCutDefinition = buildShortCutString(shortCutDefinition);
        fieldItem.globalOverride = shortCutDefinition
          ? shortCutDefinition.globalOverride
          : false;
        this.saveShortcut(fieldItem.shortcutKey, shortCutDefinition);
      };

      this.panelElement.appendChild(this.infoForm);
    }
  }

  async doEditShortcut(key) {
    const newShortcutDefinition = await doEditShortcutDialog(key);
    if (newShortcutDefinition === undefined) {
      // User cancelled, do nothing.
      return;
    }
    this.saveShortcut(key, newShortcutDefinition);
  }

  async saveShortcut(key, newShortcutDefinition) {
    //TODO: Need to be written to custom json file somehow or save in cache.
    shortcutsData[key] = newShortcutDefinition;
    shortcutsDataCustom[key] = newShortcutDefinition;
    this.setupUI(); // reload UI
  }
}

const swappedKeyMap = getKeyMapSwapped();
function parseShortCutString(key, value, globalOverride) {
  if (value === "") {
    // Shortcut has been removed,
    // therefore return null, which is valid for json and different to undefined,
    // which is a valid shortcut with no keys or codes.
    return null;
  }
  const valueCopy = `${value}`;
  const definition = {};

  function setShortCutDefinitionByKey(key, value, definition) {
    if (value.includes(getNiceKey(key))) {
      definition[key] = true;
      const keyStr = getNiceKey(key);
      const index = value.indexOf(keyStr);
      value = value.slice(0, index) + value.slice(index + keyStr.length);
    }
    return value;
  }
  value = setShortCutDefinitionByKey("metaKey", value, definition);
  value = setShortCutDefinitionByKey("shiftKey", value, definition);
  value = setShortCutDefinitionByKey("ctrlKey", value, definition);
  value = setShortCutDefinitionByKey("altKey", value, definition);
  const keysOrCodes = swappedKeyMap[value]
    ? [swappedKeyMap[value]]
    : value.length === 1
    ? value.toLowerCase()
    : undefined;

  if (keysOrCodes === undefined) {
    message("Invalid shortcut:", `“${valueCopy}”`);
    return undefined;
  }
  definition.keysOrCodes = keysOrCodes;
  definition.globalOverride = globalOverride;

  //check if definition exists already:
  for (const otherKey in shortcutsData) {
    if (key === otherKey) {
      // skip self
      continue;
    }
    if (isDifferentShortCutDefinition(shortcutsData[otherKey], definition)) {
      continue;
    }
    message("Shortcut exists for: ", translate(otherKey, ""));
    return undefined;
  }

  return definition;
}

function isDifferentShortCutDefinition(a, b) {
  const defA = _shortCutDefinitionNormalized(a);
  const defB = _shortCutDefinitionNormalized(b);

  return JSON.stringify(defA).toLowerCase() != JSON.stringify(defB).toLowerCase();
}

const shortcutDefinitionKeys = [
  "ctrlKey",
  "altKey",
  "shiftKey",
  "metaKey",
  "keysOrCodes",
  "globalOverride",
];
function _shortCutDefinitionNormalized(shortCutDefinition) {
  if (shortCutDefinition === null) {
    return null;
  }
  const definition = {};
  for (const key of shortcutDefinitionKeys) {
    if (shortCutDefinition[key]) {
      definition[key] = shortCutDefinition[key];
    }
  }
  return definition;
}

async function doEditShortcutDialog(key) {
  const shortCutDefinition = shortcutsData[key];
  const title = "Edit Shortcut: " + translate(key, "");

  const validateInput = () => {
    const tempDefinition = _shortCutDefinitionNormalized(controller.model);

    const warnings = [];
    for (const otherKey in shortcutsData) {
      if (key === otherKey) {
        // skip self
        continue;
      }
      if (isDifferentShortCutDefinition(shortcutsData[otherKey], tempDefinition)) {
        continue;
      }
      warnings.push("⚠️ Shortcut exists for: " + translate(otherKey, ""));
      break;
    }

    if (tempDefinition.keysOrCodes === undefined) {
      warnings.push("⚠️ Missing shortcut");
    }

    if (tempDefinition.keysOrCodes && tempDefinition.keysOrCodes.length >= 2) {
      warnings.push("⚠️ Only one key allowed");
    }

    warningElement.innerText = warnings.length ? warnings.join("\n") : "";
    dialog.defaultButton.classList.toggle("disabled", warnings.length);
  };

  const controller = new ObservableController({
    ctrlKey: shortCutDefinition ? shortCutDefinition.ctrlKey : false,
    altKey: shortCutDefinition ? shortCutDefinition.altKey : false,
    shiftKey: shortCutDefinition ? shortCutDefinition.shiftKey : false,
    metaKey: shortCutDefinition ? shortCutDefinition.metaKey : false,
    keysOrCodes: shortCutDefinition ? shortCutDefinition.keysOrCodes : "",
    globalOverride: shortCutDefinition ? shortCutDefinition.globalOverride : false,
  });

  controller.addKeyListener("ctrlKey", (event) => {
    validateInput();
  });
  controller.addKeyListener("altKey", (event) => {
    validateInput();
  });
  controller.addKeyListener("shiftKey", (event) => {
    validateInput();
  });
  controller.addKeyListener("metaKey", (event) => {
    validateInput();
  });
  controller.addKeyListener("keysOrCodes", (event) => {
    validateInput();
  });
  controller.addKeyListener("globalOverride", (event) => {
    validateInput();
  });

  const disable = controller.model.keysOrCodes != "" ? false : true;
  const { contentElement, warningElement } =
    _shortcutPropertiesContentElement(controller);
  const dialog = await dialogSetup(title, null, [
    { title: "Cancel", isCancelButton: true },
    { title: "Edit", isDefaultButton: true, disabled: disable },
  ]);

  dialog.setContent(contentElement);

  setTimeout(() => {
    const inputNameElement = contentElement.querySelector("#shortcut-text-input");
    inputNameElement.focus();
    inputNameElement.select();
  }, 0);

  validateInput();

  if (!(await dialog.run())) {
    // User cancelled
    return undefined;
  }

  return _shortCutDefinitionNormalized(controller.model);
}

function _shortcutPropertiesContentElement(controller) {
  const warningElement = html.div({
    id: "warning-text-anchor-name",
    style: `grid-column: 1 / -1; min-height: 1.5em;`,
  });
  const contentElement = html.div(
    {
      style: `overflow: hidden;
        white-space: nowrap;
        display: grid;
        gap: 0.5em;
        grid-template-columns: auto auto;
        align-items: center;
        height: 100%;
        min-height: 0;
      `,
    },
    [
      ...labeledTextInput("Keys or codes:", controller, "keysOrCodes", {
        id: "shortcut-text-input",
      }),
      html.div(),
      labeledCheckbox(`Meta (${getNiceKey("metaKey")})`, controller, "metaKey", {}),
      html.div(),
      labeledCheckbox(`Ctrl(${getNiceKey("ctrlKey")})`, controller, "ctrlKey", {}),
      html.div(),
      labeledCheckbox(`Shift (${getNiceKey("shiftKey")})`, controller, "shiftKey", {}),
      html.div(),
      labeledCheckbox(`Alt (${getNiceKey("altKey")})`, controller, "altKey", {}),
      html.div(),
      labeledCheckbox("Global override", controller, "globalOverride", {}),
      html.br(),
      warningElement,
    ]
  );
  return { contentElement, warningElement };
}
