import * as html from "/core/unlit.js";
import Panel from "./panel.js";

export default class GlyphSearchPanel extends Panel {
  name = "glyph-search";
  icon = "/images/magnifyingglass.svg";

  getContentElement() {
    return html.div(
      {
        class: "sidebar-glyph-search",
      },
      [
        html.createDomElement("glyphs-search", {
          id: "glyphs-search",
        }),
      ]
    );
  }
}
