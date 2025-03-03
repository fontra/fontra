import * as html from "@fontra/core/html-utils.js";

export class RotaryControl extends html.UnlitElement {
  static styles = `
  :host {
    --knob-size: 1.4rem;
    --thumb-size: calc(var(--knob-size) / 5);
  }

  .knob {
    width: var(--knob-size);
    height: var(--knob-size);
    border-radius: 50%;
    background: #e3e3e3;
    display: flex;
    justify-content: center;
  }

  .knob:before {
    content: "";
    width: var(--thumb-size);
    height: var(--thumb-size);
    background: rgb(89, 89, 89);
    border-radius: 50%;
    margin-top: calc(var(--knob-size) / 8);
  }

  .rotary-control {
    display: flex;
    gap: 0.4rem;
    margin: 0 0.2rem;
  }

  .overlay {
    position: fixed;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    z-index: 1;
  }
  `;

  constructor() {
    super();
    this.onChangeCallback = () => {};
  }

  set value(value) {
    this._value = value;
    if (this.knob) {
      this.knob.style.transform = `rotate(${this.value}deg)`;
    }
  }

  get value() {
    return this._value;
  }

  dispatch() {
    const event = { value: this.value };

    if (this.dragBegin) {
      event.dragBegin = true;
      this.dragBegin = false;
    }

    if (this.dragEnd) {
      event.dragEnd = true;
      this.dragEnd = false;
    }

    this.onChangeCallback(event);
  }

  attachOverlay() {
    const overlay = html.div(
      {
        class: "overlay",
        onmouseup: () => {
          this.positionDragBegin = undefined;
          this.angleWhenDragStart = undefined;
          this.shadowRoot.removeChild(overlay);
          this.dragEnd = true;
          this.dispatch();
        },
        onmousemove: (event) => {
          if (this.positionDragBegin === undefined) {
            return;
          }
          const value =
            this.angleWhenDragStart + (this.positionDragBegin - event.clientY);
          this.value = value;
          this.dispatch();
        },
      },
      []
    );
    this.overlay = overlay;
    this.shadowRoot.appendChild(overlay);
  }

  render() {
    return html.div({ class: "rotary-control" }, [
      (this.knob = html.div(
        {
          class: "knob",
          style: `transform: rotate(${this.value}deg);`,
          onmousedown: (event) => {
            this.positionDragBegin = event.clientY;
            this.angleWhenDragStart = this.value;
            this.dragBegin = true;
            event.preventDefault();
            this.attachOverlay();
          },
        },
        []
      )),
    ]);
  }
}

customElements.define("rotary-control", RotaryControl);
