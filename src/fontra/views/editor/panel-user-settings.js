import * as html from "/core/unlit.js";
import Panel from "./panel.js";

export default class UserSettingsPanel extends Panel {
  name = "user-settings";
  icon = "/images/gear.svg";

  getContentElement() {
    return html.div({ class: "sidebar-settings" }, [
      html.createDomElement("grouped-settings", {
        id: "user-settings",
      }),
    ]);
  }
}
