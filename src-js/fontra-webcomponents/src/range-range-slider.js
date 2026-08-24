import * as html from "@fontra/core/html-utils.js";
import { clamp, round } from "@fontra/core/utils.ts";
import { themeColorCSS } from "./theme-support.js";

// Based on https://codepen.io/scottbram/pen/PoGpyKa

const colors = {
  "thumb-color": ["#333", "#ddd"],
  "thumb-color-at-default": ["#A0A0A0", "#777"],
  "track-color": ["#ccc", "#222"],
  "range-track-color": ["#ccc", "#222"],
};

export class RangeRangeSlider extends html.UnlitElement {
  static styles = `
    ${themeColorCSS(colors)}

    .range-range-container {
      display: grid;
      grid-template-columns: min-content auto min-content;
      gap: 0.4em;
      justify-items: stretch;
    }

    .range-slider {
      --range-slider-common-height: 14px;
      --range-slider-thumb-width: 14px;
      --range-slider-thumb-height: 14px;

      position: relative;
      display: flex;
      align-items: center;
      min-width: 10em;
      height: 100%;
    }

    .range-slider > div {
      position: absolute;
      display: flex;
      align-items: center;
      left: calc(var(--range-slider-thumb-width) / 2);
      right: calc(var(--range-slider-thumb-width) / 2 - 0px);
      height: var(--range-slider-common-height);
    }

    .range-slider > div > .range-slider-track-low,
    .range-slider > div > .range-slider-track-high,
    .range-slider > div > .range-slider-track-range {
      height: 5px;
    }

    .range-slider > div > .range-slider-track-low {
      position: absolute;
      left: 0;
      border-radius: 10px;
      background-color: var(--track-color);
    }

    .range-slider > div > .range-slider-track-high {
      position: absolute;
      right: 0;
      border-radius: 10px;
      background-color: var(--track-color);
    }

    .range-slider > div > .range-slider-track-range {
      position: absolute;
      left: 0;
      // border-radius: 14px;
      height: calc(var(--range-slider-common-height) - 4px);
      background-color: var(--range-track-color);
    }

    .range-slider > div > .range-slider-thumb {
      z-index: 1;
      position: absolute;
      margin-left: -7px;
      width: var(--range-slider-thumb-width);
      height: var(--range-slider-thumb-height);
      border-radius: 50%;
      background-color: var(--thumb-color);

      outline: none;
      cursor: pointer;
    }

    .range-slider > div > .range-slider-thumb.at-default {
      background-color: var(--thumb-color-at-default);
    }

    div.range-slider > input[type="range"]::-moz-range-thumb {
      width: var(--range-slider-thumb-width);
      height: var(--range-slider-thumb-height);
      border: 0 none;
      border-radius: 0px;
      background: red;

      pointer-events: all;
    }

    div.range-slider > input[type="range"]::-webkit-slider-thumb {
      width: var(--range-slider-thumb-width);
      height: var(--range-slider-thumb-height);
      border: 0 none;
      border-radius: 0px;
      background: red;

      pointer-events: all;
      -webkit-appearance: none;
    }

    .range-slider > input[type="range"] {
      z-index: 1;
      position: absolute;
      width: 100%;
      height: var(--range-slider-common-height);

      transform: translate(-2px, 0);

      opacity: 0;
      filter: alpha(opacity=0);
      cursor: pointer;
      pointer-events: none;
      -webkit-appearance: none;
    }

    div.range-slider > input[type="range"]::-moz-range-track {
      background: transparent;
      color: transparent;

      -moz-appearance: none;
    }

    div.range-slider > input[type="range"]:focus::-webkit-slider-runnable-track {
      background: transparent;
      border: transparent;
    }

    div.range-slider > input[type="range"]:focus {
      outline: none;
    }

    /* Chrome, Safari, Edge, Opera */
    .numeric-input::-webkit-outer-spin-button,
    .numeric-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    /* Firefox */
    .numeric-input[type="number"] {
      -moz-appearance: textfield;
    }

    input::placeholder {
      opacity: 0.7;
      color: #999;
    }

    .numeric-input {
      width: 40px;
      border-radius: 6px;

      outline: none;
      border: none;
      background-color: var(--text-input-background-color);
      color: var(--ui-element-foreground-color);

      padding: 2px 3px;
      margin: 0;

      text-align: center;
      font-family: fontra-ui-regular;
      font-feature-settings: "tnum" 1;
      font-size: 0.9em;
      vertical-align: middle;
    }
  `;

  static properties = {
    minValue: { type: Number },
    maxValue: { type: Number },
    onChangeCallback: { type: Function },
  };

  constructor() {
    super();
    // Fallbacks for attributes that are not defined when calling the component
    this.minValue = 0;
    this.maxValue = 100;
    this._valueLow = null;
    this._valueHigh = null;
    this.onChangeCallback = (target) => {};
  }

  get valueLow() {
    return this._valueLow;
  }

  get valueHigh() {
    return this._valueHigh;
  }

  set valueLow(value) {
    this._valueLow = value;
    this.requestUpdate();
  }

  set valueHigh(value) {
    this._valueHigh = value;
    this.requestUpdate();
  }

  get valueLowNormalized() {
    return this.valueLow ?? this.minValue;
  }

  get valueHighNormalized() {
    return this.valueHigh ?? this.maxValue;
  }

  render() {
    const adjust = () => {
      const low = percentage(this.valueLowNormalized, this.minValue, this.maxValue);
      const high = percentage(this.valueHighNormalized, this.minValue, this.maxValue);
      trackLow.style.width = `${low}%`;
      trackRange.style.left = `${low}%`;
      trackRange.style.width = `${high - low}%`;
      trackHigh.style.left = `${high}%`;
      trackHigh.style.width = `${100 - high}%`;
      thumbLow.style.left = `${low}%`;
      thumbHigh.style.left = `${high}%`;

      thumbLow.classList.toggle("at-default", this.valueLow == null);
      thumbHigh.classList.toggle("at-default", this.valueHigh == null);

      numericLow.max = this.valueHighNormalized;
      numericHigh.min = this.valueLowNormalized;

      if (low > 50) {
        inputLow.style.zIndex = 2;
        inputHigh.style.zIndex = 1;
        thumbLow.style.zIndex = 2;
        thumbHigh.style.zIndex = 1;
      } else if (high < 50) {
        inputLow.style.zIndex = 1;
        inputHigh.style.zIndex = 2;
        thumbLow.style.zIndex = 1;
        thumbHigh.style.zIndex = 2;
      }
    };

    const trackLow = html.div({ class: "range-slider-track-low" });
    const trackHigh = html.div({ class: "range-slider-track-high" });
    const trackRange = html.div({ class: "range-slider-track-range" });

    const thumbLow = html.span({ class: "range-slider-thumb" });
    const thumbHigh = html.span({ class: "range-slider-thumb" });

    const updateNumericInputs = () => {
      const minMaxRange = this.maxValue - this.minValue;
      const decimalPlaces = minMaxRange < 100 ? 3 : 2;

      function roundIfNotNull(v) {
        return v != null ? round(v, decimalPlaces) : null;
      }

      numericLow.value = roundIfNotNull(this.valueLow);
      numericHigh.value = roundIfNotNull(this.valueHigh);
    };

    const updateSliderInputs = () => {
      inputLow.value = this.valueLowNormalized;
      inputHigh.value = this.valueHighNormalized;
    };

    const sliderOnInput = (event, property, minValue, maxValue, defaultValue) => {
      onchange: (event) => console.log("--- input");
      const value = clamp(event.target.valueAsNumber, minValue, maxValue);
      event.target.value = value;
      this[property] = value == defaultValue ? null : value;

      adjust();
      updateNumericInputs();
    };

    const [inputLow, inputHigh] = [true, false].map((isLow) => {
      const property = isLow ? "_valueLow" : "_valueHigh";

      return html.input({
        type: "range",
        class: "range-slider-input-left",
        value: isLow ? this.valueLowNormalized : this.valueHighNormalized,
        min: this.minValue,
        max: this.maxValue,
        tabindex: 0,
        step: "any",
        oninput: (event) =>
          sliderOnInput(
            event,
            property,
            isLow ? this.minValue : this.valueLowNormalized,
            isLow ? this.valueHighNormalized : this.maxValue,
            isLow ? this.minValue : this.maxValue
          ),
        onchange: (event) => this.onChangeCallback?.(this),
      });
    });

    const [numericLow, numericHigh] = [true, false].map((isLow) => {
      const property = isLow ? "_valueLow" : "_valueHigh";

      return html.input({
        type: "number",
        class: "numeric-input",
        step: "any",
        placeholder: isLow ? this.minValue : this.maxValue,
        min: this.minValue,
        max: this.maxValue,
        pattern: "[0-9]+",
        onchange: (event) => {
          const isValid = event.target.reportValidity();
          if (!isValid) {
            return;
          }
          const value = numberOrNull(event.target.valueAsNumber);
          this[property] = value;
          adjust();
          updateSliderInputs();
          this.onChangeCallback?.(this);
        },
      });
    });

    adjust();
    updateSliderInputs();
    updateNumericInputs();

    return html.div({ class: "range-range-container" }, [
      numericLow,
      html.div({ class: "range-slider" }, [
        html.div({}, [trackLow, trackHigh, trackRange, thumbLow, thumbHigh]),
        inputLow,
        inputHigh,
      ]),
      numericHigh,
    ]);
  }
}

customElements.define("range-range-slider", RangeRangeSlider);

function percentage(v, minValue, maxValue) {
  const extent = maxValue - minValue;
  return clamp((100 * (v - minValue)) / extent, 0, 100);
}

function numberOrNull(v) {
  return isNaN(v) ? null : v;
}
