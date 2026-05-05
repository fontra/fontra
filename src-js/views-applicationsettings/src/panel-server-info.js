import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { MultiPanelBasePanel } from "@fontra/core/multi-panel.js";
import { fetchJSON } from "@fontra/core/utils.js";

const serverInfo = await fetchJSON("/serverinfo");

addStyleSheet(`
  .fontra-ui-server-info-panel-card {
    background-color: var(--ui-element-background-color);
    border-radius: 0.5em;
    padding: 1em;
  }
  .fontra-ui-server-info-panel-header {
    font-weight: bold;
  }
  `);

export class ServerInfoPanel extends MultiPanelBasePanel {
  static title = "application-settings.server-info.title";
  static id = "server-info-panel";

  async setupUI() {
    this.panelElement.innerHTML = "";
    this.panelElement.style = "gap: 1em;";

    Object.entries(serverInfo).flatMap((entry) => {
      const container = html.div({ class: "fontra-ui-server-info-panel-card" }, []);
      container.appendChild(
        html.createDomElement("div", {
          class: "fontra-ui-server-info-panel-header",
          textContent: entry[0] + ":",
        })
      );
      container.appendChild(
        html.createDomElement("div", {
          class: "fontra-ui-server-info-panel-plain",
          textContent: entry[1],
        })
      );
      this.panelElement.appendChild(container);
    });
  }
}
