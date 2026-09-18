import { applicationSettingsController } from "@fontra/core/application-settings.js";
import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { MultiPanelBasePanel } from "@fontra/core/multi-panel.js";
import { labeledCheckbox, labeledTextInput } from "@fontra/core/ui-utils.js";
import { UnsignedIntegerFormatter } from "@fontra/core/formatters.js";

addStyleSheet(`
  .fontra-ui-editor-behavior-panel-card {
    background-color: var(--ui-element-background-color);
    border-radius: 0.5em;
    padding: 1em;
    display: grid;
    grid-template-columns: min-content auto;
    gap: 0.5em;
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
      ...labeledTextInput(
        "Arrow key nudge",
        applicationSettingsController,
        "arrowKeyNudgeValue",
        {
          formatter: UnsignedIntegerFormatter,
          continuous: false,
          type: "number",
        }
      ),
      ...labeledTextInput(
        "Arrow key nudge (shift)",
        applicationSettingsController,
        "arrowKeyNudgeValueShift",
        {
          formatter: UnsignedIntegerFormatter,
          continuous: false,
          type: "number",
        }
      ),
      ...labeledTextInput(
        "Arrow key nudge (shift + control/command)",
        applicationSettingsController,
        "arrowKeyNudgeValueShiftControl",
        {
          formatter: UnsignedIntegerFormatter,
          continuous: false,
          type: "number",
        }
      ),
      html.span({}), // empty grid cell
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
