import * as html from "./html-utils.js";
import { zip } from "./utils.js";

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
    listContainer.insertBefore(draggingItem, nextSibling);
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

export function labeledTextInput(label, controller, key, options) {
  const items = [];
  items.push(html.label({ for: key, style: "text-align: right;" }, [label]));

  const choices = options?.choices;
  const choicesID = `${key}-choices`;

  const inputElement = html.htmlToElement(
    `<input ${choices ? `list="${choicesID}"` : ""}>`
  );
  inputElement.type = "text";
  inputElement.id = key;
  inputElement.value = controller.model[key];
  inputElement.oninput = () => (controller.model[key] = inputElement.value);

  controller.addKeyListener(key, (event) => {
    inputElement.value = event.newValue;
  });

  if (options?.placeholderKey) {
    inputElement.placeholder = controller.model[options.placeholderKey];
    controller.addKeyListener(
      options.placeholderKey,
      (event) => (inputElement.placeholder = event.newValue)
    );
  }

  items.push(inputElement);

  if (choices) {
    items.push(
      html.createDomElement(
        "datalist",
        { id: choicesID },
        choices.map((item) => html.createDomElement("option", { value: item }))
      )
    );
  }
  return items;
}
