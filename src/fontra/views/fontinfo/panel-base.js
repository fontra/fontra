import * as html from "../core/html-utils.js";

export class BaseInfoPanel {
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
