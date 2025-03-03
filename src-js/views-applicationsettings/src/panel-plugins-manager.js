import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { BaseInfoPanel } from "./panel-base.js";

addStyleSheet(`
  .fontra-ui-plugins-manager-panel-card {
    background-color: var(--ui-element-background-color);
    border-radius: 0.5em;
    padding: 1em;
  }
  `);

export class PluginsManagerPanel extends BaseInfoPanel {
  static title = "application-settings.plugins-manager.title";
  static id = "plugins-manager-panel";

  async setupUI() {
    this.panelElement.innerHTML = "";
    const container = html.createDomElement("plugin-manager", {
      id: "plugin-manager",
    });
    container.className = "fontra-ui-plugins-manager-panel-card";
    this.panelElement.appendChild(container);
  }
}
