import * as html from "@fontra/core/html-utils.js";
import { SimpleElement } from "@fontra/core/html-utils.js";
import { MenuPanel } from "./menu-panel.js";
import { themeColorCSS } from "./theme-support.js";

const colors = {
  "menu-bar-link-hover": ["#e1e1e1", "rgb(47, 47, 47)"],
};

export class MenuBar extends SimpleElement {
  static styles = `

  ${themeColorCSS(colors)}

  .menu-bar {
    display: flex;
    align-items: center;
    font-size: 1rem;
    height: 100%;
    padding: 0 0.5rem;
  }

  .menu-item {
    padding: 0.4rem 0.6rem;
    cursor: default;
    user-select: none;
    -webkit-user-select: none;
  }

  .menu-item.hovered,
  .menu-item.current {
    background: var(--menu-bar-link-hover);
    border-radius: 5px;
  }

  .menu-item-bold {
    font-weight: bold;
  }
  `;

  constructor(items = []) {
    super();
    this.items = items;
    this.contentElement = this.shadowRoot.appendChild(html.div());
    this.contentElement.classList.add("menu-bar");
    this.render();
    window.addEventListener("blur", this.closeMenu.bind(this));
    window.addEventListener("click", this.onClick.bind(this));
    window.addEventListener("menu-panel:key-down", this.handleKeyDown.bind(this));
    this.contentElement.addEventListener("mouseover", this.onMouseOver.bind(this));
    this.contentElement.addEventListener(
      "mouseleave",
      this.unhoverMenuItems.bind(this)
    );
    this.contentElement.addEventListener("mousedown", this.onMouseDown.bind(this));
    this.showMenuWhenHover = false;
  }

  onClick(event) {
    if (event.target !== this) {
      this.closeMenu();
    }
  }

  onMouseDown(event) {
    if (event.target.classList.contains("menu-item")) {
      const currentSelection = this.contentElement.querySelector(".current");
      if (currentSelection === event.target) {
        this.closeMenu();
      } else {
        for (let i = 0; i < this.contentElement.childElementCount; i++) {
          const node = this.contentElement.childNodes[i];
          if (node === event.target) {
            this.clearCurrentSelection();
            this.showMenuWhenHover = true;
            this.showMenu(this.items[i].getItems(), node);
            break;
          }
        }
      }
    } else {
      this.closeMenu();
    }
  }

  onMouseOver(event) {
    this.hoverMenuItem(event);

    const currentSelection = this.contentElement.querySelector(".current");
    if (!currentSelection && !this.showMenuWhenHover) {
      return;
    }

    if (event.target === this.contentElement) {
      this.clearCurrentSelection();
      this.showMenuWhenHover = true;
      return;
    }
    if (event.target.classList.contains("menu-item")) {
      this.clearCurrentSelection();
      for (let i = 0; i < this.contentElement.childElementCount; i++) {
        const node = this.contentElement.childNodes[i];
        if (node === event.target) {
          if (this.showMenuWhenHover) {
            this.showMenu(this.items[i].getItems(), node);
          }
          break;
        }
      }
    }
  }

  hoverMenuItem(event) {
    this.unhoverMenuItems();
    const hoveredItem = event.target;
    if (!hoveredItem.classList.contains("menu-item")) {
      return;
    }
    hoveredItem.classList.add("hovered");
  }

  unhoverMenuItems() {
    for (const item of this.contentElement.children) {
      item.classList.remove("hovered");
    }
  }

  clearCurrentSelection() {
    const currentSelection = this.contentElement.querySelector(".current");
    if (currentSelection) {
      currentSelection.classList.remove("current");
      const menuPanel = this.contentElement.querySelector("menu-panel");
      if (menuPanel) {
        this.contentElement.removeChild(menuPanel);
      }
    }
  }

  showMenu(items, menuItemElement) {
    menuItemElement.classList.add("current");
    const clientRect = menuItemElement.getBoundingClientRect();
    const position = {
      x: clientRect.x,
      y: clientRect.y + clientRect.height,
    };
    const menuPanel = new MenuPanel(items, {
      position,
      onSelect: () => this.closeMenu(),
      onClose: () => this.closeMenu(),
    });
    this.contentElement.appendChild(menuPanel);
  }

  closeMenu() {
    this.clearCurrentSelection();
    this.showMenuWhenHover = false;
  }

  handleKeyDown(event) {
    const { key } = event.detail;
    switch (key) {
      case "ArrowLeft":
      case "ArrowRight":
        this.navigateMenuBar(key);
        break;
    }
  }

  navigateMenuBar(arrowKey) {
    this.unhoverMenuItems();
    const currentSelection = this.contentElement.querySelector(".current");
    const menuItemElements = this.contentElement.children;
    const currentSelectionIndex = Array.prototype.indexOf.call(
      menuItemElements,
      currentSelection
    );
    const newSelectionIndex =
      currentSelectionIndex + (arrowKey == "ArrowLeft" ? -1 : +1);

    if (menuItemElements[newSelectionIndex]?.classList.contains("menu-item")) {
      this.clearCurrentSelection();
      this.showMenuWhenHover = true;
      this.showMenu(
        this.items[newSelectionIndex].getItems(),
        menuItemElements[newSelectionIndex]
      );
    }
  }

  render() {
    const fragment = document.createDocumentFragment();
    for (const item of this.items) {
      fragment.appendChild(
        html.div(
          {
            class: item.bold ? "menu-item menu-item-bold" : "menu-item",
          },
          [item.title]
        )
      );
    }
    this.contentElement.appendChild(fragment);
  }
}

customElements.define("menu-bar", MenuBar);
