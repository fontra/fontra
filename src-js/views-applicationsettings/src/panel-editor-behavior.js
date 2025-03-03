import { applicationSettingsController } from "@fontra/core/application-settings.js";
import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { labeledCheckbox } from "@fontra/core/ui-utils.js";
import { BaseInfoPanel } from "./panel-base.js";

addStyleSheet(`
  .fontra-ui-editor-behavior-panel-card {
    background-color: var(--ui-element-background-color);
    border-radius: 0.5em;
    padding: 1em;
  }
  `);

export class EditorBehaviorPanel extends BaseInfoPanel {
  static title = "application-settings.editor-behavior.title";
  static id = "editor-behavior-panel";

  async setupUI() {
    this.panelElement.innerHTML = "";
    const container = html.createDomElement("div", {
      class: "fontra-ui-editor-behavior-panel-card",
    });

    container.appendChild(
      labeledCheckbox(
        "Rect-select live modifier keys",
        applicationSettingsController,
        "rectSelectLiveModifierKeys",
        {}
      )
    );
    this.panelElement.appendChild(container);
  }
}
