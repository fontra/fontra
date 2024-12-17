import { SimpleElement, div } from "/core/html-utils.js";

export default class Panel extends SimpleElement {
  static styles = `
    .panel {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
      height: 100%;
      white-space: normal;
    }

    .panel-section {
      padding: 1em;
      overflow: hidden auto;
    }

    .panel-section--flex {
      flex: 1;
    }
  `;

  constructor(editorController) {
    super();
    this.editorController = editorController;
    this.contentElement = div(
      {
        class: "panel",
      },
      []
    );
    this.shadowRoot.appendChild(this.contentElement);
  }

  getPanelSection({ children = [], flexible = true }) {
    const classes = ["panel-section"];
    if (flexible) {
      classes.push("panel-section--flex");
    }
    return div(
      {
        class: classes.join(" "),
      },
      children
    );
  }

  async toggle(on, focus) {}
}
