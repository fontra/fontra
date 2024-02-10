const draggingClassName = "ui-sortable-list-dragging";
const headElement = document.querySelector("head");
const styleElement = document.createElement("style");
styleElement.textContent = `
.${draggingClassName} {
  opacity: 0;
}
`;
headElement.appendChild(styleElement);

export function setupSortableList(listContainer) {
  listContainer.addEventListener("dragover", (event) => {
    event.preventDefault();
    const draggingItem = listContainer.querySelector(`.${draggingClassName}`);

    // Getting all items except currently dragging and making array of them
    let siblings = [
      ...listContainer.querySelectorAll(
        `[draggable="true"]:not(.${draggingClassName})`
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

  for (const listItem of listContainer.querySelectorAll(`[draggable="true"]`)) {
    listItem.addEventListener("dragstart", () => {
      setTimeout(() => listItem.classList.add(draggingClassName), 0);
    });

    listItem.addEventListener("dragend", () => {
      listItem.classList.remove(draggingClassName);
    });
  }
}
