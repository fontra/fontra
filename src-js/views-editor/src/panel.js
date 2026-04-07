import { SimpleElement } from "@fontra/core/html-utils.js";

export default class Panel extends SimpleElement {
  panelStyles = `
    .panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 0.5em;
    }
    .panel-section {
      padding: 1em;
    }
    .panel-section--flex {
      flex: 1;
    }
    .panel-section--scrollable {
      overflow: hidden auto;
    }
    .panel-section--noscroll {
      overflow: hidden;
    }
    .panel-section--full-height {
      height: 100%;
    }
    .panel-section--checkbox {
      display: grid;
      grid-template-columns: auto auto;
      justify-content: left;
      gap: 0.1em;
      align-items: center;
    }
  `;

  constructor(editorController) {
    super();
    this.editorController = editorController;
    this.fontController = editorController.fontController;
    this._appendStyle(this.panelStyles);
    this.contentElement = this.getContentElement();
    this.shadowRoot.appendChild(this.contentElement);
  }

  getContentElement() {}

  async toggle(on, focus) {}
}
