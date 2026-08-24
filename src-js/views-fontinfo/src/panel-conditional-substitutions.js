import { RangeRangeSlider } from "@fontra/web-components/range-range-slider.js";
import { themeColorCSS } from "@fontra/web-components/theme-support.js";
import { InlineSVG } from "@fontra/web-components/inline-svg.js";
import { recordChanges } from "@fontra/core/change-recorder.js";
import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { ObservableController } from "@fontra/core/observable-object.ts";
import {
  labeledPopupSelect,
  labeledTextInput,
  setupSortableList,
  textInput,
} from "@fontra/core/ui-utils.js";
import { assert, compare, enumerate, range } from "@fontra/core/utils.ts";
import { askString } from "@fontra/web-components/modal-dialog.js";
import { mapAxesFromUserSpaceToSourceSpace } from "@fontra/core/var-model.js";
import { BaseInfoPanel } from "./panel-base.js";

const glyphNamesOptionsId =
  "fontra-ui-font-info-conditional-substitutions-glyph-names-options";

const cardsInfos = {};

export class ConditionalSubstitutionsPanel extends BaseInfoPanel {
  static title = "conditional-substitutions.title";
  static id = "conditional-substitutions-panel";
  static fontAttributes = ["conditionalSubstitutions"];

  initializePanel() {
    super.initializePanel();

    this.fontController.addChangeListener(
      { conditionalSubstitutions: null },
      (change, isExternalChange) => {
        if (isExternalChange) {
          this.setupUI();
          this.undoStack.clear();
        }
      },
      false
    );

    this.fontController.addChangeListener(
      { axes: null },
      (change, isExternalChange) => this.setupUI(),
      false
    );

    this.glyphNamesOptionsElement = html.createDomElement(
      "datalist",
      { id: glyphNamesOptionsId },
      []
    );

    this._updateGlyphNames();
  }

  _updateGlyphNames() {
    const glyphNames = Object.keys(this.fontController.glyphMap);
    glyphNames.sort();

    this.glyphNamesOptionsElement.innerHTML = "";

    glyphNames.forEach((glyphName) => {
      this.glyphNamesOptionsElement.appendChild(
        html.createDomElement("option", { value: glyphName })
      );
    });
  }

  async setupUI(scrollToLastItem = false) {
    this.conditionalSubstitutions =
      await this.fontController.getConditionalSubstitutions();

    // Map to source space and filter out discrete axes
    this.fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(
      this.fontController.axes.axes
    ).filter((axis) => axis.minValue !== undefined);

    const container = html.div({
      id: "conditional-substitutions-rule-container",
      style: "display: grid; gap: 0.5em;",
    });

    for (const index of range(this.conditionalSubstitutions.rules.length)) {
      if (!cardsInfos[index]) {
        cardsInfos[index] = {};
      }

      container.appendChild(
        new RuleBox(
          this.fontController,
          this.fontAxesSourceSpace,
          this.conditionalSubstitutions,
          index,
          this.postChange.bind(this),
          this.setupUI.bind(this)
        )
      );
    }

    setupSortableList(container);

    container.addEventListener("reordered", (event) => {
      const reordered = [];
      for (const [index, ruleBox] of enumerate(container.children)) {
        reordered.push(ruleBox.rule);
        ruleBox.ruleIndex = index;
      }
      const undoLabel = translate("conditional-substitutions.rules.undo-reorder");
      this.replaceRules(reordered, undoLabel);
    });

    this.panelElement.innerHTML = "";
    this.panelElement.style = `
    gap: 1em;
    `;

    this.panelElement.appendChild(
      html.div(
        { class: "fontra-ui-font-info-conditional-substitutions-panel-header" },
        [
          html.input({
            type: "button",
            class: "fontra-button",
            style: `justify-self: start;`,
            value: translate("conditional-substitutions.rule.new"),
            onclick: (event) => this.newRule(),
          }),
          html.div(
            { style: "display: flex; gap: 0.5em; align-items: center;" },
            this._setupFeatureTagsPopup()
          ),
        ]
      )
    );

    this.panelElement.appendChild(container);
    this.panelElement.appendChild(this.glyphNamesOptionsElement);

    this.panelElement.focus();

    if (scrollToLastItem) {
      container.lastChild.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "nearest",
      });
    }
  }

  _setupFeatureTagsPopup() {
    const tags = this.conditionalSubstitutions.featureTags;
    const tagMap = { rvrn: "rvrn", rclt: "rclt" };
    const processingValue = tags.length == 1 ? (tagMap[tags[0]] ?? "custom") : "custom";

    const processingController = new ObservableController({
      processing: processingValue,
      customFeatureTags: [],
    });

    processingController.addKeyListener("processing", (event) => {
      if (event.newValue != "custom") {
        this.editConditionalSubstitutions((conditionalSubstitutions) => {
          conditionalSubstitutions.featureTags = [event.newValue];
        }, translate("conditional-substitutions.rule-processing.feature-tags.undo"));
      }
    });

    processingController.addKeyListener("customFeatureTags", (event) => {
      this.editConditionalSubstitutions((conditionalSubstitutions) => {
        conditionalSubstitutions.featureTags = event.newValue;
      }, translate("conditional-substitutions.rule-processing.feature-tags.undo"));
    });

    const getCustomLabel = () => {
      const tagsString = processingController.model.customFeatureTags.length
        ? ` (${processingController.model.customFeatureTags.join(", ")})`
        : "";
      return (
        translate("conditional-substitutions.rule-processing.feature-tags.menu-title") +
        tagsString
      );
    };

    const [feaTagsPopupLabel, feaTagsPopupSelect] = labeledPopupSelect(
      translate("conditional-substitutions.rule-processing.title"),
      processingController,
      "processing",
      [
        {
          value: "rclt",
          label: translate("conditional-substitutions.rule-processing.after"),
        },
        {
          value: "rvrn",
          label: translate("conditional-substitutions.rule-processing.before"),
        },
        {
          value: "custom",
          getLabel: getCustomLabel,
          callback: async () => {
            const answer = await askString(
              translate(
                "conditional-substitutions.rule-processing.feature-tags.enter.title"
              ),
              processingController.model.customFeatureTags.join(", ")
            );
            if (answer) {
              processingController.model.customFeatureTags = answer
                .split(/[, ]+/)
                .filter((tag) => tag.length == 4);
              feaTagsPopupSelect.valueLabel = getCustomLabel();
            }
          },
        },
      ]
    );

    return [feaTagsPopupLabel, feaTagsPopupSelect];
  }

  newRule() {
    this.editConditionalSubstitutions((conditionalSubstitutions) => {
      conditionalSubstitutions.rules.push({
        name: "",
        conditionSets: [{ conditions: [] }],
        substitutions: {},
      });
    }, translate("conditional-substitutions.rule.undo-new"));
    this.setupUI(true);
  }

  editConditionalSubstitutions(editFunc, undoLabel) {
    const root = {
      conditionalSubstitutions: this.conditionalSubstitutions,
    };

    const changes = recordChanges(root, (root) => {
      editFunc(root.conditionalSubstitutions);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
    }
  }

  async replaceRules(updatedRules, undoLabel) {
    const root = {
      conditionalSubstitutions: this.conditionalSubstitutions,
    };
    const changes = recordChanges(root, (root) => {
      root.conditionalSubstitutions.rules.splice(
        0,
        root.conditionalSubstitutions.rules.length,
        ...updatedRules
      );
    });
    await this.postChange(changes.change, changes.rollbackChange, undoLabel);
  }
}

const colors = {
  "button-color": ["#ddd", "#888"],
  "text-color": ["#000", "#fff"],
};

addStyleSheet(`
${themeColorCSS(colors, ":root")}

.fontra-ui-font-info-conditional-substitutions-panel-conditional-substitutions-rule-box {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
  cursor: pointer;
  display: grid;
  grid-template-columns: auto max-content; /* max-content auto max-content when open/close toggle*/
  grid-template-rows: auto auto;
  gap: 1em;
}

.fontra-ui-font-info-conditional-substitutions-panel-header {
  display: grid;
  grid-template-columns: auto auto;
  justify-content: start;
  align-items: center;
  gap: 1em;
}

.fontra-ui-font-info-conditional-substitutions-rule-name-input {
  width: 20em;
}

.fontra-ui-font-info-conditional-substitutions-rule-content {
  display: grid;
  grid-template-columns: max-content max-content;
  gap: 0.5em 1.5em;
  // grid-column: 2 / 3;
}

.fontra-ui-font-info-conditional-substitutions-conditionsets {
  display: grid;
  align-content: start;
  grid-template-columns: auto;
  gap: 0.5em;
}

.conditionsets-container {
  display: grid;
  gap: 0.5em;
  grid-template-columns: auto;
}

.fontra-ui-font-info-conditional-substitutions-conditionset {
  display: grid;
  gap: 0.5em;
  align-items: start;
  grid-template-columns: auto min-content;
}

.fontra-ui-font-info-conditional-substitutions-conditionset-box {
  display: grid;
  grid-template-columns: max-content max-content;
  align-items: center;
  gap: 0.5em;
  padding: 0.5em;
  border-radius: 0.5em;
  border: solid 1px #AAA6;
  width: max-content;
}

.min-max-header {
  margin-top: -0.3em;
  margin-bottom: -0.25em;
}

.conditionsets-container input {
  text-align: right;
  width: 5em;
}

input::placeholder {
  opacity: 0.7;
  color: #999;
}

.conditionset-axis-name {
  text-align: right;
  min-width: 6em;
}

.fontra-ui-font-info-conditional-substitutions-substitutions {
  display: grid;
  align-content: start;
  grid-template-columns: auto auto auto auto;
  gap: 0.5em;
  width: max-content;
}

.section-header {
  font-weight: bold;
}

.fontra-ui-font-info-conditional-substitutions-conditionset:hover > .auto-show-delete-button,
.fontra-ui-font-info-conditional-substitutions-conditionset-box:hover + .auto-show-delete-button,
.auto-show-delete-button:hover,
input:hover + .auto-show-delete-button,
span:hover + input + .auto-show-delete-button,
input:hover + span + input + .auto-show-delete-button {
  opacity: 100%;
}

.auto-show-delete-button {
  opacity: 0;
  transition: 120ms;
}

.fontra-ui-font-info-conditional-substitutions-panel-icon.open-close-icon {
  height: 1.5em;
  width: 1.5em;
  transition: 120ms;
}

.fontra-ui-font-info-conditional-substitutions-panel-icon.open-close-icon.item-closed {
  transform: rotate(180deg);
}

.plus-button {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  margin: 0;
  border-radius: 1rem;
  background-color: var(--button-color);
  fill: var(--text-color);
  border: none;
  line-height: 0;
  cursor: pointer;
}

.plus-button > inline-svg {
  width: 75%;
  height: 75%;
}

input.glyph-name-input.error {
  color: var(--fontra-red-color);
}

`);

class RuleBox extends HTMLElement {
  constructor(
    fontController,
    fontAxesSourceSpace,
    conditionalSubstitutions,
    ruleIndex,
    postChange,
    setupUI
  ) {
    super();

    this.classList.add(
      "fontra-ui-font-info-conditional-substitutions-panel-conditional-substitutions-rule-box"
    );

    this.draggable = true;
    this.fontController = fontController;
    this.fontAxesSourceSpace = fontAxesSourceSpace;
    this.conditionalSubstitutions = conditionalSubstitutions;
    this.rule = conditionalSubstitutions.rules[ruleIndex];
    this.ruleIndex = ruleIndex;
    this.postChange = postChange;
    this.setupUI = setupUI;

    this._updateContents();
  }

  editRule(editFunc, undoLabel) {
    const root = {
      conditionalSubstitutions: this.conditionalSubstitutions,
    };

    const changes = recordChanges(root, (root) => {
      editFunc(root.conditionalSubstitutions.rules[this.ruleIndex]);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
    }
  }

  deleteRule() {
    const undoLabel = translate("conditional-substitutions.rule.undo-remove");
    const root = {
      conditionalSubstitutions: this.conditionalSubstitutions,
    };
    const changes = recordChanges(root, (root) => {
      root.conditionalSubstitutions.rules.splice(this.ruleIndex, 1);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  toggleShowHide(toggleAll) {
    const cardElements = !toggleAll
      ? [this]
      : document.querySelectorAll(
          ".fontra-ui-font-info-conditional-substitutions-panel-conditional-substitutions-rule-box"
        );

    const thisIconElement = this.querySelector("#open-close-icon");
    const isClosed = thisIconElement.classList.contains("item-closed");

    for (const cardElement of cardElements) {
      const elementIcon = cardElement.querySelector("#open-close-icon");

      cardElement.isClosed = !isClosed;
      cardElement.classList.toggle("item-closed", !isClosed);
      elementIcon.classList.toggle("item-closed", !isClosed);
    }
  }

  _updateContents(options = { addNewSubstitution: false }) {
    this.innerHTML = "";

    const ruleController = new ObservableController({ name: this.rule.name });
    ruleController.addKeyListener("name", (event) => {
      this.editRule((rule) => {
        rule.name = event.newValue;
      }, "edit name");
    });

    // Once open/close toggling has a meaningful function here
    // this.append(
    //   html.createDomElement("icon-button", {
    //     class:
    //       "fontra-ui-font-info-conditional-substitutions-panel-icon open-close-icon",
    //     // +
    //     //   this.isClosed || true
    //     //   ? " item-closed"
    //     //   : "",
    //     id: "open-close-icon",
    //     src: "/tabler-icons/chevron-up.svg",
    //     open: false,
    //     onclick: (event) => this.toggleShowHide(event.altKey),
    //   })
    // );

    this.append(
      html.div(
        { style: "display: flex; gap: 0.5em; align-items: center;" },
        labeledTextInput(
          translate("conditional-substitutions.rule.name"),
          ruleController,
          "name",
          {
            class: "fontra-ui-font-info-conditional-substitutions-rule-name-input",
            continuous: false,
          }
        )
      )
    );

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-font-info-conditional-substitutions-panel-icon",
        "src": "/tabler-icons/trash.svg",
        "onclick": (event) => this.deleteRule(),
        "data-tooltip": translate("conditional-substitutions.rule.remove"),
        "data-tooltipposition": "left",
        "tabIndex": -1,
      })
    );

    const conditionSetElement = html.div({ class: "conditionsets-container" }, [
      ...this.rule.conditionSets.map((conditionSet, index) =>
        this._makeConditionSetElement(
          index,
          this.rule.conditionSets,
          conditionSet.conditions,
          this.fontAxesSourceSpace
        )
      ),
      makePlusButton(
        () => {
          this.editRule((rule) => {
            rule.conditionSets.push({ conditions: [] });
          }, translate("conditional-substitutions.condition-set.undo-new"));
          this._updateContents();
        },
        "conditional-substitutions.condition-set.new",
        "right"
      ),
    ]);

    if (this.rule.conditionSets.length > 1) {
      setupSortableList(conditionSetElement);
      conditionSetElement.addEventListener("reordered", (event) => {
        const originalIndices = [];
        for (const el of this.querySelectorAll(
          ".conditionsets-container > .fontra-ui-font-info-conditional-substitutions-conditionset"
        )) {
          originalIndices.push(parseInt(el.dataset.originalIndex));
        }

        this.editRule((rule) => {
          assert(originalIndices.length === rule.conditionSets.length);
          const newConditionSets = originalIndices.map(
            (index) => rule.conditionSets[index]
          );
          rule.conditionSets = newConditionSets;
        }, translate("conditional-substitutions.condition-sets.undo-reorder"));

        this._updateContents();
      });
    }

    this.append(
      html.div(
        { class: "fontra-ui-font-info-conditional-substitutions-rule-content" },
        [
          html.span({ class: "section-header" }, [
            translate("conditional-substitutions.condition-sets.title"),
          ]),
          html.span({ class: "section-header" }, [
            translate("conditional-substitutions.substitutions.title"),
          ]),
          conditionSetElement,
          this._makeSubstitutionsList(this.rule.substitutions, options),
        ]
      )
    );
  }

  _makeConditionSetElement(index, conditionSets, conditionSet, axes) {
    const conditionSetByName = Object.fromEntries(
      conditionSet.map((item) => [item.name, item])
    );

    const minLabel = translate("conditional-substitutions.condition.min");
    const maxLabel = translate("conditional-substitutions.condition.max");

    const elements = [];

    axes.forEach(({ name, minValue, maxValue }) => {
      elements.push(html.span({ class: "conditionset-axis-name" }, [name])); // axis name label

      const slider = new RangeRangeSlider();
      slider.minValue = minValue;
      slider.maxValue = maxValue;
      slider.minLabel = minLabel;
      slider.maxLabel = maxLabel;
      slider.valueLow = conditionSetByName[name]?.minValue ?? null;
      slider.valueHigh = conditionSetByName[name]?.maxValue ?? null;
      slider.style = "width: 20em;";
      slider.onChangeCallback = () => {
        const conditionSet =
          this.conditionalSubstitutions.rules[this.ruleIndex].conditionSets[index]
            .conditions;

        const conditionSetByName = Object.fromEntries(
          conditionSet.map((item) => [item.name, item])
        );

        const newConditions = axes
          .map(({ name: axisName }) =>
            axisName == name
              ? { name, minValue: slider.valueLow, maxValue: slider.valueHigh }
              : {
                  name: axisName,
                  minValue: conditionSetByName[axisName]?.minValue ?? null,
                  maxValue: conditionSetByName[axisName]?.maxValue ?? null,
                }
          )
          .filter(({ minValue, maxValue }) => minValue != null || maxValue != null);

        this.editRule((rule) => {
          rule.conditionSets[index].conditions = newConditions;
        }, translate("conditional-substitutions.condition-set.undo-edit"));
      };
      elements.push(slider);
    });

    return html.div(
      {
        "class": "fontra-ui-font-info-conditional-substitutions-conditionset",
        "draggable": conditionSets.length > 1,
        "data-originalIndex": index,
      },
      [
        html.div(
          {
            class: "fontra-ui-font-info-conditional-substitutions-conditionset-box",
          },
          elements
        ),
        html.createDomElement("icon-button", {
          "class":
            "fontra-ui-font-info-conditional-substitutions-panel-icon auto-show-delete-button",
          "src": "/tabler-icons/trash.svg",
          "onclick": (event) => {
            this.editRule((rule) => {
              rule.conditionSets.splice(index, 1);
            }, translate("conditional-substitutions.condition-set.undo-remove"));
            this._updateContents();
          },
          "data-tooltip": translate("conditional-substitutions.condition-set.remove"),
          "data-tooltipposition": "bottom",
          "tabIndex": -1,
        }),
      ]
    );
  }

  _makeSubstitutionsList(
    substitutions,
    options = {
      addNewSubstitution: false,
      focusKey: null,
      focusField: null,
      select: false,
    }
  ) {
    const substitutionsList = Object.entries(substitutions);
    substitutionsList.sort((a, b) => compare(a[0], b[0]));

    let elementToFocus;
    let focusedElement = { focusKey: null, focusField: null };

    if (options.addNewSubstitution) {
      substitutionsList.push(["", ""]);
    }

    const elements = substitutionsList
      .map(([input, output]) => {
        const controller = new ObservableController({ input, output });

        const editSubstitution = (oldInput, newInput, newOutput) => {
          let shouldUpdate = newOutput == null;

          this.editRule((rule) => {
            const substitutions = { ...rule.substitutions };
            if (oldInput && oldInput !== newInput && oldInput in rule.substitutions) {
              delete substitutions[oldInput];
              shouldUpdate = true;
            }
            if (newInput) {
              input = newInput;
              output = newOutput ?? "";
              substitutions[input] = output;
            }

            rule.substitutions = sortObject(substitutions);
          }, `edit substitutions`);

          this._updateContents(focusedElement);

          validate();
        };

        controller.addKeyListener("input", (event) =>
          editSubstitution(event.oldValue, event.newValue, output)
        );

        controller.addKeyListener("output", (event) =>
          editSubstitution(input, input, event.newValue)
        );

        const validate = () => {
          inputTextInput.classList.toggle(
            "error",
            this._isGlyphMissing(inputTextInput.value)
          );

          outputTextInput.classList.toggle(
            "error",
            this._isGlyphMissing(outputTextInput.value)
          );
        };

        const inputTextInput = textInput(controller, "input", {
          continuous: false,
          placeholder: "input glyph name",
          class: "glyph-name-input input",
        });

        const outputTextInput = textInput(controller, "output", {
          continuous: false,
          placeholder: "output glyph name",
          class: "glyph-name-input output",
        });

        inputTextInput.oninput = validate;
        outputTextInput.oninput = validate;

        inputTextInput.onfocus = () => {
          focusedElement = {
            focusKey: inputTextInput.value,
            focusField: "input",
            select: elementIsAllSelected(inputTextInput),
          };
        };
        outputTextInput.onfocus = () => {
          focusedElement = {
            focusKey: inputTextInput.value,
            focusField: "output",
            select: elementIsAllSelected(outputTextInput),
          };
        };
        inputTextInput.onblur = () => {
          focusedElement = { focusKey: null, focusField: null };
        };
        outputTextInput.onblur = inputTextInput.onblur;

        inputTextInput.onselect = (event) => {
          focusedElement.select = elementIsAllSelected(event.target);
        };
        outputTextInput.onselect = inputTextInput.onselect;

        validate();

        inputTextInput.setAttribute("list", glyphNamesOptionsId);
        outputTextInput.setAttribute("list", glyphNamesOptionsId);

        if (options.focusKey === input) {
          elementToFocus =
            options.focusField === "input" ? inputTextInput : outputTextInput;
        }

        return [
          inputTextInput,
          html.span({}, ["→"]),
          outputTextInput,
          html.createDomElement("icon-button", {
            "class":
              "fontra-ui-font-info-conditional-substitutions-panel-icon auto-show-delete-button",
            "src": "/tabler-icons/trash.svg",
            "onclick": (event) => editSubstitution(input, null, null),
            "data-tooltip": translate("conditional-substitutions.substitutions.remove"),
            "data-tooltipposition": "bottom",
            "tabIndex": -1,
          }),
        ];
      })
      .flat();

    elements.push(
      makePlusButton(
        () => this._updateContents({ addNewSubstitution: true }),
        "conditional-substitutions.substitutions.new"
      )
    );

    if (options.addNewSubstitution) {
      elementToFocus = elements.filter((el) => el.classList.contains("input")).at(-1);
    }

    if (elementToFocus) {
      setTimeout(() => {
        elementToFocus.focus();
        if (options.select) {
          elementToFocus.select();
        }
      }, 10);
    }

    return html.div(
      { class: "fontra-ui-font-info-conditional-substitutions-substitutions" },
      elements
    );
  }

  _isGlyphMissing(glyphName) {
    return !(!glyphName || glyphName in this.fontController.glyphMap);
  }
}

customElements.define("conditional-substitutions-rule-box", RuleBox);

function sortObject(obj) {
  const entries = Object.entries(obj);
  entries.sort((a, b) => compare(a[0], b[0]));
  return Object.fromEntries(entries);
}

function elementIsAllSelected(el) {
  return el.selectionStart === 0 && el.selectionEnd === el.value.length;
}

function makePlusButton(callback, tooltipKey, tooltipPosition = "bottom") {
  return html.button(
    {
      "onclick": callback,
      "class": "plus-button",
      "data-tooltip": translate(tooltipKey),
      "data-tooltipposition": tooltipPosition,
    },
    [new InlineSVG("/images/plus.svg")]
  );
}
