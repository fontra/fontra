import * as html from "@fontra/core/html-utils.js";
import { SimpleElement } from "@fontra/core/html-utils.js";
import { sleepAsync } from "@fontra/core/utils.js";
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

  .menu-item:focus-visible {
    outline: none;
  }

  .menu-item:focus-visible,
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
    this.contentElement = this.shadowRoot.appendChild(html.div({ class: "menu-bar" }));
    this.render();
    window.addEventListener("blur", this.closeMenu.bind(this));
    window.addEventListener("menu-bar:close-menu", this.closeMenu.bind(this));
    window.addEventListener("menu-bar:navigate", (event) => {
      this.navigateMenuBar(event.detail.direction);
    });
    window.addEventListener("keydown", this.onKeyDown.bind(this));
    this.contentElement.addEventListener("mouseover", this.onMouseOver.bind(this));
    this.contentElement.addEventListener("mouseup", this.onMouseUp.bind(this));
    this.contentElement.addEventListener(
      "mouseleave",
      this.unhoverMenuItems.bind(this)
    );
    this.contentElement.addEventListener("mousedown", this.onMouseDown.bind(this));
    this.showMenuWhenHover = false;
  }

  get currentSelection() {
    return this.contentElement.querySelector(".current");
  }

  get menuPanel() {
    return this.contentElement.querySelector("menu-panel");
  }

  get submenuPanel() {
    return this.menuPanel?.submenu;
  }

  onMouseDown({ target }) {
    if (isMenuItem(target)) {
      if (!this.menuPanel) {
        MenuPanel.closeMenuPanels({});
        this.openMenu(target);
      } else {
        this.closeMenu();
      }
    }
  }

  onMouseUp({ target }) {
    if (isMenuItem(target)) {
      target?.blur();
    }
  }

  onMouseOver({ target }) {
    this.unhoverMenuItems();
    if (!this.currentSelection && !this.showMenuWhenHover) {
      return;
    }
    if (target === this.contentElement) {
      this.clearCurrentSelection();
      this.showMenuWhenHover = true;
      return;
    }
    if (isMenuItem(target)) {
      target.classList.add("hovered");
      this.clearCurrentSelection();
      if (this.showMenuWhenHover) {
        this.showMenu(
          this.items[getNodeIndex(this.contentElement.childNodes, target)].getItems(),
          target
        );
      }
    }
  }

  unhoverMenuItems() {
    for (const item of this.contentElement.children) {
      item.classList.remove("hovered");
    }
  }

  clearCurrentSelection() {
    if (this.currentSelection) {
      this.currentSelection.classList.remove("current");
      if (this.menuPanel) {
        this.contentElement.removeChild(this.menuPanel);
      }
    }
  }

  showMenu(items, target) {
    target.classList.add("current");
    const { x, y, height } = target.getBoundingClientRect();
    this.contentElement.appendChild(
      new MenuPanel(items, {
        position: {
          x,
          y: y + height,
        },
        context: "menu-bar",
        onSelect: () => this.closeMenu(),
        onClose: () => this.closeMenu(),
      })
    );
  }

  openMenu(target) {
    this.clearCurrentSelection();
    this.showMenuWhenHover = true;
    this.showMenu(
      this.items[getNodeIndex(this.contentElement.childNodes, target)].getItems(),
      target
    );
  }

  closeMenu() {
    this.clearCurrentSelection();
    this.showMenuWhenHover = false;
  }

  async onKeyDown(event) {
    if (event.key === "ArrowDown") {
      let { menuPanel } = this;
      const { activeElement } = this.shadowRoot;
      if (isMenuItem(activeElement) && !menuPanel) {
        this.openMenu(activeElement);
        await sleepAsync(0); // Wait for render
        menuPanel = this.menuPanel;
        if (menuPanel) {
          menuPanel.selectFirstEnabledItem(menuPanel.menuElement.children);
        }
      }
    }
  }

  navigateMenuBar(direction) {
    if (!this.currentSelection) {
      return;
    }

    this.unhoverMenuItems();
    const { children } = this.contentElement;
    const index = getNodeIndex(children, this.currentSelection) + direction;
    const child = children[index];

    if (isMenuItem(child)) {
      child.focus();
      this.clearCurrentSelection();
      this.showMenuWhenHover = true;
      this.showMenu(this.items[index].getItems(), child);
    }
  }

  render() {
    const fragment = document.createDocumentFragment();
    for (const item of this.items) {
      fragment.appendChild(
        html.div(
          {
            class: item.bold ? "menu-item menu-item-bold" : "menu-item",
            tabIndex: 0,
          },
          [item.title]
        )
      );
    }
    this.contentElement.appendChild(fragment);
  }
}

customElements.define("menu-bar", MenuBar);

function isMenuItem(target) {
  return target?.classList.contains("menu-item");
}

function getNodeIndex(nodeList, node) {
  return Array.prototype.indexOf.call(nodeList, node);
}
