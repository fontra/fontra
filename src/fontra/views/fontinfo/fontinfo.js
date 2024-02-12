import { FontController } from "../core/font-controller.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import { getRemoteProxy } from "../core/remote.js";
import { labeledTextInput, setupSortableList } from "../core/ui-utils.js";
import { makeDisplayPath } from "../core/view-utils.js";
import { IconButton } from "../web-components/icon-button.js";

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

    const url = new URL(window.location);
    const selectedPanel = url.hash ? url.hash.slice(1) : "family-info-panel";

    const panelContainer = document.querySelector("#panel-container");
    const headerContainer = document.querySelector("#header-container");

    this.panels = {};
    const observer = setupIntersectionObserver(panelContainer, this.panels);

    for (const panelClass of [NamesPanel, AxesPanel, SourcesPanel]) {
      const headerElement = html.div(
        {
          class: "header",
          onclick: (event) => {
            document.querySelector(".header.selected")?.classList.remove("selected");
            const clickedHeader = event.target;
            clickedHeader.classList.add("selected");
            const selectedPanel = clickedHeader.getAttribute("for");
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
      if (panelClass.id === selectedPanel) {
        headerElement.classList.add("selected");
      }
      headerElement.setAttribute("for", panelClass.id);
      headerContainer.appendChild(headerElement);

      const panelElement = html.div({
        class: "font-info-panel",
        id: panelClass.id,
        hidden: panelClass.id != selectedPanel,
      });
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
    this.panelElement.appendChild(
      html.div({}, [`panel placeholder ${this.constructor.id}`])
    );
  }
}

class NamesPanel extends BaseInfoPanel {
  static title = "Family info";
  static id = "family-info-panel";
}

class AxesPanel extends BaseInfoPanel {
  static title = "Axes";
  static id = "axes-panel";

  setupUI() {
    const fontController = this.fontInfoController.fontController;

    const axisContainer = html.div({
      style: "display: grid; gap: 0.5em;",
    });

    for (const axis of fontController.globalAxes) {
      axisContainer.appendChild(makeAxisBox(axis));
    }

    setupSortableList(axisContainer);

    axisContainer.addEventListener("reordered", (event) =>
      console.log("list reordered")
    );

    this.panelElement.appendChild(axisContainer);
  }
}

addStyleSheet(`
.fontra-ui-font-info-axes-panel-axis-box {
  background-color: #FFF;
  border-radius: 0.5em;
  padding: 1em;
  cursor: pointer;
  display: grid;
  grid-template-columns: max-content max-content auto;
  gap: 0.5em;
}

.fontra-ui-font-info-axes-panel-axis-box-values,
.fontra-ui-font-info-axes-panel-axis-box-names {
  display: grid;
  grid-template-columns: max-content max-content;
  gap: 0.5em;
}

.fontra-ui-font-info-axes-panel-axis-box-delete {
  justify-self: end;
  align-self: start;
}
`);

function makeAxisBox(axis) {
  const controller = new ObservableController(axis);
  return html.div(
    { class: "fontra-ui-font-info-axes-panel-axis-box", draggable: true },
    [
      html.div(
        { class: "fontra-ui-font-info-axes-panel-axis-box-names" },
        [
          ["Name", "name"],
          ["OT Tag", "tag"],
          ["UI Name", "label"],
        ]
          .map(([labelName, keyName]) =>
            labeledTextInput(labelName, controller, keyName)
          )
          .flat()
      ),
      html.div(
        { class: "fontra-ui-font-info-axes-panel-axis-box-values" },
        [
          ["Minimum", "minValue"],
          ["Default", "defaultValue"],
          ["Maximum", "maxValue"],
        ]
          .map(([labelName, keyName]) =>
            labeledTextInput(labelName, controller, keyName, { type: "number" })
          )
          .flat()
      ),
      html.createDomElement("icon-button", {
        class: "fontra-ui-font-info-axes-panel-axis-box-delete",
        src: "/tabler-icons/trash.svg",
        onclick: (event) => console.log("delete axis"),
      }),
    ]
  );
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
