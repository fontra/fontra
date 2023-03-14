import { html, css, LitElement } from "https://cdn.jsdelivr.net/npm/lit@2.6.1/+esm";

export class AddRemoveButtons extends LitElement {
  static styles = css`
    .buttons-container {
      padding: 0.5em;
      padding-left: 0;
    }

    button {
      min-width: 2em;
    }

    button:enabled:hover {
      cursor: pointer;
    }
  `;

  static properties = {
    addButtonCallback: { type: Function },
    removeButtonCallback: { type: Function },
    disableRemoveButton: { type: Boolean },
  };
  constructor() {
    super();
    this.addButtonCallback = () => {};
    this.removeButtonCallback = () => {};
    this.disableRemoveButton = false;
  }

  render() {
    return html`
      <div class="buttons-container">
        <button name="add-button" @click=${() => this.addButtonCallback()}>+</button>
        <button
          name="remove-button"
          .disabled=${this.disableRemoveButton}
          @click=${() => this.removeButtonCallback()}
        >
          –
        </button>
      </div>
    `;
  }
}

customElements.define("add-remove-buttons", AddRemoveButtons);
