import * as html from "@fontra/core/html-utils.js";
import { clamp, round } from "@fontra/core/utils.js";
import { themeColorCSS } from "./theme-support.js";

const colors = {
  "thumb-color": ["#333", "#ddd"],
  "thumb-color-at-default": ["#ccc", "#777"],
  "track-color": ["#ccc", "#222"],
  "disabled-color": ["#ddd", "#2e2e2e"],
  "disabled-text-color": ["#999", "#aaa"],
};

export class RangeSlider extends html.UnlitElement {
  static styles = `
    ${themeColorCSS(colors)}

    :host {
      --thumb-height: 14px;
      --thumb-width: 14px;
      --track-height: 5px;
      --disabled-factor: 0.7;
    }

    .wrapper {
      position: relative;
      display: flex;
      gap: 0.5em;
      font-family: fontra-ui-regular, sans-serif;
      font-feature-settings: "tnum" 1;
    }

    .wrapper.disabled {
      height: var(--thumb-height);
      margin-top: -3px;
    }

    .range-container {
      position: relative;
      flex-grow: 1;
    }

    /* Chrome, Safari, Edge, Opera */
    .slider-numeric-input::-webkit-outer-spin-button,
    .slider-numeric-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    /* Firefox */
    .slider-numeric-input[type="number"] {
      -moz-appearance: textfield;
    }

    .slider {
      -webkit-appearance: none;
      position: relative;
      margin: 0;
      width: 100%;
      background: transparent;
      height: 1rem;
      vertical-align: middle;
    }

    .slider:disabled {
      height: calc(1rem * var(--disabled-factor));
    }

    /* Special styling for WebKit/Blink */
    .slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      height: var(--thumb-height);
      width: var(--thumb-width);
      background: var(--thumb-color);
      border: none;
      border-radius: 7px;
      cursor: pointer;
      margin-top: -4.5px; /* You need to specify a margin in Chrome, but in Firefox and IE it is automatic */
    }

    .slider:disabled::-webkit-slider-thumb {
      height: calc(var(--thumb-height) * var(--disabled-factor));
      background: var(--disabled-color);
      cursor: unset;
      margin-top: calc(-4.5px * var(--disabled-factor));
    }

    .slider.is-at-default:disabled::-webkit-slider-thumb {
      background: var(--disabled-color);
    }

    .slider.is-at-default::-webkit-slider-thumb {
      background: var(--thumb-color-at-default);
    }

    .slider::-webkit-slider-runnable-track {
      border-radius: 5px;
      height: var(--track-height);
      background: var(--track-color);
    }

    .slider:disabled::-webkit-slider-runnable-track {
      height: calc(var(--track-height) * var(--disabled-factor));
      background: var(--disabled-color);
    }

    /* Firefox */
    .slider::-moz-range-thumb {
      height: var(--thumb-height);
      width: var(--thumb-width);
      background: var(--thumb-color);
      border: none;
      cursor: pointer;
    }

    .slider:disabled::-moz-range-thumb {
      height: calc(var(--thumb-height) * var(--disabled-factor));
      background: var(--disabled-color);
      cursor: unset;
    }

    .slider.is-at-default::-moz-range-thumb {
      background: var(--thumb-color-at-default);
    }

    .slider.is-at-default:disabled::-moz-range-thumb {
      background: var(--disabled-color);
    }

    .slider::-moz-range-track {
      border-radius: 5px;
      height: var(--track-height);
      background: var(--track-color);
    }

    .slider:disabled::-moz-range-track {
      border-radius: calc(5px * var(--disabled-factor));
      height: calc(var(--track-height) * var(--disabled-factor));
      background: var(--disabled-color);
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

    input {
      width: inherit;
    }

    .numeric-input > div {
      opacity: 0.3;
      font-size: 1em;
      padding: 5px;
      pointer-events: none;
    }

    .numeric-input > .slider-input {
      position: relative;
    }

    .numeric-input > .slider-input > .slider-numeric-input {
      width: 40px;
      border-radius: 6px;

      outline: none;
      border: none;
      background-color: var(--text-input-background-color);
      color: var(--ui-element-foreground-color);

      padding: 2px 3px;

      text-align: center;
      font-family: fontra-ui-regular;
      font-feature-settings: "tnum" 1;
      font-size: 0.9em;
      vertical-align: middle;
    }

    .numeric-input > .slider-input > .slider-numeric-input:disabled {
      background-color: unset;
      color: var(--disabled-text-color);
      padding: 0 3px;
      font-size: 0.8em;
      border-radius: unset;
    }

    .tickmarks {
      display: flex;
      height: 6px;
      justify-content: space-between;
      padding: 7px calc(var(--thumb-width)/2 - 0.5px);
      padding-bottom: 0;
    }

    .tickmarks.disabled {
      height: calc(6px * var(--disabled-factor));
      padding: 7px calc(var(--thumb-width) * var(--disabled-factor) / 2 - 0.5px);
    }

    .tickmark {
      width: 1px;
      background: var(--track-color);
    }
    .tickmark.disabled {
      background: var(--disabled-color);
    }
  `;

  static properties = {
    minValue: { type: Number },
    maxValue: { type: Number },
    defaultValue: { type: Number },
    step: {},
    onChangeCallback: { type: Function },
    values: {},
  };

  constructor() {
    super();
    // Fallbacks for attributes that are not defined when calling the component
    this.minValue = 0;
    this.maxValue = 100;
    this.defaultValue = this.minValue;
    this.value = this.defaultValue;
    this.step = "any";
    this.sawMouseDown = false;
    this.sawMouseUp = false;
    this.sawChangeEvent = false;
    this.onChangeCallback = () => {};
    this.values = [];
    this.disabled = false;
  }

  get valueFormatted() {
    const minMaxRange = this.maxValue - this.minValue;
    const decimalPlaces = minMaxRange < 100 ? 3 : 2;
    return round(this.value, decimalPlaces);
  }

  set value(value) {
    this._value = value;
    if (this.rangeInput) {
      if (this.isDiscrete()) {
        this.rangeInput.value = this.values.indexOf(
          this.getClosestDiscreteValue(value)
        );
      } else {
        this.rangeInput.value = value;
      }
      this.updateIsAtDefault();
    }
    if (this.numberInput) {
      this.numberInput.value = this.valueFormatted;
    }
  }

  get value() {
    return this._value;
  }

  getClosestDiscreteValue(value) {
    let closestDistance;
    let closestDiscreteValue;
    for (const discreteValue of this.values) {
      const distance = Math.abs(value - discreteValue);
      if (closestDistance === undefined || distance < closestDistance) {
        closestDiscreteValue = discreteValue;
        closestDistance = distance;
      }
    }
    return closestDiscreteValue;
  }

  getValueFromEventTarget(event) {
    let value = event.target.valueAsNumber;
    const isValid = event.target.reportValidity();
    if (isValid && this.isDiscrete()) {
      if (event.target === this.rangeInput) {
        value = this.values[value];
      } else {
        value = this.getClosestDiscreteValue(value);
      }
    }
    if (!isValid) {
      event.target.setAttribute("aria-invalid", "true");
      if (event.target.validity.badInput || event.target.validity.valueMissing) {
        value = this.defaultValue;
      } else if (value < this.minValue) {
        value = this.minValue;
      } else if (value > this.maxValue) {
        value = this.maxValue;
      } else {
        value = this.defaultValue;
      }
    }
    return value;
  }

  getNextValue() {
    let index = this.values.indexOf(this.value);
    if (index !== this.values.length - 1) {
      index = index + 1;
    }
    return this.values[index];
  }

  getPrevValue() {
    let index = this.values.indexOf(this.value);
    if (index > 0) {
      index = index - 1;
    }
    return this.values[index];
  }

  onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    let value = this.getValueFromEventTarget(event);
    let increment = event.shiftKey ? 10 : 1;
    let dispatch;
    switch (event.key) {
      case "ArrowDown":
        if (this.isDiscrete()) {
          value = this.getPrevValue();
        } else {
          value = value - increment;
        }
        dispatch = true;
        break;
      case "ArrowUp":
        if (this.isDiscrete()) {
          value = this.getNextValue();
        } else {
          value = value + increment;
        }
        dispatch = true;
        break;
      default: {
        dispatch = false;
        return;
      }
    }

    event.preventDefault();

    value = clamp(value, this.minValue, this.maxValue);

    if (dispatch) {
      this.onChangeCallback({ value });
    }

    this.value = value;
  }

  updateIsAtDefault() {
    this.rangeInput.classList.toggle("is-at-default", this.value == this.defaultValue);
  }

  isDiscrete() {
    return this.values && this.values.length > 0;
  }

  render() {
    let minValue, maxValue, step, value;
    if (this.isDiscrete()) {
      minValue = 0;
      maxValue = this.values.length - 1;
      step = 1;
      value = this.getClosestDiscreteValue(this.value);
    } else {
      step = this.step;
      minValue = this.minValue;
      maxValue = this.maxValue;
      value = this.valueFormatted;
    }
    const isAtDefault = this.value == this.defaultValue;
    return html.div(
      {
        class: this.disabled ? "wrapper disabled" : "wrapper",
      },
      [
        html.div({ class: "numeric-input" }, [
          html.section({ class: "slider-input" }, [
            (this.numberInput = html.input({
              disabled: this.disabled,
              type: "number",
              class: "slider-numeric-input",
              value,
              step: this.step,
              required: "required",
              min: this.minValue,
              max: this.maxValue,
              pattern: "[0-9]+",
              onkeydown: (event) => this.onKeyDown(event),
              onchange: (event) => {
                const value = this.getValueFromEventTarget(event);
                this.value = value;
                const callbackEvent = { value };
                if (this.sawMouseDown) {
                  callbackEvent.dragBegin = true;
                }
                this.sawMouseDown = false;
                this.onChangeCallback(callbackEvent);
              },
            })),
          ]),
        ]),
        html.div(
          {
            class: "range-container",
            style: this.isDiscrete()
              ? // In the discrete case, to keep the spacing between tick marks
                // constant, the max-width for the slider is computed like this:
                // (the number of values - 1) * (desired distance from left of
                // tickmark to left of next tickmark = 20px)
                // + one tickmark thickness (1px)
                // + the total padding of the tickmarks span (6.5px * 2)
                `max-width: ${(this.values.length - 1) * 20 + 1 + 13}px; width: 100%;`
              : "",
          },
          [
            (this.rangeInput = html.input({
              disabled: this.disabled,
              type: "range",
              class: isAtDefault ? "slider is-at-default" : "slider",
              min: minValue,
              max: maxValue,
              step,
              value: this.isDiscrete() ? this.values.indexOf(value) : value,
              tabindex: "-1",
              onkeydown: (event) => this.onKeyDown(event),
              onmouseup: (event) => {
                this._savedCanvasElement?.focus();
                this.sawMouseDown = false;
                this.sawMouseUp = true;
                if (!this.sawChangeEvent) {
                  this.onChangeCallback({
                    value: this.getValueFromEventTarget(event),
                    dragEnd: true,
                  });
                }
                this.sawChangeEvent = false;
              },
              onmousedown: (event) => {
                this.sawChangeEvent = false;
                this.sawMouseDown = true;
                this.sawMouseUp = false;
                const activeElement = document.activeElement;
                this._savedCanvasElement =
                  activeElement?.id === "edit-canvas" ? activeElement : undefined;
                if (event.altKey) {
                  event.preventDefault();
                  this.reset();
                }
              },
              onchange: (event) => {
                if (!this.sawMouseUp) {
                  this.onChangeCallback({
                    value: this.getValueFromEventTarget(event),
                    dragEnd: true,
                  });
                }
                this.sawMouseUp = false;
                this.sawChangeEvent = true;
              },
              oninput: (event) => {
                const value = this.getValueFromEventTarget(event);
                this.value = value;
                const callbackEvent = { value, isDragging: true };
                if (this.sawMouseDown) {
                  callbackEvent.dragBegin = true;
                }
                this.sawMouseDown = false;
                this.onChangeCallback(callbackEvent);
              },
            })),
            this.isDiscrete() &&
              html.div(
                {
                  class: this.disabled ? "tickmarks disabled" : "tickmarks",
                },
                this.values.map(() =>
                  html.span({ class: this.disabled ? "tickmark disabled" : "tickmark" })
                )
              ),
          ].filter((e) => e)
        ),
      ]
    );
  }

  reset() {
    this.value = this.defaultValue;
    this.onChangeCallback({ value: this.value });
  }
}

customElements.define("range-slider", RangeSlider);
