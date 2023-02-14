import { html, css, LitElement } from "https://cdn.jsdelivr.net/npm/lit@2.6.1/+esm";

export class OptionsList extends LitElement {
  static styles = css`
    .tree {
      --spacing: 1.5rem;
      --radius: 10px;
    }

    .tree li {
      display: block;
      position: relative;
      padding-left: calc(2 * var(--spacing) - var(--radius) - 2px);
    }

    .tree ul {
      margin-left: calc(var(--radius) - var(--spacing));
      padding-left: 0;
    }

    .tree ul li {
      border-left: 2px solid #ddd;
    }

    .tree ul li:last-child {
      border-color: transparent;
    }

    .tree ul li::before {
      content: "";
      display: block;
      position: absolute;
      top: calc(var(--spacing) / -2);
      left: -2px;
      width: calc(var(--spacing) + 2px);
      height: calc(var(--spacing) + 1px);
      border: solid #ddd;
      border-width: 0 0 2px 2px;
    }

    .tree summary {
      display: block;
      cursor: pointer;
    }

    .tree summary::marker,
    .tree summary::-webkit-details-marker {
      display: none;
    }

    .tree summary:focus {
      outline: none;
    }

    .tree summary:focus-visible {
      outline: 1px dotted #000;
    }

    .tree li::after,
    .tree summary::before {
      content: "";
      display: block;
      position: absolute;
      top: calc(var(--spacing) / 2 - var(--radius));
      left: calc(var(--spacing) - var(--radius) - 1px);
      width: calc(2 * var(--radius));
      height: calc(2 * var(--radius));
      border-radius: 50%;
      background: #ddd;
    }

    .tree summary::before {
      content: "+";
      z-index: 1;
      background: #222;
      color: #fff;
      line-height: calc(2 * var(--radius) - 2px);
      text-align: center;
    }

    .tree details[open] > summary::before {
      content: "−";
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

    if (this.options) {
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
      <ul class="tree">
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
    console.log(this.options);
  }
}

customElements.define("options-list", OptionsList);
