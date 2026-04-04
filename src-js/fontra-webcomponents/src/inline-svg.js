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
    try {
      const svgElement = htmlToElement(sanitizeSVG(await cachedSVGData(svgSRC)));
      svgElement.removeAttribute("width");
      svgElement.removeAttribute("height");
      this.innerHTML = "";
      this.appendChild(svgElement);
    } catch (error) {
      this.innerHTML = "";
      throw error;
    }
  }
}

function sanitizeSVG(svgData) {
  const doc = new DOMParser().parseFromString(svgData, "image/svg+xml");
  const svgElement = doc.documentElement;
  if (svgElement?.tagName?.toLowerCase() !== "svg") {
    throw new Error("Invalid SVG");
  }

  svgElement.querySelectorAll("script, foreignObject").forEach((el) => el.remove());

  for (const el of svgElement.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (
        (name === "href" || name === "xlink:href") &&
        value &&
        !value.startsWith("#")
      ) {
        el.removeAttribute(attr.name);
      }
    }
  }

  return svgElement.outerHTML;
}

const svgDataCache = new Map();

async function cachedSVGData(svgSRC) {
  const srcURL = new URL(svgSRC, window.location.href);
  if (srcURL.origin !== window.location.origin) {
    throw new Error("Cross-origin SVG sources are not allowed");
  }

  const cacheKey = srcURL.href;
  let svgData = svgDataCache.get(cacheKey);
  if (!svgData) {
    const response = await fetch(cacheKey);
    if (!response.ok) {
      throw new Error(`Failed to fetch SVG: ${response.status}`);
    }
    svgData = await response.text();
    svgDataCache.set(cacheKey, svgData);
  }
  return svgData;
}

customElements.define("inline-svg", InlineSVG);
