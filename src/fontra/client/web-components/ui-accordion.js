import * as html from "/core/html-utils.js";
import { UnlitElement } from "/core/html-utils.js";
import { enumerate } from "/core/utils.js";

export class Accordion extends UnlitElement {
  static styles = `
  .ui-accordion-contents {
    display: grid;
    grid-template-rows: auto;
    align-content: start;
    gap: 0.5em;
    text-wrap: wrap;
    width: 100%;
    box-sizing: border-box;
  }

  .ui-accordion-item {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 0.2em;
    min-height: 0;
    box-sizing: border-box;
  }

  .ui-accordion-item[hidden] {
    display: none;
  }

  .ui-accordion-item-header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    justify-content: start;
    align-items: center;
    font-weight: bold;
    cursor: pointer;
    box-sizing: border-box;
  }

  .ui-accordion-item .open-close-icon {
    height: 1.5em;
    width: 1.5em;
    transition: 120ms;
  }

  .ui-accordion-item.ui-accordion-item-closed .open-close-icon {
    transform: rotate(180deg);
  }

  .ui-accordion-item.ui-accordion-item-closed .ui-accordion-item-content {
    display: none;
  }

  .ui-accordion-item-content {
    display: block;
    box-sizing: border-box;
    overflow: hidden;
  }
  `;

  static properties = {
    items: { type: Array },
  };

  render() {
    const itemElements = [];
    for (const [index, item] of enumerate(this.items || [])) {
      const id = item.id || `ui-accordion-item-${index}`;

      const headerElement = html.div(
        {
          class: "ui-accordion-item-header",
          onclick: (event) => this._toggleItem(itemElement),
        },
        [
          html.createDomElement("inline-svg", {
            class: "open-close-icon",
            src: "/tabler-icons/chevron-up.svg",
          }),
          item.label,
        ]
      );
      if (item.auxiliaryHeaderElement) {
        headerElement.appendChild(item.auxiliaryHeaderElement);
      }

      const contentElement = html.div(
        { class: "ui-accordion-item-content", hidden: !item.open },
        [item.content]
      );

      const itemElement = html.div(
        { class: "ui-accordion-item", id: id, hidden: !!item.hidden },
        [headerElement, contentElement]
      );

      if (!item.open) {
        itemElement.classList.add("ui-accordion-item-closed");
      }

      itemElements.push(itemElement);
    }
    return [
      html.link({ href: "/css/tooltip.css", rel: "stylesheet" }),
      html.div({ class: "ui-accordion-contents" }, itemElements),
    ];
  }

  querySelector(selector) {
    return this.shadowRoot.querySelector(selector);
  }

  _toggleItem(itemElement) {
    itemElement.classList.toggle("ui-accordion-item-closed");
  }
}

customElements.define("ui-accordion", Accordion);
