import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { languageController, languages, translate } from "@fontra/core/localization.js";
import { BaseInfoPanel } from "./panel-base.js";

addStyleSheet(`
  .fontra-ui-display-language-panel-card {
    background-color: var(--ui-element-background-color);
    border-radius: 0.5em;
    padding: 1em;
  }
  `);

export class DisplayLanguagePanel extends BaseInfoPanel {
  static title = "application-settings.display-language.title";
  static id = "display-language-panel";

  async setupUI() {
    this.panelElement.innerHTML = "";
    this.panelElement.style = "gap: 1em;";

    for (const cardContent of this.cards()) {
      const container = html.createDomElement("grouped-settings", {
        class: "fontra-ui-display-language-panel-card",
      });
      container.items = [cardContent];
      this.panelElement.appendChild(container);
    }
  }

  cards() {
    const languageOptions = languages.map((lang) => {
      let displayName = `${lang.langLang} / ${lang.langEn}`;
      if (lang.status != "done") {
        const statusString = translate(
          `application-settings.display-language.status.${lang.status}`
        );
        displayName += ` (${statusString})`;
      }
      return {
        key: lang.code,
        displayName: displayName,
      };
    });
    return [
      {
        displayName: "Display Language",
        controller: languageController,
        descriptions: [
          {
            key: "language",
            ui: "radio",
            options: languageOptions,
          },
          {
            ui: "plain",
            displayName: html.div({}, [
              html.br(),
              "If you'd like to contribute to the translations, please visit the ",
              html.a(
                {
                  href: "https://docs.google.com/spreadsheets/d/1woTU8dZCHJh7yvdk-N1kgQBUj4Sn3SdRsbKgn6ltJQs/edit?gid=1731105247#gid=1731105247",
                  target: "_blank",
                },
                ["public spreadsheet"]
              ),
              " where we maintain them. We welcome fixes, refinements, additions, " +
                "and full translations.",
            ]),
          },
        ],
      },
    ];
  }
}
