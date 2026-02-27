import { DefaultFormatter } from "@fontra/core/formatters.js";
import * as html from "@fontra/core/html-utils.js";
import { UnlitElement } from "@fontra/core/html-utils.js";
import { firstItemOfSet, isEqualSet } from "@fontra/core/set-ops.js";
import { message } from "@fontra/web-components/modal-dialog.js";
import { themeColorCSS } from "./theme-support.js";

const LIST_CHUNK_SIZE = 200; // the amount of items added to the list at a time

const colors = {
  "border-color": ["#aaa", "#777"],
  "row-border-color": ["#ddd", "#333"],
  "row-foreground-color": ["black", "white"],
  "row-background-color": ["white", "#333"],
  "row-selected-background-color": ["#ddd", "#555"],
};

export class UIList extends UnlitElement {
  static styles = `
    ${themeColorCSS(colors)}

    .list-container {
      --column-header-divider-thickness: 1px;
      --column-header-divider-right-margin: 2px;
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 0.2em;
      min-height: 0;
      min-width: 0;
    }

    .rows-container {
      overflow: auto;
      height: 100%;
      width: 100%;
      border: solid 1px var(--border-color);
      background-color: var(--row-background-color);
    }

    .rows-container.drop-target {
      border-radius: 0.1px;
      outline: 6px solid #BBB8;
    }

    .contents {
      display: flex;
      flex-direction: column;
      outline: none;
    }

    .header-container::-webkit-scrollbar {
      display: none;
    }

    .header-container {
      overflow: auto;
      height: 100%;
      width: 100%;
      scrollbar-width: none;  /* hide scrollbar in FireFox */
    }

    .header {
      display: flex;
      width: min-content;
      min-width: 100%;
      padding: 0.15em;
      padding-left: 0.5em;
      padding-right: 0.5em;
      user-select: none;
    }

    .header-cell.resizable {
      border-right: var(--column-header-divider-thickness) solid #8888;
      margin-right: var(--column-header-divider-right-margin);
    }

    .header-cell-container {
      position: relative;
    }

    .header-resize-handle {
      // background-color: red;
      display: block;
      position: absolute;
      opacity: 40%;
      top: 0;
      right: 0;
      transform: translate(50%, 0);
      width: 0.5em;
      height: 100%;
      cursor: col-resize;
      z-index: 10;
    }

    .row {
      display: flex;
      width: min-content;
      min-width: 100%;
      border-top: solid 1px var(--row-border-color);
      color: var(--row-foreground-color);
      background-color: var(--row-background-color);
      padding: 0.15em;
      padding-left: 0.5em;
      padding-right: 0.5em;
      cursor: pointer;
      user-select: none;
    }

    .contents > .selected,
    .selected > input {
      background-color: var(--row-selected-background-color);
    }

    .list-cell,
    .text-cell,
    .text-cell-header {
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 0.2em 0 0.1em;
      box-sizing: content-box; /* TODO: use border-box */
      white-space: nowrap;
    }

    .list-cell.editing,
    .text-cell.editing {
      text-overflow: clip;
    }

    .text-cell.left,
    .text-cell-header.left {
      text-align: left;
    }

    .text-cell.center,
    .text-cell-header.center {
      text-align: center;
    }

    .text-cell.right,
    .text-cell-header.right {
      text-align: right;
    }

    input {
      font-family: fontra-ui-regular, -apple-system, sans-serif;
      font-size: 100%;
      border: none;
      color: var(--row-foreground-color);
      background-color: var(--row-background-color);
    }

    input:focus {
      outline: none;
      background-color: var(--background-color);
      border-radius: 0.25em;
    }

    input:invalid {
      color: red;
    }

    input:read-only {
      cursor: pointer;
    }

    input:read-only:focus {
      outline: none;
      background-color: unset;
    }
    `;

  constructor() {
    super();

    this._columnDescriptions = [
      {
        key: "default",
        get: (item) => item,
      },
    ];
    this.items = [];
    this.itemEqualFunc = null;

    this.listContainer = html.div({ class: "list-container" });

    this.rowsElement = html.div({
      class: "contents",
      onclick: (event) => this._clickHandler(event),
      ondblclick: (event) => this._dblClickHandler(event),
      tabIndex: 1,
    });

    this.rowsContainer = html.div(
      {
        class: "rows-container",
        ondrop: (event) => this._dropHandler(event),
        ondragover: (event) => this._dragOverHandler(event),
        ondragleave: (event) => this._dragLeaveHandler(event),
      },
      [this.rowsElement]
    );

    this.rowsContainer.addEventListener(
      "scroll",
      (event) => this._scrollHandler(event),
      false
    );
    this.rowsElement.addEventListener(
      "keydown",
      (event) => this._keyDownHandler(event),
      false
    );
    this.rowsElement.addEventListener(
      "keyup",
      (event) => this._keyUpHandler(event),
      false
    );
    this.selectedItemIndices = new Set();
    this.allowEmptySelection = true;
    this._settingsStorageKey = null;

    this.columnWidths = {};
  }

  render() {
    if (this.minHeight) {
      this.rowsContainer.style.minHeight = this.minHeight;
    }

    this.listContainer.innerHTML = "";

    if (this.showHeader) {
      this.listContainer.appendChild(this._makeHeader());
    }

    this.listContainer.appendChild(this.rowsContainer);

    return [this.listContainer];
  }

  static properties = {
    showHeader: { type: Boolean },
    minHeight: { type: String },
  };

  get columnDescriptions() {
    return this._columnDescriptions;
  }

  set columnDescriptions(columnDescriptions) {
    this._columnDescriptions = columnDescriptions;
    const identifierDescs = columnDescriptions.filter((desc) => desc.isIdentifierKey);
    const getters = (identifierDescs.length ? identifierDescs : columnDescriptions).map(
      (desc) => desc.get || ((item) => item[desc.key])
    );
    this.itemEqualFunc = (a, b) => getters.every((getter) => getter(a) === getter(b));

    for (const colDesc of columnDescriptions) {
      if (colDesc.width) {
        this.setColumnWidth(colDesc.key, colDesc.width);
      }
    }

    this.setItems(this.items);
    this.requestUpdate();
  }

  setColumnWidth(key, width, store = false) {
    this.listContainer.style.setProperty(
      columnWidthProperty(key),
      typeof width == "number" ? `${width}px` : width
    );
    this.columnWidths[key] = width;
    if (store) {
      this.storeSettings();
    }
  }

  get settingsStorageKey() {
    return this._settingsStorageKey;
  }

  set settingsStorageKey(key) {
    this._settingsStorageKey = key;
    this.restoreSettings();
  }

  storeSettings() {
    if (!this.settingsStorageKey) {
      return;
    }

    const columnWidths = {};
    for (const colDesc of this.columnDescriptions) {
      const columnWidth = this.columnWidths[colDesc.key];
      if (colDesc.minWidth != undefined && columnWidth != undefined) {
        columnWidths[colDesc.key] = columnWidth;
      }
    }
    const settings = { columnWidths };
    localStorage.setItem(
      `fontra.list.${this.settingsStorageKey}`,
      JSON.stringify(settings)
    );
  }

  restoreSettings() {
    if (!this.settingsStorageKey) {
      return;
    }
    const settingsString = localStorage.getItem(
      `fontra.list.${this.settingsStorageKey}`
    );
    const settings = settingsString ? JSON.parse(settingsString) : {};
    this.columnWidths = settings.columnWidths ?? {};
    for (const [key, columnWidth] of Object.entries(this.columnWidths)) {
      this.setColumnWidth(key, columnWidth);
    }
  }

  setItems(items, shouldDispatchEvent = false, keepScrollPosition = false) {
    const scrollLeft = this.rowsContainer.scrollLeft;
    const scrollTop = this.rowsContainer.scrollTop;
    const selectedItem = this.getSelectedItem();
    this.rowsElement.innerHTML = "";
    this.items = items;
    this._itemsBackLog = Array.from(items);
    this.setSelectedItem(selectedItem, shouldDispatchEvent);
    this._addMoreItemsIfNeeded();
    if (keepScrollPosition) {
      this.rowsContainer.scrollLeft = scrollLeft;
      this.rowsContainer.scrollTop = scrollTop;
    }
    this._dispatchEvent("itemsSet");
  }

  getSelectedItem() {
    if (this.selectedItemIndex === undefined) {
      return undefined;
    }
    return this.items[this.selectedItemIndex];
  }

  setSelectedItem(item, shouldDispatchEvent = false, shouldScrollInfoView = false) {
    if (!item) {
      this.setSelectedItemIndex(undefined, shouldDispatchEvent);
      return;
    }
    let index = -1;
    if (item && this.itemEqualFunc) {
      const itemEqualFunc = this.itemEqualFunc;
      const items = this.items;
      for (let i = 0; i < items.length; i++) {
        if (itemEqualFunc(item, items[i])) {
          index = i;
          break;
        }
      }
    } else if (item) {
      index = this.items.indexOf(item);
    }
    if (index >= 0) {
      this.setSelectedItemIndex(index, shouldDispatchEvent, shouldScrollInfoView);
    } else {
      this.setSelectedItemIndex(undefined, shouldDispatchEvent);
    }
  }

  _addMoreItemsIfNeeded() {
    while (
      this._itemsBackLog.length > 0 &&
      this.rowsContainer.scrollTop + this.offsetHeight + 200 >
        this.rowsElement.offsetHeight
    ) {
      this._addMoreItems();
      if (this.offsetHeight === 0) {
        break;
      }
    }
  }

  _addMoreItems() {
    const items = this._itemsBackLog.splice(0, LIST_CHUNK_SIZE);
    let rowIndex = this.rowsElement.childElementCount;
    for (const item of items) {
      const row = html.div({ class: "row" });
      row.dataset.rowIndex = rowIndex;
      if (this.selectedItemIndices.has(rowIndex)) {
        row.classList.add("selected");
      }

      for (const colDesc of this.columnDescriptions) {
        let cell;
        if (colDesc.cellFactory) {
          cell = html.div(
            {
              class: "list-cell",
              style: colDesc.width ? `display: flex; width: ${colDesc.width};` : "",
            },
            [colDesc.cellFactory(item, colDesc)]
          );
        } else {
          const formatter = item.formatters?.[colDesc.key] || colDesc.formatter;
          const value = colDesc.get ? colDesc.get(item) : item[colDesc.key];
          const formattedValue = formatter
            ? formatter.toString(value)
            : value == undefined
            ? ""
            : value;

          const classString = `text-cell ${colDesc.key} ${colDesc.align || "left"}`;
          if (colDesc.editable) {
            cell = html.input({
              class: classString,
              value: formattedValue,
              readOnly: true, // Default: true, will be changed within ondblclick -> _makeCellEditor
            });
            cell.ondblclick = this._makeCellEditor(cell, colDesc, item);
          } else {
            cell = html.div({ class: classString }, [formattedValue]);
          }
          if (colDesc.width) {
            cell.style.width = `var(${columnWidthProperty(colDesc.key)})`;
          }
        }
        row.appendChild(cell);
      }

      this.rowsElement.appendChild(row);
      rowIndex++;
    }
  }

  _makeHeader() {
    const header = html.div({ class: "header" });

    for (const colDesc of this.columnDescriptions) {
      const cell = html.div({ class: "text-cell-header header-cell " + colDesc.key });
      if (colDesc.align) {
        cell.classList.add(colDesc.align);
      }
      if (colDesc.width) {
        cell.style.width = colDesc.minWidth
          ? `calc(var(${columnWidthProperty(
              colDesc.key
            )}) - var(--column-header-divider-thickness)
                - var(--column-header-divider-right-margin))`
          : `var(${columnWidthProperty(colDesc.key)}`;
      }
      const value = colDesc.title || colDesc.key;
      cell.append(value);

      const cellContainer = html.div({ class: "header-cell-container" });

      cellContainer.appendChild(cell);

      if (colDesc.minWidth) {
        cell.classList.add("resizable");
        const resizeHandle = this._setupResizeHandle(colDesc);
        cellContainer.appendChild(resizeHandle);
      }

      header.appendChild(cellContainer);
    }
    this.headerContainer = html.div({ class: "header-container" }, [header]);
    this.headerContainer.addEventListener(
      "scroll",
      (event) => this._headerScrollHandler(event),
      false
    );
    return this.headerContainer;
  }

  _setupResizeHandle(colDesc) {
    const resizeHandle = html.div({ class: "header-resize-handle" });

    let initialEvent;
    let initialWidth;

    resizeHandle.addEventListener("mousedown", (event) => {
      initialEvent = event;
      initialWidth = this.columnWidths[colDesc.key] ?? colDesc.width;
      document.addEventListener("mousemove", mouseMoveHandler);
      document.addEventListener("mouseup", mouseUpHandler);
      document.body.style.cursor = "col-resize";
    });

    const setColumnWidthFromEvent = (event, store = false) => {
      const newWidth = Math.max(
        colDesc.minWidth,
        initialWidth + event.x - initialEvent.x
      );
      this.setColumnWidth(colDesc.key, newWidth, store);
    };

    const mouseMoveHandler = (event) => {
      setColumnWidthFromEvent(event, false);
    };

    const mouseUpHandler = (event) => {
      document.body.style.cursor = undefined;
      document.removeEventListener("mousemove", mouseMoveHandler);
      document.removeEventListener("mouseup", mouseUpHandler);
      setColumnWidthFromEvent(event, true);
    };

    return resizeHandle;
  }

  _makeCellEditor(cell, colDesc, item) {
    const initialValue = item[colDesc.key];
    let formattingError;

    const handleChange = (event, onlyCheck) => {
      const formatter =
        item.formatters?.[colDesc.key] || colDesc.formatter || DefaultFormatter;
      const { value, error } = formatter.fromString(
        cell.value != "\n" ? cell.value : ""
      );
      cell.setCustomValidity("");
      if (!error && !onlyCheck) {
        item[colDesc.key] = value;
      } else if (error && onlyCheck) {
        cell.setCustomValidity(`Invalid "${colDesc.key}": ${error}`);
        cell.reportValidity();
      }
      formattingError = error;
    };

    cell.onblur = (event) => {
      cell.readOnly = true;
      cell.classList.remove("editing");
      cell.scrollTop = 0;
      cell.scrollLeft = 0;
      this.rowsElement.focus();
      handleChange(event, false);
      if (formattingError) {
        const formatter =
          item.formatters?.[colDesc.key] || colDesc.formatter || DefaultFormatter;
        cell.value = formatter.toString(initialValue);
      }
      document.getSelection().collapseToEnd();
    };

    cell.oninput = (event) => handleChange(event, true);

    cell.onkeydown = (event) => {
      if (cell.readOnly) {
        return;
      }
      switch (event.key) {
        case "Enter":
          event.preventDefault();
          event.stopImmediatePropagation();
          cell.blur();
          break;
        case "Tab":
          event.preventDefault();
          event.stopImmediatePropagation();
          let sibling = cell;
          do {
            sibling = event.shiftKey
              ? sibling.previousElementSibling
              : sibling.nextElementSibling;
          } while (sibling && !sibling.ondblclick);
          if (sibling) {
            cell.blur();
            sibling.ondblclick();
          }
          break;
      }
    };

    return (event) => {
      cell.readOnly = false;
      cell.classList.add("editing");
      const range = document.createRange();
      range.selectNodeContents(cell);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      cell.focus();
      cell.select();
    };
  }

  _clickHandler(event) {
    const rowIndex = this._getRowIndexFromTarget(event.target);
    if (rowIndex !== undefined) {
      this.setSelectedItemIndex(rowIndex, true);
    }
  }

  _dblClickHandler(event) {
    this.doubleClickedRowIndex = this._getRowIndexFromTarget(event.target);
    this._dispatchEvent("rowDoubleClicked");
  }

  _dropHandler(event) {
    event.preventDefault();
    if (this.onFilesDrop) {
      this.rowsContainer.classList.remove("drop-target");
      if (event.dataTransfer?.files?.length) {
        this.onFilesDrop(event.dataTransfer.files);
        this.rowsElement.focus();
      }
    }
  }

  _dragOverHandler(event) {
    event.preventDefault();
    if (this.onFilesDrop) {
      this.rowsContainer.classList.add("drop-target");
    }
  }

  _dragLeaveHandler(event) {
    event.preventDefault();
    if (this.onFilesDrop) {
      this.rowsContainer.classList.remove("drop-target");
    }
  }

  _getRowIndexFromTarget(target) {
    let node = target;
    while (node && node.parentNode !== this.rowsElement) {
      node = node.parentNode;
    }
    return node?.dataset.rowIndex;
  }

  setSelectedItemIndex(
    rowIndex,
    shouldDispatchEvent = false,
    shouldScrollInfoView = false
  ) {
    if (!isNaN(rowIndex)) {
      rowIndex = Number(rowIndex);
    }

    this.setSelectedItemIndices(
      new Set(rowIndex == undefined ? undefined : [rowIndex]),
      shouldDispatchEvent,
      shouldScrollInfoView
    );
  }

  setSelectedItemIndices(
    rowIndices,
    shouldDispatchEvent = false,
    shouldScrollInfoView = false
  ) {
    rowIndices = new Set(rowIndices);

    if (!rowIndices.size && !this.allowEmptySelection) {
      return;
    }
    if (isEqualSet(rowIndices, this.selectedItemIndices)) {
      // nothing to do
      return;
    }
    for (const rowIndex of this.selectedItemIndices) {
      const row = this.rowsElement.children[rowIndex];
      row?.classList.remove("selected");
    }
    for (const rowIndex of rowIndices) {
      const row = this.rowsElement.children[rowIndex];
      row?.classList.add("selected");
    }
    this.selectedItemIndices = rowIndices;
    if (!this._isKeyRepeating && shouldDispatchEvent) {
      this._dispatchEvent("listSelectionChanged");
    }

    if (shouldScrollInfoView && rowIndices.size) {
      const rowIndex = firstItemOfSet(rowIndices);
      const row = this.rowsElement.children[rowIndex];
      row?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
    }
  }

  get selectedItemIndex() {
    return this.getSelectedItemIndex();
  }

  getSelectedItemIndices() {
    return this.selectedItemIndices;
  }

  getSelectedItemIndex() {
    const indices = [...this.selectedItemIndices];
    return firstItemOfSet(this.selectedItemIndices);
  }

  editCell(rowIndex, columnKey) {
    this.setSelectedItemIndex(rowIndex, true);
    const row = this.rowsElement.children[rowIndex];
    if (!row) {
      return;
    }
    const cell = [...row.children].find((cell) => cell.classList.contains(columnKey));
    cell?.ondblclick?.();
  }

  _dispatchEvent(eventName) {
    const event = new CustomEvent(eventName, {
      bubbles: false,
      detail: this,
    });
    this.dispatchEvent(event);
  }

  _keyDownHandler(event) {
    if (event.key === "Enter" && this.selectedItemIndex !== undefined) {
      this.doubleClickedRowIndex = this.selectedItemIndex;
      this._dispatchEvent("rowDoubleClicked");
      return;
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      (this.selectedItemIndex !== undefined || event.altKey) &&
      !this.rowsContainer.querySelector(".editing")
    ) {
      event.stopImmediatePropagation();
      if (event.altKey) {
        this._dispatchEvent("deleteKeyAlt");
      } else {
        this._dispatchEvent("deleteKey");
      }
      return;
    }
    if (
      (event.key !== "ArrowUp" && event.key !== "ArrowDown") ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!this.items.length) {
      return;
    }
    let rowIndex = this.selectedItemIndex;
    if (rowIndex === undefined) {
      rowIndex = 0;
    } else {
      rowIndex = event.key === "ArrowUp" ? rowIndex - 1 : rowIndex + 1;
      rowIndex = Math.min(Math.max(rowIndex, 0), this.items.length - 1);
    }
    this._isKeyRepeating = event.repeat;
    this.setSelectedItemIndex(rowIndex, true, true);
  }

  _keyUpHandler(event) {
    if (this._isKeyRepeating) {
      // When key events repeat, they may fire too fast, so selection-changed
      // events are suppressed. We need to send one after the fact.
      this._isKeyRepeating = false;
      this._dispatchEvent("listSelectionChanged");
    }
  }

  _headerScrollHandler(event) {
    if (this.rowsContainer.scrollLeft != this.headerContainer.scrollLeft) {
      this.rowsContainer.scrollLeft = this.headerContainer.scrollLeft;
    }
  }

  _scrollHandler(event) {
    if (
      this.headerContainer &&
      this.headerContainer.scrollLeft != this.rowsContainer.scrollLeft
    ) {
      this.headerContainer.scrollLeft = this.rowsContainer.scrollLeft;
    }
    this._addMoreItemsIfNeeded();
  }
}

function columnWidthProperty(key) {
  return `--column-${key}-width`;
}

customElements.define("ui-list", UIList);
