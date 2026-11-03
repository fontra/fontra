import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { languageController, languages, translate } from "@fontra/core/localization.js";
import { MultiPanelBasePanel } from "@fontra/core/multi-panel.js";

addStyleSheet(`
  .fontra-ui-display-language-panel-card {
    background-color: var(--ui-element-background-color);
    border-radius: 0.5em;
    padding: 1em;
  }
  `);

const translationStatusStyle = `
  background-color: #BBB5;
  padding: 0em 0.3em 0.1em 0.3em;
  margin-left: 0.3em;
  border-radius: 0.4em;
  font-size: 0.9em;
`;

export class DisplayLanguagePanel extends MultiPanelBasePanel {
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
      const displayName = `${lang.langLang} / ${lang.langEn}`;

      return {
        key: lang.code,
        displayName: html.span({}, [
          displayName,
          lang.status != "done"
            ? html.span({ style: translationStatusStyle }, [
                translate(
                  `application-settings.display-language.status.${lang.status}`
                ),
              ])
            : "",
        ]),
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
