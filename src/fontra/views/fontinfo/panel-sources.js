import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import {
  NumberFormatter,
  OptionalNumberFormatter,
  checkboxListCell,
  labeledTextInput,
  labeledTextInputMultiValues,
  setupSortableList,
} from "../core/ui-utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { translate } from "/core/localization.js";
import "/web-components/add-remove-buttons.js";

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
          this.fontController,
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
        value: "New font source...",
        onclick: (event) => this.newSource(),
      })
    );
    this.panelElement.appendChild(container);
    this.panelElement.focus();
  }

  async newSource() {
    // open a dialog to create a new source
    console.log("Adding new font source");
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

.fontra-ui-font-info-vertical-metrics {
  display: grid;
  grid-template-columns: minmax(4.5em, max-content) 4em 4em;
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
  constructor(fontController, sources, sourceIdentifier, postChange, setupUI) {
    super();
    this.classList.add("fontra-ui-font-info-sources-panel-source-box");
    this.draggable = true;
    this.fontController = fontController;
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
      General: {
        name: source.name,
        italicAngle: source.italicAngle ? source.italicAngle : 0,
      },
      location: source.location,
      verticalMetrics: source.verticalMetrics,
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
        console.log("event: ", event);
        this.editSource((source) => {
          if (key == "General") {
            source[event.key] = event.newValue;
          } else {
            source[key][event.key] = event.newValue;
          }
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
      if (key == "location") {
        const htmlElement = buildElementLocations(
          this.controller[key],
          this.fontController.axes.axes
        );
        this.append(htmlElement);
        console.log("htmlElement: ", htmlElement);
        continue;
      }
      if (key == "verticalMetrics") {
        const htmlElement = buildElementVerticalMetrics(
          this.controller[key],
          this.fontController.axes.axes
        );
        this.append(htmlElement);
        console.log("htmlElement: ", htmlElement);
        continue;
      }
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
    items.push([translate(key), key]);
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

function buildElementVerticalMetrics(controller, options = {}) {
  console.log("controller.model: ", controller.model);
  let itemsArray = Object.keys(controller.model).map(function (key) {
    return [key, controller.model[key]];
  });
  itemsArray.sort((a, b) => b[1].value - a[1].value);

  let items = [];
  for (const [key, value] of itemsArray) {
    items.push([translate(key), key]);
  }

  return html.div(
    { class: "fontra-ui-font-info-vertical-metrics" },
    items
      .map(([labelName, keyName]) =>
        labeledTextInputMultiValues(labelName, controller, keyName, {
          continuous: false,
          valueKeys: ["value", "zone"],
        })
      )
      .flat()
  );
}

function buildElementLocations(controller, fontAxes) {
  const locationElement = html.createDomElement("designspace-location", {});
  locationElement.axes = fontAxes;
  locationElement.controller = controller;
  return locationElement;
}

async function getSources(fontController) {
  const sources = await fontController.getSources();
  if (Object.keys(sources).length > 0) {
    return sources;
  }
  return {};
}
