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

    :host {
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 0.2em;
      min-height: 0;
      min-width: 0;
    }

    .container {
      overflow: auto;
      height: 100%;
      width: 100%;
      border: solid 1px var(--border-color);
      background-color: var(--row-background-color);
    }

    .container.drop-target {
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

    this.contents = html.div({
      class: "contents",
      onclick: (event) => this._clickHandler(event),
      ondblclick: (event) => this._dblClickHandler(event),
      tabIndex: 1,
    });

    this.container = html.div(
      {
        class: "container",
        ondrop: (event) => this._dropHandler(event),
        ondragover: (event) => this._dragOverHandler(event),
        ondragleave: (event) => this._dragLeaveHandler(event),
      },
      [this.contents]
    );

    this.container.addEventListener(
      "scroll",
      (event) => this._scrollHandler(event),
      false
    );
    this.contents.addEventListener(
      "keydown",
      (event) => this._keyDownHandler(event),
      false
    );
    this.contents.addEventListener(
      "keyup",
      (event) => this._keyUpHandler(event),
      false
    );
    this.selectedItemIndices = new Set();
    this.allowEmptySelection = true;
  }

  render() {
    if (this.minHeight) {
      this.container.style.minHeight = this.minHeight;
    }
    const contents = [];
    if (this.showHeader) {
      contents.push(this._makeHeader());
    }
    contents.push(this.container);
    return contents;
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
    this.setItems(this.items);
    this.requestUpdate();
  }

  setItems(items, shouldDispatchEvent = false, keepScrollPosition = false) {
    const scrollLeft = this.container.scrollLeft;
    const scrollTop = this.container.scrollTop;
    const selectedItem = this.getSelectedItem();
    this.contents.innerHTML = "";
    this.items = items;
    this._itemsBackLog = Array.from(items);
    this.setSelectedItem(selectedItem, shouldDispatchEvent);
    this._addMoreItemsIfNeeded();
    if (keepScrollPosition) {
      this.container.scrollLeft = scrollLeft;
      this.container.scrollTop = scrollTop;
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
      this.container.scrollTop + this.offsetHeight + 200 > this.contents.offsetHeight
    ) {
      this._addMoreItems();
      if (this.offsetHeight === 0) {
        break;
      }
    }
  }

  _addMoreItems() {
    const items = this._itemsBackLog.splice(0, LIST_CHUNK_SIZE);
    let rowIndex = this.contents.childElementCount;
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "row";
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
            cell.style.width = colDesc.width;
          }
        }
        row.appendChild(cell);
      }

      this.contents.appendChild(row);
      rowIndex++;
    }
  }

  _makeHeader() {
    const header = html.div({ class: "header" });

    for (const colDesc of this.columnDescriptions) {
      const cell = document.createElement("div");
      cell.className = "text-cell-header " + colDesc.key;
      if (colDesc.align) {
        cell.classList.add(colDesc.align);
      }
      if (colDesc.width) {
        cell.style.width = colDesc.width;
      }
      const value = colDesc.title || colDesc.key;
      cell.append(value);
      header.appendChild(cell);
    }
    this.headerContainer = html.div({ class: "header-container" }, [header]);
    this.headerContainer.addEventListener(
      "scroll",
      (event) => this._headerScrollHandler(event),
      false
    );
    return this.headerContainer;
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
      this.contents.focus();
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
      this.container.classList.remove("drop-target");
      if (event.dataTransfer?.files?.length) {
        this.onFilesDrop(event.dataTransfer.files);
        this.contents.focus();
      }
    }
  }

  _dragOverHandler(event) {
    event.preventDefault();
    if (this.onFilesDrop) {
      this.container.classList.add("drop-target");
    }
  }

  _dragLeaveHandler(event) {
    event.preventDefault();
    if (this.onFilesDrop) {
      this.container.classList.remove("drop-target");
    }
  }

  _getRowIndexFromTarget(target) {
    let node = target;
    while (node && node.parentNode !== this.contents) {
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
      const row = this.contents.children[rowIndex];
      row?.classList.remove("selected");
    }
    for (const rowIndex of rowIndices) {
      const row = this.contents.children[rowIndex];
      row?.classList.add("selected");
    }
    this.selectedItemIndices = rowIndices;
    if (!this._isKeyRepeating && shouldDispatchEvent) {
      this._dispatchEvent("listSelectionChanged");
    }

    if (shouldScrollInfoView && rowIndices.size) {
      const rowIndex = firstItemOfSet(rowIndices);
      const row = this.contents.children[rowIndex];
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
    const row = this.contents.children[rowIndex];
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
      !this.container.querySelector(".editing")
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
    if (this.container.scrollLeft != this.headerContainer.scrollLeft) {
      this.container.scrollLeft = this.headerContainer.scrollLeft;
    }
  }

  _scrollHandler(event) {
    if (
      this.headerContainer &&
      this.headerContainer.scrollLeft != this.container.scrollLeft
    ) {
      this.headerContainer.scrollLeft = this.container.scrollLeft;
    }
    this._addMoreItemsIfNeeded();
  }
}

customElements.define("ui-list", UIList);
