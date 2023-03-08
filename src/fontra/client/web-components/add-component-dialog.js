import { html, css, LitElement } from "https://cdn.jsdelivr.net/npm/lit@2.6.1/+esm";

export class addComponentDialog extends LitElement {
  static styles = css``;

  static properties = {
    addComponentCallback: { type: Function },
  };
  constructor(container) {
    super();
    this.addComponentCallback = () => {};
    this.glyphList = this.buildGlyphList();
    this.container = container;
    this.container.appendChild(this);
    this.container.classList.add("visible");
  }

  render() {
    return html`
      <section class="add-component-dialog">
        <div class="search-bar">Search glyphs</div>
        <div class="ui-list glyph-list">${this.glyphList}</div>
        <div class="buttons">
          <button name="cancel-button" @click=${() => this.dismissDialog()}>
            Cancel
          </button>
          <button name="add-button" @click=${() => this.addComponent()}>Add</button>
        </div>
      </section>
    `;
  }

  buildGlyphList() {
    return ["test list"];
  }

  addComponent() {
    this.addComponentCallback();
    this.dismissDialog();
  }

  dismissDialog() {
    this.container.removeChild(this);
    this.container.classList.remove("visible");
  }
}

customElements.define("add-component-dialog", addComponentDialog);
