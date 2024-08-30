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

// For details please see https://tecadmin.net/javascript-detect-os/
const isMac = window.navigator.userAgent.indexOf("Mac") != -1;

let shortCutsDataDefault = {};
let shortCutsDataCustom = {};
let resolveShortCutsHasLoaded;

export const ensureShortCutsHasLoaded = new Promise((resolve) => {
  resolveShortCutsHasLoaded = resolve;
});

function createShortCutsData() {
  fetchJSON(`/core/data/shortcuts.json`).then((data) => {
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

    // TODO: Data is missing keysOrCodes and I don't know why.

    const storedCustomData = localStorage.getItem("shortCuts-custom");
    shortCutsDataCustom = storedCustomData ? JSON.parse(storedCustomData) : {};
    shortCutsDataDefault = data;
    resolveShortCutsHasLoaded();
  });
}

createShortCutsData();

export function getShortCut(key) {
  return shortCutsDataCustom[key] || shortCutsDataDefault[key];
}

// With this grouping we have control over the order of the shortcuts.
const shortCutsGrouped = {
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
    "action.delete",
    "action.add-component",
    "action.decompose-component",
    "action.join-contours",
    "action.add-anchor",
    "action.add-guideline",
    "action.break-contour",
    "action.reverse-contour",
    "action.set-contour-start",
  ],
};

addStyleSheet(`
.fontra-ui-shortcuts-panel {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
}
.fontra-ui-shortcuts-panel-header {
  font-weight: bold;
}
.fontra-ui-shortcuts-panel-buttons {
  display: grid;
  grid-template-columns: max-content max-content max-content;
  gap: 1em;
}
`);

export class ShortCutsPanel extends BaseInfoPanel {
  static title = "shortcuts.title";
  static id = "shortcuts-panel";

  async setupUI() {
    await ensureShortCutsHasLoaded;

    this.panelElement.innerHTML = "";

    this.panelElement.style = "gap: 1em;";

    const containerButtons = html.div(
      { class: "fontra-ui-shortcuts-panel-buttons" },
      []
    );
    containerButtons.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: "Reset all shortcuts",
        onclick: (event) => this.resetToDefault(),
      })
    );

    containerButtons.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: "Export shortcuts",
        onclick: (event) => this.exportShortCuts(),
      })
    );

    containerButtons.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: "Import shortcuts",
        onclick: (event) => this.importShortCuts(),
      })
    );

    this.panelElement.appendChild(containerButtons);

    for (const [categoryKey, shortCuts] of Object.entries(shortCutsGrouped)) {
      const container = html.div({ class: "fontra-ui-shortcuts-panel" }, []);
      container.appendChild(
        html.createDomElement("div", {
          class: "fontra-ui-shortcuts-panel-header",
          innerHTML: translate(categoryKey),
        })
      );
      for (const key of shortCuts) {
        container.appendChild(new ShortCutElement(key, this.setupUI.bind(this)));
      }
      this.panelElement.appendChild(container);
    }
  }

  async resetToDefault() {
    const result = await dialog(
      "Reset to default",
      "Are you sure you want to reset all shortcuts to their default settings?",
      [
        { title: translate("dialog.cancel"), isCancelButton: true },
        { title: "Okay", isDefaultButton: true },
      ]
    );
    if (!result) {
      return;
    }
    localStorage.removeItem("shortCuts-custom");
    location.reload();
  }

  async exportShortCuts() {
    // Only export custom shortcuts,
    // because default shortcuts are already in the code.
    const data = JSON.stringify(shortCutsDataCustom);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shortcuts.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async importShortCuts() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = async (event) => {
        const data = JSON.parse(event.target.result);
        localStorage.setItem("shortCuts-custom", JSON.stringify(data));
        location.reload();
      };
      reader.readAsText(file);
    };
    input.click();
  }
}

const swappedKeyMap = getKeyMapSwapped();
function parseShortCutString(value) {
  if (value === "") {
    // Shortcut has been removed, therefore return null,
    // which is valid for json and different to undefined.
    // 'null' is a valid shortcut with no keys or codes.
    return null;
  }
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

  const codePoint = value.codePointAt(0);
  const isAtoZor0to9 =
    (codePoint >= 65 && codePoint <= 90) || (codePoint >= 48 && codePoint <= 57);
  definition.keysOrCodes = isAtoZor0to9
    ? value.toLowerCase()
    : swappedKeyMap[value]
    ? [swappedKeyMap[value]]
    : value;

  return definition;
}

function isDifferentShortCutDefinition(a, b) {
  // Why isDifferent and not isEqual?
  // Because it is a faster return if something is different.
  const defA = _shortCutDefinitionNormalized(a);
  const defB = _shortCutDefinitionNormalized(b);

  if (defA === null || defB === null) {
    return defA != defB;
  }

  // we ignore globalOverride for comparison, therefore delete it.
  delete defA.globalOverride;
  delete defB.globalOverride;

  if (Object.keys(defA).length !== Object.keys(defB).length) {
    return true;
  }

  for (const key in defA) {
    if (key === "keysOrCodes") {
      // This is required, because of cases like this:
      // ['Delete', 'Backspace'] vs 'Backspace'
      const array1 = Array.isArray(defA[key]) ? defA[key] : [defA[key]];
      const array2 = Array.isArray(defB[key]) ? defB[key] : [defB[key]];
      const intersection = array1.filter(Set.prototype.has, new Set(array2));
      if (intersection.length === 0) {
        // No intersection: they are different.
        return true;
      }
    } else if (defA[key] !== defB[key]) {
      return true;
    }
  }
  return false;
}

const shortCutDefinitionKeys = [
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
  if (shortCutDefinition === undefined) {
    return undefined;
  }
  if (!shortCutDefinition["keysOrCodes"]) {
    // No keys or codes, is not valid,
    // therefore return null.
    // INFO: This is how you can delete a shortcut.
    return null;
  }
  const definition = {};
  for (const key of shortCutDefinitionKeys) {
    if (shortCutDefinition[key]) {
      if (key === "keysOrCodes") {
        if (shortCutDefinition[key] === "") {
          return null;
        }
        if (
          shortCutDefinition[key].length > 1 &&
          shortCutDefinition[key].includes(",")
        ) {
          // It's a list of keys, if it contains a comma
          shortCutDefinition[key] = shortCutDefinition[key].split(",");
        }
      }
      definition[key] = shortCutDefinition[key];
    }
  }
  return definition;
}

function validateShortCutDefinition(key, definition) {
  if (definition === null) {
    return [];
  }
  const warnings = [];
  for (const otherKey in shortCutsDataDefault) {
    if (key === otherKey) {
      // skip self
      continue;
    }
    if (isDifferentShortCutDefinition(getShortCut(otherKey), definition)) {
      continue;
    }
    warnings.push("⚠️ ShortCut exists for: " + translate(otherKey, ""));
    break;
  }

  let keysOrCodes = [];
  if (Array.isArray(definition.keysOrCodes)) {
    keysOrCodes = definition.keysOrCodes;
  } else {
    if (definition.keysOrCodes && definition.keysOrCodes.length > 1) {
      if (definition.keysOrCodes.includes(",")) {
        // collect items to be checked later if it's a valid key
        definition.keysOrCodes.split(",").forEach((key) => {
          keysOrCodes.push(key);
        });
      } else {
        keysOrCodes.push(definition.keysOrCodes);
      }
    }
  }

  for (const charStr of keysOrCodes) {
    if (charStr.length > 1 && !getKeyMap()[charStr]) {
      warnings.push(`⚠️ Invalid key: ${charStr}`);
    }
  }
  return warnings;
}

async function doEditShortCutDialog(key) {
  const shortCutDefinition = getShortCut(key);
  const title = "Edit ShortCut: " + translate(key, "");

  const validateInput = () => {
    const warnings = validateShortCutDefinition(
      key,
      _shortCutDefinitionNormalized(controller.model)
    );

    warningElement.innerText = warnings.length ? warnings.join("\n") : "";
    dialog.defaultButton.classList.toggle("disabled", warnings.length);
  };

  const controller = new ObservableController({
    ctrlKey: shortCutDefinition ? shortCutDefinition.ctrlKey : false,
    altKey: shortCutDefinition ? shortCutDefinition.altKey : false,
    shiftKey: shortCutDefinition ? shortCutDefinition.shiftKey : false,
    metaKey: shortCutDefinition ? shortCutDefinition.metaKey : false,
    keysOrCodes: shortCutDefinition ? shortCutDefinition.keysOrCodes : "",
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

  const disable = controller.model.keysOrCodes != "" ? false : true;
  const { contentElement, warningElement } =
    _shortCutPropertiesContentElement(controller);
  const dialog = await dialogSetup(title, null, [
    { title: "Cancel", isCancelButton: true },
    { title: "Edit", isDefaultButton: true, disabled: disable },
  ]);

  dialog.setContent(contentElement);

  setTimeout(() => {
    const inputNameElement = contentElement.querySelector("#shortCut-text-input");
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

function _shortCutPropertiesContentElement(controller) {
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
        id: "shortCut-text-input",
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
      warningElement,
    ]
  );
  return { contentElement, warningElement };
}

const shortcutsPanelInputWidth = isMac ? "6em" : "12em"; // longer on windows because no icons are shown.
addStyleSheet(`
  .fontra-ui-shortcuts-panel-element {
    background-color: var(--ui-element-background-color);
    border-radius: 0.5em;
    padding: 0.35rem 0 0 0;
    display: grid;
    grid-template-rows: auto auto;
    grid-template-columns: max-content max-content max-content max-content;
    grid-row-gap: 0.1em;
    grid-column-gap: 1em;
    height: 1.4em;
  }

  .fontra-ui-shortcuts-panel-input {
    width: ${shortcutsPanelInputWidth};
    text-align: center;
    caret-color: transparent;
  }

  .fontra-ui-shortcuts-panel-input:focus {
    border: 1px solid var(--background-color-dark);
    outline: unset;
    color: #999;
  }

  .fontra-ui-shortcuts-panel-label {
    width: 14em;
    overflow: hidden;
    text-align: right;
  }

  .fontra-ui-shortcuts-panel-icon {
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    background-color: green; /* for debugging */
  }

  .fontra-ui-shortcuts-panel-input:focus ~ * {
    pointer-events: unset;
    opacity: unset;
  }

  .fontra-ui-shortcuts-panel-icon:active {
    pointer-events: unset;
    opacity: unset;
  }

`);

class ShortCutElement extends HTMLElement {
  constructor(key, setupUI) {
    super();
    this.classList.add("fontra-ui-shortcuts-panel-element");
    this.key = key;
    this.shortCutDefinition = getShortCut(this.key);
    // get globalOverride from data or false -> no custom settings allowed.
    this.globalOverride =
      this.shortCutDefinition === null
        ? false
        : this.shortCutDefinition.globalOverride || false;
    this.setupUI = setupUI;
    this.shorcutCommands = new Set();
    this._updateContents();
  }

  async doEditShortCut(id) {
    const shortCutDefinition = await doEditShortCutDialog(this.key);
    const newShortCutDefinition = _shortCutDefinitionNormalized(shortCutDefinition);
    if (newShortCutDefinition === undefined) {
      // User cancelled, do nothing.
      return;
    }
    newShortCutDefinition.globalOverride = this.globalOverride;
    if (this.saveShortCut(newShortCutDefinition)) {
      const element = document.getElementById(id);
      element.value = buildShortCutString(newShortCutDefinition);
      element.blur(); // remove focus
    }
  }

  saveShortCut(newShortCutDefinition) {
    const warnings = validateShortCutDefinition(this.key, newShortCutDefinition);
    if (warnings.length > 0) {
      message(
        `Invalid ShortCut "${buildShortCutString(
          newShortCutDefinition
        )}" for "${translate(this.key, "")}":`,
        warnings.join("\n")
      );
      return false;
    }

    shortCutsDataCustom[this.key] = newShortCutDefinition;
    localStorage.setItem("shortCuts-custom", JSON.stringify(shortCutsDataCustom));
    return true;
  }

  getPressedKey(event) {
    const mainkey = `${
      event.key.toLowerCase() === "control" ? "ctrl" : event.key.toLowerCase()
    }Key`;

    // collect the keys pressed in this.shorcutCommands
    if (event[mainkey]) {
      return mainkey;
    } else if (getNiceKey(event.code, false)) {
      return event.code;
    } else {
      return event.key;
    }
  }

  getShortCutCommand() {
    let shorcutCommand = "";
    Array.from(this.shorcutCommands).forEach((item) => {
      if (getNiceKey(item, false)) {
        shorcutCommand += getNiceKey(item);
      } else {
        shorcutCommand += item;
      }
    });
    return shorcutCommand;
  }

  recordShortCut(id, event) {
    event.preventDefault();

    const pressedKey = this.getPressedKey(event);
    this.shorcutCommands.add(pressedKey);
    const shorcutCommand = this.getShortCutCommand();

    // show the current shortcut immediately, no delay:
    const element = document.getElementById(id);
    element.value = shorcutCommand;

    // if not alt, shift, ctrl or meta, end of recording -> save shortcut
    if (!event[pressedKey]) {
      const shortCutDefinition = parseShortCutString(shorcutCommand);
      shortCutDefinition.globalOverride = this.globalOverride;
      if (!this.saveShortCut(shortCutDefinition)) {
        // if the shortcut is invalid, reset the input field
        element.value = buildShortCutString(this.shortCutDefinition);
      }
      element.blur(); // remove focus
      this.shorcutCommands = new Set();
    }
  }

  recordShortCutKeyup(id, event) {
    const mainkey = `${
      event.key.toLowerCase() === "control" ? "ctrl" : event.key.toLowerCase()
    }Key`;
    this.shorcutCommands.delete(mainkey); // remove the main key if it was pressed

    const element = document.getElementById(id);
    element.value =
      this.getShortCutCommand() != ""
        ? this.getShortCutCommand()
        : buildShortCutString(this.shortCutDefinition);
  }

  resetShortCut(id) {
    const shortCutDefinition = shortCutsDataDefault[this.key];

    if (this.saveShortCut(shortCutDefinition)) {
      document.getElementById(id).value = buildShortCutString(shortCutDefinition);
    }
  }

  deleteShortCut(id) {
    if (this.saveShortCut(null)) {
      document.getElementById(id).value = "";
    }
  }

  _updateContents() {
    this.innerHTML = "";
    const labelString = translate(this.key, "");
    this.append(
      html.label(
        {
          "class": "fontra-ui-shortcuts-panel-label",
          "data-tooltip": labelString,
          "data-tooltipposition": "top",
        },
        [labelString]
      )
    );

    const id = `shortcut-input-${this.key}`;
    this.append(
      html.input({
        "type": "text",
        "id": id,
        "class": "fontra-ui-shortcuts-panel-input",
        "value": buildShortCutString(this.shortCutDefinition),
        "data-tooltip":
          "Click and record a shortcut OR double click and open dialog for editing",
        "data-tooltipposition": "top",
        "onkeydown": (event) => this.recordShortCut(id, event),
        "onkeyup": (event) => this.recordShortCutKeyup(id, event),
        "ondblclick": (event) => this.doEditShortCut(id),
      })
    );

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-shortcuts-panel-icon",
        "src": "/tabler-icons/refresh.svg", // TODO: I don't know why the icon is not shown.
        "value": "",
        "onclick": (event) => this.resetShortCut(id),
        "data-tooltip": "Reset to default",
        "data-tooltipposition": "top",
      })
    );

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-shortcuts-panel-icon",
        "src": "/tabler-icons/trash.svg", // TODO: I don't know why the icon is not shown.
        "onclick": (event) => this.deleteShortCut(id),
        "data-tooltip": "Delete",
        "data-tooltipposition": "top",
      })
    );
  }
}

customElements.define("shortcut-element", ShortCutElement);
