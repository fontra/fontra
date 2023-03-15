import { RangeSlider } from "/web-components/range-slider.js";

export class Sliders {
  constructor(slidersID, sliderDescriptions) {
    this.container = document.querySelector(`#${slidersID}`);
    this.setSliderDescriptions(sliderDescriptions);
  }

  addEventListener(eventName, handler, options) {
    this.container.addEventListener(eventName, handler, options);
  }

  _dispatchListSelectionChanged() {
    const event = new CustomEvent("slidersChanged", {
      bubbles: false,
      detail: this,
    });
    this.container.dispatchEvent(event);
  }

  setSliderDescriptions(sliderDescriptions) {
    this.container.innerHTML = ""; // Delete previous sliders
    for (const sliderInfo of sliderDescriptions) {
      if (sliderInfo.isDivider) {
        const divider = document.createElement("hr");
        divider.className = "slider-divider";
        this.container.appendChild(divider);
      } else {
        const slider = new RangeSlider();
        // label.className = "slider-label";
        slider.classList.add("slider");
        slider.name = sliderInfo.name;
        slider.minValue = sliderInfo.minValue;
        slider.maxValue = sliderInfo.maxValue;
        slider.defaultValue = sliderInfo.defaultValue;
        slider.step = "any";
        //TODO: make this dynamic also
        if (sliderInfo.mapping) {
          slider.tickMarksPositions = sliderInfo.mapping.reduce(
            (acc, curr) => acc.concat(curr),
            []
          );
        }

        // slider.oninput = (event) => this._dispatchListSelectionChanged();

        // const label = document.createElement("label");
        // const slider = document.createElement("input");
        // label.className = "slider-label";
        // slider.type = "range";
        // slider.step = "any";
        // slider.class = "slider";
        // slider.min = sliderInfo.minValue;
        // slider.max = sliderInfo.maxValue;
        // slider.value = sliderInfo.defaultValue;
        // slider.dataset.name = sliderInfo.name;
        // slider.oninput = (event) => this._dispatchListSelectionChanged();
        // label.appendChild(slider);
        // label.append(sliderInfo.name);

        this.container.appendChild(slider);
      }
    }
  }

  get values() {
    const values = {};
    for (const label of this.container.children) {
      const slider = label.firstElementChild;
      if (slider) {
        values[slider.dataset.name] = Number(slider.value);
      }
    }
    return values;
  }

  set values(values) {
    for (const label of this.container.children) {
      const slider = label.firstElementChild;
      if (!slider) {
        continue;
      }
      const value = values[slider.dataset.name];
      if (value !== undefined) {
        slider.value = values[slider.dataset.name];
      }
    }
  }
}
