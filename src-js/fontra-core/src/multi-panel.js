import { Accordion } from "@fontra/web-components/ui-accordion.js";
import * as html from "./html-utils.js";
import { translate } from "./localization.js";

const foldingStateKey = "";

export class MultiPanelController {
  constructor(panelClasses, viewController, panelIdentifier) {
    this.panelIdentifier = panelIdentifier;
    this.foldingStateLocalStorageKey = `multi-panel-${panelIdentifier}-folded`;
    this.panels = {};

    this.selectedPanelIdentifier =
      getSelectedPanelIdentifierFromWindowLocation(panelClasses);

    const panelContainer = document.querySelector("#multi-panel-panel-container");
    const headerContainer = document.querySelector("#multi-panel-header-container");
    const headerItems = html.div({ id: "multi-panel-header-items" });

    this.headerAccordion = new Accordion();
    this.headerAccordion.appendStyle(`
      .multi-panel-header {
        cursor: pointer;
        font-size: 1.15em;
        font-weight: bold;
        text-underline-offset: 0.15em;
      }

      .multi-panel-header:hover {
        text-decoration: underline dotted;
      }

      .multi-panel-header.selected {
        text-decoration: underline;
      }

      #multi-panel-header-items {
        display: grid;
        gap: 0.5em;
      }
    `);

    this.headerAccordion.items = [
      {
        label: "",
        content: headerItems,
        open: localStorage.getItem(this.foldingStateLocalStorageKey) === "true",
      },
    ];

    this.headerAccordion.onItemOpenClose = (item, openClose) => {
      localStorage.setItem(this.foldingStateLocalStorageKey, `${!!openClose}`);
    };

    headerContainer.appendChild(this.headerAccordion);

    const observer = setupIntersectionObserver(panelContainer, this.panels);

    for (const panelClass of panelClasses) {
      const headerElement = html.div(
        {
          class: "multi-panel-header",
          onclick: (event) => {
            this.selectPanel(event.target.getAttribute("for"));
          },
        },
        [translate(panelClass.title)]
      );
      if (panelClass.id === this.selectedPanelIdentifier) {
        headerElement.classList.add("selected");
      }
      headerElement.setAttribute("for", panelClass.id);
      headerItems.appendChild(headerElement);

      const panelElement = html.div({
        class: "multi-panel-panel",
        tabindex: 1,
        id: panelClass.id,
        hidden: panelClass.id != this.selectedPanelIdentifier,
      });
      panelContainer.appendChild(panelElement);

      this.panels[panelClass.id] = new panelClass(viewController, panelElement);
      observer.observe(panelElement);
    }

    window.addEventListener("popstate", (event) => {
      this.selectPanel(getSelectedPanelIdentifierFromWindowLocation(panelClasses));
    });
  }

  selectPanel(panelIdentifier) {
    this.headerAccordion
      .querySelector(".multi-panel-header.selected")
      ?.classList.remove("selected");

    const selectedHeader = this.headerAccordion.querySelector(
      `.multi-panel-header[for=${panelIdentifier}]`
    );
    selectedHeader?.classList.add("selected");

    this.selectedPanelIdentifier = panelIdentifier;
    for (const el of document.querySelectorAll(".multi-panel-panel")) {
      el.hidden = el.id != this.selectedPanelIdentifier;
      if (el.id == this.selectedPanelIdentifier) {
        el.focus(); // So it can receive key events
      }
    }

    const url = new URL(window.location);
    url.hash = `#${this.selectedPanelIdentifier}`;
    window.history.replaceState({}, "", url);
  }

  get selectedPanel() {
    return this.panels[this.selectedPanelIdentifier];
  }
}

function setupIntersectionObserver(panelContainer, panels) {
  return new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        const panel = panels[entry.target.id];
        if (!panel) {
          return;
        }
        if (panel.visible !== entry.isIntersecting) {
          panel.visibilityChanged(entry.isIntersecting);
        }
      });
    },
    {
      root: panelContainer,
    }
  );
}

export class MultiPanelBasePanel {
  constructor(viewController, panelElement) {
    this.viewController = viewController;
    this.panelElement = panelElement;
  }

  visibilityChanged(onOff) {
    this.visible = onOff;
    if (onOff && !this.initialized) {
      this.initializePanel();
      this.initialized = true;
    }
  }

  initializePanel() {
    this.setupUI();
  }
}

function getSelectedPanelIdentifierFromWindowLocation(panelClasses) {
  const panelIdentifiers = panelClasses.map((p) => p.id);
  const url = new URL(window.location);
  const selectedPanelIdentifier = url.hash?.slice(1);
  return panelIdentifiers.includes(selectedPanelIdentifier)
    ? selectedPanelIdentifier
    : panelIdentifiers[0];
}
