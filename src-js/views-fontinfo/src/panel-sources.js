import {
  doPerformAction,
  getActionIdentifierFromKeyEvent,
} from "@fontra/core/actions.js";
import { recordChanges } from "@fontra/core/change-recorder.js";
import { joinChanges, wildcard } from "@fontra/core/changes.js";
import { ensureDenseSource } from "@fontra/core/font-controller.js";
import { openTypeSettingsFontSourcesLevel } from "@fontra/core/font-info-data.js";
import { NumberFormatter, OptionalNumberFormatter } from "@fontra/core/formatters.js";
import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { ObservableController } from "@fontra/core/observable-object.js";
import {
  labelForElement,
  labeledCheckbox,
  labeledTextInput,
  textInput,
} from "@fontra/core/ui-utils.js";
import {
  arrowKeyDeltas,
  deepCopyObject,
  modulo,
  range,
  round,
  sleepAsync,
} from "@fontra/core/utils.js";
import {
  locationToString,
  makeSparseLocation,
  mapAxesFromUserSpaceToSourceSpace,
} from "@fontra/core/var-model.js";
import "@fontra/web-components/add-remove-buttons.js";
import "@fontra/web-components/custom-data-list.js";
import { CustomDataList } from "@fontra/web-components/custom-data-list.js";
import "@fontra/web-components/designspace-location.js";
import { dialogSetup, message } from "@fontra/web-components/modal-dialog.js";
import { Accordion } from "@fontra/web-components/ui-accordion.js";
import { UIList } from "@fontra/web-components/ui-list.js";
import { updateRemoveButton } from "./panel-axes.js";
import { BaseInfoPanel } from "./panel-base.js";

addStyleSheet(`
.font-sources-container {
  display: grid;
  grid-template-columns: auto 1fr;
  overflow: hidden;
}

#font-sources-container-names,
#font-sources-container-source-content {
  display: grid;
  align-content: start;
  gap: 0.5em;
  overflow: scroll;
}

.font-sources-container-wrapper {
  display: grid;
  align-content: start;
  gap: 0.5em;
  overflow: hidden;
}

#sources-panel {
  height: 100%;
}

.fontra-ui-font-info-sources-panel-source-name-box {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
  cursor: pointer;
  display: grid;
  grid-template-columns: max-content auto;
  grid-column-gap: 1em;
}

.fontra-ui-font-info-sources-panel-source-name-box.default {
  font-weight: bold;
}

.fontra-ui-font-info-sources-panel-source-name-box.selected {
  background-color: var(--horizontal-rule-color);
}
`);

export class SourcesPanel extends BaseInfoPanel {
  static title = "sources.title";
  static id = "sources-panel";
  static fontAttributes = ["axes", "sources"];

  initializePanel() {
    super.initializePanel();
    this.selectedSourceIdentifier = this.fontController.defaultSourceIdentifier;
    this.fontController.addChangeListener(
      { axes: null },
      (change, isExternalChange) => {
        this.setupUI();
        this.undoStack.clear();
      },
      false
    );

    this.fontController.addChangeListener(
      { sources: { [wildcard]: { name: null } } },
      (change, isExternalChange) => this._setupSourceNames(),
      false
    );
  }

  async setupUI() {
    this.fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(
      this.fontController.axes.axes
    );

    this.panelElement.innerHTML = "";

    const container = html.div({
      class: "font-sources-container",
    });

    const containerSourcesNames = html.div({
      id: "font-sources-container-names",
    });
    const containerSourcesNamesWrapper = html.div(
      {
        class: "font-sources-container-wrapper",
      },
      [containerSourcesNames]
    );

    const containerSourceContent = html.div({
      id: "font-sources-container-source-content",
    });
    const containerSourceContentWrapper = html.div(
      {
        class: "font-sources-container-wrapper",
      },
      [containerSourceContent]
    );

    this.sortedSourceIdentifiers = this.fontController.getSortedSourceIdentifiers();

    const addRemoveSourceButtons = html.createDomElement("add-remove-buttons");
    addRemoveSourceButtons.addButtonCallback = (event) => {
      this.newSource();
    };
    addRemoveSourceButtons.removeButtonCallback = (event) => {
      this.deleteSource();
    };
    containerSourcesNamesWrapper.appendChild(addRemoveSourceButtons);

    container.appendChild(containerSourcesNamesWrapper);
    container.appendChild(containerSourceContentWrapper);
    this.panelElement.appendChild(container);
    this.panelElement.focus();

    await this._setupSourceNames();

    this.selectSource(this.selectedSourceIdentifier, true);
  }

  async _setupSourceNames() {
    const sources = await this.fontController.getSources();

    const containerSourcesNames = document.getElementById(
      "font-sources-container-names"
    );

    containerSourcesNames.innerHTML = "";

    for (const sourceIdentifier of this.sortedSourceIdentifiers) {
      const classes = ["fontra-ui-font-info-sources-panel-source-name-box"];
      if (sourceIdentifier === this.fontController.defaultSourceIdentifier) {
        classes.push("default");
      }
      if (sourceIdentifier === this.selectedSourceIdentifier) {
        classes.push("selected");
      }

      const sourceNameElement = html.div(
        {
          "class": classes.join(" "),
          "onclick": (event) => this.selectSource(sourceIdentifier),
          "data-sourceIdentifier": sourceIdentifier,
        },
        [sources[sourceIdentifier].name]
      );
      containerSourcesNames.appendChild(sourceNameElement);
    }
  }

  async selectSource(sourceIdentifier, forceUpdate = false) {
    const sources = await this.fontController.getSources();
    if (!sources.hasOwnProperty(sourceIdentifier)) {
      sourceIdentifier = undefined;
    }

    if (!forceUpdate && sourceIdentifier === this.selectedSourceIdentifier) {
      return;
    }

    for (const nameElement of document.querySelectorAll(
      ".fontra-ui-font-info-sources-panel-source-name-box"
    )) {
      const selected = nameElement.dataset.sourceIdentifier == sourceIdentifier;
      nameElement.classList.toggle("selected", selected);
      if (selected) {
        nameElement.scrollIntoView({
          behavior: "auto",
          block: "nearest",
          inline: "nearest",
        });
      }
    }
    this.selectedSourceIdentifier = sourceIdentifier;
    this._updateSourceBox();
  }

  async _updateSourceBox() {
    const containerSourceContent = document.getElementById(
      "font-sources-container-source-content"
    );
    containerSourceContent.innerHTML = "";
    if (!this.selectedSourceIdentifier) {
      return;
    }

    containerSourceContent.appendChild(
      new SourceBox(
        this,
        this.fontAxesSourceSpace,
        await this.fontController.getSources(),
        this.selectedSourceIdentifier,
        this.selectedSourceIdentifier === this.fontController.defaultSourceIdentifier
      )
    );
  }

  async deleteSource() {
    if (!this.selectedSourceIdentifier) {
      return;
    }
    const dialog = await dialogSetup(
      "Are you sure you want to delete the selected font source?", // TODO: translation
      "Deleting a font source may result in kerning being lost or glyphs to become invalid.", // TODO: translation
      [
        { title: translate("dialog.cancel"), isCancelButton: true },
        { title: translate("dialog.delete"), isDefaultButton: true, result: "ok" },
      ]
    );

    if (!(await dialog.run())) {
      return;
    }

    const undoLabel = translate(
      "sources.undo.delete",
      this.fontController.sources[this.selectedSourceIdentifier].name
    );
    const root = {
      sources: this.fontController.sources,
      kerning: await this.fontController.getKerning(),
    };

    // First, delete kerning source
    const kerningChanges = await deleteKerningSource(
      this.fontController,
      this.selectedSourceIdentifier
    );

    // Then delete font source
    const sourceChanges = recordChanges(root, (root) => {
      delete root.sources[this.selectedSourceIdentifier];
    });

    const allChanges = [...kerningChanges, sourceChanges];
    const finalChanges = allChanges[0].concat(...allChanges.slice(1));

    if (finalChanges.hasChange) {
      const deletedSourceIdentifier = this.selectedSourceIdentifier;
      await this.postChange(
        finalChanges.change,
        finalChanges.rollbackChange,
        undoLabel,
        {
          undoCallback: () => this.selectSource(deletedSourceIdentifier),
          redoCallback: () => this.selectSource(undefined),
        }
      );
      this.selectSource(undefined);
      await sleepAsync(0); // Breathe, so the font controller can purge some caches
      this.setupUI();
    }
  }

  async newSource() {
    const newSource = await this._sourcePropertiesRunDialog();
    if (!newSource) {
      return;
    }

    const undoLabel = `add source '${newSource.name}'`; // TODO: translation

    let sourceIdentifier;
    do {
      sourceIdentifier = crypto.randomUUID().slice(0, 8);
    } while (sourceIdentifier in this.fontController.sources);

    const finalChanges = joinChanges(
      ...(await insertInterpolatedKerningAndInsertSource(
        this.fontController,
        sourceIdentifier,
        newSource
      ))
    );

    if (finalChanges.hasChange) {
      const currentSelectedSourceIdentifier = this.selectedSourceIdentifier;
      await this.postChange(
        finalChanges.change,
        finalChanges.rollbackChange,
        undoLabel,
        {
          undoCallback: () => this.selectSource(currentSelectedSourceIdentifier),
          redoCallback: () => this.selectSource(sourceIdentifier),
        }
      );
      this.setupUI();
      await sleepAsync(0); // Breathe, so the font controller can purge some caches
      this.selectSource(sourceIdentifier);
    }
  }

  async _sourcePropertiesRunDialog() {
    const sources = await this.fontController.getSources();
    const locationAxes = this.fontAxesSourceSpace;
    const validateInput = () => {
      const warnings = [];
      const editedSourceName = nameController.model.sourceName;
      if (!editedSourceName.length || !editedSourceName.trim()) {
        warnings.push(`⚠️ ${translate("sources.warning.empty-source-name")}`);
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
        warnings.push(`⚠️ ${translate("sources.warning.unique-source-name")}`);
      }
      const locStr = locationToString(
        makeSparseLocation(locationController.model, locationAxes)
      );
      if (sourceLocations.has(locStr)) {
        warnings.push(`⚠️ ${translate("sources.warning.unique-location")}`);
      }
      warningElement.innerText = warnings.length ? warnings.join("\n") : "";
      dialog.defaultButton.classList.toggle("disabled", warnings.length);
    };

    const nameController = new ObservableController({
      sourceName: makeUntitledSourceName(sources),
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

    const dialog = await dialogSetup(
      translate("sources.dialog.add-source.title"),
      null,
      [
        { title: translate("dialog.cancel"), isCancelButton: true },
        { title: translate("dialog.add"), isDefaultButton: true, disabled: disable },
      ]
    );
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

    if (interpolatedSource.lineMetricsHorizontalLayout) {
      newSource.lineMetricsHorizontalLayout = getLineMetricsRounded(
        interpolatedSource.lineMetricsHorizontalLayout
      );
    }

    return ensureDenseSource({
      lineMetricsHorizontalLayout: getDefaultLineMetricsHor(
        this.fontController.unitsPerEm
      ),
      ...interpolatedSource,
      ...newSource,
    });
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
      ...labeledTextInput(
        translate("sources.dialog.add-source.label.source-name"),
        nameController,
        "sourceName",
        {}
      ),
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

  handleKeyDown(event) {
    const actionIdentifier = getActionIdentifierFromKeyEvent(event);
    if (actionIdentifier) {
      event.preventDefault();
      event.stopImmediatePropagation();
      doPerformAction(actionIdentifier, event);
    } else if (event.key in arrowKeyDeltas) {
      this.handleArrowKeys(event);
    }
  }

  handleArrowKeys(event) {
    if (document.activeElement.id != "sources-panel") {
      // The focus is somewhere else, for example on an input element.
      // In this case arrow keys should be ignored.
      return;
    }
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) {
      // We currently don't support any actions for left or right arrow.
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();

    const sourcesLength = this.sortedSourceIdentifiers.length;
    const index = this.sortedSourceIdentifiers.indexOf(this.selectedSourceIdentifier);
    const selectPrevious = "ArrowUp" == event.key;
    const newIndex =
      index == -1
        ? selectPrevious
          ? sourcesLength - 1
          : 0
        : modulo(index + (selectPrevious ? -1 : 1), sourcesLength);

    this.selectSource(this.sortedSourceIdentifiers[newIndex]);
  }
}

function makeUntitledSourceName(sources) {
  const sourceNames = Object.keys(sources).map((sourceIdentifier) => {
    return sources[sourceIdentifier].name;
  });
  let sourceName = translate("sources.untitled-source");
  let i = 1;
  while (sourceNames.includes(sourceName)) {
    sourceName = `${translate("sources.untitled-source")} ${i}`;
    i++;
  }
  return sourceName;
}

addStyleSheet(`
.fontra-ui-font-info-sources-panel-source-box {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
  margin-left: 1em;
  height: fit-content;
}
`);

class SourceBox extends HTMLElement {
  constructor(sourcesPanel, fontAxesSourceSpace, sources, sourceIdentifier, isDefault) {
    super();
    this.sourcesPanel = sourcesPanel;
    this.classList.add("fontra-ui-font-info-sources-panel-source-box");
    this.fontAxesSourceSpace = fontAxesSourceSpace;
    this.sources = sources;
    this.sourceIdentifier = sourceIdentifier;
    this.isDefault = isDefault;
    this.controllers = {};
    this.customDataKeys = openTypeSettingsFontSourcesLevel.map((item) => item.key);
    this._updateContents();
  }

  get source() {
    return this.sources[this.sourceIdentifier];
  }

  get models() {
    const source = this.source;
    return {
      general: {
        name: source.name,
        italicAngle: source.italicAngle ? source.italicAngle : 0,
        isSparse: source.isSparse ? source.isSparse : false,
      },
      location: { ...source.location },
      lineMetricsHorizontalLayout: prepareLineMetricsHorForController(
        source.lineMetricsHorizontalLayout
      ),
      guidelines: { ...source.guidelines },
      customData: { ...source.customData },
    };
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
      let thisSourceValue = value;

      if (valueKey == undefined) {
        if (key == "location") {
          sourceValue = locationToString(source[key]);
          thisSourceValue = locationToString(value);
        } else {
          sourceValue = source[key];
        }
      } else {
        sourceValue = source[key][valueKey];
      }

      if (sourceValue == thisSourceValue) {
        existsAlready = true;
      }

      if (existsAlready) {
        const valueString = `${key}${
          valueKey ? " " + valueKey : ""
        }: “${thisSourceValue}”`;
        errorMessage = translate("warning.entry-exists", valueString);
        break;
      }
    }

    if (errorMessage) {
      message(translate("sources.dialog.cannot-edit-source.title"), errorMessage);
      return false;
    }
    return true;
  }

  editSource(editFunc, undoLabel, preChanges) {
    const root = { sources: this.sources };
    let changes = recordChanges(root, (root) => {
      editFunc(root.sources[this.sourceIdentifier]);
    });

    if (preChanges) {
      changes = preChanges.concat(changes);
    }

    if (changes.hasChange) {
      const sourcesPanel = this.sourcesPanel;
      const sourceIdentifier = this.sourceIdentifier;
      sourcesPanel.postChange(changes.change, changes.rollbackChange, undoLabel, {
        undoCallback: () => sourcesPanel.selectSource(sourceIdentifier),
        redoCallback: () => sourcesPanel.selectSource(sourceIdentifier),
      });
    }
  }

  async _updateContents() {
    const models = this.models;

    // create controllers
    for (const key in models) {
      this.controllers[key] = new ObservableController(models[key]);
    }

    // create listeners
    this.controllers.general.addListener(async (event) => {
      if (event.senderInfo?.noUpdate) {
        // We did this update ourselves
        return;
      }
      if (event.key == "name") {
        if (!this.checkSourceEntry("name", undefined, event.newValue.trim())) {
          this.controllers.general.model.name = this.source.name;
          return;
        }
      }

      let preChanges;
      if (event.key == "isSparse") {
        if (!(await this.askChangeIsSparseOkayCancel(event.newValue))) {
          // Revert the checkbox to the old state, but don't trigger an update
          this.controllers.general.setItem("isSparse", event.oldValue, {
            noUpdate: true,
          });
          return;
        }

        const fontController = this.sourcesPanel.fontController;
        if (event.newValue) {
          preChanges = await deleteKerningSource(fontController, this.sourceIdentifier);
        } else {
          preChanges = await insertInterpolatedKerningAndSourceInfo(
            fontController,
            this.sourceIdentifier,
            fontController.sources[this.sourceIdentifier].location
          );
        }
      }

      this.editSource(
        (source) => {
          if (typeof event.newValue == "string") {
            source[event.key] = event.newValue.trim();
          } else {
            source[event.key] = event.newValue;
          }
        },
        `edit ${event.key}`, // TODO: translation
        preChanges?.length ? joinChanges(...preChanges) : undefined
      );

      if (event.key == "isSparse") {
        this._updateContents();
      }
    });

    this.controllers.location.addListener((event) => {
      if (!this.checkSourceLocation(event.key, event.newValue)) {
        this.controllers.location.model[event.key] = this.source.location[event.key];
        return;
      }
      this.editSource((source) => {
        source.location[event.key] = event.newValue;
      }, `edit location (“${event.key}” axis)`); // TODO: translation
    });

    this.controllers.lineMetricsHorizontalLayout.addListener((event) => {
      const [which, lineMetricName] = event.key.split("-");
      this.editSource((source) => {
        if (which === "value") {
          source.lineMetricsHorizontalLayout[event.key.slice(6)].value = event.newValue;
        } else {
          source.lineMetricsHorizontalLayout[event.key.slice(5)].zone = event.newValue;
        }
      }, `edit line metric ${which} “${lineMetricName}”`); // TODO: translation
    });

    this.controllers.guidelines.addListener((event) => {
      this.editSource((source) => {
        source.guidelines = event.newValue;
      }, `edit guidelines`); // TODO: translation
    });

    this.controllers.customData.addListener((event) => {
      this.editSource((source) => {
        source.customData = {};
        for (const item of event.newValue) {
          source.customData[item["key"]] = item["value"];
        }
      }, `edit customData`); // TODO: translation
    });

    const accordion = new Accordion();
    accordion.appendStyle(`
.fontra-ui-font-info-sources-panel-column {
  display: grid;
  grid-template-columns: minmax(4.5em, max-content) minmax(max-content, 25em);
  gap: 0.5em;
  align-items: start;
  align-content: start;
  padding-bottom: 1em;
}

.fontra-ui-font-info-sources-panel-line-metrics-hor {
  grid-template-columns: minmax(4.5em, max-content) 4em 4em;
}

.fontra-ui-font-info-sources-panel-list-element {
  min-width: max-content;
  max-width: 29.5em; // 4.5 + 25
  max-height: 12em;
}

input {
  background-color: var(--text-input-background-color);
  color: var(--text-input-foreground-color);
  border-radius: 0.25em;
  border: none;
  outline: none;
  padding: 0.1em 0.3em;
  font-family: "fontra-ui-regular";
  font-size: 100%;
}

.ui-form-value input {
  width: min(100%, 9.5em);
  height: 1.6em;
}
    `);
    const accordionItems = [
      {
        label: getLabelFromKey("general"),
        id: "general",
        content: buildElement(this.controllers.general, this.isDefault),
        open: true,
      },
    ];

    // Don't add 'Location', if the font has no axes.
    if (this.fontAxesSourceSpace.length > 0) {
      accordionItems.push({
        label: getLabelFromKey("location"),
        id: "location",
        content: buildElementLocations(
          this.controllers.location,
          this.fontAxesSourceSpace
        ),
        open: true,
      });
    }

    // NOTE: Don't show 'Line Metrics' or 'Guidelines' for sparse sources.
    if (!this.source.isSparse) {
      const openTypeSettings = this.customDataKeys.map((customDataKey) => ({
        ...openTypeSettingsFontSourcesLevel[this.customDataKeys.indexOf(customDataKey)],
        getDefaultFunction: () =>
          openTypeSettingsFontSourcesLevel[
            this.customDataKeys.indexOf(customDataKey)
          ].getDefaultFunction(this.source),
      }));

      const customDataList = new CustomDataList(
        this.controllers.customData,
        openTypeSettings
      );
      accordionItems.push(
        {
          label: getLabelFromKey("lineMetricsHorizontalLayout"),
          id: "lineMetricsHorizontalLayout",
          content: buildElementLineMetricsHor(
            this.controllers.lineMetricsHorizontalLayout
          ),
          open: true,
        },
        {
          label: getLabelFromKey("guidelines"),
          id: "guidelines",
          content: buildFontGuidelineList(this.controllers.guidelines),
          open: Object.keys(this.source.guidelines).length > 0,
        },
        {
          label: getLabelFromKey("customData"),
          id: "customData",
          content: customDataList,
          open: Object.keys(this.source.customData).length > 0,
        }
      );
    }

    accordion.items = accordionItems;

    this.innerHTML = "";
    this.appendChild(accordion);
  }

  async askChangeIsSparseOkayCancel(onOff) {
    const message = onOff
      ? `This will delete any kerning for this source.`
      : `This will add interpolated kerning and line metrics for this source.`;

    const dialog = await dialogSetup(
      `Are you sure you want to turn the "Is Sparse" flag ${onOff ? "on" : "off"}?`,
      message,
      [
        { title: translate("dialog.cancel"), isCancelButton: true },
        { title: translate("dialog.okay"), isDefaultButton: true, result: "ok" },
      ]
    );

    return !!(await dialog.run());
  }
}

customElements.define("source-box", SourceBox);

function buildElement(controller, sourceIsDefault) {
  let items = [];
  for (const key in controller.model) {
    items.push([getLabelFromKey(key), key, controller.model[key]]);
  }

  return html.div(
    { class: "fontra-ui-font-info-sources-panel-column" },
    items
      .map(([labelName, keyName, value]) => {
        if (typeof value === "boolean") {
          const checkbox = labeledCheckbox(labelName, controller, keyName, {
            disabled: keyName === "isSparse" && sourceIsDefault,
          });
          return [html.div(), checkbox];
        } else if (typeof value === "number") {
          return labeledTextInput(labelName, controller, keyName, {
            continuous: false,
            type: "number",
            formatter: NumberFormatter,
          });
        } else {
          return labeledTextInput(labelName, controller, keyName, {
            continuous: false,
          });
        }
      })
      .flat()
  );
}

function buildElementLineMetricsHor(controller) {
  let items = [];
  for (const key of Object.keys(lineMetricsHorizontalLayoutDefaults)) {
    if (`value-${key}` in controller.model) {
      items.push([getLabelFromKey(key), key]);
    }
  }
  // TODO: Custom line metrics

  return html.div(
    {
      class:
        "fontra-ui-font-info-sources-panel-column fontra-ui-font-info-sources-panel-line-metrics-hor",
    },
    items
      .map(([labelName, keyName]) => {
        const opts = {
          continuous: false,
          formatter: OptionalNumberFormatter,
          type: "number",
        };
        const valueInput = textInput(controller, `value-${keyName}`, opts);
        const zoneInput = textInput(controller, `zone-${keyName}`, opts);
        return [labelForElement(labelName, valueInput), valueInput, zoneInput];
      })
      .flat()
  );
}

function buildFontGuidelineList(controller) {
  const model = controller.model;

  const makeItem = (label) => {
    const item = new ObservableController({ ...label });
    item.addListener((event) => {
      const newGuidelines = labelList.items.map((guideline) => {
        return { ...guideline };
      });
      model.guidelines = newGuidelines;
    });
    return item.model;
  };

  const items = Object.values(model)?.map(makeItem) || [];

  const labelList = new UIList();
  labelList.classList.add("fontra-ui-font-info-sources-panel-list-element");
  labelList.style = `min-width: 12em;`;
  labelList.columnDescriptions = [
    {
      key: "name",
      title: translate("guideline.labels.name"),
      width: "15em", // TODO: set to 11em once 'Locked' column is added
      editable: true,
      continuous: false,
    },
    {
      key: "x",
      title: "x",
      width: "4em",
      align: "right",
      editable: true,
      formatter: OptionalNumberFormatter,
      continuous: false,
    },
    {
      key: "y",
      title: "y",
      width: "4em",
      align: "right",
      editable: true,
      formatter: OptionalNumberFormatter,
      continuous: false,
    },
    {
      key: "angle",
      title: translate("guideline.labels.angle"),
      width: "4em",
      align: "right",
      editable: true,
      formatter: OptionalNumberFormatter,
      continuous: false,
    },
    // TODO: Font Guidelines
    // Once the guidelines can be edited in the editor view, we want to add these columns
    // {
    //   key: "dummy", // this is a spacer column
    //   title: " ",
    //   width: "0.25em",
    // },
    // {
    //   key: "locked",
    //   title: translate("guideline.labels.locked"),
    //   width: "4em",
    //   cellFactory: checkboxListCell,
    // },
  ];
  labelList.showHeader = true;
  labelList.minHeight = "5em";
  labelList.setItems(items);

  const deleteSelectedItem = () => {
    const index = labelList.getSelectedItemIndex();
    if (index === undefined) {
      return;
    }
    const items = [...labelList.items];
    items.splice(index, 1);
    labelList.setItems(items);
    const newGuidelines = items.map((guideline) => {
      return { ...guideline };
    });
    model.guidelines = newGuidelines;
  };

  labelList.addEventListener("deleteKey", deleteSelectedItem);

  const addRemoveButton = html.createDomElement("add-remove-buttons", {
    addButtonCallback: () => {
      const newItem = makeItem({
        name: `Guideline ${labelList.items.length + 1}`,
        x: 0,
        y: 0,
        angle: 0,
        locked: false,
      });
      const newItems = [...labelList.items, newItem];
      model.guidelines = newItems.map((label) => {
        return { ...label };
      });
      labelList.setItems(newItems);
      labelList.editCell(newItems.length - 1, "name");
    },
    removeButtonCallback: deleteSelectedItem,
    disableRemoveButton: true,
  });

  updateRemoveButton(labelList, addRemoveButton);

  return html.div({ style: "display: grid; grid-gap: 0.3em; padding-bottom: 1em;" }, [
    labelList,
    addRemoveButton,
  ]);
}

function buildElementLocations(controller, fontAxes) {
  const locationElement = html.createDomElement("designspace-location", {
    continuous: false,
    class: `fontra-ui-font-info-sources-panel-column`,
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
  return deepCopyObject(fontSourceInstance);
}

const lineMetricsHorizontalLayoutDefaults = {
  ascender: { value: 0.8, zone: 0.016 },
  capHeight: { value: 0.75, zone: 0.016 },
  xHeight: { value: 0.5, zone: 0.016 },
  baseline: { value: 0, zone: -0.016 },
  descender: { value: -0.25, zone: -0.016 },
};

function getDefaultLineMetricsHor(unitsPerEm) {
  const lineMetricsHorizontalLayout = {};
  for (const [name, defaultFactor] of Object.entries(
    lineMetricsHorizontalLayoutDefaults
  )) {
    const value = Math.round(defaultFactor.value * unitsPerEm);
    const zone = Math.round(defaultFactor.zone * unitsPerEm);
    lineMetricsHorizontalLayout[name] = { value: value, zone: zone };
  }
  return lineMetricsHorizontalLayout;
}

function prepareLineMetricsHorForController(lineMetricsHorizontalLayout) {
  const newLineMetricsHorizontalLayout = {};
  for (const key in lineMetricsHorizontalLayout) {
    newLineMetricsHorizontalLayout[`value-${key}`] =
      lineMetricsHorizontalLayout[key].value;
    newLineMetricsHorizontalLayout[`zone-${key}`] =
      lineMetricsHorizontalLayout[key].zone | 0;
  }
  return newLineMetricsHorizontalLayout;
}

function getLineMetricsRounded(lineMetrics) {
  const newLineMetrics = {};
  for (const key in lineMetrics) {
    newLineMetrics[key] = {
      value: round(lineMetrics[key].value, 2),
      zone: round(lineMetrics[key].zone, 2) || 0,
    };
  }
  return newLineMetrics;
}

function getLabelFromKey(key) {
  const keyLabelMap = {
    name: translate("sources.labels.name"),
    italicAngle: translate("sources.labels.italic-angle"),
    isSparse: translate("sources.labels.is-sparse"),
    ascender: translate("sources.labels.ascender"),
    capHeight: translate("sources.labels.cap-height"),
    xHeight: translate("sources.labels.x-height"),
    baseline: translate("sources.labels.baseline"),
    descender: translate("sources.labels.descender"),
    general: translate("sources.labels.general"),
    location: translate("sources.labels.location"),
    lineMetricsHorizontalLayout: translate("sources.labels.line-metrics"),
    guidelines: translate("sidebar.user-settings.guidelines"),
    customData: translate("OpenType settings"), // TODO: translation
  };
  return keyLabelMap[key] || key;
}

async function deleteKerningSource(fontController, sourceIdentifier) {
  const kerning = await fontController.getKerning();
  const kerningChanges = [];
  for (const kernTag of Object.keys(kerning)) {
    const kerningController = await fontController.getKerningController(kernTag);
    const changes = kerningController.deleteSource(sourceIdentifier);
    kerningChanges.push(changes);
  }
  return kerningChanges;
}

async function insertInterpolatedKerningAndSourceInfo(
  fontController,
  sourceIdentifier,
  location
) {
  const interpolatedSource = getInterpolatedSourceData(fontController, location);
  delete interpolatedSource["name"];
  delete interpolatedSource["location"];
  delete interpolatedSource["isSparse"];

  const sources = await fontController.getSources();
  const newSource = { ...sources[sourceIdentifier], ...interpolatedSource };

  return await insertInterpolatedKerningAndInsertSource(
    fontController,
    sourceIdentifier,
    newSource
  );
}

async function insertInterpolatedKerningAndInsertSource(
  fontController,
  sourceIdentifier,
  newSource
) {
  // Do the kerning changes *first*, and then add the font source. This is needed
  // because the *presence* of the new source will make it participate in kerning
  // interpolation, but it doesn't exist yet, so it would be seen as all zeros.
  const kerningChanges = await insertInterpolatedKerning(
    fontController,
    sourceIdentifier,
    newSource.location
  );

  const sources = await fontController.getSources();
  const sourceChanges = recordChanges({ sources }, (root) => {
    root.sources[sourceIdentifier] = newSource;
  });

  // While the kerning changes need to be *computed* before the source changes,
  // the source changes must be *emitted* before the kerning changes, to give backends
  // (*cough* designspace *cough*) the chance to first create the source, because
  // they may not be able to write kerning to a non-existing source.
  return [sourceChanges, ...kerningChanges];
}

async function insertInterpolatedKerning(fontController, sourceIdentifier, location) {
  const kerning = await fontController.getKerning();
  const kerningChanges = [];
  for (const [kernTag, kernData] of Object.entries(kerning)) {
    const kerningController = await fontController.getKerningController(kernTag);
    const changes = kerningController.insertInterpolatedSource(
      sourceIdentifier,
      location,
      kernData
    );
    kerningChanges.push(changes);
  }
  return kerningChanges;
}
