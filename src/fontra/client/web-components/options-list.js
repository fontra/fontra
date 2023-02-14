import { html, css, LitElement } from "https://cdn.jsdelivr.net/npm/lit@2.6.1/+esm";

export class OptionsList extends LitElement {
  static styles = css`
    ul {
      list-style: none;
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
                    id="${option.name}"
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
  }
}

customElements.define("options-list", OptionsList);
