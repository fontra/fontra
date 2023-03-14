import { html, css, LitElement } from "https://cdn.jsdelivr.net/npm/lit@2.6.1/+esm";

export class RangeSlider extends LitElement {
  static styles = css`
    .wrapper {
      display: flex;
      padding-top: 5px;
    }

    .slider-name {
      margin-left: 0.5em;
      min-width: 5ch;
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

    .numeric-input > .slider-input > span {
      position: absolute;
      top: -0.15em;
      padding: 0 0.15em;
      font-size: 1.2em;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.4s ease-in-out;
    }

    .numeric-input > .slider-input > span.active {
      opacity: 1;
    }

    .range-container {
      position: relative;
    }

    .min-max-values {
      position: absolute;
      display: none;
      justify-content: space-between;
      width: 100%;
      top: -10px;
      font-size: 0.8em;
    }

    .range-container:hover > .min-max-values {
      display: flex;
    }

    .range-container > input + div {
      margin-top: -11px;
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
      width: 20px;
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
      width: 20px;
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
      width: 20px;
      background: #282828;
      border: none;
      cursor: pointer;
    }

    .slider::-ms-track {
      height: 5px;
      background: dimgray;
    }

    .range-slider-options {
      position: relative;
      display: flex;
      justify-content: space-between;
      z-index: -1;
    }

    .range-slider-options > span {
      display: block;
      width: 2px;
      height: 3.5px;
      opacity: 0.65;
      background: dimgray;
    }
  `;

  static properties = {
    name: { type: String },
    minValue: { type: Number },
    maxValue: { type: Number },
    defaultValue: { state: true },
    currentValue: {},
    tickMarksPositions: { type: Array },
    step: { type: Number },
    onChangeCallback: { type: Function },
  };

  constructor() {
    super();
    // Fallbacks for attributes that are not defined when calling the component
    this.name = "Slider";
    this.minValue = 0;
    this.maxValue = 100;
    this.currentValue = this.defaultValue || this.minValue;
    this.tickMarksPositions = [];
    this.step = 0.1;
    this.onChangeCallback = () => {};
  }

  render() {
    return html`
      <div class="wrapper">
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
              .value=${this.currentValue}
            />
            <span
              class="${this.currentValue !== this.defaultValue ? "active" : ""}"
              @click=${this.reset}
              >↺</span
            >
          </section>
        </div>
        <div class="range-container">
          <div class="min-max-values">
            <span>${this.minValue}</span>
            <span>${this.maxValue}</span>
          </div>
          <input
            type="range"
            @input=${this.changeValue}
            class="slider"
            min=${this.minValue}
            max=${this.maxValue}
            step=${this.step}
            .value=${this.currentValue}
            list="markers"
          />
          <div class="range-slider-options">
            ${this.tickMarksPositions.map(() => html`<span></span>`)}
          </div>
          <datalist id="markers">
            ${this.tickMarksPositions.map(
              (pos) => html`<option value="${pos}"></option>`
            )}
          </datalist>
        </div>
        <div class="slider-name">${this.name}</div>
      </div>
    `;
  }

  changeValue(e) {
    const currentValue = e.target.value;
    const isValid = e.target.reportValidity();
    if (isValid) {
      this.currentValue = currentValue;
    } else {
      e.target.setAttribute("aria-invalid", !isValid);
      this.currentValue = this.defaultValue;
    }
    this.onChangeCallback(this.currentValue);
  }

  reset() {
    this.currentValue = this.defaultValue;
    this.onChangeCallback(this.currentValue);
  }

  connectedCallback() {
    super.connectedCallback();
    this.reset();
  }
}

customElements.define("range-slider", RangeSlider);
