// This isn't really a web component, just a custom element.

import { htmlToElement } from "@fontra/core/html-utils.js";

export class InlineSVG extends HTMLElement {
  constructor(src) {
    super();
    if (src) {
      this.setAttribute("src", src);
    }
  }

  static get observedAttributes() {
    return ["src"];
  }

  get src() {
    return this.getAttribute("src");
  }

  set src(value) {
    return this.setAttribute("src", value);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "src") {
      if (newValue) {
        this.fetchSVG(newValue);
      } else {
        this.innerHTML = "";
      }
    }
  }

  async fetchSVG(svgSRC) {
    const svgElement = htmlToElement(await cachedSVGData(svgSRC));
    svgElement.removeAttribute("width");
    svgElement.removeAttribute("height");
    this.innerHTML = "";
    this.appendChild(svgElement);
  }
}

const svgDataCache = new Map();

async function cachedSVGData(svgSRC) {
  let svgData = svgDataCache.get(svgSRC);
  if (!svgData) {
    const response = await fetch(svgSRC);
    svgData = await response.text();
    svgDataCache.set(svgSRC, svgData);
  }
  return svgData;
}

customElements.define("inline-svg", InlineSVG);
