import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import {
  NumberFormatter,
  OptionalNumberFormatter,
  checkboxListCell,
  labeledTextInput,
  setupSortableList,
} from "../core/ui-utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { translate } from "/core/localization.js";

export class SourcesPanel extends BaseInfoPanel {
  static title = "sources.title";
  static id = "sources-panel";
  static fontAttributes = ["sources", "sources"];

  async setupUI() {
    const sources = await getSources(this.fontController);
    console.log("sources: ", sources);

    const container = html.div({
      style: "display: grid; gap: 0.5em;",
    });

    for (const [identifier, source] of Object.entries(sources)) {
      container.appendChild(
        new SourceBox(
          sources,
          identifier,
          this.postChange.bind(this),
          this.setupUI.bind(this)
        )
      );
    }

    this.panelElement.innerHTML = "";
    this.panelElement.style = `
    gap: 1em;
    `;
    this.panelElement.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: "New source...",
        onclick: (event) => this.newSource(),
      })
    );
    this.panelElement.appendChild(container);
    this.panelElement.focus();
  }

  async newSource() {
    // open a dialog to create a new source
    console.log("Adding new source");
    const newSource = {
      name: "New Source",
      location: { wght: 400, wdth: 100, ital: 0 },
      verticalMetrics: {},
      guidelines: [],
      customData: {},
    };
    //this.fontController.putSources({'sourceIdentyfier': newSource});
    this.setupUI();
  }
}

addStyleSheet(`
:root {
  --fontra-ui-font-info-sources-panel-max-list-height: 12em;
}

.fontra-ui-font-info-sources-panel-source-box {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
  cursor: pointer;
  display: grid;
  grid-template-rows: auto auto;
  grid-template-columns: max-content max-content auto auto;
  grid-row-gap: 0.1em;
  grid-column-gap: 1em;
}

.fontra-ui-font-info-sources-panel-source-box-values,
.fontra-ui-font-info-names {
  display: grid;
  grid-template-columns: minmax(4.5em, max-content) max-content;
  gap: 0.5em;
  align-items: start;
  align-content: start;
}

.fontra-ui-font-info-sources-panel-source-box-mapping-list {
  width: 9em;
  max-height: var(--fontra-ui-font-info-sources-panel-max-list-height);
}

.fontra-ui-font-info-sources-panel-source-box-label-list {
  max-width: max-content;
  max-height: var(--fontra-ui-font-info-sources-panel-max-list-height);
}

.fontra-ui-font-info-delete {
  justify-self: end;
  align-self: start;
}

select {
  font-family: "fontra-ui-regular";
}

.fontra-ui-font-info-header {
  font-weight: bold;
}
`);

class SourceBox extends HTMLElement {
  constructor(sources, sourceIdentifier, postChange, setupUI) {
    super();
    this.classList.add("fontra-ui-font-info-sources-panel-source-box");
    this.draggable = true;
    this.sources = sources;
    this.sourceIdentifier = sourceIdentifier;
    this.postChange = postChange;
    this.setupUI = setupUI;
    this.controller = {};
    this._updateContents();
  }

  get source() {
    return this.sources[this.sourceIdentifier];
  }

  get model() {
    const source = this.source;
    return {
      General: { name: source.name },
      Location: source.location,
      Metrics: source.verticalMetrics,
    };
    // NOTE: Font guidlines could be read/write here,
    // but makes more sense directly in the glyph editing window.
  }

  editSource(editFunc, undoLabel) {
    const root = { sources: this.sources };
    const changes = recordChanges(root, (root) => {
      editFunc(root.sources[this.sourceIdentifier]);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
    }
  }

  replaceSource(newSource, undoLabel) {
    const root = { sources: this.sources };
    const changes = recordChanges(root, (root) => {
      root.sources[this.sourceIdentifier] = newSource;
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
    }
  }

  deleteSource(sourceIdentifier) {
    const undoLabel = `delete source '${this.source.name}'`;
    const root = { sources: this.sources };
    const changes = recordChanges(root, (root) => {
      delete root.sources[sourceIdentifier];
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  _updateContents() {
    const model = this.model;

    for (const key in model) {
      this.controller[key] = new ObservableController(model[key]);
      this.controller[key].addListener((event) => {
        this.editSource((source) => {
          source[event.key] = event.newValue;
        }, `edit source ${key} ${event.key}`);
      });
    }

    this.innerHTML = "";

    for (const key in model) {
      this.append(html.div({ class: "fontra-ui-font-info-header" }, [translate(key)]));
    }

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-font-info-delete",
        "src": "/tabler-icons/trash.svg",
        "onclick": (event) => this.deleteSource(this.sourceIdentifier),
        "data-tooltip": translate("sources.delete-source"),
        "data-tooltipposition": "left",
      })
    );

    for (const key in model) {
      this.append(buildElement(this.controller[key]));
    }
  }
}

customElements.define("source-box", SourceBox);

function buildElement(controller, options = {}) {
  let itemsArray = Object.keys(controller.model).map(function (key) {
    return [key, controller.model[key]];
  });
  itemsArray.sort((a, b) => b[1].value - a[1].value);

  let items = [];
  for (const [key, value] of itemsArray) {
    if (key != "italicAngle") {
      items.push([translate(key), key]);
    }
  }
  // Add italic angle last
  // this is a very bad hack, but it works for now.
  if (controller.model.italicAngle) {
    items.push([translate("italicAngle"), "italicAngle"]);
  }

  return html.div(
    { class: "fontra-ui-font-info-names" },
    items
      .map(([labelName, keyName]) =>
        labeledTextInput(labelName, controller, keyName, {
          continuous: false,
        })
      )
      .flat()
  );
}

async function getSources(fontController) {
  const sources = await fontController.getSources();
  if (Object.keys(sources).length > 0) {
    return sources;
  }
  return getSourcesTestData;
}

const getSourcesTestData = {
  "identifier-0": {
    location: { italic: 0.0, weight: 150.0, width: 0.0 },
    name: "Light Condensed",
    verticalMetrics: {
      ascender: { value: 700, zone: 16 },
      capHeight: { value: 700, zone: 16 },
      descender: { value: -200, zone: -16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
    guidelines: [
      { name: "Guideline Cap Height", y: 700 },
      { name: "Guideline Left", x: 60, angle: 90 },
      { name: "Guideline Baseline Overshoot", y: -10 },
    ],
  },
  "identifier-1": {
    location: { italic: 0.0, weight: 850.0, width: 0.0 },
    name: "Bold Condensed",
    verticalMetrics: {
      ascender: { value: 800, zone: 16 },
      capHeight: { value: 800, zone: 16 },
      descender: { value: -200, zone: 16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
  },
  "identifier-2": {
    location: { italic: 0.0, weight: 150.0, width: 1000.0 },
    name: "Light Wide",
    verticalMetrics: {
      ascender: { value: 700, zone: 16 },
      capHeight: { value: 700, zone: 16 },
      descender: { value: -200, zone: 16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
  },
  "identifier-3": {
    location: { italic: 0.0, weight: 850.0, width: 1000.0 },
    name: "Bold Wide",
    verticalMetrics: {
      ascender: { value: 800, zone: 16 },
      capHeight: { value: 800, zone: 16 },
      descender: { value: -200, zone: 16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
  },
  "identifier-4": {
    location: { italic: 0.0, weight: 595.0, width: 0.0 },
    name: "support.crossbar",
    verticalMetrics: {
      ascender: { value: 700, zone: 16 },
      capHeight: { value: 700, zone: 16 },
      descender: { value: -200, zone: 16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
    guidelines: [
      { name: "Guideline Cap Height", y: 700, zone: 16 },
      { name: "Guideline Left", x: 60, angle: 90 },
      { name: "Guideline Baseline Overshoot", y: -10 },
    ],
  },
  "identifier-5": {
    location: { italic: 0.0, weight: 595.0, width: 1000.0 },
    name: "support.S.wide",
    verticalMetrics: {
      ascender: { value: 700, zone: 16 },
      capHeight: { value: 700, zone: 16 },
      descender: { value: -200, zone: 16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
    guidelines: [
      { name: "Guideline Cap Height", y: 700, zone: 16 },
      { name: "Guideline Left", x: 60, angle: 90 },
      { name: "Guideline Baseline Overshoot", y: -10 },
    ],
  },
  "identifier-6": {
    location: { italic: 0.0, weight: 595.0, width: 569.078 },
    name: "support.S.middle",
    verticalMetrics: {
      ascender: { value: 700, zone: 16 },
      capHeight: { value: 700, zone: 16 },
      descender: { value: -200, zone: -16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
    guidelines: [
      { name: "Guideline Cap Height", y: 700, zone: 16 },
      { name: "Guideline Left", x: 60, angle: 90 },
      { name: "Guideline Baseline Overshoot", y: -10 },
    ],
  },
  "identifier-7": {
    location: { italic: 1.0, weight: 150.0, width: 0.0 },
    name: "Light Condensed Italic",
    verticalMetrics: {
      ascender: { value: 750, zone: 16 },
      capHeight: { value: 750, zone: 16 },
      descender: { value: -250, zone: -16 },
      baseline: { value: 0, zone: -16 },
      italicAngle: { value: 0 },
      xHeight: { value: 500, zone: 16 },
    },
  },
};
