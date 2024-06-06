import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { translate } from "../core/localization.js";
import { ObservableController } from "../core/observable-object.js";
import {
  OptionalNumberFormatter,
  labelForElement,
  labeledCheckbox,
  labeledTextInput,
  textInput,
} from "../core/ui-utils.js";
import { round } from "../core/utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import {
  locationToString,
  makeSparseLocation,
  mapAxesFromUserSpaceToSourceSpace,
} from "/core/var-model.js";
import "/web-components/add-remove-buttons.js";
import "/web-components/designspace-location.js";
import { dialogSetup, message } from "/web-components/modal-dialog.js";

export class SourcesPanel extends BaseInfoPanel {
  static title = "sources.title";
  static id = "sources-panel";
  static fontAttributes = ["axes", "sources"];

  initializePanel() {
    super.initializePanel();
    this.fontController.addChangeListener(
      { axes: null },
      (change, isExternalChange) => {
        this.setupUI();
        this.undoStack.clear();
      },
      false
    );
  }

  async setupUI() {
    const sources = await this.fontController.getSources();
    const fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(
      this.fontController.axes.axes
    );

    const container = html.div({
      style: "display: grid; gap: 0.5em;",
    });

    for (const identifier of sortedSourceIdentifiers(sources, fontAxesSourceSpace)) {
      container.appendChild(
        new SourceBox(
          fontAxesSourceSpace,
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
    const newSource = await this._sourcePropertiesRunDialog();
    if (!newSource) {
      return;
    }

    const undoLabel = `add source '${newSource.name}'`;
    const sourceIdentifier = newSource.name;
    // TODO: Maybe use proper sourceIdentifier, not source name
    const root = { sources: this.fontController.sources };
    const changes = recordChanges(root, (root) => {
      root.sources[sourceIdentifier] = newSource;
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  async _sourcePropertiesRunDialog() {
    const sources = await this.fontController.getSources();
    const locationAxes = this.fontController.axes.axes;
    const validateInput = () => {
      const warnings = [];
      const editedSourceName = nameController.model.sourceName;
      if (!editedSourceName.length || !editedSourceName.trim()) {
        warnings.push("⚠️ The source name must not be empty");
      }
      if (
        Object.keys(sources)
          .map((sourceIdentifier) => {
            if (sources[sourceIdentifier].name === editedSourceName.trim()) {
              return true;
            }
          })
          .includes(true)
      ) {
        warnings.push("⚠️ The source name should be unique");
      }
      const locStr = locationToString(
        makeSparseLocation(locationController.model, locationAxes)
      );
      if (sourceLocations.has(locStr)) {
        warnings.push("⚠️ The source location must be unique");
      }
      warningElement.innerText = warnings.length ? warnings.join("\n") : "";
      dialog.defaultButton.classList.toggle("disabled", warnings.length);
    };

    const nameController = new ObservableController({
      sourceName: this.getSourceName(sources),
    });

    nameController.addKeyListener("sourceName", (event) => {
      validateInput();
    });

    const sourceLocations = new Set(
      Object.keys(sources).map((sourceIdentifier) => {
        return locationToString(
          makeSparseLocation(sources[sourceIdentifier].location, locationAxes)
        );
      })
    );

    const locationController = new ObservableController({});
    locationController.addListener((event) => {
      validateInput();
    });

    const { contentElement, warningElement } = this._sourcePropertiesContentElement(
      locationAxes,
      nameController,
      locationController
    );

    const disable = nameController.model.sourceName ? false : true;

    const dialog = await dialogSetup("Add font source", null, [
      { title: "Cancel", isCancelButton: true },
      { title: "Add", isDefaultButton: true, disabled: disable },
    ]);
    dialog.setContent(contentElement);

    setTimeout(
      () => contentElement.querySelector("#font-source-name-text-input")?.focus(),
      0
    );

    validateInput();

    if (!(await dialog.run())) {
      // User cancelled
      return;
    }

    let newLocation = makeSparseLocation(locationController.model, locationAxes);
    for (const axis of locationAxes) {
      if (!(axis.name in newLocation)) {
        newLocation[axis.name] = axis.defaultValue;
      }
    }

    const interpolatedSource = getInterpolatedSourceData(
      this.fontController,
      newLocation
    );

    const newSource = {
      name: nameController.model.sourceName.trim(),
      location: newLocation,
    };

    if (interpolatedSource.verticalMetrics) {
      newSource.verticalMetrics = getVerticalMetricsRounded(
        interpolatedSource.verticalMetrics
      );
    }

    return {
      verticalMetrics: getDefaultVerticalMetrics(this.fontController.unitsPerEm),
      ...interpolatedSource,
      ...newSource,
    };
  }

  getSourceName(sources) {
    const sourceNames = Object.keys(sources).map((sourceIdentifier) => {
      return sources[sourceIdentifier].name;
    });
    let sourceName = "Untitled source";
    let i = 1;
    while (sourceNames.includes(sourceName)) {
      sourceName = `Untitled source ${i}`;
      i++;
    }
    return sourceName;
  }

  _sourcePropertiesContentElement(locationAxes, nameController, locationController) {
    const locationElement = html.createDomElement("designspace-location", {
      style: `grid-column: 1 / -1;
        min-height: 0;
        overflow: auto;
        height: 100%;
      `,
    });
    locationElement.axes = locationAxes;
    locationElement.controller = locationController;

    const containerContent = [
      ...labeledTextInput("Source name:", nameController, "sourceName", {}),
      html.br(),
      locationElement,
    ];

    const warningElement = html.div({
      id: "warning-text",
      style: `grid-column: 1 / -1; min-height: 1.5em;`,
    });
    containerContent.push(warningElement);

    const contentElement = html.div(
      {
        style: `overflow: hidden;
          white-space: nowrap;
          display: grid;
          gap: 0.5em;
          grid-template-columns: max-content auto;
          align-items: center;
          height: 100%;
          min-height: 0;
        `,
      },
      containerContent
    );

    return { contentElement, warningElement };
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
  grid-template-columns: max-content max-content max-content max-content auto;
  grid-row-gap: 0.1em;
  grid-column-gap: 1em;
}

.fontra-ui-font-info-sources-panel-column {
  display: grid;
  grid-template-columns: minmax(4.5em, max-content) max-content;
  gap: 0.5em;
  align-items: start;
  align-content: start;
  overflow: scroll;
}

fontra-ui-font-info-sources-panel-source-box.min-height,
.fontra-ui-font-info-sources-panel-column.min-height {
  height: 45px;
}

.fontra-ui-font-info-sources-panel-vertical-metrics {
  grid-template-columns: minmax(4.5em, max-content) 4em 4em;
}

.fontra-ui-font-info-sources-panel-header {
  font-weight: bold;
}

.fontra-ui-font-info-sources-panel-icon {
  justify-self: end;
  align-self: start;
}

.fontra-ui-font-info-sources-panel-icon.open-close-icon {
  height: 1.5em;
  width: 1.5em;
  transition: 120ms;
}

.fontra-ui-font-info-sources-panel-icon.open-close-icon.item-closed {
  transform: rotate(180deg);
}

`);

class SourceBox extends HTMLElement {
  constructor(fontAxesSourceSpace, sources, sourceIdentifier, postChange, setupUI) {
    super();
    this.classList.add("fontra-ui-font-info-sources-panel-source-box");
    this.fontAxesSourceSpace = fontAxesSourceSpace;
    this.sources = sources;
    this.sourceIdentifier = sourceIdentifier;
    this.postChange = postChange;
    this.setupUI = setupUI;
    this.controllers = {};
    this.models = this._getModels();
    this._updateContents();
  }

  get source() {
    return this.sources[this.sourceIdentifier];
  }

  _getModels() {
    const source = this.source;
    return {
      general: {
        name: source.name,
        italicAngle: source.italicAngle ? source.italicAngle : 0,
        //isSparse: source.isSparse ? source.isSparse : false,
      },
      location: { ...source.location },
      verticalMetrics: prepareVerticalMetricsForController(source.verticalMetrics),
      // TODO: hhea, OS/2 verticalMetrics, etc
      // customData: { ...source.customData },
    };
    // NOTE: Font guidelines could be read/write here,
    // but makes more sense directly in the glyph editing window.
  }

  checkSourceLocation(axisName, value) {
    const newLocation = { ...this.source.location, [axisName]: value };
    return this.checkSourceEntry("location", undefined, newLocation);
  }

  checkSourceEntry(key, valueKey = undefined, value) {
    let errorMessage = "";
    for (const sourceIdentifier in this.sources) {
      if (sourceIdentifier == this.sourceIdentifier) {
        // skip the current source
        continue;
      }
      const source = this.sources[sourceIdentifier];

      let existsAlready = false;
      let sourceValue;

      if (valueKey == undefined) {
        if (key == "location") {
          sourceValue = locationToString(source[key]);
          value = locationToString(value);
        } else {
          sourceValue = source[key];
        }
      } else {
        sourceValue = source[key][valueKey];
      }

      if (sourceValue == value) {
        existsAlready = true;
      }

      if (existsAlready) {
        errorMessage = `${key}${valueKey ? " " + valueKey : ""}: “${value}”
          exists already, please use a different value.`;
        break;
      }
    }

    if (errorMessage) {
      message(`Can’t edit font source`, errorMessage);
      this.setupUI();
      return false;
    }
    return true;
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

  deleteSource() {
    const undoLabel = `delete source '${this.source.name}'`;
    const root = { sources: this.sources };
    const changes = recordChanges(root, (root) => {
      delete root.sources[this.sourceIdentifier];
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  toggleShowHide() {
    const element = this.querySelector("#open-close-icon");
    element.classList.toggle("item-closed");

    for (const child of this.children) {
      child.classList.toggle("min-height");
    }
  }

  _updateContents() {
    const models = this.models;

    // create controllers
    for (const key in models) {
      this.controllers[key] = new ObservableController(models[key]);
    }

    // create listeners
    this.controllers.general.addListener((event) => {
      if (event.key == "name") {
        if (!this.checkSourceEntry("name", undefined, event.newValue.trim())) {
          return;
        }
      }
      this.editSource((source) => {
        if (typeof event.newValue == "string") {
          source[event.key] = event.newValue.trim();
        } else {
          source[event.key] = event.newValue;
        }
      }, `edit source general ${event.key}`);
    });

    this.controllers.location.addListener((event) => {
      if (!this.checkSourceLocation(event.key, event.newValue)) {
        return;
      }
      this.editSource((source) => {
        source.location[event.key] = event.newValue;
      }, `edit source location ${event.key}`);
    });

    this.controllers.verticalMetrics.addListener((event) => {
      this.editSource((source) => {
        if (event.key.startsWith("value-")) {
          source.verticalMetrics[event.key.slice(6)].value = event.newValue;
        } else {
          source.verticalMetrics[event.key.slice(5)].zone = event.newValue;
        }
      }, `edit source vertical metrics ${event.key}`);
    });

    this.innerHTML = "";
    this.append(
      html.createDomElement("icon-button", {
        class: "fontra-ui-font-info-sources-panel-icon open-close-icon item-closed",
        id: "open-close-icon",
        src: "/tabler-icons/chevron-up.svg",
        open: false,
        onclick: (event) => this.toggleShowHide(),
      })
    );

    for (const key in models) {
      this.append(
        html.div({ class: "fontra-ui-font-info-sources-panel-header" }, [
          getLabelFromKey(key),
        ])
      );
    }

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-font-info-sources-panel-icon",
        "src": "/tabler-icons/trash.svg",
        "onclick": (event) => this.deleteSource(),
        "data-tooltip": "Delete source",
        "data-tooltipposition": "left",
      })
    );

    this.append(html.div()); // empty cell for grid with arrow

    this.append(buildElement(this.controllers.general));
    this.append(
      buildElementLocations(this.controllers.location, this.fontAxesSourceSpace)
    );
    this.append(buildElementVerticalMetrics(this.controllers.verticalMetrics));
  }
}

customElements.define("source-box", SourceBox);

function sortedSourceIdentifiers(sources, fontAxes) {
  const sortFunc = (identifierA, identifierB) => {
    for (const axis of fontAxes) {
      const valueA = sources[identifierA].location[axis.name];
      const valueB = sources[identifierB].location[axis.name];
      if (valueA === valueB) {
        continue;
      }
      return valueA < valueB ? -1 : 0;
    }
    return 0;
  };
  return Object.keys(sources).sort(sortFunc);
}

function buildElement(controller) {
  let items = [];
  for (const key in controller.model) {
    items.push([getLabelFromKey(key), key, controller.model[key]]);
  }

  return html.div(
    { class: "fontra-ui-font-info-sources-panel-column min-height" },
    items
      .map(([labelName, keyName, value]) => {
        if (typeof value === "boolean") {
          return [html.div(), labeledCheckbox(labelName, controller, keyName, {})];
        } else {
          return labeledTextInput(labelName, controller, keyName, {
            continuous: false,
          });
        }
      })
      .flat()
  );
}

function buildElementVerticalMetrics(controller) {
  let items = [];
  for (const key of Object.keys(verticalMetricsDefaults)) {
    if (`value-${key}` in controller.model) {
      items.push([getLabelFromKey(key), key]);
    }
  }
  // TODO: Custom vertical metrics

  return html.div(
    {
      class:
        "fontra-ui-font-info-sources-panel-column min-height fontra-ui-font-info-sources-panel-vertical-metrics",
    },
    items
      .map(([labelName, keyName]) => {
        const opts = { continuous: false, formatter: OptionalNumberFormatter };
        const valueInput = textInput(controller, `value-${keyName}`, opts);
        const zoneInput = textInput(controller, `zone-${keyName}`, opts);
        return [labelForElement(labelName, valueInput), valueInput, zoneInput];
      })
      .flat()
  );
}

function buildElementLocations(controller, fontAxes) {
  const locationElement = html.createDomElement("designspace-location", {
    continuous: false,
    class: `fontra-ui-font-info-sources-panel-column min-height`,
  });
  locationElement.axes = fontAxes;
  locationElement.controller = controller;
  return locationElement;
}

function getInterpolatedSourceData(fontController, newLocation) {
  const fontSourceInstance =
    fontController.fontSourcesInstancer.instantiate(newLocation);
  if (!fontSourceInstance) {
    // This happens if there is no source specified, yet.
    return {};
  }
  // TODO: figure out how to handle this case,
  // because it should not happen, but it does.
  // if (!fontSourceInstance.name) {
  //   throw new Error(`assert -- interpolated font source name is NULL.`);
  // }

  // TODO: ensure that instancer returns a copy of the source
  return JSON.parse(JSON.stringify(fontSourceInstance));
}

const verticalMetricsDefaults = {
  ascender: { value: 0.8, zone: 0.016 },
  capHeight: { value: 0.75, zone: 0.016 },
  xHeight: { value: 0.5, zone: 0.016 },
  baseline: { value: 0, zone: -0.016 },
  descender: { value: -0.25, zone: -0.016 },
};

function getDefaultVerticalMetrics(unitsPerEm) {
  const defaultVerticalMetrics = {};
  for (const [name, defaultFactor] of Object.entries(verticalMetricsDefaults)) {
    const value = Math.round(defaultFactor.value * unitsPerEm);
    const zone = Math.round(defaultFactor.zone * unitsPerEm);
    defaultVerticalMetrics[name] = { value: value, zone: zone };
  }
  return defaultVerticalMetrics;
}

function prepareVerticalMetricsForController(verticalMetrics) {
  const newVerticalMetrics = {};
  for (const key in verticalMetrics) {
    newVerticalMetrics[`value-${key}`] = verticalMetrics[key].value;
    newVerticalMetrics[`zone-${key}`] = verticalMetrics[key].zone | 0;
  }
  return newVerticalMetrics;
}

function getVerticalMetricsRounded(verticalMetrics) {
  const newVerticalMetrics = {};
  for (const key in verticalMetrics) {
    newVerticalMetrics[key] = {
      value: round(verticalMetrics[key].value, 2),
      zone: round(verticalMetrics[key].zone, 2) | 0,
    };
  }
  return newVerticalMetrics;
}

function getLabelFromKey(key) {
  // TODO: this may use translate in future
  const keyMap = {
    name: "font.source.name",
    italicAngle: "font.source.italicAngle",
    isSparse: "font.source.isSparse",
    ascender: "font.source.ascender",
    capHeight: "font.source.capHeight",
    xHeight: "font.source.xHeight",
    baseline: "font.source.baseline",
    descender: "font.source.descender",
    general: "font.source.general",
    location: "font.source.location",
    verticalMetrics: "font.source.verticalMetrics",
  };
  return translate(keyMap[key]) || key;
}
