import { SimpleElement } from "/core/unlit.js";

export default class Panel extends SimpleElement {
  constructor(editorController, renderContentElement = true) {
    super();
    this.editorController = editorController;
    if (renderContentElement) {
      this.renderContentElement();
    }
  }

  renderContentElement() {
    this.contentElement = this.getContentElement();
    this.shadowRoot.appendChild(this.contentElement);
  }

  getContentElement() {}

  attach() {}

  async toggle(on, focus) {}
}

customElements.define("fontra-panel", Panel);
