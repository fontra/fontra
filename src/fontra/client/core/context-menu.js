import { reversed } from './utils.js';

export class ContextMenu {
  constructor(elementID, menuItems) {
    this.element = document.querySelector(`#${elementID}`);

    this.element.classList.add('visible');
    this.element.focus();
    this.element.onkeydown = (event) => this.handleKeyDown(event);

    this.element.innerHTML = '';
    this.element.oncontextmenu = (event) => event.preventDefault(); // No context menu on our context menu please

    for (const item of menuItems) {
      const el = document.createElement('div');
      if (item === '-') {
        const dividerElement = document.createElement('hr');
        dividerElement.className = 'context-menu-item-divider';
        this.element.appendChild(dividerElement);
      } else {
        const itemElement = document.createElement('div');
        itemElement.classList.add('context-menu-item');
        itemElement.classList.toggle('enabled', !item.disabled);
        itemElement.innerText = item.title;
        if (!item.disabled) {
          itemElement.onmouseenter = (event) => this.selectItem(itemElement);
          itemElement.onmousemove = (event) => {
            if (!itemElement.classList.contains('selected')) {
              this.selectItem(itemElement);
            }
          };
          itemElement.onmouseleave = (event) =>
            itemElement.classList.remove('selected');
          itemElement.onclick = (event) => {
            if (item.callback) {
              item.callback(event);
            }
            this.dismiss();
          };
        }
        this.element.appendChild(itemElement);
      }
    }

    const container = this.element.parentElement;
    let { clientX: mouseX, clientY: mouseY } = event;
    mouseX -= container.offsetLeft;
    mouseY -= container.offsetTop;

    const [normalizedX, normalizedY] = normalizedPosition(
      container,
      this.element,
      mouseX,
      mouseY
    );

    this.element.style.top = `${normalizedY - 1}px`;
    this.element.style.left = `${normalizedX + 1}px`;
  }

  dismiss() {
    this.element.classList.remove('visible');
  }

  selectItem(itemElement) {
    const selectedItem = this.findSelectedItem();
    if (selectedItem && selectedItem !== itemElement) {
      selectedItem.classList.remove('selected');
    }
    itemElement.classList.add('selected');
  }

  handleKeyDown(event) {
    switch (event.key) {
      case 'Escape':
        this.dismiss();
        break;
      case 'ArrowDown':
        this.selectPrevNext(true);
        break;
      case 'ArrowUp':
        this.selectPrevNext(false);
        break;
      case 'Enter':
        const selectedItem = this.findSelectedItem();
        if (selectedItem) {
          selectedItem.onclick(event);
        }
        break;
    }
  }

  findSelectedItem() {
    let selectedItem;
    for (const item of this.element.children) {
      if (item.classList.contains('selected')) {
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
        if (sibling.classList.contains('enabled')) {
          sibling.classList.add('selected');
          selectedChild.classList.remove('selected');
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
      for (const item of f(this.element.children)) {
        if (item.classList.contains('enabled')) {
          this.selectItem(item);
          break;
        }
      }
    }
  }
}

function normalizedPosition(container, contextMenu, mouseX, mouseY) {
  const { left: containerOffsetX, top: containerOffsetY } =
    container.getBoundingClientRect();

  const containerX = mouseX - containerOffsetX;
  const containerY = mouseY - containerOffsetY;

  const outOfBoundsOnX = containerX + contextMenu.clientWidth > container.clientWidth;

  const outOfBoundsOnY = containerY + contextMenu.clientHeight > container.clientHeight;

  let normalizedX = mouseX;
  let normalizedY = mouseY;

  if (outOfBoundsOnX) {
    normalizedX = containerOffsetX + container.clientWidth - contextMenu.clientWidth;
  }

  if (outOfBoundsOnY) {
    normalizedY = containerOffsetY + container.clientHeight - contextMenu.clientHeight;
  }

  return [normalizedX, normalizedY];
}
