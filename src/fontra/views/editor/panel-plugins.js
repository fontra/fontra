import { dialogSetup } from "/web-components/modal-dialog.js";
import * as html from "/core/unlit.js";
import Panel from "./panel.js";

export default class PluginsPanel extends Panel {
  name = "plugins";
  icon = "/images/gear.svg";

  getContentElement() {
    return html.div(
      {
        class: "plugins",
      },
      [
        html.createDomElement("ui-list", { id: "plugin-list" }),
        html.div(
          {
            class: "plugin-list-buttons",
          },
          [
            html.createDomElement(
              "button",
              {
                id: "add-plugin-button",
              },
              ["Add plugin"]
            ),
            html.createDomElement(
              "button",
              { disabled: true, style: "margin-left: auto;" },
              ["Remove"]
            ),
          ]
        ),
      ]
    );
  }

  attach(editorController) {
    const pluginList = document.querySelector("#plugin-list");
    this.pluginList = pluginList;
    pluginList.showHeader = true;
    pluginList.columnDescriptions = [
      {
        title: "on",
        key: "active",
        cellFactory: checkboxListCell,
        width: "2em",
      },
      { key: "name", title: "Plugin name", width: "12em" },
    ];
    pluginList.setItems([
      {
        active: true,
        name: "extrude",
      },
    ]);

    const addPluginButton = document.querySelector("#add-plugin-button");
    addPluginButton.addEventListener("click", (event) => {
      event.preventDefault();
      const dialog = dialogSetup("Add a plugin", null, [
        { title: "Cancel", resultValue: "no", isCancelButton: true },
        { title: "Create", resultValue: "ok", isDefaultButton: true },
      ])
        .then((dialog) => {
          dialog.setContent(html.div({}, "content"));
          return dialog.run();
        })
        .then((result) => {
          console.log(result);
        });
    });
  }
}

function checkboxListCell(item, colDesc) {
  const value = item[colDesc.key];
  return html.input({
    type: "checkbox",
    style: `width: auto; margin: 0; padding: 0; outline: none;`,
    checked: value,
    onclick: (event) => {
      item[colDesc.key] = event.target.checked;
      event.stopImmediatePropagation();
    },
    ondblclick: (event) => {
      event.stopImmediatePropagation();
    },
  });
}
