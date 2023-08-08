import * as html from "/core/unlit.js";
import Panel from "./panel.js";

export default class ReferenceFontPanel extends Panel {
  name = "reference-font";
  icon = "/images/reference.svg";

  getContentElement() {
    return html.div(
      {
        class: "sidebar-reference-font",
      },
      [
        html.createDomElement("reference-font", {
          id: "reference-font",
        }),
      ]
    );
  }
}
