import * as html from "@fontra/core/html-utils.js";
import { UnlitElement } from "@fontra/core/html-utils.js";
import { FocusKeeper } from "@fontra/core/utils.js";
import { InlineSVG } from "./inline-svg.js";

export class IconButton extends UnlitElement {
  static styles = `
    :host {
      line-height: 0;
    }

    button {
      background-color: transparent;
      border: none;
      padding: 0;
      margin: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
      contain: content;
    }

    button svg {
      will-change: transform;
      transition: 150ms;
    }

    button:hover svg {
      transform: scale(1.1, 1.1);
    }

    button:active svg {
      transform: scale(1.2, 1.2);
    }

    button:disabled {
      opacity: 35%;
    }

    button:disabled svg {
      transform: none;
    }
  `;

  constructor(src) {
    super();
    if (src) {
      this.setAttribute("src", src);
    }
  }

  static properties = {
    src: { type: String },
  };

  get disabled() {
    return this._buttonDisabled;
  }

  set disabled(value) {
    this._buttonDisabled = value;
    if (this._button) {
      this._button.disabled = value;
    }
  }

  set onclick(callback) {
    // Don't assign this.onclick, we only need button.onclick
    this._buttonOnClick = callback;
  }

  render() {
    const focus = new FocusKeeper();
    this._button = html.button(
      {
        onmousedown: focus.save,
        onclick: (event) => {
          this._buttonOnClick?.(event);
          event.stopImmediatePropagation();
          focus.restore();
        },
        disabled: this._buttonDisabled,
        style: `color: undefined var(--foreground-color);`, // TODO: huh.
      },
      [html.createDomElement("inline-svg", { src: this.src })]
    );
    return this._button;
  }
}

customElements.define("icon-button", IconButton);
