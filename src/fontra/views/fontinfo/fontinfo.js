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
    this.font = font;
  }

  async start() {
    this.panels = {
      "names-panel": new NamesPanel(this),
      "axes-panel": new AxesPanel(this),
      "sources-panel": new SourcesPanel(this),
    };

    for (const el of document.querySelectorAll(".header")) {
      el.onclick = (event) => {
        const showID = event.target.getAttribute("for");
        for (const el of document.querySelectorAll(".content-item")) {
          el.hidden = el.id != showID;
        }
      };
    }

    this.axes = await this.font.getGlobalAxes();
    const contentContainer = document.querySelector("#content-container");

    const observer = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          const panel = this.panels[entry.target.id];
          panel?.visibilityChanged(entry.isIntersecting);
        });
      },
      {
        root: contentContainer,
      }
    );

    for (const contentItem of document.querySelectorAll(
      "#content-container .content-item"
    )) {
      observer.observe(contentItem);
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
  constructor(fontInfoController) {
    this.fontInfoController = fontInfoController;
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
    console.log("setupUI", this.constructor.id);
  }
}

class NamesPanel extends BaseInfoPanel {
  static id = "names-panel";

  constructor(fontInfoController) {
    super(fontInfoController);
  }
}

class AxesPanel extends BaseInfoPanel {
  static id = "axes-panel";

  constructor(fontInfoController) {
    super(fontInfoController);
  }
}

class SourcesPanel extends BaseInfoPanel {
  static id = "sources-panel";

  constructor(fontInfoController) {
    super(fontInfoController);
  }
}
