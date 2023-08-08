import * as html from "/core/unlit.js";
import Panel from "./panel.js";

export default class DesignspaceNavigationPanel extends Panel {
  name = "designspace-navigation";
  icon = "/images/sliders.svg";

  getContentElement() {
    return html.div(
      {
        id: "designspace-navigation",
      },
      [
        html.createDomElement(
          "designspace-location",
          {
            id: "designspace-location",
          },
          []
        ),
        html.createDomElement("ui-list", {
          id: "sources-list",
        }),
        html.createDomElement("add-remove-buttons", {
          id: "sources-list-add-remove-buttons",
        }),
      ]
    );
  }
}
