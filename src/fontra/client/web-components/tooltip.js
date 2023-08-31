import { UnlitElement } from "/core/unlit.js";
import * as html from "/core/unlit.js";

export class Tooltip extends UnlitElement {
  static styles = `
  .tooltip {
    background: #f2f2f2;
    position: absolute;
    width: 200px;
    padding: 9px;
    margin: 6px 0;
    box-shadow: 0 0 4px 0 #686868;
  }

  .hidden {
    display: none;
  }
  `;

  constructor() {
    super();
    this.x = 0;
    this.y = 0;
  }

  connectedCallback() {
    const showFor = this.parentElement.querySelector(this.showFor);
    const observer = new ResizeObserver(() => {
      if (!this._element) {
        return;
      }
      const boundingClientRect = showFor.getBoundingClientRect();
      this.x = boundingClientRect.x;
      this.y = boundingClientRect.y + boundingClientRect.height;
      this._element.style.top = this.y + "px";
      this._element.style.left = this.x + "px";
    });
    observer.observe(showFor);
    showFor.addEventListener("mouseover", () => {
      this._element.classList.remove("hidden");
    });
    showFor.addEventListener("mouseout", () => {
      this._element.classList.add("hidden");
    });
  }

  static properties = {
    text: { type: String },
    showFor: { type: String },
  };

  render() {
    this._element = html.div(
      {
        class: "tooltip hidden",
      },
      this.text
    );
    return this._element;
  }
}

customElements.define("tool-tip", Tooltip);
