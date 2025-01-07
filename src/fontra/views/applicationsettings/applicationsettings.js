import * as html from "../core/html-utils.js";
import { ClipboardPanel } from "./panel-clipboard.js";
import { DisplayLanguagePanel } from "./panel-display-language.js";
import { EditorBehaviorPanel } from "./panel-editor-behavior.js";
import { PluginsManagerPanel } from "./panel-plugins-manager.js";
import { ServerInfoPanel } from "./panel-server-info.js";
import { ShortCutsPanel } from "./panel-shortcuts.js";
import { ThemeSettingsPanel } from "./panel-theme-settings.js";
import { ensureLanguageHasLoaded, translate } from "/core/localization.js";
import { ViewController } from "/core/view-controller.js";
import { message } from "/web-components/modal-dialog.js";

export class ApplicationSettingsController extends ViewController {
  static titlePattern(displayPath) {
    return `Fontra Application Settings — ${decodeURI(displayPath)}`;
  }

  constructor(font) {
    super(font);

    this.initTopBar();
    this.initContextMenuItems();
  }

  async start() {
    await ensureLanguageHasLoaded;

    const url = new URL(window.location);
    this.selectedPanel = url.hash ? url.hash.slice(1) : "shortcuts-panel";

    const panelContainer = document.querySelector("#panel-container");
    const headerContainer = document.querySelector("#header-container");

    this.panels = {};
    const observer = setupIntersectionObserver(panelContainer, this.panels);

    for (const panelClass of [
      ShortCutsPanel,
      ThemeSettingsPanel,
      DisplayLanguagePanel,
      ClipboardPanel,
      EditorBehaviorPanel,
      PluginsManagerPanel,
      ServerInfoPanel,
    ]) {
      const headerElement = html.div(
        {
          class: "header",
          onclick: (event) => {
            document.querySelector(".header.selected")?.classList.remove("selected");
            const clickedHeader = event.target;
            clickedHeader.classList.add("selected");
            this.selectedPanel = clickedHeader.getAttribute("for");
            for (const el of document.querySelectorAll(".application-settings-panel")) {
              el.hidden = el.id != this.selectedPanel;
              if (el.id == this.selectedPanel) {
                el.focus(); // So it can receive key events
              }
            }

            const url = new URL(window.location);
            url.hash = `#${this.selectedPanel}`;
            window.history.replaceState({}, "", url);
          },
        },
        [translate(panelClass.title)]
      );
      if (panelClass.id === this.selectedPanel) {
        headerElement.classList.add("selected");
      }
      headerElement.setAttribute("for", panelClass.id);
      headerContainer.appendChild(headerElement);

      const panelElement = html.div({
        class: "application-settings-panel",
        tabindex: 1,
        id: panelClass.id,
        hidden: panelClass.id != this.selectedPanel,
      });
      panelContainer.appendChild(panelElement);

      this.panels[panelClass.id] = new panelClass(this, panelElement);
      observer.observe(panelElement);
    }

    window.addEventListener("keydown", (event) => this.handleKeyDown(event));
  }

  handleKeyDown(event) {
    const panel = this.panels[this.selectedPanel];
    panel?.handleKeyDown?.(event);
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
