import * as html from "/core/unlit.js";
import { clamp } from "../../core/utils.js";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;

export default class Sidebar {
  constructor(identifier) {
    this.identifier = identifier;
    this.panels = [];
  }

  addPanel(panel) {
    this.panels.push(panel);
  }

  toggle(tabName) {
    const container = document.querySelector(`.sidebar-container.${this.identifier}`);
    let toggledTab;
    for (const tab of this.panels) {
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

  attach(element) {
    {
      const to = element.querySelector(`.sidebar-container.${this.identifier} slot`);
      const fragment = document.createDocumentFragment();
      for (const panel of this.panels) {
        fragment.appendChild(
          html.div(
            {
              "class": "sidebar-content",
              "data-sidebarName": panel.name,
            },
            [panel.getContentElement()]
          )
        );
      }
      to.replaceWith(fragment);
    }

    {
      const panelTabs = this.getPanelTabs();
      const fragment = document.createDocumentFragment();
      for (const panelTab of panelTabs) {
        fragment.appendChild(panelTab);
      }
      element
        .querySelector(`.tab-overlay-container.${this.identifier}`)
        .appendChild(fragment);
    }

    this.initResizeGutter();
  }

  initResizeGutter() {
    let initialWidth;
    let initialPointerCoordinateX;
    let sidebarResizing;
    let growDirection;
    let width;
    const onPointerMove = (event) => {
      if (sidebarResizing) {
        let cssProperty;
        if (growDirection === "left") {
          width = initialWidth + (initialPointerCoordinateX - event.clientX);
          cssProperty = "--sidebar-content-width-right";
        } else {
          width = initialWidth + (event.clientX - initialPointerCoordinateX);
          cssProperty = "--sidebar-content-width-left";
        }
        width = clamp(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
        document.documentElement.style.setProperty(cssProperty, `${width}px`);
      }
    };
    const onPointerUp = () => {
      localStorage.setItem(`fontra-sidebar-width-${this.identifier}`, width);
      sidebarResizing.classList.add("animating");
      sidebarResizing = undefined;
      initialWidth = undefined;
      growDirection = undefined;
      initialPointerCoordinateX = undefined;
      document.documentElement.classList.remove("sidebar-resizing");
      document.removeEventListener("pointermove", onPointerMove);
    };
    const gutter = document.querySelector(
      `.sidebar-container.${this.identifier} .sidebar-resize-gutter`
    );
    gutter.addEventListener("pointerdown", (event) => {
      sidebarResizing = gutter.parentElement;
      initialWidth = sidebarResizing.getBoundingClientRect().width;
      initialPointerCoordinateX = event.clientX;
      sidebarResizing.classList.remove("animating");
      growDirection = gutter.dataset.growDirection;
      document.documentElement.classList.add("sidebar-resizing");
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp, { once: true });
    });
    const sidebarWidth = localStorage.getItem(
      `fontra-sidebar-width-${this.identifier}`
    );
    if (sidebarWidth) {
      let width = clamp(parseInt(sidebarWidth), MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
      if (isNaN(width)) {
        width = MIN_SIDEBAR_WIDTH;
      }
      document.documentElement.style.setProperty(
        `--sidebar-content-width-${this.identifier}`,
        `${width}px`
      );
    }
  }

  getPanelTabs() {
    return this.panels.map((tab) =>
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
    );
  }
}
