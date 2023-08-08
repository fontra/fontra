import * as html from "/core/unlit.js";
export default class Sidebar {
  // iconPath
  // identifier
  constructor(editorController) {
    this.editorController = editorController;
  }

  tabs = [];

  toggle(tabName) {
    const container = document.querySelector(`.sidebar-container.${this.identifier}`);
    let toggledTab;
    for (const tab of this.tabs) {
      const tabElement = document.querySelector(
        `.sidebar-tab[data-sidebar-name="${tab.name}"]`
      );
      const contentElement = document.querySelector(
        `.sidebar-content[data-sidebar-name="${tab.name}"]`
      );
      if (tabName === tab.name) {
        toggledTab = tabElement;
        const isSelected = tabElement.classList.contains("selected");
        tabElement.classList.toggle("selected", !isSelected);
        container.classList.toggle("visible", !isSelected);
        const shadowBox = document.querySelector(
          `.tab-overlay-container.${this.identifier} > .sidebar-shadow-box`
        );
        if (isSelected) {
          container.addEventListener(
            "transitionend",
            () => {
              contentElement.classList.remove("selected");
              shadowBox.classList.remove("visible");
            },
            { once: true }
          );
        } else {
          contentElement.classList.add("selected");
          shadowBox.classList.add("visible");
        }
      } else {
        tabElement.classList.remove("selected");
        contentElement.classList.remove("selected");
      }
    }
    return toggledTab.classList.contains("selected");
  }

  attach(element) {}

  getSidebarTabContents() {
    return [];
  }

  getContentElement() {
    return html.div(
      {
        class: `sidebar-container cleanable-overlay ${this.identifier}`,
      },
      this.getSidebarTabContents()
    );
  }

  getSidebarTabs() {
    return html.div(
      {
        class: `tab-overlay-container ${this.identifier}`,
      },
      [
        html.div({
          class: "sidebar-shadow-box",
        }),
        ...this.tabs.map((tab) =>
          html.div(
            {
              "class": "sidebar-tab",
              "data-sidebarName": tab.name,
            },
            [
              html.createDomElement("inline-svg", {
                src: tab.icon,
              }),
            ]
          )
        ),
      ]
    );
  }
}
