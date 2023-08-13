import { dialogSetup } from "/web-components/modal-dialog.js";
import * as html from "/core/unlit.js";
import Panel from "./panel.js";
import { ObservableController } from "../core/observable-object.js";

export default class PluginsPanel extends Panel {
  name = "plugins";
  icon = "/images/gear.svg";

  constructor() {
    super();
    this.plugins = new ObservableController([]);
  }

  detach() {
    throw new Error("default panels cannot be detached.");
  }

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

  async initPlugin(name) {
    let content;
    try {
      content = await fetch(`https://cdn.jsdelivr.net/gh/${name}/start.js`);
    } catch (e) {
      console.log("Plugin not found.");
    }
    if (content !== undefined) {
      const text = await content.text();
      const plugin = eval(`(${text})`); // a sandboxed javascript may run instead
      const pluginInstance = new plugin();
      pluginInstance.main({
        addSidebarPanel: (panel, sidebarName) => {
          this.editorController.addSidebarPanel(panel, sidebarName);
        },
      });
    }
  }

  attach(editorController) {
    this.editorController = editorController;
    this.plugins.addListener(({ oldValue, newValue }) => {
      if (oldValue === undefined && newValue !== undefined) {
        this.initPlugin(newValue.name);
      }
    });

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
    this.plugins.addListener(() => {
      pluginList.setItems(this.plugins.model);
    });

    const addPluginButton = document.querySelector("#add-plugin-button");
    addPluginButton.addEventListener("click", (event) => {
      event.preventDefault();

      const pluginNameInput = html.createDomElement("input", { id: "plugin-name" });
      const dialog = dialogSetup("Add a plugin", null, [
        { title: "Cancel", resultValue: "no", isCancelButton: true },
        { title: "Create", resultValue: "ok", isDefaultButton: true },
      ])
        .then((dialog) => {
          dialog.setContent(
            html.div({}, ["Plugin github handle/repository name", pluginNameInput])
          );
          return dialog.run();
        })
        .then((result) => {
          this.plugins.model.push({
            active: true,
            name: pluginNameInput.value,
          });
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
