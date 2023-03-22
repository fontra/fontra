import { html, css, LitElement } from "../third-party/lit.js";

export class OptionsList extends LitElement {
  static styles = css`
    ul {
      padding: 0;
      list-style: none;
    }

    summary {
      font-size: 1em;
      font-weight: bold;
      margin-bottom: 1rem;
    }

    details > div {
      padding-left: 0.55rem;
    }

    label {
      text-transform: capitalize;
    }
  `;

  static properties = {
    options: { type: Array },
  };

  constructor() {
    super();
    this.options = [];
  }

  optionsList() {
    let listHTML = "";

    if (this.options.length > 0) {
      listHTML = this.options.map((options) => {
        return html`<li>
          <details .open=${options.defaultOpen}>
            <summary>${options.name}</summary>
            ${options.items.map(
              (option) =>
                html`<div>
                  <input
                    type="checkbox"
                    id="${option.id}"
                    name="${option.name}"
                    .checked=${option.isChecked}
                    @change=${(option) => this.updateOptions(option)}
                  />
                  <label for="${option.name}">${option.name}</label>
                </div>`
            )}
          </details>
        </li>`;
      });
    }

    return listHTML;
  }

  render() {
    return html`
      <ul>
        ${this.optionsList()}
      </ul>
    `;
  }

  updateOptions(e) {
    let updatedOptions = null;
    this.options.forEach((option) => {
      if (updatedOptions) return;

      updatedOptions = option.items.find(
        (optionItem) => optionItem.name === e.target.name
      );
    });

    updatedOptions.isChecked = e.target.checked;

    const event = new CustomEvent("change", {
      bubbles: false,
      detail: e.target,
    });
    this.dispatchEvent(event);
  }
}

customElements.define("options-list", OptionsList);
