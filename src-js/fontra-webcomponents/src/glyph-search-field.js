import * as html from "@fontra/core/html-utils.js";
import { SimpleElement } from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { themeColorCSS } from "./theme-support.js";

const colors = {
  "search-input-foreground-color": ["black", "white"],
  "search-input-background-color": ["#eee", "#333"],
};

export class GlyphSearchField extends SimpleElement {
  static styles = `
    ${themeColorCSS(colors)}

    input {
      color: var(--search-input-foreground-color);
      background-color: var(--search-input-background-color);
      font-family: fontra-ui-regular, sans-serif;
      font-size: 1.1rem;
      border-radius: 2em;
      border: none;
      outline: none;
      resize: none;
      width: 100%;
      height: 1.8em;
      padding: 0.2em 0.8em;
    }
  `;

  constructor(options) {
    super();
    this.searchField = html.input({
      type: "text",
      placeholder: translate("sidebar.glyphs.search"),
      autocomplete: "off",
      oninput: (event) => this._searchFieldChanged(event),
    });

    if (options?.settingsController) {
      this._settingsController = options.settingsController;
      this._searchStringKey = options.searchStringKey || "searchString";
      this._settingsController.addKeyListener(this._searchStringKey, (event) => {
        this.searchField.value = event.newValue;
      });
      this.searchField.value = this._settingsController.model.searchString;
    }

    this.shadowRoot.appendChild(this.searchField);
  }

  get searchString() {
    return this.searchField.value;
  }

  focusSearchField() {
    this.searchField.focus();
  }

  _searchFieldChanged(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const value = event.target.value;

    if (this._settingsController) {
      this._settingsController.model[this._searchStringKey] = value;
    }

    this.onSearchFieldChanged?.(event);
  }
}

customElements.define("glyph-search-field", GlyphSearchField);
