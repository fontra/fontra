import * as html from "@fontra/core/html-utils.js";
import { InlineSVG } from "./inline-svg.js";
import { themeColorCSS } from "./theme-support.js";

const colors = {
  "button-color": ["#ddd", "#888"],
  "button-disabled-color": ["#eee", "#555"],
  "button-hover-color": ["#ccc", "#999"],
  "button-active-color": ["#bbb", "#bbb"],
  "text-color": ["#000", "#fff"],
  "text-disabled-color": ["#aaa", "#888"],
};

class AddRemoveButtons extends html.UnlitElement {
  static styles = `
    ${themeColorCSS(colors)}

    .buttons-container {
      display: grid;
      grid-template-columns: auto auto;
      justify-content: start;
      gap: 0.5em;
    }

    button {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 1.6rem;
      height: 1.6rem;
      padding: 0;
      margin: 0;
      border-radius: 1rem;
      background-color: var(--button-color);
      fill: var(--text-color);
      border: none;
      line-height: 0;
    }

    button > inline-svg {
      width: 75%;
      height: 75%;
    }

    button:disabled {
      background-color: var(--button-disabled-color);
      fill: var(--text-disabled-color);
    }

    button:enabled:hover {
      background-color: var(--button-hover-color);
      cursor: pointer;
    }

    button:enabled:active {
      background-color: var(--button-active-color);
      cursor: pointer;
    }

    button:focus {
      outline: none;
    }
  `;

  static properties = {
    addButtonCallback: { type: Function },
    removeButtonCallback: { type: Function },
    disableAddButton: { type: Boolean },
    disableRemoveButton: { type: Boolean },
    hidden: { type: Boolean },
  };

  constructor() {
    super();
    this.addButtonCallback = () => {};
    this.removeButtonCallback = () => {};
    this.disableAddButton = false;
    this.disableRemoveButton = false;
    this.hidden = false;
  }

  render() {
    return this.hidden
      ? ""
      : html.div(
          {
            class: "buttons-container",
          },
          [
            html.button(
              {
                disabled: this.disableAddButton,
                onclick: () => {
                  this.addButtonCallback();
                },
              },
              [new InlineSVG("/images/plus.svg")]
            ),
            html.button(
              {
                disabled: this.disableRemoveButton,
                onclick: () => {
                  this.removeButtonCallback();
                },
              },
              [new InlineSVG("/images/minus.svg")]
            ),
          ]
        );
  }
}

customElements.define("add-remove-buttons", AddRemoveButtons);
