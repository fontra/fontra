import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { themeController } from "@fontra/core/theme-settings.js";
import { BaseInfoPanel } from "./panel-base.js";

addStyleSheet(`
  .fontra-ui-theme-settings-panel-card {
    background-color: var(--ui-element-background-color);
    border-radius: 0.5em;
    padding: 1em;
  }
  `);

export class ThemeSettingsPanel extends BaseInfoPanel {
  static title = "application-settings.theme-settings.title";
  static id = "theme-settings-panel";

  async setupUI() {
    this.panelElement.innerHTML = "";
    this.panelElement.style = "gap: 1em;";

    for (const cardContent of this.cards()) {
      const container = html.createDomElement("grouped-settings", {
        class: "fontra-ui-theme-settings-panel-card",
      });
      container.items = [cardContent];
      this.panelElement.appendChild(container);
    }
  }

  cards() {
    return [
      {
        displayName: translate("sidebar.user-settings.theme"),
        controller: themeController,
        descriptions: [
          {
            key: "theme",
            ui: "radio",
            options: [
              {
                key: "automatic",
                displayName: translate("sidebar.user-settings.theme.auto"),
              },
              {
                key: "light",
                displayName: translate("sidebar.user-settings.theme.light"),
              },
              {
                key: "dark",
                displayName: translate("sidebar.user-settings.theme.dark"),
              },
            ],
          },
        ],
      },
      // TODO: There might come more in future, like font size, colors etc.
    ];
  }
}
