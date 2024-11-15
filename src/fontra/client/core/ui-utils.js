import * as html from "./html-utils.js";
import { uniqueID, zip } from "./utils.js";

const containerClassName = "fontra-ui-sortable-list-container";
const draggingClassName = "fontra-ui-sortable-list-dragging";

html.addStyleSheet(`
.${draggingClassName} {
  opacity: 0.3;
}
`);

export function setupSortableList(listContainer) {
  listContainer.classList.add(containerClassName);
  let originalItems;
  // We need to compare the vertical middle of the dragged item with the sibling,
  // independently of where the user grabbed the item, so on dragstart we calculate
  // the difference between the middle of the dragged item and clientY
  let clientYOffset;

  listContainer.addEventListener("dragover", (event) => {
    event.preventDefault();
    const draggingItem = listContainer.querySelector(
      `.${containerClassName} > .${draggingClassName}`
    );

    // Getting all items except currently dragging and making array of them
    const siblings = [
      ...listContainer.querySelectorAll(
        `.${containerClassName} > [draggable="true"]:not(.${draggingClassName})`
      ),
    ];

    // Finding the sibling after which the dragging item should be placed
    const nextSibling = siblings.find((sibling) => {
      return (
        event.clientY + clientYOffset <= sibling.offsetTop + sibling.offsetHeight / 2
      );
    });

    // Inserting the dragging item before the found sibling
    if (draggingItem.nextSibling != nextSibling) {
      listContainer.insertBefore(draggingItem, nextSibling);
    }
  });

  listContainer.addEventListener("dragenter", (event) => event.preventDefault());

  listContainer.addEventListener("dragstart", (event) => {
    if (listContainer.contains(document.activeElement)) {
      // Don't allow dragging on the active element (for example a text input)
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    setTimeout(() => {
      event.target.classList.add(draggingClassName);
    }, 0);
    originalItems = [
      ...listContainer.querySelectorAll(`.${containerClassName} > [draggable="true"]`),
    ];
    // Calculate the difference between the middle of the dragged item and clientY
    clientYOffset =
      event.target.offsetTop + event.target.offsetHeight / 2 - event.clientY;
  });

  listContainer.addEventListener("dragend", (event) => {
    const draggingItem = listContainer.querySelector(
      `.${containerClassName} > .${draggingClassName}`
    );
    draggingItem.classList.remove(draggingClassName);

    const currentItems = [
      ...listContainer.querySelectorAll(`.${containerClassName} > [draggable="true"]`),
    ];
    if (didReorder(originalItems, currentItems)) {
      const event = new CustomEvent("reordered", {
        bubbles: false,
        detail: listContainer,
      });
      listContainer.dispatchEvent(event);
    }

    originalItems = undefined;
  });
}

function didReorder(a, b) {
  for (const [itemA, itemB] of zip(a, b)) {
    if (itemA !== itemB) {
      return true;
    }
  }
  return false;
}

export function labeledCheckbox(label, controller, key, options) {
  const checkboxID = options?.id || `checkbox-${uniqueID()}-${key}`;
  const inputWrapper = html.div();
  const inputElement = html.input({ type: "checkbox", id: checkboxID });
  inputElement.checked = controller.model[key];
  inputWrapper.appendChild(inputElement);
  if (label) {
    inputWrapper.appendChild(html.label({ for: checkboxID }, [label]));
  }

  inputElement.onchange = () => {
    controller.model[key] = inputElement.checked;
  };

  controller.addKeyListener(key, (event) => {
    inputElement.checked = event.newValue;
  });

  return inputWrapper;
}

export function labelForElement(label, element) {
  return html.label({ for: element.id, style: "text-align: right;" }, [label]);
}

export function choicesForInput(choices, inputElement) {
  const choicesID = `${inputElement.id}-choices`;
  inputElement.setAttribute("list", choicesID);
  return html.createDomElement(
    "datalist",
    { id: choicesID },
    choices.map((item) => html.createDomElement("option", { value: item }))
  );
}

export function textInput(controller, key, options) {
  options = { continuous: true, ...options };
  const inputID = options?.id || `input-${uniqueID()}-${key}`;
  const formatter = options?.formatter || DefaultFormatter;

  const inputElement = html.input({ type: options?.type || "text", id: inputID });
  if (options?.class) {
    inputElement.className = options.class;
  }
  inputElement.value = formatter.toString(controller.model[key]);
  inputElement[options.continuous ? "oninput" : "onchange"] = () => {
    const { value, error } = formatter.fromString(inputElement.value);
    if (!error) {
      controller.model[key] = value;
    }
  };

  controller.addKeyListener(key, (event) => {
    inputElement.value = formatter.toString(event.newValue);
  });

  if (options?.placeholderKey) {
    inputElement.placeholder = controller.model[options.placeholderKey];
    controller.addKeyListener(
      options.placeholderKey,
      (event) => (inputElement.placeholder = event.newValue)
    );
  }

  return inputElement;
}

export function labeledTextInput(label, controller, key, options) {
  const inputElement = textInput(controller, key, options);
  const items = [labelForElement(label, inputElement), inputElement];

  if (options?.choices) {
    items.push(choicesForInput(options.choices, inputElement));
  }
  return items;
}

export function labeledColorInput(label, controller, key, options) {
  const inputElement = colorInput(controller, key, options);
  const items = [labelForElement(label, inputElement), inputElement];

  return items;
}

export function colorInput(controller, key, options) {
  const inputID = options?.id || `color-input-${uniqueID()}-${key}`;
  const style =
    options?.style ||
    `
    margin: 0;
    padding: 0;
    outline: none;
    border: none;
    border-color: transparent;
    border-radius: 0.25em;
    width: 100%;`;
  const inputElement = html.input({ type: "color", id: inputID, style: style });
  inputElement.value = controller.model[key];

  inputElement.onchange = () => {
    controller.model[key] = inputElement.value;
  };

  controller.addKeyListener(key, (event) => {
    inputElement.value = event.newValue;
  });

  return inputElement;
}

export function labeledSliderInput(label, controller, key, options) {
  const inputElement = sliderInput(controller, key, options);
  const items = [labelForElement(label, inputElement), inputElement];

  return items;
}

// for now keep it as is, but maybe better use: return html.createDomElement("range-slider", parms);
export function sliderInput(controller, key, options) {
  const inputID = options?.id || `range-input-${uniqueID()}-${key}`;
  const min = options?.min || 0;
  const max = options?.max || 100;
  const value = options?.value || 0;
  const step = options?.step || 1;

  const inputElement = html.input({
    type: "range",
    id: inputID,
    min: min,
    max: max,
    step: step,
    value: value,
  });
  inputElement.value = controller.model[key];

  inputElement.onchange = () => {
    controller.model[key] = inputElement.value;
  };

  controller.addKeyListener(key, (event) => {
    inputElement.value = event.newValue;
  });

  return inputElement;
}

export const DefaultFormatter = {
  toString: (value) => (value !== undefined && value !== null ? value.toString() : ""),
  fromString: (value) => {
    return {
      value: value,
    };
  },
};

export const NumberFormatter = {
  toString: (value) => value.toString(),
  fromString: (value) => {
    const number = Number(value);
    if (isNaN(number) || !value) {
      return { error: "not a number" };
    } else {
      return { value: number };
    }
  },
};

export const OptionalNumberFormatter = {
  toString: (value) => (value != undefined ? value.toString() : ""),
  fromString: (value) => {
    if (!value) {
      return { value: null };
    }
    const number = Number(value);
    if (isNaN(number)) {
      return { error: "not a number" };
    } else {
      return { value: number };
    }
  },
};

export function checkboxListCell(item, colDesc) {
  const value = item[colDesc.key];
  return html.input({
    type: "checkbox",
    style: `width: auto; margin: 0; padding: 0; outline: none;`,
    checked: value,
    onclick: (event) => {
      item[colDesc.key] = event.target.checked;
      event.stopImmediatePropagation();
    },
    ondblclick: (event) => {
      event.stopImmediatePropagation();
    },
  });
}
