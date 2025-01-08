import { addStyleSheet, div } from "/core/html-utils.js";

export default class Panel extends HTMLElement {
  #cssName = "panel";
  #styles = `
    .panel {
      display: flex;
      height: 100%;
      gap: 0.5rem;
    }
    .panel__section {
      padding: 1rem;
    }
    .panel__section--flex {
      flex: 1;
    }
    .panel__section--overflow {
      overflow: hidden auto;
    }
  `;

  constructor(editorController) {
    super();
    this.editorController = editorController;
    addStyleSheet(this.#styles, null, this.#cssName);
    this.classList.add(this.#cssName);
    this.#createSections();
  }

  #createSections() {
    const sectionClass = `${this.#cssName}__section`;
    for (const { children, modifiers } of this.panelSections) {
      this.appendChild(
        div(
          {
            class: [
              sectionClass,
              ...(modifiers ?? []).map((modifier) => `${sectionClass}--${modifier}`),
            ].join(" "),
          },
          children
        )
      );
    }
  }

  // overridable
  // example: [{ modifiers: ["flex", "overflow"], children: [] }]
  get panelSections() {
    return [];
  }

  // overridable
  // @params (on, focus)
  async toggle() {}
}
