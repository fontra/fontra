import { themeColorCSS } from "./theme-support.js";
import * as html from "/core/html-utils.js";
import { SimpleElement } from "/core/html-utils.js";
import { capitalizeFirstLetter, enumerate, reversed } from "/core/utils.js";
import { InlineSVG } from "/web-components/inline-svg.js";

export const MenuItemDivider = { title: "-" };

export function showMenu(menuItems, position, positionContainer, container) {
  if (!container) {
    container = document.querySelector("#menu-panel-container");
  }
  const menu = new MenuPanel(menuItems, { position, positionContainer });
  container.appendChild(menu);
}

export class MenuPanel extends SimpleElement {
  static openMenuPanels = [];

  static closeAllMenus(event) {
    for (const element of MenuPanel.openMenuPanels) {
      element.parentElement?.removeChild(element);
    }
    MenuPanel.openMenuPanels.splice(0, MenuPanel.openMenuPanels.length);
  }

  static colors = {
    "background-color": ["#f0f0f0", "#333"],
    "foreground-color": ["black", "white"],
    "background-active-color": ["var(--fontra-red-color)", "var(--fontra-red-color)"],
    "foreground-active-color": ["white", "white"],
  };

  static styles = `
    ${themeColorCSS(MenuPanel.colors)}

    :host {
      position: absolute;
      z-index: 10000;
      color: var(--foreground-color);
      background-color: var(--background-color);
      border-radius: 6px;
      border: solid gray 0.5px;
      outline: none;
      box-shadow: 2px 3px 10px #00000020;
      font-size: 1rem;
      user-select: none;
      cursor: default;
    }

    .menu-container {
      margin: 0.2em 0em 0.3em 0em; /* top, right, bottom, left */
    }

    .menu-item-divider {
      border: none;
      border-top: 1px solid #80808080;
      height: 1px;
      margin: 0.3em 0 0.2em 0;
    }

    .context-menu-item {
      display: grid;
      grid-template-columns: 1em auto;
      align-items: center;
      gap: 0em;
      padding: 0.1em 0.8em 0.1em 0.5em; /* top, right, bottom, left */
      color: #8080a0;
    }

    .with-submenu {
      grid-template-columns: 1em auto auto;
    }

    .has-open-submenu {
      background-color: #dedede;
    }

    .context-menu-item.enabled {
      color: inherit;
    }

    .context-menu-item.enabled.selected {
      color: var(--foreground-active-color);
      background-color: var(--background-active-color);
      cursor: pointer;
    }

    .item-content {
      display: flex;
      gap: 0.5em;
      justify-content: space-between;
    }

    .submenu-icon {
      width: 10px;
      height: 14px;
    }
  `;

  constructor(menuItems, options = {}) {
    super();
    options = { visible: true, ...options };
    this.style = "display: none;";
    this.visible = options.visible;
    this.position = options.position;
    this.onSelect = options.onSelect;
    this.onClose = options.onClose;
    this.positionContainer = options.positionContainer;
    this.menuElement = html.div({ class: "menu-container", tabindex: 0 });
    this.childOf = options.childOf;
    this.menuSearchText = "";

    // No context menu on our context menu please:
    this.menuElement.oncontextmenu = (event) => event.preventDefault();

    this.menuItems = menuItems;

    for (const [index, item] of enumerate(menuItems)) {
      if (!("enabled" in item)) {
        item.enabled = () => true;
      }
      const hasSubMenu = typeof item.getItems === "function";
      let itemElement;
      if (item === MenuItemDivider || item.title === "-") {
        itemElement = html.hr({ class: "menu-item-divider" });
      } else {
        const classNames = ["context-menu-item"];
        if (
          (!hasSubMenu || item.getItems().length > 0) &&
          typeof item.enabled === "function" &&
          item.enabled()
        ) {
          classNames.push("enabled");
        }
        if (hasSubMenu) {
          classNames.push("with-submenu");
        }
        const itemElementContent = [
          html.div({ class: "check-mark" }, [item.checked ? "✓" : ""]),
          html.div({ class: "item-content" }, [
            typeof item.title === "function" ? item.title() : item.title,
            html.span({}, [buildShortCutString(item.shortCut)]),
          ]),
        ];
        if (hasSubMenu) {
          itemElementContent.push(
            html.div({ class: "submenu-icon" }, [
              new InlineSVG(`/tabler-icons/chevron-right.svg`, {
                style: "margin-top: 2px",
              }),
            ])
          );
        }
        itemElement = html.div(
          {
            class: classNames.join(" "),
            onmouseenter: (event) => this.selectItem(itemElement),
            onmousemove: (event) => {
              if (!itemElement.classList.contains("selected")) {
                this.selectItem(itemElement);
              }
            },
            onmousedown: (event) => {
              event.preventDefault();
              event.stopImmediatePropagation();
            },
            onmouseleave: (event) => itemElement.classList.remove("selected"),
            onmouseup: (event) => {
              event.preventDefault();
              event.stopImmediatePropagation();
              if (item.enabled()) {
                item.callback?.(event);
                this.dismiss();
                this.onSelect?.(itemElement);
              }
            },
          },
          itemElementContent
        );
        itemElement.dataset.index = index;
      }
      this.menuElement.appendChild(itemElement);
    }

    this._attachStyles();
    this.shadowRoot.appendChild(this.menuElement);
    this.tabIndex = 0;
    this.addEventListener("keydown", (event) => this.handleKeyDown(event));
    MenuPanel.openMenuPanels.push(this);
  }

  connectedCallback() {
    if (this.visible) {
      this.show();
    }
  }

  hide() {
    this.style.display = "none";
  }

  show() {
    this._savedActiveElement = document.activeElement;
    const position = { ...this.position };
    this.style = `display: inherited; left: ${position.x}px; top: ${position.y}px;`;
    if (this.positionContainer) {
      const containerRect = this.positionContainer.getBoundingClientRect();
      const thisRect = this.getBoundingClientRect();
      if (thisRect.right > containerRect.right) {
        position.x -= thisRect.width + 2;
      }
      if (thisRect.bottom > containerRect.bottom) {
        position.y -= thisRect.bottom - containerRect.bottom + 2;
      }
      this.style = `display: inherited; left: ${position.x}px; top: ${position.y}px;`;
    }
    this.focus();
  }

  dismiss() {
    const index = MenuPanel.openMenuPanels.indexOf(this);
    if (index >= 0) {
      MenuPanel.openMenuPanels.splice(index, 1);
    }
    this.parentElement?.removeChild(this);
    this._savedActiveElement?.focus();
    this.onClose?.();
  }

  selectItem(itemElement) {
    for (const menuPanel of MenuPanel.openMenuPanels) {
      if (menuPanel.childOf === this) {
        menuPanel.dismiss();
        break;
      }
    }

    for (const item of this.menuElement.children) {
      if (item.classList.contains("has-open-submenu")) {
        item.classList.remove("has-open-submenu");
      }
    }

    const selectedItem = this.findSelectedItem();
    if (selectedItem && selectedItem !== itemElement) {
      selectedItem.classList.remove("selected");
    }
    itemElement.classList.add("selected");

    if (itemElement.classList.contains("with-submenu")) {
      const { y: menuElementY } = this.getBoundingClientRect();
      const { y, width } = itemElement.getBoundingClientRect();
      const submenu = new Menupanel(
        this.menuItems[itemElement.dataset.index].getItems(),
        {
          position: {
            x: 0,
            y: 0,
          },
          childOf: this,
        }
      );
      this.menuElement.appendChild(submenu);
      submenu.position = { x: width, y: y - menuElementY - 4 };
      submenu.show();
      itemElement.classList.add("has-open-submenu");
    }
  }

  handleKeyDown(event) {
    this.searchMenuItems(event.key);
    switch (event.key) {
      case "Escape":
        this.dismiss();
        break;
      case "ArrowDown":
        this.selectPrevNext(true);
        break;
      case "ArrowUp":
        this.selectPrevNext(false);
        break;
      case "Enter":
        const selectedItem = this.findSelectedItem();
        if (selectedItem) {
          selectedItem.onmouseup(event);
        }
        break;
    }
  }

  searchMenuItems(key) {
    // Accept only letters, numbers & spaces
    const isValidSearchInput = /^[a-zA-Z0-9 ]$/.test(key);
    if (!isValidSearchInput) {
      return;
    }

    let foundMatchingItem = false;
    this.menuSearchText += key.toLowerCase();

    for (const item of this.menuElement.children) {
      if (item.classList.contains("enabled")) {
        const itemText = item.textContent.toLowerCase();
        if (itemText.startsWith(this.menuSearchText)) {
          foundMatchingItem = true;
          this.selectItem(item);
          break;
        }
      }
    }

    // If an item matching the search text is not found
    // then allow the user to immediately start searching again
    clearTimeout(this.menuSearchTimer);
    if (foundMatchingItem) {
      this.menuSearchTimer = setTimeout(() => {
        this.menuSearchText = "";
      }, 1000);
    } else {
      this.menuSearchText = "";
    }
  }

  findSelectedItem() {
    let selectedItem;
    for (const item of this.menuElement.children) {
      if (item.classList.contains("selected")) {
        return item;
      }
    }
  }

  selectPrevNext(isNext) {
    const selectedChild = this.findSelectedItem();

    if (selectedChild) {
      let sibling;
      if (isNext) {
        sibling = selectedChild.nextElementSibling;
      } else {
        sibling = selectedChild.previousElementSibling;
      }
      while (sibling) {
        if (sibling.classList.contains("enabled")) {
          sibling.classList.add("selected");
          selectedChild.classList.remove("selected");
          break;
        }
        if (isNext) {
          sibling = sibling.nextElementSibling;
        } else {
          sibling = sibling.previousElementSibling;
        }
      }
    } else {
      const f = isNext ? (a) => a : reversed;
      for (const item of f(this.menuElement.children)) {
        if (item.classList.contains("enabled")) {
          this.selectItem(item);
          break;
        }
      }
    }
  }
}

customElements.define("menu-panel", MenuPanel);

// TODO: Maybe move to utils
let userAgent = window.navigator.userAgent;
const isMac = userAgent.indexOf("Mac") != -1;
const isWin = userAgent.indexOf("Win") != -1;

const shortCutKeyMapMac = {
  metaKey: "⌘", // "\u2318"
  shiftKey: "⇧", // "\u21e7"
  ctrlKey: "⌃",
  altKey: "⌥", // "\u2325"
};

const shortCutKeyMapWin = {
  metaKey: "⊞", // "\u229E"
};

// Nice reference: https://www.toptal.com/developers/keycode
export const shortCutKeyMap = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Tab: "⇥",
  Delete: "⌫",
};

let keyMap = {};
const keyMapOS = isMac ? shortCutKeyMapMac : isWin ? shortCutKeyMapWin : {};
keyMap = { ...keyMapOS, ...shortCutKeyMap };

export function getKeyMap() {
  return { ...keyMap };
}

export function getKeyMapSwapped() {
  return Object.fromEntries(Object.entries(keyMap).map((a) => a.reverse()));
}

export function getNiceKey(key) {
  return keyMap[key] || `${key}+`;
}

const eventMainKeys = ["metaKey", "ctrlKey", "altKey", "shiftKey"];
export function buildShortCutString(shortCutDefinition) {
  let shorcutCommand = "";
  if (!shortCutDefinition) {
    return shorcutCommand;
  }

  for (const key of eventMainKeys) {
    if (shortCutDefinition[key]) {
      shorcutCommand += getNiceKey(key);
    }
  }
  if (shortCutDefinition.keysOrCodes) {
    // If the definition specifies multiple keys, e.g ["Delete", "Backspace"],
    // we are taking the first key for comparison with the map
    const key = shortCutDefinition.keysOrCodes[0];
    shorcutCommand += shortCutKeyMap[key] || capitalizeFirstLetter(key);
  }

  return shorcutCommand;
}

window.addEventListener("mousedown", (event) => MenuPanel.closeAllMenus(event));
window.addEventListener("blur", (event) => MenuPanel.closeAllMenus(event));
