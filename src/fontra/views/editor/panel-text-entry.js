import * as html from "/core/unlit.js";
import Panel from "./panel.js";

export default class TextEntryPanel extends Panel {
  name = "text-entry";
  icon = "/images/texttool.svg";

  getContentElement() {
    return html.div(
      {
        class: "sidebar-text-entry",
      },
      [
        html.createDomElement("textarea", {
          rows: 1,
          wrap: "off",
          id: "text-entry-textarea",
        }),
        html.div(
          {
            id: "text-align-menu",
          },
          [
            html.createDomElement("inline-svg", {
              dataAlign: "left",
              src: "/images/alignleft.svg",
            }),
            html.createDomElement("inline-svg", {
              class: "selected",
              dataAlign: "center",
              src: "/images/aligncenter.svg",
            }),
            html.createDomElement("inline-svg", {
              dataAlign: "right",
              src: "/images/alignright.svg",
            }),
          ]
        ),
      ]
    );
  }
}
