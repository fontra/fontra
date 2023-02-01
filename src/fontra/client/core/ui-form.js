import { QueueIterator } from './queue-iterator.js';
import { capitalizeFirstLetter, hyphenatedToCamelCase } from './utils.js';

export class Form {
  constructor(formID, fieldDescriptions) {
    this.container = document.querySelector(`#${formID}`);
    if (!this.container) {
      throw new Error(`Expecting an element with id="#${formID}"`);
    }
    if (this.container.children.length != 0) {
      throw new Error('Form container must be empty');
    }
    this.container.classList.add('ui-form');
    this.setFieldDescriptions(fieldDescriptions);
    this.callQueue = new QueueIterator();
    this._readCallQueue();
  }

  async _readCallQueue() {
    for await (const func of this.callQueue) {
      await func();
    }
  }

  setFieldDescriptions(fieldDescriptions) {
    this.container.innerHTML = '';
    this._fieldGetters = {};
    this._fieldSetters = {};
    if (!fieldDescriptions) {
      return;
    }
    for (const fieldItem of fieldDescriptions) {
      if (fieldItem.type === 'divider') {
        const dividerElement = document.createElement('hr');
        dividerElement.className = 'ui-form-divider';
        this.container.appendChild(dividerElement);
        continue;
      }
      const labelElement = document.createElement('div');
      labelElement.classList.add('ui-form-label', fieldItem.type);
      const valueElement = document.createElement('div');
      valueElement.classList.add('ui-form-value', fieldItem.type);

      let label = fieldItem.label || fieldItem.key || '';
      if (label.length && fieldItem.type !== 'header') {
        label += ':';
      }
      labelElement.innerHTML = label;
      this.container.appendChild(labelElement);
      if (fieldItem.type === 'header') {
        continue;
      }
      this.container.appendChild(valueElement);

      const methodName = hyphenatedToCamelCase('_add-' + fieldItem.type);
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
      this._fieldSetters[fieldItem.key] = (value) =>
        (valueElement.innerText = value);
    }
  }

  _addEditText(valueElement, fieldItem) {
    const inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.value = fieldItem.value || '';
    inputElement.disabled = fieldItem.disabled;
    inputElement.onchange = (event) => {
      this._fieldChanging(fieldItem.key, inputElement.value, undefined);
    };
    this._fieldGetters[fieldItem.key] = () => inputElement.value;
    this._fieldSetters[fieldItem.key] = (value) => (inputElement.value = value);
    valueElement.appendChild(inputElement);
  }

  _addEditNumber(valueElement, fieldItem) {
    const inputElement = document.createElement('input');
    inputElement.type = 'number';
    inputElement.value = fieldItem.value;
    inputElement.step = 'any';
    inputElement.disabled = fieldItem.disabled;
    inputElement.onchange = (event) => {
      this._fieldChanging(
        fieldItem.key,
        parseFloat(inputElement.value),
        undefined
      );
    };
    this._fieldGetters[fieldItem.key] = () => inputElement.value;
    this._fieldSetters[fieldItem.key] = (value) => (inputElement.value = value);
    valueElement.appendChild(inputElement);
  }

  _addEditNumberSlider(valueElement, fieldItem) {
    const inputElement = document.createElement('input');
    const sliderElement = document.createElement('input');
    inputElement.type = 'number';
    sliderElement.type = 'range';
    for (const el of [inputElement, sliderElement]) {
      el.step = 'any';
      el.min = fieldItem.minValue;
      el.max = fieldItem.maxValue;
      el.value = fieldItem.value;
      el.disabled = fieldItem.disabled;
    }

    {
      // Slider change closure
      let valueStream = undefined;
      sliderElement.oninput = (event) => {
        // Continuous changes
        inputElement.value = myRound(sliderElement.value, 3);
        const value = parseFloat(inputElement.value);
        if (!valueStream) {
          valueStream = new QueueIterator();
          this._fieldChanging(fieldItem.key, value, valueStream);
        }
        valueStream.put(value);
        this._dispatchEvent('doChange', { key: fieldItem.key, value: value });
      };
      sliderElement.onchange = (event) => {
        // Single change, or final change after continuous changes
        if (valueStream) {
          valueStream.done();
          valueStream = undefined;
          this._dispatchEvent('endChange', { key: fieldItem.key });
        }
      };
      sliderElement.onmouseup = (event) => {
        // sliderElement.onchange is ONLY triggered when the final slider value
        // is different from the initial value. However, we may have been in
        // a live drag, and we need to handle the end of the slider drag no
        // matter what the final value. To work around this, we also listen to
        // "mouseup".
        sliderElement.onchange(event);
      };
    }

    inputElement.onchange = (event) => {
      sliderElement.value = inputElement.value;
      inputElement.value = sliderElement.value; // Use slider's clamping
      this._fieldChanging(
        fieldItem.key,
        parseFloat(inputElement.value),
        undefined
      );
    };
    this._fieldGetters[fieldItem.key] = () => sliderElement.value;
    this._fieldSetters[fieldItem.key] = (value) => {
      inputElement.value = value;
      sliderElement.value = value;
    };
    valueElement.appendChild(inputElement);
    valueElement.appendChild(sliderElement);
  }

  addEventListener(eventName, handler, options) {
    this.container.addEventListener(eventName, handler, options);
  }

  _fieldChanging(fieldKey, value, valueStream) {
    if (valueStream) {
      this._dispatchEvent('beginChange', { key: fieldKey });
    } else {
      this._dispatchEvent('doChange', { key: fieldKey, value: value });
    }
    const handlerName = 'onFieldChange';
    if (this[handlerName] !== undefined) {
      this[handlerName](fieldKey, value, valueStream);
    }
  }

  _dispatchEvent(eventName, detail) {
    const event = new CustomEvent(eventName, {
      bubbles: false,
      detail: detail,
    });
    this.container.dispatchEvent(event);
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
