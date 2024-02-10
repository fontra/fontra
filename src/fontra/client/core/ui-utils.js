export function setupSortableList(listContainer) {
  listContainer.addEventListener("dragover", (event) => {
    event.preventDefault();
    const draggingItem = listContainer.querySelector(".dragging");

    // Getting all items except currently dragging and making array of them
    let siblings = [
      ...listContainer.querySelectorAll(".ui-sortable-list-item:not(.dragging)"),
    ];

    // Finding the sibling after which the dragging item should be placed
    let nextSibling = siblings.find((sibling) => {
      return event.clientY <= sibling.offsetTop + sibling.offsetHeight / 2;
    });

    // Inserting the dragging item before the found sibling
    listContainer.insertBefore(draggingItem, nextSibling);
  });

  listContainer.addEventListener("dragenter", (event) => event.preventDefault());

  for (const listItem of listContainer.querySelectorAll(".ui-sortable-list-item")) {
    listItem.addEventListener("dragstart", () => {
      setTimeout(() => listItem.classList.add("dragging"), 0);
    });

    listItem.addEventListener("dragend", () => {
      listItem.classList.remove("dragging");
    });
  }
}
