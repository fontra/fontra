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
            html.createDomElement("button", {}, ["Add plugin"]),
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
