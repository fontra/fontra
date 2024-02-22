import * as html from "../core/html-utils.js";
import { SimpleElement } from "../core/html-utils.js";
import { QueueIterator } from "../core/queue-iterator.js";
import { hyphenatedToCamelCase } from "../core/utils.js";
import { RangeSlider } from "/web-components/range-slider.js";
import "/web-components/rotary-control.js";

export class Form extends SimpleElement {
  static styles = `
    .ui-form {
      display: grid;
      grid-template-columns: 32% auto;
      box-sizing: border-box;
      gap: 0.35rem 0.35rem;
      overflow-x: hidden;
      overflow-y: auto;
      margin: 0em;
      padding: 0em;
    }

    .ui-form-label {
      text-align: right;
      align-self: center;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    hr {
      border: none;
      border-top: 1px solid var(--horizontal-rule-color);
      width: 100%;
      height: 1px;
      margin-block-start: 0.2em;
      margin-block-end: 0.1em;
      grid-column: 1 / span 2;
    }

    .ui-form-label.header {
      font-weight: bold;
      grid-column: 1 / span 2;
      text-align: left;
    }

    input {
      box-sizing: border-box;
      background-color: red;
      background-color: var(--text-input-background-color);
      color: var(--text-input-foreground-color);
      border-radius: 0.25em;
      border: none;
      outline: none;
      padding: 0.1em 0.3em;
      font-family: "fontra-ui-regular";
    }

    .ui-form-value {
      box-sizing: border-box;
    }

    .ui-form-value input {
      width: min(100%, 9.5em);
    }

    .ui-form-value input[type="number"] {
      width: 4em;
    }

    .ui-form-value.text {
      white-space: normal;
    }

    .ui-form-value.edit-number-x-y {
      display: flex;
      gap: 0.3rem;
    }
  `;

  constructor() {
    super();
    this.contentElement = this.shadowRoot.appendChild(document.createElement("div"));
    this.contentElement.classList.add("ui-form");
  }

  setFieldDescriptions(fieldDescriptions) {
    this.contentElement.innerHTML = "";
    this._fieldGetters = {};
    this._fieldSetters = {};
    this._lastValidFieldValues = {};
    if (!fieldDescriptions) {
      return;
    }
    for (const fieldItem of fieldDescriptions) {
      if (fieldItem.type === "divider") {
        this.contentElement.appendChild(html.hr());
        continue;
      }
      const labelElement = document.createElement("div");
      labelElement.classList.add("ui-form-label", fieldItem.type);
      const valueElement = document.createElement("div");
      valueElement.classList.add("ui-form-value", fieldItem.type);

      let label = fieldItem.label || fieldItem.key || "";
      if (label.length && fieldItem.type !== "header") {
        label += ":";
      }
      labelElement.innerHTML = label;
      this.contentElement.appendChild(labelElement);
      if (fieldItem.type === "header") {
        continue;
      }
      this.contentElement.appendChild(valueElement);

      const methodName = hyphenatedToCamelCase("_add-" + fieldItem.type);
      if (this[methodName] === undefined) {
        throw new Error(`Unknown field type: ${fieldItem.type}`);
      }
      this[methodName](valueElement, fieldItem);
    }
  }

  _addHeader(valueElement, fieldItem) {
    this._addText(valueElement, fieldItem);
  }

  _addNumber(valueElement, fieldItem) {
    this._addText(valueElement, fieldItem);
  }

  _addText(valueElement, fieldItem) {
    if (fieldItem.value !== undefined) {
      valueElement.innerText = fieldItem.value;
      this._fieldGetters[fieldItem.key] = () => valueElement.innerText;
      this._fieldSetters[fieldItem.key] = (value) => (valueElement.innerText = value);
    }
  }

  _addEditText(valueElement, fieldItem) {
    const inputElement = document.createElement("input");
    inputElement.type = "text";
    inputElement.value = fieldItem.value || "";
    inputElement.disabled = fieldItem.disabled;
    inputElement.onchange = (event) => {
      this._fieldChanging(fieldItem, inputElement.value, undefined);
    };
    this._fieldGetters[fieldItem.key] = () => inputElement.value;
    this._fieldSetters[fieldItem.key] = (value) => (inputElement.value = value);
    valueElement.appendChild(inputElement);
  }

  _addEditNumberXY(valueElement, fieldItem) {
    this._addEditNumber(valueElement, fieldItem.fieldX);
    this._addEditNumber(valueElement, fieldItem.fieldY);
  }

  _addEditNumber(valueElement, fieldItem) {
    this._lastValidFieldValues[fieldItem.key] = fieldItem.value;
    const inputElement = document.createElement("input");
    inputElement.type = "number";
    inputElement.value = fieldItem.value;
    if ("minValue" in fieldItem) {
      inputElement.min = fieldItem.minValue;
    }
    if ("maxValue" in fieldItem) {
      inputElement.max = fieldItem.maxValue;
    }
    inputElement.step = "any";

    inputElement.disabled = fieldItem.disabled;
    inputElement.onkeydown = (event) => {
      if (event.shiftKey) {
        switch (event.key) {
          case "ArrowUp":
            // We add to the "regular" +1 increment
            event.target.value = event.target.valueAsNumber + 9;
            break;

          case "ArrowDown":
            // We add to the "regular" -1 increment
            event.target.value = event.target.valueAsNumber - 9;
            break;
        }
      }
    };
    inputElement.onchange = (event) => {
      let value = parseFloat(inputElement.value);
      if (isNaN(value)) {
        value = this._lastValidFieldValues[fieldItem.key];
        inputElement.value = value;
      }

      if (!inputElement.reportValidity()) {
        if (inputElement.min != undefined) {
          value = Math.max(value, inputElement.min);
        }
        if (inputElement.max != undefined) {
          value = Math.min(value, inputElement.max);
        }
        inputElement.value = value;
      }
      this._lastValidFieldValues[fieldItem.key] = value;
      this._fieldChanging(fieldItem, value, undefined);
    };
    this._fieldGetters[fieldItem.key] = () => inputElement.value;
    this._fieldSetters[fieldItem.key] = (value) => (inputElement.value = value);
    valueElement.appendChild(inputElement);
  }

  _addEditAngle(valueElement, fieldItem) {
    this._lastValidFieldValues[fieldItem.key] = fieldItem.value;
    const inputElement = html.input({
      type: "number",
      value: fieldItem.value,
      step: "any",
      disabled: fieldItem.disabled,
      onchange: () => {
        let value = parseFloat(inputElement.value);
        if (isNaN(value)) {
          value = this._lastValidFieldValues[fieldItem.key];
          inputElement.value = value;
        }
        this._lastValidFieldValues[fieldItem.key] = value;
        this._fieldChanging(fieldItem, value);
        rotaryControl.value = -value;
      },
    });
    const rotaryControl = html.createDomElement("rotary-control", {
      value: -fieldItem.value,
    });
    {
      // Rotary change closure
      let valueStream;

      rotaryControl.onChangeCallback = (event) => {
        const value = -event.value;
        inputElement.value = value;
        if (event.dragBegin) {
          valueStream = new QueueIterator(5, true);
          this._fieldChanging(fieldItem, value, valueStream);
        }

        if (valueStream) {
          valueStream.put(value);
          this._dispatchEvent("doChange", { key: fieldItem.key, value: value });
          if (event.dragEnd) {
            valueStream.done();
            valueStream = undefined;
            this._dispatchEvent("endChange", { key: fieldItem.key });
          }
        } else {
          this._fieldChanging(fieldItem, value, undefined);
        }
      };
    }

    this._fieldGetters[fieldItem.key] = () => inputElement.value;
    this._fieldSetters[fieldItem.key] = (value) => (inputElement.value = value);
    valueElement.appendChild(
      html.div({ style: "display: flex; gap: 0.15rem;" }, [inputElement, rotaryControl])
    );
  }

  _addEditNumberSlider(valueElement, fieldItem) {
    const rangeElement = new RangeSlider();
    rangeElement.value = fieldItem.value;
    rangeElement.minValue = fieldItem.minValue;
    rangeElement.defaultValue = fieldItem.defaultValue;
    rangeElement.maxValue = fieldItem.maxValue;

    {
      // Slider change closure
      let valueStream = undefined;

      rangeElement.onChangeCallback = (event) => {
        const value = event.value;
        if (event.dragBegin) {
          valueStream = new QueueIterator(5, true);
          this._fieldChanging(fieldItem, value, valueStream);
        }

        if (valueStream) {
          valueStream.put(value);
          this._dispatchEvent("doChange", { key: fieldItem.key, value: value });
          if (event.dragEnd) {
            valueStream.done();
            valueStream = undefined;
            this._dispatchEvent("endChange", { key: fieldItem.key });
          }
        } else {
          this._fieldChanging(fieldItem, value, undefined);
        }
      };
    }

    valueElement.appendChild(rangeElement);
  }

  addEventListener(eventName, handler, options) {
    this.contentElement.addEventListener(eventName, handler, options);
  }

  _fieldChanging(fieldItem, value, valueStream) {
    if (valueStream) {
      this._dispatchEvent("beginChange", { key: fieldItem.key });
    } else {
      this._dispatchEvent("doChange", { key: fieldItem.key, value: value });
    }
    const handlerName = "onFieldChange";
    if (this[handlerName] !== undefined) {
      this[handlerName](fieldItem, value, valueStream);
    }
  }

  _dispatchEvent(eventName, detail) {
    const event = new CustomEvent(eventName, {
      bubbles: false,
      detail: detail,
    });
    this.contentElement.dispatchEvent(event);
  }

  getKeys() {
    return Object.keys(this._fieldGetters);
  }

  hasKey(key) {
    return key in this._fieldGetters;
  }

  getValue(key) {
    const getter = this._fieldGetters[key];
    if (getter === undefined) {
      throw new Error(`getting unknown Form key: ${key}`);
    }
    return getter();
  }

  setValue(key, value) {
    const setter = this._fieldSetters[key];
    if (setter === undefined) {
      throw new Error(`setting unknown Form key: ${key}`);
    }
    setter(value);
  }
}

customElements.define("ui-form", Form);
