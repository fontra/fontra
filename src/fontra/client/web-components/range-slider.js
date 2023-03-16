import { html, css, LitElement } from "https://cdn.jsdelivr.net/npm/lit@2.6.1/+esm";

export class RangeSlider extends LitElement {
  static styles = css`
    :host {
      --thumb-width: 20px;
    }

    .wrapper {
      position: relative;
      display: flex;
      padding-top: 5px;
      font-family: fontra-ui-regular, sans-serif;
    }

    .slider-name {
      margin-right: 0.5em;
      min-width: 7ch;
    }

    .tooltip {
      position: absolute;
      display: none;
      top: 1.8em;
      font-size: 1em;
      background: var(--editor-mini-console-background-color);
      border-radius: 5px;
      padding: 0 1em;
      opacity: 0.95;
      z-index: 100;
    }

    .slider-name:hover > .tooltip {
      display: block;
    }

    input {
      width: inherit;
    }

    .numeric-input {
      margin-right: 1.5em;
      width: inherit;
      display: flex;
      flex-direction: row;
      justify-content: space-between;
    }

    .numeric-input > div {
      opacity: 0.3;
      font-size: 10px;
      padding: 5px;
      color: white;
      background-color: black;
      border: 1px solid black;
      border-radius: 5px;
      pointer-events: none;
    }

    .numeric-input > .slider-input {
      position: relative;
    }

    .numeric-input > .slider-input > .slider-default-value {
      width: 40px;
      border-radius: 5px;
      border: 1px solid dimgray;
      text-align: center;
      font-size: 0.85em;
    }

    .reset {
      cursor: pointer;
      opacity: 1;
    }

    .range-container {
      position: relative;
    }

    /* Chrome, Safari, Edge, Opera */
    .slider-default-value::-webkit-outer-spin-button,
    .slider-default-value::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    /* Firefox */
    .slider-default-value[type="number"] {
      -moz-appearance: textfield;
    }

    .slider {
      -webkit-appearance: none;
      position: relative;
      margin: 0;
      width: 100%;
      background: transparent;
    }

    /* Special styling for WebKit/Blink */
    .slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      height: 12px;
      width: var(--thumb-width);
      background: #282828;
      border: none;
      border-radius: 7px;
      cursor: pointer;
      margin-top: -3.5px; /* You need to specify a margin in Chrome, but in Firefox and IE it is automatic */
    }

    .slider::-webkit-slider-runnable-track {
      height: 5px;
      background: dimgray;
    }

    .slider:focus::-webkit-slider-runnable-track {
      background: dimgray;
    }

    /* Firefox */
    .slider::-moz-range-thumb {
      height: 12px;
      width: var(--thumb-width);
      background: #282828;
      border: none;
      cursor: pointer;
    }

    .slider::-moz-range-track {
      height: 5px;
      background: dimgray;
    }

    /* All the same stuff for IE */
    .slider::-ms-thumb {
      height: 12px;
      width: var(--thumb-width);
      background: #282828;
      border: none;
      cursor: pointer;
    }

    .slider::-ms-track {
      height: 5px;
      background: dimgray;
    }

    .range-container > input + div {
      margin-top: -11px;
      z-index: -1;
    }

    .range-container > .range-slider-options {
      position: relative;
      padding: 0 10px; // half of var(--thumb-width). Not recognised if referenced by variable
    }

    .range-container > .range-slider-options > span {
      display: block;
      position: relative;
      left: calc(var(--offset));
      width: 2px;
      height: 5.5px;
      opacity: 0.65;
      background: dimgray;
    }
  `;

  static properties = {
    name: { type: String },
    minValue: { type: Number },
    maxValue: { type: Number },
    defaultValue: { type: Number },
    value: { type: Number },
    tickmarksPositions: { type: Array },
    step: { type: Number },
    onChangeCallback: { type: Function },
  };

  constructor() {
    super();
    // Fallbacks for attributes that are not defined when calling the component
    this.name = "Slider";
    this.minValue = 0;
    this.maxValue = 100;
    this.defaultValue = this.minValue;
    this.value = this.defaultValue;
    this.tickmarksPositions = [];
    this.step = "any";
    this.onChangeCallback = () => {};
  }

  render() {
    return html`
      <div class="wrapper">
        <div class="slider-name">
          ${this.name}
          <div class="tooltip">
            <p>Name: ${this.name}</p>
            <p>
              Values:<br />
              <span>Min: ${this.minValue}</span>&nbsp;
              <span>Default: ${this.defaultValue}</span>&nbsp;
              <span>Max: ${this.maxValue}</span>
            </p>
            <p>
              <span class="reset" @click=${this.reset}>Reset to default ↺</span>
            </p>
          </div>
        </div>
        <div class="numeric-input">
          <section class="slider-input">
            <input
              type="number"
              @input=${this.changeValue}
              class="slider-default-value"
              min=${this.minValue}
              max=${this.maxValue}
              step=${this.step}
              pattern="[0-9]+"
              .value=${Number(Math.round(parseFloat(this.value + "e" + 2)) + "e-" + 2)}
            />
          </section>
        </div>
        <div class="range-container">
          <input
            type="range"
            @input=${this.changeValue}
            class="slider"
            min=${this.minValue}
            max=${this.maxValue}
            step=${this.step}
            .value=${this.value}
            list="markers"
          />
          <div class="range-slider-options">
            ${this.tickmarksPositions.map((pos) => {
              const posOffset =
                ((pos - this.minValue) / (this.maxValue - this.minValue)) * 100;
              return html`<span style="--offset: ${posOffset}%;"></span>`;
            })}
          </div>
          <datalist id="markers">
            ${this.tickmarksPositions.map(
              (pos) => html`<option value="${pos}"></option>`
            )}
          </datalist>
        </div>
      </div>
    `;
  }

  changeValue(e) {
    const value = e.target.value;
    const isValid = e.target.reportValidity();
    if (isValid) {
      this.value = value;
    } else {
      e.target.setAttribute("aria-invalid", !isValid);
      this.value = this.defaultValue;
    }
    this.onChangeCallback();
  }

  reset() {
    this.value = this.defaultValue;
    this.onChangeCallback(this.value);
  }

  buildTickmarks() {
    if (this.defaultValue > this.minValue && this.defaultValue <= this.maxValue) {
      this.tickmarksPositions.push(this.defaultValue);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.buildTickmarks();
    this.reset();
  }
}

customElements.define("range-slider", RangeSlider);
