import { applicationSettingsController } from "@fontra/core/application-settings.js";
import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { MultiPanelBasePanel } from "@fontra/core/multi-panel.js";
import { labeledCheckbox, labeledTextInput } from "@fontra/core/ui-utils.js";
import { UnsignedIntegerFormatter } from "@fontra/core/formatters.js";
import { translate } from "@fontra/core/localization.js";

addStyleSheet(`
  .fontra-ui-editor-behavior-panel-card {
    background-color: var(--ui-element-background-color);
    border-radius: 0.5em;
    padding: 1em;
    display: grid;
    grid-template-columns: min-content auto;
    gap: 0.5em;
  }

  .section-header {
    grid-column: 1 / 3;
    font-weight: bold;
  }

  .section-header:not(:first-child) {
    margin-top: 1em;
  }

  input[type="number"] {
    width: 5em;
  }
  `);

export class EditorBehaviorPanel extends MultiPanelBasePanel {
  static title = "application-settings.editor-behavior.title";
  static id = "editor-behavior-panel";

  async setupUI() {
    this.panelElement.innerHTML = "";
    const container = html.createDomElement("div", {
      class: "fontra-ui-editor-behavior-panel-card",
    });

    container.append(
      html.span({ class: "section-header" }, [
        translate("application-settings.editor-behavior.arrow-key-section"),
      ]),
      ...labeledTextInput("", applicationSettingsController, "arrowKeyNudgeValue", {
        formatter: UnsignedIntegerFormatter,
        continuous: false,
        type: "number",
      }),
      ...labeledTextInput(
        translate("application-settings.editor-behavior.nudge-shift"),
        applicationSettingsController,
        "arrowKeyNudgeValueShift",
        {
          formatter: UnsignedIntegerFormatter,
          continuous: false,
          type: "number",
        }
      ),
      ...labeledTextInput(
        translate("application-settings.editor-behavior.nudge-shift-control"),
        applicationSettingsController,
        "arrowKeyNudgeValueShiftControl",
        {
          formatter: UnsignedIntegerFormatter,
          continuous: false,
          type: "number",
        }
      ),
      html.span({ class: "section-header" }, [
        translate("application-settings.editor-behavior.selection-behavior-section"),
      ]),
      html.span({}), // empty grid cell
      labeledCheckbox(
        translate(
          "application-settings.editor-behavior.rect-select-live-modifier-keys"
        ),
        applicationSettingsController,
        "rectSelectLiveModifierKeys",
        {}
      )
    );

    this.panelElement.appendChild(container);
  }
}
