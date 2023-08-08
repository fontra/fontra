import * as html from "/core/unlit.js";
import Panel from "./panel.js";

export default class SelectionInfoPanel extends Panel {
  name = "selection-info";
  icon = "/images/info.svg";

  getContentElement() {
    return html.div(
      {
        class: "selection-info",
      },
      [
        html.div(
          {
            id: "selection-info",
          },
          []
        ),
      ]
    );
  }
}
