import * as html from "/core/unlit.js";
import Sidebar from "./sidebar-base.js";

export default class SidebarRight extends Sidebar {
  identifier = "right";
  attach(element) {
    element.appendChild(this.getContentElement());
    element.querySelector(".main-overlay-container").append(this.getSidebarTabs());
  }
  tabs = [{ name: "sidebar-selection-info", icon: "/images/info.svg" }];
  getSidebarTabContents() {
    return [
      html.div(
        {
          "class": "sidebar-resize-gutter",
          "data-growDirection": "left",
        },
        []
      ),
      html.div(
        {
          "class": "sidebar-content",
          "data-sidebarName": "sidebar-selection-info",
        },
        [
          html.div(
            {
              class: "sidebar-selection-info",
            },
            [
              html.div(
                {
                  id: "selection-info",
                },
                []
              ),
            ]
          ),
        ]
      ),
    ];
  }
}
