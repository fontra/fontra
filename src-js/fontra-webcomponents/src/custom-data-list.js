import { DefaultFormatter } from "@fontra/core/formatters.js";
import * as html from "@fontra/core/html-utils.js";
import { SimpleElement } from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { ObservableController } from "@fontra/core/observable-object.js";
import { labeledTextInput } from "@fontra/core/ui-utils.js";
import { zip } from "@fontra/core/utils.js";
import { dialogSetup } from "@fontra/web-components/modal-dialog.js";
import { UIList } from "@fontra/web-components/ui-list.js";

// TODO: Refactor this, copy from panel-axes.js
function arraysEqual(arrayA, arrayB) {
  if (arrayA.length !== arrayB.length) {
    return false;
  }
  for (const [itemA, itemB] of zip(arrayA, arrayB)) {
    if (itemA !== itemB) {
      return false;
    }
  }
  return true;
}

// TODO: Refactor this, copy from panel-axes.js
function updateRemoveButton(list, buttons) {
  list.addEventListener("listSelectionChanged", (event) => {
    buttons.disableRemoveButton = list.getSelectedItemIndex() === undefined;
  });
}

export class CustomDataList extends SimpleElement {
  static styles = `

  .fontra-ui-font-info-sources-panel-list-element {
    min-width: max-content;
    max-width: 29.5em; // 4.5 + 25
    max-height: 12em;
  }
  `;

  constructor(controller, customDataInfos) {
    super();
    this.contentElement = this.shadowRoot.appendChild(html.div());
    this.controller = controller;
    this.customDataInfos = customDataInfos;
    this.customDataKeys = customDataInfos.map((item) => item.key);
    this.render();
  }

  buildCustomDataList() {
    const model = this.controller.model;

    const sortItems = (sortedItems) => {
      return sortedItems.sort(
        (a, b) =>
          (this.customDataKeys.indexOf(a.key) != -1
            ? this.customDataKeys.indexOf(a.key)
            : this.customDataKeys.length) -
          (this.customDataKeys.indexOf(b.key) != -1
            ? this.customDataKeys.indexOf(b.key)
            : this.customDataKeys.length)
      );
    };

    const makeItem = ([key, value]) => {
      const customDataInfo = this.customDataInfos[this.customDataKeys.indexOf(key)];
      const formatter = customDataInfo?.formatter || DefaultFormatter;
      const item = new ObservableController({
        key: key,
        value: value,
        formatters: { value: formatter },
      });
      item.addListener((event) => {
        const sortedItems = sortItems([...labelList.items]);

        if (!arraysEqual(labelList.items, sortedItems)) {
          labelList.setItems(sortedItems);
        }

        const newCustomData = sortedItems.map((customData) => {
          return { ...customData };
        });
        model.customData = newCustomData;
      });
      return item.model;
    };

    const items = sortItems(
      Object.entries(model)?.map(([key, value]) => makeItem([key, value])) || []
    );

    const labelList = new UIList();
    labelList.classList.add("fontra-ui-font-info-sources-panel-list-element");
    labelList.style = `min-width: 12em;`;
    labelList.columnDescriptions = [
      {
        key: "key",
        title: "Key", // TODO: translation
        width: "17.5em",
      },
      {
        key: "value",
        title: "Value", // TODO: translation
        width: "10em",
        editable: true,
      },
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
      const newCustomData = items.map((customData) => {
        return { ...customData };
      });
      model.customData = newCustomData;
      addRemoveButton.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "nearest",
      });
      labelList.setSelectedItemIndex(items.length - 1);
    };

    labelList.addEventListener("deleteKey", deleteSelectedItem);
    const addRemoveButton = html.createDomElement("add-remove-buttons", {
      addButtonCallback: async () => {
        const currentKeys = labelList.items.map((customData) => {
          return customData.key;
        });
        const { key, value } = await this._customDataPropertiesRunDialog(
          this.customDataInfos,
          currentKeys
        );
        if (key == undefined || value == undefined) {
          return;
        }
        const newItem = makeItem([key, value]);
        const newItems = sortItems([...labelList.items, newItem]);

        model.customData = newItems.map((label) => {
          return { ...label };
        });
        labelList.setItems(newItems);
        const itemIndex = newItems.indexOf(newItem);
        labelList.editCell(itemIndex, "key");
        addRemoveButton.scrollIntoView({
          behavior: "auto",
          block: "nearest",
          inline: "nearest",
        });
      },
      removeButtonCallback: deleteSelectedItem,
      disableRemoveButton: true,
    });

    updateRemoveButton(labelList, addRemoveButton);

    return html.div({ style: "display: grid; grid-gap: 0.3em;" }, [
      labelList,
      addRemoveButton,
    ]);
  }

  render() {
    this.contentElement.appendChild(this.buildCustomDataList());
  }

  async _customDataPropertiesRunDialog(customDataInfos, currentKeys) {
    const title = translate("Add OpenType settings"); // TODO: translation

    const validateInput = () => {
      warningElement.innerText = "";
      infoElement.innerText = "";
      const customDataKey =
        nameController.model.customDataKey == ""
          ? undefined
          : nameController.model.customDataKey;
      const customDataValue = nameController.model.customDataValue;

      const setWarning = (warning) => {
        warningElement.innerText = warning;
        dialog.defaultButton.classList.toggle("disabled", true);
      };

      if (customDataKey == undefined && customDataValue == "") {
        // We don't want to start with a warning,
        // but need to disable the button -> therefore set it to empty string.
        setWarning("");
        return;
      }

      if (customDataKey == undefined) {
        setWarning("⚠️ Key is empty, please enter."); // TODO: translation
        return;
      }

      if (!this.customDataKeys.includes(customDataKey)) {
        // We know we have a key, but it is not supported, yet.
        setWarning(`⚠️ ${translate("Key not supported.")}`); // TODO: translation
        return;
      }

      // At that point, we know we have a valid key -> add key info if exists.
      const customDataInfo =
        customDataInfos[this.customDataKeys.indexOf(customDataKey)];
      infoElement.innerText = customDataInfo?.info || "";
      if (customDataInfo?.infoLinks) {
        infoElement.appendChild(html.br());
        for (const linkName in customDataInfo?.infoLinks) {
          infoElement.append(
            html.br(),
            html.a(
              {
                href: customDataInfo?.infoLinks[linkName],
                target: "_blank",
                style:
                  "font-style: italic; color: var(--foreground-color); text-decoration: underline;",
              },
              [linkName]
            )
          );
        }
      }

      if (currentKeys.includes(customDataKey)) {
        setWarning(`⚠️ ${translate("Key already in use.")}`); // TODO: translation
        return;
      }

      const formatter = customDataInfo?.formatter || DefaultFormatter;
      const result = formatter.fromString(customDataValue);
      if (customDataKey != undefined && result.value == undefined) {
        const msg = result.error ? ` "${result.error}"` : "";
        setWarning(`⚠️ Invalid value${msg}`); // TODO: translation
        return;
      }

      // If we reach here, everything is fine:
      dialog.defaultButton.classList.toggle("disabled", false);
    };

    const nameController = new ObservableController({
      customDataKey: undefined,
      suggestedCustomDataKey: "Please enter a key",
      customDataValue: undefined,
      suggestedCustomDataValue: "Please enter a value",
    });

    nameController.addKeyListener("customDataKey", (event) => {
      const customDataInfo =
        customDataInfos[
          this.customDataKeys.indexOf(nameController.model.customDataKey)
        ];
      if (customDataInfo) {
        const customDataFormatter = customDataInfo.formatter || DefaultFormatter;
        nameController.model.customDataValue = customDataFormatter.toString(
          customDataInfo.getDefaultFunction()
        );
      }
      validateInput();
    });

    nameController.addKeyListener("customDataValue", (event) => {
      validateInput();
    });

    const { contentElement, warningElement, infoElement } =
      this._customDataPropertiesContentElement(nameController, this.customDataKeys);

    const dialog = await dialogSetup(title, null, [
      { title: translate("dialog.cancel"), isCancelButton: true },
      { title: translate("dialog.add"), isDefaultButton: true, disabled: true },
    ]);
    dialog.setContent(contentElement);

    setTimeout(() => contentElement.querySelector("#customDataKey-input")?.focus(), 0);

    if (!(await dialog.run())) {
      // User cancelled
      return {};
    }

    const customDataInfo =
      customDataInfos[this.customDataKeys.indexOf(nameController.model.customDataKey)];
    const formatter = customDataInfo?.formatter || DefaultFormatter;

    return {
      key: nameController.model.customDataKey,
      value: formatter.fromString(nameController.model.customDataValue).value,
    };
  }

  _customDataPropertiesContentElement(nameController, customDataKeys) {
    const warningElement = html.div({
      id: "warning-text",
      style: `grid-column: 1 / -1; min-height: 1.5em;`,
    });

    const infoElement = html.div({
      id: "info-text",
      style: `grid-column: 1 / -1; min-height: 1.5em; text-wrap: auto;`,
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
          max-width: 30em;
        `,
      },
      [
        ...labeledTextInput(translate("Key"), nameController, "customDataKey", {
          id: "customDataKey-input",
          placeholderKey: "suggestedCustomDataKey",
          choices: customDataKeys,
        }),
        ...labeledTextInput(translate("Value"), nameController, "customDataValue", {
          placeholderKey: "suggestedCustomDataValue",
        }),
        html.br(),
        infoElement,
        warningElement,
      ]
    );
    return { contentElement, warningElement, infoElement };
  }
}

customElements.define("custom-data-list", CustomDataList);
