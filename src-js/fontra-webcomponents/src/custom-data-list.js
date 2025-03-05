import { customDataNameMapping } from "@fontra/core/font-info-data.js";
import * as html from "@fontra/core/html-utils.js";
import { SimpleElement } from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { ObservableController } from "@fontra/core/observable-object.js";
import { DefaultFormatter, labeledTextInput } from "@fontra/core/ui-utils.js";
import { dialogSetup, message } from "@fontra/web-components/modal-dialog.js";
import { UIList } from "@fontra/web-components/ui-list.js";
import { themeColorCSS } from "./theme-support.js";

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

const colors = {
  "menu-bar-link-hover": ["#e1e1e1", "rgb(47, 47, 47)"],
};

export class CustomDataList extends SimpleElement {
  static styles = `

  ${themeColorCSS(colors)}
  .fontra-ui-font-info-sources-panel-list-element {
    min-width: max-content;
    max-width: 29.5em; // 4.5 + 25
    max-height: 12em;
  }
  `;

  // fontObject can either be FontInfo or FontSource.
  constructor(options) {
    super();
    this.contentElement = this.shadowRoot.appendChild(html.div());
    this.controller = options.controller;
    this.fontObject = options.fontObject;
    this.supportedAttributes =
      options.supportedAttributes || Object.keys(customDataNameMapping);
    this.render();
  }

  buildCustomDataList() {
    const customDataNames = Object.keys(customDataNameMapping);
    const model = this.controller.model;

    const makeItem = ([key, value]) => {
      const item = new ObservableController({ key: key, value: value });
      item.addListener((event) => {
        const sortedItems = [...labelList.items];
        sortedItems.sort(
          (a, b) =>
            (customDataNames.indexOf(a.key) != -1
              ? customDataNames.indexOf(a.key)
              : customDataNames.length) -
            (customDataNames.indexOf(b.key) != -1
              ? customDataNames.indexOf(b.key)
              : customDataNames.length)
        );

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

    const sortedItems = Object.entries(model);
    sortedItems.sort(
      (a, b) =>
        (customDataNames.indexOf(a[0]) != -1
          ? customDataNames.indexOf(a[0])
          : customDataNames.length) -
        (customDataNames.indexOf(b[0]) != -1
          ? customDataNames.indexOf(b[0])
          : customDataNames.length)
    );
    const items = sortedItems?.map(makeItem) || [];

    const labelList = new UIList();
    labelList.classList.add("fontra-ui-font-info-sources-panel-list-element");
    labelList.style = `min-width: 12em;`;
    labelList.columnDescriptions = [
      {
        key: "key",
        title: "Key", // TODO: translation
        width: "14em",
        editable: true,
        continuous: false,
      },
      {
        key: "value",
        title: "Value", // TODO: translation
        width: "10em",
        editable: true,
        continuous: false,
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
        let nextKey = undefined;
        for (const key of this.supportedAttributes) {
          if (!currentKeys.includes(key)) {
            nextKey = key;
            break;
          }
        }
        const { key, value } = await this._customDataPropertiesRunDialog(
          this.fontObject,
          nextKey,
          this.supportedAttributes
        );
        console.log("Add new custom data: ", key, value);
        if (key == undefined || value == undefined) {
          return;
        }

        const newItem = makeItem([key, value]);
        const newItems = [...labelList.items, newItem];
        model.customData = newItems.map((label) => {
          return { ...label };
        });
        labelList.setItems(newItems);
        labelList.editCell(newItems.length - 1, "key");
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

  async _customDataPropertiesRunDialog(fontObject, nextKey, supportedAttributes) {
    const title = translate("Add Custom Data");

    const validateInput = () => {
      const infos = [];
      const warnings = [];
      const customDataKey =
        nameController.model.customDataKey == ""
          ? undefined
          : nameController.model.customDataKey;
      nameController.model.suggestedCustomDataValue = `Please enter the correct value`;
      nameController.model.suggestedCustomDataKey = `Please enter a valid key`;
      if (customDataKey != undefined) {
        const customDataInfo = customDataNameMapping[customDataKey]?.info;
        if (customDataInfo) {
          infos.push(customDataInfo);
        }

        if (!customDataNameMapping[customDataKey]) {
          warnings.push(`⚠️ ${translate("Unkown custom data key")}`); // TODO: Translation
        }

        const customDataValue =
          nameController.model.customDataValue == ""
            ? undefined
            : nameController.model.customDataValue;
        if (customDataValue != undefined) {
          const formatter =
            customDataNameMapping[customDataKey]?.formatter || DefaultFormatter;
          const result = formatter.fromString(customDataValue);
          if (result.value == undefined) {
            const msg = result.error ? ` "${result.error}"` : "";
            warnings.push(`⚠️ Invalid value${msg}`); // TODO: Translation
          }
        }
      }

      warningElement.innerText = warnings.length ? warnings.join("\n") : "";
      dialog.defaultButton.classList.toggle("disabled", warnings.length);
      infoElement.innerText = infos.length ? infos.join("\n") : "";
    };

    const nameController = new ObservableController({
      customDataKey: nextKey,
      suggestedCustomDataKey: nextKey,
      customDataValue: customDataNameMapping[nextKey].default(fontObject),
      suggestedCustomDataValue: "Enter number, list or boolean",
    });

    nameController.addKeyListener("customDataKey", (event) => {
      validateInput();
      nameController.model.customDataValue =
        customDataNameMapping[nameController.model.customDataKey]?.default(fontObject);
    });

    nameController.addKeyListener("customDataValue", (event) => {
      validateInput();
    });

    const { contentElement, warningElement, infoElement } =
      this._customDataPropertiesContentElement(nameController, supportedAttributes);

    const dialog = await dialogSetup(title, null, [
      { title: translate("dialog.cancel"), isCancelButton: true },
      { title: translate("dialog.add"), isDefaultButton: true },
    ]);
    dialog.setContent(contentElement);

    setTimeout(
      () => contentElement.querySelector("#source-name-text-input")?.focus(),
      0
    );

    validateInput();

    if (!(await dialog.run())) {
      // User cancelled
      return {};
    }

    return {
      key: nameController.model.customDataKey,
      value: nameController.model.customDataValue,
    };
  }

  _customDataPropertiesContentElement(nameController, supportedAttributes) {
    const warningElement = html.div({
      id: "warning-text",
      style: `grid-column: 1 / -1; min-height: 1.5em;`,
    });

    const infoElement = html.div({
      id: "info-text",
      style: `grid-column: 1 / -1; min-height: 1.5em;`,
    });

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
      [
        ...labeledTextInput(translate("Key"), nameController, "customDataKey", {
          placeholderKey: "suggestedCustomDataKey",
          choices: supportedAttributes,
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
