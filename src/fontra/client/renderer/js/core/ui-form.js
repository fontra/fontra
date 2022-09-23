import { capitalizeFirstLetter, hyphenatedToCamelCase } from "./utils.js";


export class Form {

  constructor(formID, fieldDescriptions) {
    this.container = document.querySelector(`#${formID}`);
    if (!this.container) {
      throw new Error(`Expecting an element with id="#${formID}"`);
    }
    if (this.container.children.length != 0) {
      throw new Error("Form container must be empty");
    }
    this.container.classList.add("ui-form");
    this.setFieldDescriptions(fieldDescriptions);
    this.callQueue = new CallQueue();
    this.callQueue.start();
  }

  setFieldDescriptions(fieldDescriptions) {
    this.container.innerHTML = "";
    this._fieldGetters = {};
    this._fieldSetters = {};
    if (!fieldDescriptions) {
      return;
    }
    for (const fieldItem of fieldDescriptions) {
      if (fieldItem.type === "divider") {
        const dividerElement = document.createElement("hr");
        dividerElement.className = "ui-form-divider";
        this.container.appendChild(dividerElement);
        continue;
      }
      const labelElement = document.createElement("div");
      labelElement.classList.add("ui-form-label", fieldItem.type);
      const valueElement = document.createElement("div");
      valueElement.classList.add("ui-form-value", fieldItem.type);

      let label = fieldItem.label || fieldItem.key || "";
      if (label.length && fieldItem.type !== "header") {
        label += ":";
      };
      labelElement.innerHTML = label;
      this.container.appendChild(labelElement);
      if (fieldItem.type === "header") {
        continue;
      }
      this.container.appendChild(valueElement);

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
      this._fieldSetters[fieldItem.key] = value => valueElement.innerText = value;
    }
  }

  _addEditText(valueElement, fieldItem) {
    const inputElement = document.createElement("input");
    inputElement.type = "text";
    inputElement.value = fieldItem.value || "";
    inputElement.disabled = fieldItem.disabled;
    inputElement.onchange = event => {
      this._dispatchEvent("doChange", {"key": fieldItem.key, "value": inputElement.value});
    };
    this._fieldGetters[fieldItem.key] = () => inputElement.value;
    this._fieldSetters[fieldItem.key] = value => inputElement.value = value;
    valueElement.appendChild(inputElement);
  }

  _addEditNumber(valueElement, fieldItem) {
    const inputElement = document.createElement("input");
    inputElement.type = "number";
    inputElement.value = fieldItem.value;
    inputElement.step = "any";
    inputElement.disabled = fieldItem.disabled;
    inputElement.onchange = event => {
      this._dispatchEvent("doChange", {"key": fieldItem.key, "value": parseFloat(inputElement.value)});
    };
    this._fieldGetters[fieldItem.key] = () => inputElement.value;
    this._fieldSetters[fieldItem.key] = value => inputElement.value = value;
    valueElement.appendChild(inputElement);
  }

  _addEditNumberSlider(valueElement, fieldItem) {
    const inputElement = document.createElement("input");
    const sliderElement = document.createElement("input");
    inputElement.type = "number";
    sliderElement.type = "range";
    for (const el of [inputElement, sliderElement]) {
      el.step = "any";
      el.min = fieldItem.minValue;
      el.max = fieldItem.maxValue;
      el.value = fieldItem.value;
      el.disabled = fieldItem.disabled;
    }
    setSliderCallbacks(
      sliderElement,
      {
        beginChange: () => {
          // console.log("begin drag");
          this._dispatchEvent("beginChange", {"key": fieldItem.key});
        },
        change: () => {
          inputElement.value = myRound(sliderElement.value, 3);
          this._dispatchEvent("doChange", {"key": fieldItem.key, "value": parseFloat(inputElement.value)});
        },
        endEdit: () => {
          this._dispatchEvent("endChange", {"key": fieldItem.key});
        }
      }
    );
    inputElement.onchange = event => {
      sliderElement.value = inputElement.value;
      inputElement.value = sliderElement.value;  // Use slider's clamping
      this._dispatchEvent("doChange", {"key": fieldItem.key, "value": parseFloat(inputElement.value)});
    };
    this._fieldGetters[fieldItem.key] = () => sliderElement.value;
    this._fieldSetters[fieldItem.key] = value => {
      inputElement.value = value;
      sliderElement.value = value;
    }
    valueElement.appendChild(inputElement);
    valueElement.appendChild(sliderElement);
  }

  addEventListener(eventName, handler, options) {
    this.container.addEventListener(eventName, handler, options);
  }

  _dispatchEvent(eventName, detail) {
    const event = new CustomEvent(eventName, {
      "bubbles": false,
      "detail": detail,
    });
    this.container.dispatchEvent(event);
    const handlerName = "on" + capitalizeFirstLetter(eventName);
    if (this[handlerName] !== undefined) {
      this.callQueue.put(async () => await this[handlerName](detail));
    }
  }

  getKeys() {
    return Object.keys(this._fieldGetters);
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


function myRound(n, digits) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}


function setSliderCallbacks(sliderElement, callbacks) {
  let sliderDragging = false;

  sliderElement.oninput = event => {
    if (!sliderDragging) {
      sliderDragging = true;
      callbacks.beginChange();
    }
    callbacks.change();
  }

  sliderElement.onchange = event => {
    sliderDragging = false;
    callbacks.endEdit();
  }

}


class CallQueue {

  // Queue for async function calls, to ensure they are called
  // in a specific order, instead of scheduled individually.

  constructor() {
    this.queue = [];
  }

  async start() {
    while (true) {
      const func = this.queue.shift();
      if (func !== undefined) {
        await func();
      } else {
        await new Promise(resolve => {
          this.signal = resolve;
        });
        delete this.signal;
      }
    }
  }

  put(func) {
    this.queue.push(func);
    this.signal?.call();
  }

}
