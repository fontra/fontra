import { UnlitElement, div } from "@fontra/core/html-utils.js";
import { SimpleSettings } from "./simple-settings.js";

export class GroupedSettings extends UnlitElement {
  static styles = `
    :host {
      overflow-y: auto;
    }

    .header {
      margin-top: 0.6em;
      margin-bottom: 0.2em;
      font-weight: bold;
    }
  `;

  static properties = {
    items: { type: Array },
  };

  render() {
    if (!this.items) {
      return;
    }
    return this.items.map((item) => {
      const simpleSettings = new SimpleSettings();
      simpleSettings.controller = item.controller;
      simpleSettings.descriptions = item.descriptions;
      return [div({ class: "header" }, [item.displayName]), simpleSettings];
    });
  }
}

customElements.define("grouped-settings", GroupedSettings);
