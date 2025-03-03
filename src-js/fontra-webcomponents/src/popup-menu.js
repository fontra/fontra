import * as html from "@fontra/core/html-utils.js";
import { UnlitElement } from "@fontra/core/html-utils.js";
import { InlineSVG } from "./inline-svg.js";
import { showMenu } from "./menu-panel.js";
import { themeColorCSS } from "./theme-support.js";

const colors = {
  "border-color": ["#0004", "#FFF4"],
  "hover-color": ["#ccc", "#444"],
};

export class PopupMenu extends UnlitElement {
  static styles = `
    ${themeColorCSS(colors)}

    :host {
      cursor: pointer;
    }

    #popup-menu {
      background-color: var(--text-input-background-color);
      border-radius: 0.25em;
      padding: 0.1em 0.4em;
      display: grid;
      grid-template-columns: auto max-content;
      gap: 0.4em;
      border: 1px solid var(--border-color);
    }

    #popup-menu:hover {
      background-color: var(--hover-color);
    }

    inline-svg {
      display: inline-block;
      height: 1.25em;
      width: 1.25em;
      transform: rotate(180deg);
    }
  `;

  static properties = {
    valueLabel: { type: String },
  };

  constructor(valueLabel, getMenuItemsFunc) {
    super();
    this.valueLabel = valueLabel;
    this._getMenuItems = getMenuItemsFunc;
  }

  render() {
    return html.div(
      { id: "popup-menu", onmousedown: (event) => this._handleClickEvent(event) },
      [
        html.span({}, [this.valueLabel]),
        html.createDomElement("inline-svg", {
          src: "/tabler-icons/chevron-up.svg",
        }),
      ]
    );
  }

  _handleClickEvent(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (this._menu) {
      this._menu.dismiss();
      delete this._menu;
      return;
    }

    const menuItems = this._getMenuItems?.() || [];
    if (!menuItems.length) {
      return;
    }

    const dialogParent = null;
    const thisRect = this.getBoundingClientRect();
    let pos;

    if (dialogParent) {
      const dialogRect = dialogParent.getBoundingClientRect();
      pos = {
        x: thisRect.left - dialogRect.left,
        y: thisRect.bottom - dialogRect.y,
      };
    } else {
      pos = { x: thisRect.left, y: thisRect.bottom };
    }

    this._menu = showMenu(menuItems, pos, {
      onClose: () => {
        delete this._menu;
      },
    });
  }
}

customElements.define("popup-menu", PopupMenu);
