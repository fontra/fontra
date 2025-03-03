import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { clamp, hyphenatedToLabel } from "@fontra/core/utils.js";

export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 500;

export class Sidebar {
  constructor(identifier) {
    this.identifier = identifier;
    this.container = null;
    this.panelIdentifiers = [];
  }

  addPanel(panelElement) {
    if (!this.container) {
      throw new Error("Sidebar needs to be attached to a container element.");
    }

    this.panelIdentifiers.push(panelElement.identifier);

    const sidebarContainer = this.container.querySelector(
      `.sidebar-container.${this.identifier}`
    );

    const panelContent = html.div(
      {
        "class": "sidebar-content",
        "data-sidebarName": panelElement.identifier,
      },
      [panelElement]
    );

    sidebarContainer.append(panelContent);

    const tabOverlayContainer = this.container.querySelector(
      `.tab-overlay-container.${this.identifier}`
    );

    tabOverlayContainer.appendChild(
      html.div(
        {
          "class": "sidebar-tab",
          "data-sidebarName": panelElement.identifier,
          "data-tooltip": translate("sidebar." + panelElement.identifier),
          "data-tooltipposition": this.identifier === "right" ? "left" : "right",
        },
        [html.createDomElement("inline-svg", { src: panelElement.iconPath })]
      )
    );
  }

  toggle(tabName) {
    const container = document.querySelector(`.sidebar-container.${this.identifier}`);
    let toggledTab;
    for (const panelIdentifier of this.panelIdentifiers) {
      const tabElement = document.querySelector(
        `.sidebar-tab[data-sidebar-name="${panelIdentifier}"]`
      );
      const contentElement = document.querySelector(
        `.sidebar-content[data-sidebar-name="${panelIdentifier}"]`
      );
      if (tabName === panelIdentifier) {
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
    this.container = element;
    this.initResizeGutter();

    if (localStorage.getItem(`fontra-selected-sidebar-${this.identifier}`)) {
      const container = document.querySelector(`.sidebar-container.${this.identifier}`);
      const shadowBox = document.querySelector(
        `.tab-overlay-container.${this.identifier} > .sidebar-shadow-box`
      );
      container.classList.add("visible");
      shadowBox.classList.add("visible");
    }
  }

  applyWidth(width, saveLocalStorage = false) {
    if (width === undefined) {
      return;
    }
    if (saveLocalStorage) {
      localStorage.setItem(`fontra-sidebar-width-${this.identifier}`, width);
    }
    document.documentElement.style.setProperty(
      `--sidebar-content-width-${this.identifier}`,
      `${width}px`
    );
  }

  getStoredWidth() {
    const sidebarWidth = localStorage.getItem(
      `fontra-sidebar-width-${this.identifier}`
    );

    if (!sidebarWidth) {
      return;
    }

    return clamp(parseInt(sidebarWidth), MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
  }

  getDOMWidth() {
    return parseInt(
      getComputedStyle(document.documentElement)
        .getPropertyValue(`--sidebar-content-width-${this.identifier}`)
        .replace("px", "")
    );
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
      this.applyWidth(width, true);
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
    const sidebarWidth = this.getStoredWidth();
    this.applyWidth(sidebarWidth);
  }
}
