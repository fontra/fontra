import { recordChanges } from "@fontra/core/change-recorder.js";
import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { ObservableController } from "@fontra/core/observable-object.js";
import {
  labeledCheckbox,
  labeledTextInput,
  setupSortableList,
} from "@fontra/core/ui-utils.js";
import { enumerate, range } from "@fontra/core/utils.js";
import { mapAxesFromUserSpaceToSourceSpace } from "@fontra/core/var-model.js";
import "@fontra/web-components/add-remove-buttons.js";
import "@fontra/web-components/designspace-location.js";
import { BaseInfoPanel } from "./panel-base.js";

const cardsInfos = {};

export class CrossAxisMappingPanel extends BaseInfoPanel {
  static title = "cross-axis-mapping.title";
  static id = "cross-axis-mapping-panel";
  static fontAttributes = ["axes"];

  initializePanel() {
    super.initializePanel();
    this.fontController.addChangeListener(
      { axes: null },
      (change, isExternalChange) => {
        if (isExternalChange) {
          this.setupUI();
          this.undoStack.clear();
        }
      },
      false
    );
  }

  async setupUI() {
    const mappings = this.fontController.axes.mappings;

    this.fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(
      this.fontController.axes.axes
    );

    const container = html.div({
      style: "display: grid; gap: 0.5em;",
    });

    for (const index of range(mappings.length)) {
      if (!cardsInfos[index]) {
        cardsInfos[index] = {};
      }
      container.appendChild(
        new CrossAxisMappingBox(
          this.fontController,
          this.fontAxesSourceSpace,
          mappings,
          index,
          this.postChange.bind(this),
          this.setupUI.bind(this)
        )
      );
    }

    setupSortableList(container);

    container.addEventListener("reordered", (event) => {
      const reordered = [];
      for (const [index, crossAxisMappingBox] of enumerate(container.children)) {
        reordered.push(crossAxisMappingBox.mapping);
        crossAxisMappingBox.mappingIndex = index;
      }
      const undoLabel = translate("cross-axis-mapping.undo.reorder");
      this.replaceMappings(reordered, undoLabel);
    });

    this.panelElement.innerHTML = "";
    this.panelElement.style = `
    gap: 1em;
    `;
    this.panelElement.appendChild(
      html.input({
        type: "button",
        class: "fontra-button",
        style: `justify-self: start;`,
        value: translate("cross-axis-mapping.new"),
        onclick: (event) => this.newCrossAxisMapping(),
      })
    );
    this.panelElement.appendChild(container);
    this.panelElement.focus();
  }

  async newCrossAxisMapping() {
    //new empty mapping
    const newMapping = {
      inputLocation: {},
      outputLocation: {},
    };

    const undoLabel = translate("cross-axis-mapping.undo.add");

    const root = { axes: this.fontController.axes };
    const changes = recordChanges(root, (root) => {
      root.axes.mappings.push(newMapping);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  async replaceMappings(updatedMappings, undoLabel) {
    const root = { axes: this.fontController.axes };
    const changes = recordChanges(root, (root) => {
      root.axes.mappings.splice(0, root.axes.mappings.length, ...updatedMappings);
    });
    await this.postChange(changes.change, changes.rollbackChange, undoLabel);
  }
}

addStyleSheet(`
.fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
  cursor: pointer;
  display: grid;
  grid-template-rows: auto auto;
  grid-template-columns: max-content max-content minmax(17em, 25em) 1.5em minmax(17em, 25em) 1.5em auto;
  grid-row-gap: 0.1em;
  grid-column-gap: 1em;
}

.fontra-ui-font-info-cross-axis-mapping-panel-group {
  display: grid;
  grid-template-columns: min-content auto;
  gap: 0.5em;
  grid-column-start: 3;
  grid-column-end: 5;
  align-items: center;
}

.fontra-ui-font-info-cross-axis-mapping-panel-description {
  display: grid;
  grid-template-columns: min-content auto;
  gap: 0.5em;
  grid-column-start: 5;
  grid-column-end: 7;
  align-items: center;
}

.fontra-ui-font-info-cross-axis-mapping-panel-header {
  font-weight: bold;
  padding-top: 0.5em;
  padding-bottom: 0.5em;
}

.fontra-ui-font-info-cross-axis-mapping-panel-location{
  margin-right: -0.5em;
}

.fontra-ui-font-info-cross-axis-mapping-panel-location-label {
  text-align: right;
}

.fontra-ui-font-info-cross-axis-mapping-panel-empty.min-height,
.fontra-ui-font-info-cross-axis-mapping-panel-location.min-height,
.fontra-ui-font-info-cross-axis-mapping-panel-checkboxes.min-height,
.fontra-ui-font-info-cross-axis-mapping-panel-header.min-height,
.fontra-ui-font-info-cross-axis-mapping-panel-location-label.min-height {
  overflow: hidden;
  height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.fontra-ui-font-info-cross-axis-mapping-panel-icon {
  justify-self: end;
  align-self: start;
}

.fontra-ui-font-info-cross-axis-mapping-panel-icon.open-close-icon {
  height: 1.5em;
  width: 1.5em;
  transition: 120ms;
}

.fontra-ui-font-info-cross-axis-mapping-panel-icon.open-close-icon.item-closed {
  transform: rotate(180deg);
}

.fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box.item-closed {
  grid-row-gap: 0em;
}

`);

class CrossAxisMappingBox extends HTMLElement {
  constructor(
    fontController,
    fontAxesSourceSpace,
    mappings,
    mappingIndex,
    postChange,
    setupUI
  ) {
    super();
    this.classList.add(
      "fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box"
    );
    this.draggable = true;
    this.fontController = fontController;
    this.fontAxesSourceSpace = fontAxesSourceSpace;
    this.mappings = mappings;
    this.mapping = mappings[mappingIndex];
    this.mappingIndex = mappingIndex;
    this.postChange = postChange;
    this.setupUI = setupUI;
    this.controllers = {};
    this.models = this._getModels();
    this._updateContents();
  }

  _getModels() {
    const mapping = this.mapping;

    //add checkboxes for each axis
    const inputLocationCheckboxes = {};
    const outputLocationCheckboxes = {};

    for (const axis of this.fontAxesSourceSpace) {
      inputLocationCheckboxes[axis.name] = mapping.inputLocation.hasOwnProperty(
        axis.name
      );
      outputLocationCheckboxes[axis.name] = mapping.outputLocation.hasOwnProperty(
        axis.name
      );
    }

    const model = {
      groupDescription: { groupDescription: mapping.groupDescription || "" },
      description: { description: mapping.description || "" },
      inputLocation: { ...mapping.inputLocation },
      inputLocationCheckboxes: { ...inputLocationCheckboxes },
      outputLocation: { ...mapping.outputLocation },
      outputLocationCheckboxes: { ...outputLocationCheckboxes },
    };

    return model;
  }

  editCrossAxisMapping(editFunc, undoLabel) {
    const root = { axes: this.fontController.axes };
    const changes = recordChanges(root, (root) => {
      editFunc(root.axes.mappings[this.mappingIndex]);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
    }
  }

  deleteCrossAxisMapping() {
    const undoLabel = translate("cross-axis-mapping.undo.delete");
    const root = { axes: this.fontController.axes };
    const changes = recordChanges(root, (root) => {
      root.axes.mappings.splice(this.mappingIndex, 1);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  toggleShowHide(altKey) {
    const cardElements = !altKey
      ? [this]
      : document.querySelectorAll(
          ".fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box"
        );

    const thisIconElement = this.querySelector("#open-close-icon");
    const isClosed = thisIconElement.classList.contains("item-closed");

    for (const cardElement of cardElements) {
      const elementIcon = cardElement.querySelector("#open-close-icon");
      if (isClosed) {
        cardsInfos[cardElement.mappingIndex].isClosed = false;
        cardElement.classList.remove("item-closed");
        elementIcon.classList.remove("item-closed");
        for (const child of cardElement.children) {
          child.classList.remove("min-height");
        }
      } else {
        cardsInfos[cardElement.mappingIndex].isClosed = true;
        cardElement.classList.add("item-closed");
        elementIcon.classList.add("item-closed");
        for (const child of cardElement.children) {
          child.classList.add("min-height");
        }
      }
    }
  }

  _updateContents() {
    const models = this.models;

    // create controllers
    for (const key in models) {
      this.controllers[key] = new ObservableController(models[key]);
    }

    // create listeners
    this.controllers.groupDescription.addListener((event) => {
      this.editCrossAxisMapping((mapping) => {
        mapping[event.key] = event.newValue.trim();
      }, `edit groupDescription ${event.key}`);
    });

    this.controllers.description.addListener((event) => {
      this.editCrossAxisMapping((mapping) => {
        mapping[event.key] = event.newValue.trim();
      }, `edit description ${event.key}`);
    });

    for (const prop of ["input", "output"]) {
      const locationController = this.controllers[`${prop}Location`];
      const checkboxController = this.controllers[`${prop}LocationCheckboxes`];

      locationController.addListener((event) => {
        this.editCrossAxisMapping((mapping) => {
          mapping[`${prop}Location`][event.key] = event.newValue;
          checkboxController.setItem(event.key, true, { sentBySlider: true });
        }, `edit ${prop} location ${event.key}`);
      });

      checkboxController.addListener((event) => {
        if (event.senderInfo?.sentBySlider) {
          document.getElementById(
            `${this.mappingIndex}-${event.key}-${prop}Checkbox`
          ).checked = true;
          return;
        }
        this.editCrossAxisMapping((mapping) => {
          const defaultValue = this.fontAxesSourceSpace.find(
            (axis) => axis.name === event.key
          ).defaultValue;
          if (!event.newValue) {
            delete mapping[`${prop}Location`][event.key];
            document.getElementById(`${this.mappingIndex}-${event.key}-${prop}`).value =
              defaultValue;
          } else {
            mapping[`${prop}Location`][event.key] = defaultValue;
          }
        }, `edit ${prop} location ${event.key}`); // TODO: translation
      });
    }

    this.innerHTML = "";
    // Row 1 Icons and Descriptions
    this.append(
      html.createDomElement("icon-button", {
        class: "fontra-ui-font-info-cross-axis-mapping-panel-icon open-close-icon",
        id: "open-close-icon",
        src: "/tabler-icons/chevron-up.svg",
        open: false,
        onclick: (event) => this.toggleShowHide(event.altKey),
      })
    );
    this.append(html.div()); // empty cell for grid
    this.append(
      html.div(
        { class: "fontra-ui-font-info-cross-axis-mapping-panel-group" },
        labeledTextInput(
          translate("cross-axis-mapping.groupDescription"),
          this.controllers.groupDescription,
          "groupDescription",
          { continuous: false }
        )
      )
    );
    this.append(
      html.div(
        { class: "fontra-ui-font-info-cross-axis-mapping-panel-description" },
        labeledTextInput(
          translate("cross-axis-mapping.description"),
          this.controllers.description,
          "description",
          { continuous: false }
        )
      )
    );
    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-font-info-cross-axis-mapping-panel-icon",
        "src": "/tabler-icons/trash.svg",
        "onclick": (event) => this.deleteCrossAxisMapping(),
        "data-tooltip": translate("cross-axis-mapping.delete"),
        "data-tooltipposition": "left",
      })
    );

    const inputHeaderElement = html.div(
      {
        class: "fontra-ui-font-info-cross-axis-mapping-panel-header",
      },
      [translate("cross-axis-mapping.header.inputLocation")]
    );

    const outputHeaderElement = html.div(
      {
        class: "fontra-ui-font-info-cross-axis-mapping-panel-header",
      },
      [translate("cross-axis-mapping.header.outputLocation")]
    );

    // Row 2 Locations headlines
    this.append(
      html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-empty" })
    );
    this.append(
      html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-empty" })
    );
    this.append(inputHeaderElement);
    this.append(
      html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-empty" })
    );
    this.append(outputHeaderElement);
    this.append(
      html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-empty" })
    );
    this.append(
      html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-empty" })
    );

    // Other rows: axis for input and output
    for (const axis of this.fontAxesSourceSpace) {
      this.append(
        html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-empty" })
      );
      this.append(buildElementLocationsLabel(axis));
      this.append(
        buildElementLocations(
          axis,
          this.controllers.inputLocation,
          `${this.mappingIndex}-${axis.name}-input`
        )
      );
      this.append(
        buildElementLocationsCheckboxes(
          axis,
          this.controllers.inputLocationCheckboxes,
          `${this.mappingIndex}-${axis.name}-inputCheckbox`
        )
      );
      this.append(
        buildElementLocations(
          axis,
          this.controllers.outputLocation,
          `${this.mappingIndex}-${axis.name}-output`
        )
      );
      this.append(
        buildElementLocationsCheckboxes(
          axis,
          this.controllers.outputLocationCheckboxes,
          `${this.mappingIndex}-${axis.name}-outputCheckbox`
        )
      );
      this.append(
        html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-empty" })
      );
    }

    const isClosed = !!cardsInfos[this.mappingIndex].isClosed;
    if (isClosed) {
      this.toggleShowHide(false);
    }
  }
}

customElements.define("cross-axis-mapping-box", CrossAxisMappingBox);

function _createSlider(controller, axis, modelValue, continuous = false) {
  const parms = {
    defaultValue: axis.defaultValue,
    value: modelValue !== undefined ? modelValue : axis.defaultValue,
    onChangeCallback: (event) => {
      if (continuous || !event.isDragging) {
        controller.setItem(axis.name, event.value);
      }
    },
  };
  if (axis.values) {
    // Discrete axis
    parms.values = axis.values;
  } else {
    // Continuous axis
    parms.minValue = axis.minValue;
    parms.maxValue = axis.maxValue;
  }
  return html.createDomElement("range-slider", parms);
}

function buildElementLocations(axis, controller, sliderId) {
  const slider = _createSlider(controller, axis, controller.model[axis.name]);
  slider.className = "fontra-ui-font-info-cross-axis-mapping-panel-location";
  slider.id = sliderId;
  return slider;
}

function buildElementLocationsLabel(axis) {
  return html.label(
    { class: "fontra-ui-font-info-cross-axis-mapping-panel-location-label" },
    [axis.name]
  );
}

function buildElementLocationsCheckboxes(axis, controller, checkboxId) {
  const element = labeledCheckbox(null, controller, axis.name);
  element.className = "fontra-ui-font-info-cross-axis-mapping-panel-checkboxes";
  element.setAttribute(
    "data-tooltip",
    translate("cross-axis-mapping.axis-participates")
  );
  element.setAttribute("data-tooltipposition", "right");
  element.firstChild.id = checkboxId;
  return element;
}
