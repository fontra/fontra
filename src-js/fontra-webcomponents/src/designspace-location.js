import * as html from "@fontra/core/html-utils.js";
import { UnlitElement, htmlToElement } from "@fontra/core/html-utils.js";
import { RangeSlider } from "./range-slider.js";
import { themeColorCSS } from "./theme-support.js";

const colors = {
  "disabled-color": ["#ccc", "#777"],
};

export class DesignspaceLocation extends UnlitElement {
  static styles = `
    ${themeColorCSS(colors)}

    :host {
      display: grid;
      grid-template-columns: 25% auto;
      gap: 0.3em;
      overflow: auto;
    }

    .slider-label {
      text-align: right;
      overflow: hidden; /* this needs to be set so that width respects fit-content */
      text-overflow: ellipsis;
      vertical-align: middle;
      margin-top: 1px;
    }

    .slider-label:hover {
      /* overflow: visible; */  /* this is cool but makes the layout jump: too distracting? */
      cursor: pointer;
    }

    .slider-group {
      display: grid;
      gap: 0.1em;
    }

    .info-box {
      display: none;
      grid-column: 1 / -1;
      margin-bottom: 0.5em;
      color: var(--disabled-color);
    }

    .info-box.visible {
      display: initial;
    }

    hr {
      border: none;
      border-top: 1px dotted var(--horizontal-rule-color);
      width: 100%;
      height: 1px;
      grid-column: 1 / -1;
    }

    hr.spacer {
      border-top: unset;
    }
  `;

  constructor() {
    super();
    this.continuous = true;
  }

  static properties = {
    axes: { type: Array },
    phantomAxes: { type: Array },
  };

  get model() {
    return this._controller.model;
  }

  get controller() {
    return this._controller;
  }

  set controller(controller) {
    if (this._controller) {
      this._controller.removeListener(this._modelListener);
    }
    this._controller = controller;
    this._modelListener = (event) => {
      if (event.senderInfo === this) {
        // Event was triggered by us -- ignore
        return;
      }
      const slider = this._sliders?.[event.key];
      if (slider) {
        slider.value = event.newValue;
      }
    };
    this._controller.addListener(this._modelListener);
    this.values = controller.model;
  }

  get values() {
    if (!this._values) {
      this._values = {};
    }
    return this._values;
  }

  set values(values) {
    this._values = { ...values };
    this._setSliderValues(values, this._sliders);
  }

  get phantomValues() {
    if (!this._phantomValues) {
      this._phantomValues = {};
    }
    return this._phantomValues;
  }

  set phantomValues(phantomValues) {
    this._phantomValues = { ...phantomValues };
    this._setSliderValues(phantomValues, this._phantomSliders);
  }

  _setSliderValues(values, sliders) {
    for (const [axisName, value] of Object.entries(values)) {
      const slider = sliders?.[axisName];
      if (slider) {
        slider.value = value;
      }
    }

    for (const axis of this.axes || []) {
      if (!(axis.name in values)) {
        const slider = sliders?.[axis.name];
        if (slider) {
          slider.value = axis.defaultValue;
        }
      }
    }
  }

  render() {
    if (!this.axes) {
      return;
    }
    this._sliders = {};
    this._phantomSliders = {};

    const phantomAxesByName = {};
    for (const phantomAxis of this.phantomAxes || []) {
      phantomAxesByName[phantomAxis.name] = phantomAxis;
    }
    const elements = [];
    for (const axis of this.axes) {
      if (axis.isDivider) {
        elements.push(html.hr());
        continue;
      }
      this._setupAxis(elements, axis, phantomAxesByName[axis.name]);
    }
    return elements;
  }

  _setupAxis(elements, axis, phantomAxis) {
    const modelValue = this.values[axis.name];
    const phantomModelValue = phantomAxis ? this.phantomValues[axis.name] : undefined;

    const infoBox = htmlToElement(
      `<div class="info-box">
        ${
          axis.values && axis.values.length > 0
            ? `
        <span>Default: <strong>${axis.defaultValue}</strong></span>&nbsp; |
        <span>Values: <strong style="white-space: break-spaces;">${axis.values.join(
          ", "
        )}</strong></span>
        `
            : `
        <span>Min: <strong>${axis.minValue}</strong></span>&nbsp; |
        <span>Default: <strong>${axis.defaultValue}</strong></span>&nbsp; |
        <span>Max: <strong>${axis.maxValue}</strong></span>
        `
        }
      </div>`
    );
    elements.push(
      html.div(
        {
          class: "slider-label",
          onclick: (event) => this._toggleInfoBox(infoBox, event),
        },
        [axis.name]
      )
    );
    const slider = this._createSlider(axis, modelValue);
    this._sliders[axis.name] = slider;
    const sliderGroupContents = [slider];
    if (phantomAxis) {
      const phantomSlider = this._createSlider(phantomAxis, phantomModelValue, true);
      this._phantomSliders[axis.name] = phantomSlider;
      sliderGroupContents.push(phantomSlider);
    }
    elements.push(html.div({ class: "slider-group" }, sliderGroupContents));
    elements.push(infoBox);
  }

  _createSlider(axis, modelValue, sliderDisabled = false) {
    const parms = {
      defaultValue: axis.defaultValue,
      value: modelValue !== undefined ? modelValue : axis.defaultValue,
      onChangeCallback: (event) => {
        if (this.continuous || !event.isDragging) {
          this._dispatchLocationChangedEvent(axis.name, event.value);
        }
      },
      disabled: sliderDisabled,
    };
    if (axis.values) {
      // Discrete axis
      parms.values = axis.values;
    } else {
      // Continuous axis
      parms.minValue = axis.minValue;
      parms.maxValue = axis.maxValue;
    }
    return html.createDomElement("range-slider", parms);
  }

  _toggleInfoBox(infoBox, event) {
    if (event.altKey) {
      const onOff = !infoBox.classList.contains("visible");
      for (const box of this.shadowRoot.querySelectorAll(".info-box")) {
        box.classList.toggle("visible", onOff);
      }
    } else {
      infoBox.classList.toggle("visible");
    }
  }

  _dispatchLocationChangedEvent(name, value) {
    if (this.controller) {
      this.controller.setItem(name, value, this);
    } else {
      this.values[name] = value;
      const event = new CustomEvent("locationChanged", {
        bubbles: false,
        detail: this,
      });
      this.dispatchEvent(event);
    }
  }
}

customElements.define("designspace-location", DesignspaceLocation);
