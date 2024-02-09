import { FontController } from "../core/font-controller.js";
import * as html from "../core/html-utils.js";
import { getRemoteProxy } from "../core/remote.js";
import { makeDisplayPath } from "../core/view-tools.js";

export class FontInfoController {
  static async fromWebSocket() {
    const pathItems = window.location.pathname.split("/").slice(3);
    const displayPath = makeDisplayPath(pathItems);
    document.title = `Fontra Font Info — ${decodeURI(displayPath)}`;
    const projectPath = pathItems.join("/");
    const protocol = window.location.protocol === "http:" ? "ws" : "wss";
    const wsURL = `${protocol}://${window.location.host}/websocket/${projectPath}`;

    const remoteFontEngine = await getRemoteProxy(wsURL);
    const fontInfoController = new FontInfoController(remoteFontEngine);
    remoteFontEngine.receiver = fontInfoController;
    remoteFontEngine.onclose = (event) => fontInfoController.handleRemoteClose(event);
    remoteFontEngine.onerror = (event) => fontInfoController.handleRemoteError(event);
    await fontInfoController.start();
    return fontInfoController;
  }

  constructor(font) {
    this.fontController = new FontController(font);
  }

  async start() {
    await this.fontController.initialize();
    console.log("axes?", this.fontController.globalAxes);

    const url = new URL(window.location);
    const selectedPanel = url.hash ? url.hash.slice(1) : "names-panel";

    const panelContainer = document.querySelector("#panel-container");
    const headerContainer = document.querySelector("#header-container");

    this.panels = {};
    const observer = setupIntersectionObserver(panelContainer, this.panels);

    for (const panelClass of [NamesPanel, AxesPanel, SourcesPanel]) {
      const headerElement = html.div(
        {
          class: "header",
          onclick: (event) => {
            const selectedPanel = event.target.getAttribute("for");
            for (const el of document.querySelectorAll(".font-info-panel")) {
              el.hidden = el.id != selectedPanel;
            }

            const url = new URL(window.location);
            url.hash = `#${selectedPanel}`;
            window.history.replaceState({}, "", url);
          },
        },
        [panelClass.title]
      );
      headerElement.setAttribute("for", panelClass.id);
      headerContainer.appendChild(headerElement);

      const panelElement = html.div(
        {
          class: "font-info-panel",
          id: panelClass.id,
          hidden: panelClass.id != selectedPanel,
        },
        [`panel ${panelClass.id}`]
      );
      panelContainer.appendChild(panelElement);

      this.panels[panelClass.id] = new panelClass(this, panelElement);
      observer.observe(panelElement);
    }
  }

  handleRemoteClose(event) {
    //
  }

  handleRemoteError(event) {
    //
  }
}

class BaseInfoPanel {
  constructor(fontInfoController, panelElement) {
    this.fontInfoController = fontInfoController;
    this.panelElement = panelElement;
  }

  visibilityChanged(onOff) {
    this.visible = onOff;
    if (onOff && !this.initialized) {
      this.setupUI();
      this.initialized = true;
    }
  }

  setupUI() {
    // override
    console.log("setupUI", this.constructor.id, this.panelElement);
  }
}

class NamesPanel extends BaseInfoPanel {
  static title = "Names";
  static id = "names-panel";
}

class AxesPanel extends BaseInfoPanel {
  static title = "Axes";
  static id = "axes-panel";
}

class SourcesPanel extends BaseInfoPanel {
  static title = "Sources";
  static id = "sources-panel";
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
