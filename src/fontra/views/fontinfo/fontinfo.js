import { FontController } from "../core/font-controller.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import { getRemoteProxy } from "../core/remote.js";
import { labeledTextInput, setupSortableList } from "../core/ui-utils.js";
import { zip } from "../core/utils.js";
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
  grid-template-columns: max-content max-content max-content auto;
  gap: 0.5em;
}

.fontra-ui-font-info-axes-panel-axis-box-values,
.fontra-ui-font-info-axes-panel-axis-box-names {
  display: grid;
  grid-template-columns: minmax(4.5em, max-content) max-content;
  gap: 0.5em;
  align-items: start;
  align-content: start;
}

.fontra-ui-font-info-axes-panel-axis-box-delete {
  justify-self: end;
  align-self: start;
}
`);

function makeAxisBox(axis) {
  const axisModel = { ...axis };
  const axisItems = !axisModel.values
    ? [
        ["Minimum", "minValue"],
        ["Default", "defaultValue"],
        ["Maximum", "maxValue"],
      ]
    : [
        ["Values", "valuesString"],
        ["Default", "defaultValue"],
      ];
  if (axisModel.values) {
    axisModel.valuesString = axisModel.values.join(" ");
  }
  const controller = new ObservableController(axisModel);
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
        axisItems
          .map(([labelName, keyName]) =>
            labeledTextInput(labelName, controller, keyName, {
              type: keyName === "valuesString" ? "text" : "number",
            })
          )
          .flat()
      ),
      buildMappingGraph(axis),
      html.createDomElement("icon-button", {
        class: "fontra-ui-font-info-axes-panel-axis-box-delete",
        src: "/tabler-icons/trash.svg",
        onclick: (event) => console.log("delete axis"),
      }),
    ]
  );
}

function buildMappingGraph(axis) {
  if (!axis.mapping.length) {
    return html.div(); // filler
  }
  const marginLeft = 4;
  const marginRight = 16;
  const marginTop = 4;
  const marginBottom = 16;
  const graphSize = 100;
  const width = graphSize + marginLeft + marginRight;
  const height = graphSize + marginTop + marginBottom;
  const xs = axis.mapping.map(([x, y]) => x);
  const ys = axis.mapping.map(([x, y]) => y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const graphX = xs.map((x) => (graphSize * (x - xMin)) / (xMax - xMin));
  const graphY = ys.map((y) => (graphSize * (y - yMin)) / (yMax - yMin));
  const pointsString = [...zip(graphX, graphY)].flat().join(" ");
  const nodeString = [...zip(xs, ys, graphX, graphY)]
    .map(
      ([x, y, gx, gy]) => `<circle class="node" cx="${gx}" cy="${gy}" fill="black" />`
    )
    .join("\n");
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
  viewBox="0 0 ${width} ${height}">
  <style>
  text {
    font-size: 0.8em;
  }
  .node {
    r: 4px;
    transition: 200ms;
  }
  .node:hover {
    r: 6px;
  }
  </style>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#F8F8F8" />
  <g transform="translate(0, ${height}) scale(1, -1)">
    <g transform="translate(${marginLeft}, ${marginBottom})">
      <rect x="0" y="0" width="${graphSize}" height="${graphSize}"
       fill="none" stroke="#8886"/>
      <polyline points="${pointsString}" stroke="gray" fill="none"
       stroke-linecap="round" stroke-linejoin="round" stroke-width="2px"/>
      ${nodeString}
      <text x="0" y="10" transform="scale(1, -1)">${xMin}</text>
      <text x="${
        graphSize / 2
      }" y="10" text-anchor="middle" transform="scale(1, -1)">user</text>
      <text x="${graphSize}" y="10" text-anchor="end" transform="scale(1, -1)">${xMax}</text>
      <g transform="translate(${graphSize}) rotate(90)">
        <text x="0" y="10" transform="scale(1, -1)">${yMin}</text>
        <text x="${
          graphSize / 2
        }" y="10" text-anchor="middle" transform="scale(1, -1)">source</text>
        <text x="${graphSize}" y="10" text-anchor="end" transform="scale(1, -1)">${yMax}</text>
      </g>
    </g>
  </g>
</svg>`;
  return html.htmlToElement(svgString);
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
