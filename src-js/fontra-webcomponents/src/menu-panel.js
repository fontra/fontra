import {
  canPerformAction,
  doPerformAction,
  getActionTitle,
  getShortCutRepresentationFromActionIdentifier,
} from "@fontra/core/actions.js";
import { dispatchCustomEvent } from "@fontra/core/event-utils.js";
import * as html from "@fontra/core/html-utils.js";
import { SimpleElement } from "@fontra/core/html-utils.js";
import {
  enumerate,
  findNestedActiveElement,
  reversed,
  sleepAsync,
} from "@fontra/core/utils.js";
import { InlineSVG } from "@fontra/web-components/inline-svg.js";
import { themeColorCSS } from "./theme-support.js";

export const MenuItemDivider = { title: "-" };

export function showMenu(menuItems, position, options) {
  MenuPanel.closeMenuPanels({});
  const container = getMenuContainer();
  const { left, top } = container.getBoundingClientRect();
  position = { x: position.x - left, y: position.y - top };
  const menu = new MenuPanel(menuItems, { position, ...options });
  container.appendChild(menu);
  return menu;
}

export class MenuPanel extends SimpleElement {
  static openMenuPanels = [];

  static closeMenuPanels(event) {
    if (event.target?.closest?.("menu-bar")) {
      return;
    }
    for (const element of MenuPanel.openMenuPanels) {
      element.dismiss();
      if (element.context === "menu-bar" && !element.childOf) {
        dispatchCustomEvent(window, "menu-bar:close-menu");
      }
    }
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
      text-wrap: nowrap;
    }

    .submenu-icon {
      width: 1.1em;
      height: 1.1em;
    }
  `;

  _savedActiveElement = null;

  constructor(menuItems, options = {}) {
    super();
    this.hidden = options.hidden ?? false;
    this.immediatelyActive = options.immediatelyActive ?? true;
    this.position = options.position;
    this.onSelect = options.onSelect;
    this.onClose = options.onClose;
    this.childOf = options.childOf;
    this.menuSearchText = "";
    this.context = options.context;
    this.active = false;
    this.submenu = null;
    this.selectedItem = null;
    this.menuItems = menuItems;
    this.menuElement = this.getMenuElement();
    this.shadowRoot.appendChild(this.menuElement);
    this._attachStyles();
    MenuPanel.openMenuPanels.push(this);
  }

  async connectedCallback() {
    this.addEventListener("contextmenu", this.onContextMenu);
    this.addEventListener("keydown", this.onKeyDown);
    this.setAttribute("tabindex", "0");
    this.place();

    if (this.hidden) {
      this.hide();
    } else if (this.immediatelyActive) {
      // Wait next cycle to ensure `tabindex` is available
      await sleepAsync(0);
      this.setActive(true);
    }
  }

  disconnectedCallback() {
    this.removeEventListener("contextmenu", this.onContextMenu);
    this.removeEventListener("keydown", this.onKeyDown);
  }

  setActive(active) {
    this.active = active;
    if (active) {
      const activeElement = findNestedActiveElement();
      if (this !== activeElement && this.context !== "menu-bar") {
        this._savedActiveElement = activeElement;
      }
      this.focus();
    } else {
      this._savedActiveElement = null;
    }
  }

  hide() {
    this.hidden = true;
    this.style.display = "none";
  }

  async show(options = { animated: false }) {
    this.hidden = false;
    this.style.display = null;
    if (options.animated) {
      // hide immediately since animation is delayed
      this.style.opacity = 0;
      const { finished } = this.animate(
        { opacity: 1 },
        { delay: 250, duration: 50, iterations: 1, easing: "ease-in-out" }
      );
      await finished;
      this.style.opacity = null;
    }
  }

  place() {
    const assignStyles = (x, y) => {
      Object.assign(this.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
    };
    let { x, y } = { ...this.position };
    assignStyles(x, y);
    // Ensure the whole menu is visible, and not cropped by the window
    const bodyRect = document.body.getBoundingClientRect();
    const { right, width, bottom } = this.getBoundingClientRect();
    if (right > bodyRect.right) {
      x -= width + 2;
    }
    if (bottom > bodyRect.bottom) {
      y -= bottom - bodyRect.bottom + 2;
    }
    assignStyles(x, y);
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

  getMenuElement() {
    const menuElement = html.div({ class: "menu-container" });

    for (const [index, item] of enumerate(this.menuItems)) {
      if (!item.enabled) {
        item.enabled = item.actionIdentifier
          ? () => canPerformAction(item.actionIdentifier)
          : () => true;
      }
      const hasSubMenu = typeof item.getItems === "function";
      let itemElement;
      if (item === MenuItemDivider || item.title === "-") {
        itemElement = html.hr({ class: "menu-item-divider" });
      } else {
        const classNames = ["context-menu-item"];
        if ((!hasSubMenu || item.getItems().length > 0) && item.enabled()) {
          classNames.push("enabled");
        }
        if (hasSubMenu) {
          classNames.push("with-submenu");
        }
        const itemElementContent = [
          html.div({ class: "check-mark" }, [item.checked ? "✓" : ""]),
          html.div({ class: "item-content" }, [
            typeof item.title === "function"
              ? item.title()
              : item.title || getActionTitle(item.actionIdentifier),
            hasSubMenu
              ? html.div(
                  {
                    class: "submenu-icon",
                    style: "transform: translate(0, 0.15em)",
                  },
                  [new InlineSVG(`/tabler-icons/chevron-right.svg`)]
                )
              : html.span({}, [
                  getShortCutRepresentationFromActionIdentifier(item.actionIdentifier),
                ]),
          ]),
        ];

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
            onmouseleave: (event) => {
              this.selectItem(null);
            },
            onmouseup: (event) => {
              event.preventDefault();
              event.stopImmediatePropagation();
              if (item.enabled()) {
                if (item.actionIdentifier) {
                  doPerformAction(item.actionIdentifier, event);
                } else {
                  item.callback?.(event);
                }
                this.dismiss();
                this.onSelect?.(itemElement);
              }
            },
          },
          itemElementContent
        );
        itemElement.dataset.index = index;
      }
      menuElement.appendChild(itemElement);
    }

    return menuElement;
  }

  selectFirstEnabledItem(items) {
    this.selectItem(
      Array.from(items)
        .filter((item) => isEnabledItem(item))
        .at(0)
    );
  }

  selectItem(item, fromChild = false) {
    this.selectedItem = item;

    for (const child of this.menuElement.children) {
      if (child !== item) {
        child.classList.remove("selected");
        if (child.classList.contains("has-open-submenu")) {
          if (item) {
            child.classList.remove("has-open-submenu");
            this.submenu = null;
          }
        }
      }
    }

    if (item) {
      for (const panel of MenuPanel.openMenuPanels) {
        panel.setActive(panel === this);
        if (panel.childOf === this) {
          panel.dismiss();
        }
      }

      item.classList.add("selected");

      if (item.classList.contains("with-submenu")) {
        const { y } = this.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();

        this.submenu = new MenuPanel(this.menuItems[item.dataset.index].getItems(), {
          hidden: true,
          immediatelyActive: false,
          position: {
            x: itemRect.width,
            y: itemRect.y - y - 4,
          },
          childOf: this,
          context: this.context,
          onSelect: (event) => {
            // FIXME: this probably only works one level deep
            this.dismiss();
          },
        });
        this.menuElement.appendChild(this.submenu);
        if (!fromChild) {
          this.submenu.show({ animated: true });
        }
        item.classList.add("has-open-submenu");
      }
    }
  }

  onContextMenu(event) {
    // No context menu on our context menu please:
    event.preventDefault();
  }

  async onKeyDown(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const { key } = event;
    if (key === "Escape") {
      MenuPanel.closeMenuPanels(event);
    } else if (this.active) {
      const { childOf, submenu, selectedItem, context } = this;
      this.searchMenuItems(key);
      switch (key) {
        case "ArrowDown":
          this.selectPrevNext(true);
          break;
        case "ArrowUp":
          this.selectPrevNext(false);
          break;
        case "ArrowLeft":
          if (childOf) {
            await sleepAsync(0); // Wait for update
            childOf.selectItem(
              childOf.menuElement.querySelector(".has-open-submenu"),
              true
            );
          } else if (context === "menu-bar") {
            dispatchCustomEvent(window, "menu-bar:navigate", { direction: -1 });
          }
          break;
        case "ArrowRight":
          if (submenu) {
            this.setActive(false);
            this.selectItem(null);
            if (submenu.hidden) {
              submenu.show();
            }
            await sleepAsync(0); //  Wait for render
            submenu.selectFirstEnabledItem(submenu.menuElement.children);
          } else if (context === "menu-bar") {
            dispatchCustomEvent(window, "menu-bar:navigate", { direction: 1 });
          }
          break;
        case "Enter":
          if (selectedItem) {
            selectedItem.onmouseup(event);
          }
          break;
      }
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
      if (isEnabledItem(item)) {
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

  selectPrevNext(isNext) {
    const f = isNext ? (a) => a : reversed;
    const { selectedItem } = this;
    let previousItem;
    for (const item of f(this.menuElement.children)) {
      if (isEnabledItem(item)) {
        if (!selectedItem || (selectedItem && selectedItem === previousItem)) {
          this.selectItem(item);
          break;
        }
        previousItem = item;
      }
    }
  }
}

customElements.define("menu-panel", MenuPanel);

window.addEventListener("blur", (event) => MenuPanel.closeMenuPanels(event));
window.addEventListener("mousedown", (event) => MenuPanel.closeMenuPanels(event));

function getMenuContainer() {
  // This is tightly coupled to modal-dialog.js
  // We need to return a different container if the menu is opened from a dialog
  const dialog = document.querySelector("modal-dialog");

  const dialogContainer = dialog?.isActive()
    ? dialog.shadowRoot.querySelector(".dialog-box")
    : null;

  return dialogContainer || document.body;
}

function isEnabledItem(item) {
  return item.classList.contains("enabled");
}
