const containerClassName = "ui-sortable-list-container";
const draggingClassName = "ui-sortable-list-dragging";

const headElement = document.querySelector("head");
const styleElement = document.createElement("style");
styleElement.textContent = `
.${draggingClassName} {
  opacity: 0.3;
}
`;
headElement.appendChild(styleElement);

export function setupSortableList(listContainer) {
  listContainer.classList.add("ui-sortable-list-container");
  listContainer.addEventListener("dragover", (event) => {
    event.preventDefault();
    const draggingItem = listContainer.querySelector(
      `.${containerClassName} > .${draggingClassName}`
    );

    // Getting all items except currently dragging and making array of them
    let siblings = [
      ...listContainer.querySelectorAll(
        `.${containerClassName} > [draggable="true"]:not(.${draggingClassName})`
      ),
    ];

    // Finding the sibling after which the dragging item should be placed
    let nextSibling = siblings.find((sibling) => {
      return event.clientY <= sibling.offsetTop + sibling.offsetHeight / 2;
    });

    // Inserting the dragging item before the found sibling
    listContainer.insertBefore(draggingItem, nextSibling);
  });

  listContainer.addEventListener("dragenter", (event) => event.preventDefault());
  listContainer.addEventListener("dragstart", (event) =>
    event.target.classList.add(draggingClassName)
  );
  listContainer.addEventListener("dragend", (event) => {
    const draggingItem = listContainer.querySelector(
      `.${containerClassName} > .${draggingClassName}`
    );
    draggingItem.classList.remove(draggingClassName);
  });
}
