import { html, css, LitElement } from "https://cdn.jsdelivr.net/npm/lit@2.6.1/+esm";

const reset = html` <svg
  xmlns="http://www.w3.org/2000/svg"
  enable-background="new 0 0 20 20"
  height="20px"
  viewBox="0 0 24 24"
  width="20px"
  fill="#000000"
>
  <title>Replay</title>
  <g>
    <rect fill="none" height="20" width="20" />
    <rect fill="none" height="20" width="20" />
    <rect fill="none" height="20" width="20" />
  </g>
  <g>
    <g />
    <path
      d="M12,5V1L7,6l5,5V7c3.31,0,6,2.69,6,6s-2.69,6-6,6s-6-2.69-6-6H4c0,4.42,3.58,8,8,8s8-3.58,8-8S16.42,5,12,5z"
    />
  </g>
</svg>`;

export class RangeSlider extends LitElement {
  static styles = css`
    .wrapper {
      display: flex;
    }

    .slider-name {
      margin-left: 0.5em;
      min-width: 5ch;
      text-align: right;
    }

    input {
      width: inherit;
    }

    .numeric-input {
      margin-right: 1.2em;
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
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.4s ease-in-out;
    }

    .numeric-input > .slider-input > span.active {
      opacity: 1;
    }

    .numeric-input > .slider-input > span > svg {
      width: 1.3em;
      height: 1.3em;
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
    tickMarksPositions: { type: Array },
    step: { type: Number },
  };

  constructor() {
    super();
    // Fallbacks for attributes that are not defined when calling the component
    this.name = "Slider";
    this.minValue = 0;
    this.maxValue = 100;
    this.defaultValue = this.midValue;
    this.tickMarksPositions = [];
    this.step = 0.1;
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
              .value=${this.defaultValue}
            />
            <span
              class="${this.defaultValue !== this.midValue ? "active" : ""}"
              @click=${this.reset}
              >${reset}</span
            >
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
            .value=${this.defaultValue}
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
    const defaultValue = e.target.value;
    const isValid = e.target.reportValidity();
    if (isValid) {
      this.defaultValue = defaultValue;
    } else {
      e.target.setAttribute("aria-invalid", !isValid);
      this.defaultValue = this.midValue;
    }
  }

  reset() {
    this.defaultValue = this.midValue;
  }

  get midValue() {
    return (this.maxValue - Math.abs(this.minValue)) / 2;
  }

  connectedCallback() {
    super.connectedCallback();
    this.reset();
  }
}

customElements.define("range-slider", RangeSlider);
