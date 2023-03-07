import { html, css, LitElement } from "https://cdn.jsdelivr.net/npm/lit@2.6.1/+esm";

export class addRemoveButtons extends LitElement {
  static styles = css`
    .buttons-container {
      padding: 0.5em;
    }

    button {
      min-width: 2em;
    }

    button:hover {
      cursor: pointer;
    }
  `;

  static properties = {
    addButtonCallback: { type: Function },
    removeButtonCallback: { type: Function },
  };
  constructor() {
    super();
    this.addButtonCallback = () => {};
    this.removeButtonCallback = () => {};
  }

  render() {
    return html`
      <div class="buttons-container">
        <button name="add-button" @click=${() => this.addButtonCallback()}>+</button>
        <button name="remove-button" @click=${() => this.removeButtonCallback()}>
          -
        </button>
      </div>
    `;
  }
}

customElements.define("add-remove-buttons", addRemoveButtons);
