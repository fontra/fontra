// import { FontController } from "../core/font-controller.js";
import * as html from "../core/html-utils.js";
// import { getRemoteProxy } from "../core/remote.js";
// import { makeDisplayPath } from "../core/view-utils.js";
import { ShortcutsPanel, ensureShortcutsHasLoaded } from "./panel-shortcuts.js";
import { ensureLanguageHasLoaded, translate } from "/core/localization.js";
import { message } from "/web-components/modal-dialog.js";

export class ApplicationSettingsController {
  static async fromWebSocket() {
    document.title = `Fontra Application Settings`;
    // const pathItems = window.location.pathname.split("/").slice(3);
    // const displayPath = makeDisplayPath(pathItems);
    // document.title = `Fontra Application Settings — ${decodeURI(displayPath)}`;
    // const projectPath = pathItems.join("/");
    // const protocol = window.location.protocol === "http:" ? "ws" : "wss";
    // const wsURL = `${protocol}://${window.location.host}/websocket/${projectPath}`;

    // const remoteFontEngine = await getRemoteProxy(wsURL);
    // const applicationSettingsController = new ApplicationSettingsController(remoteFontEngine);
    // remoteFontEngine.receiver = applicationSettingsController;
    // remoteFontEngine.onclose = (event) => applicationSettingsController.handleRemoteClose(event);
    // remoteFontEngine.onerror = (event) => applicationSettingsController.handleRemoteError(event);

    await ensureLanguageHasLoaded;

    const applicationSettingsController = new ApplicationSettingsController();
    await applicationSettingsController.start();
    return applicationSettingsController;
  }

  // constructor(font) {
  //   this.fontController = new FontController(font);
  // }

  async start() {
    //await this.fontController.initialize();

    const url = new URL(window.location);
    this.selectedPanel = url.hash ? url.hash.slice(1) : "shortcuts-panel";

    const panelContainer = document.querySelector("#panel-container");
    const headerContainer = document.querySelector("#header-container");

    this.panels = {};
    const observer = setupIntersectionObserver(panelContainer, this.panels);

    const subscribePattern = {};

    for (const panelClass of [
      ShortcutsPanel,
      // TODO: Add more panels here:
      // EditorAppearancePanel,
      // ExtensionsPanel,
      // ServerInfoPanel,
    ]) {
      // panelClass.fontAttributes.forEach((fontAttr) => {
      //   subscribePattern[fontAttr] = null;
      // });

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

    //await this.fontController.subscribeChanges(subscribePattern, false);

    window.addEventListener("keydown", (event) => this.handleKeyDown(event));
  }

  handleKeyDown(event) {
    const panel = this.panels[this.selectedPanel];
    panel?.handleKeyDown?.(event);
  }

  async externalChange(change, isLiveChange) {
    await this.fontController.applyChange(change, true);
    this.fontController.notifyChangeListeners(change, isLiveChange, true);
  }

  async reloadData(reloadPattern) {
    // We have currently no way to refine update behavior based on the
    // reloadPattern.
    //
    // reloadEverything() will trigger the appropriate listeners
    this.fontController.reloadEverything();
  }

  async messageFromServer(headline, msg) {
    // don't await the dialog result, the server doesn't need an answer
    message(headline, msg);
  }

  handleRemoteClose(event) {
    //
  }

  handleRemoteError(event) {
    //
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
