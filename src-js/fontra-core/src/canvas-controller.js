import { normalizeRect, rectCenter } from "./rectangle.js";
import { consolidateCalls, withSavedState } from "./utils.js";

const MIN_MAGNIFICATION = 0.005;
const MAX_MAGNIFICATION = 200;

export class CanvasController {
  constructor(canvas, magnificationChangedCallback) {
    this.canvas = canvas; // The HTML5 Canvas object
    this.context = canvas.getContext("2d");
    this.sceneView = undefined; // will be set later

    this.magnification = 1;
    this.origin = { x: this.canvasWidth / 2, y: 0.85 * this.canvasHeight }; // TODO choose y based on initial canvas height

    this._magnificationChangedCallback = magnificationChangedCallback;

    const resizeObserver = new ResizeObserver((entries) => {
      this.setupSize();
      this.draw();
      // console.log('Size changed');
    });
    resizeObserver.observe(this.canvas.parentElement);

    canvas.addEventListener("wheel", (event) => this.handleWheel(event));

    // Safari pinch zoom:
    canvas.addEventListener("gesturestart", (event) =>
      this.handleSafariGestureStart(event)
    );
    canvas.addEventListener("gesturechange", (event) =>
      this.handleSafariGestureChange(event)
    );
    canvas.addEventListener("gestureend", (event) =>
      this.handleSafariGestureEnd(event)
    );

    // canvas.addEventListener("mousedown", async (e) => this.testing(e));
    // canvas.addEventListener("scroll", this.onEvent.bind(this));
    // canvas.addEventListener("touchstart", this.onEvent.bind(this), false);
    // canvas.addEventListener("touchmove", this.onEvent.bind(this), false);
    // canvas.addEventListener("touchend", this.onEvent.bind(this), false);
    // canvas.addEventListener("pointerdown", async (e) => this.testing(e), false);
    // canvas.addEventListener("pointermove", this.onEvent.bind(this), false);
    // canvas.addEventListener("pointerup", this.onEvent.bind(this), false);
    // canvas.addEventListener("pointercancel", this.onEvent.bind(this), false);

    this.setupSize();
    this.requestUpdate = consolidateCalls(() => this.draw());
    this.requestUpdate();
  }

  get canvasWidth() {
    return this.canvas.parentElement.getBoundingClientRect().width;
  }

  get canvasHeight() {
    return this.canvas.parentElement.getBoundingClientRect().height;
  }

  get devicePixelRatio() {
    // return 1;  // To test normal resolution on Retina displays
    return window.devicePixelRatio;
  }

  setupSize() {
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const scale = this.devicePixelRatio;
    this.canvas.width = Math.floor(width * scale);
    this.canvas.height = Math.floor(height * scale);
    this.canvas.style.width = width + "px";
    this.canvas.style.height = height + "px";
    const parentOffsetX = this.canvas.parentElement.offsetLeft;
    const parentOffsetY = this.canvas.parentElement.offsetTop;

    if (this.previousOffsets) {
      // Try to keep the scroll position constant relative to the
      // parent container
      const dx = this.previousOffsets["parentOffsetX"] - parentOffsetX;
      const dy = this.previousOffsets["parentOffsetY"] - parentOffsetY;
      this.origin.x += dx;
      this.origin.y += dy;
    }
    this.previousOffsets = { parentOffsetX, parentOffsetY };
    this._dispatchEvent("viewBoxChanged", "canvas-size");
  }

  draw() {
    const scale = this.devicePixelRatio;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.sceneView) {
      return;
    }
    withSavedState(this.context, () => {
      this.context.scale(scale, scale);
      this.context.translate(this.origin.x, this.origin.y);
      this.context.scale(this.magnification, -this.magnification);
      this.sceneView.draw(this);
    });
  }

  setLangAttribute(lang) {
    this.canvas.setAttribute("lang", lang.trim() || "en");
    this.requestUpdate();
  }

  // Event handlers

  handleWheel(event) {
    event.preventDefault();
    let { deltaX, deltaY, wheelDeltaX, wheelDeltaY } = event;
    // We try to detect whether the event comes from a "clunky" scroll wheel, one
    // that outputs rather large values for deltaY (this appears to be common on
    // Windows), so we can scale down to keep zoom speed and scroll speed in check.
    const clunkyScrollWheel =
      Math.abs(deltaY) > 50 && Math.abs(wheelDeltaY / deltaY) < 2;
    if (event.ctrlKey || event.altKey) {
      // Note: wheel events with ctrlKey down is *also* how zoom gestures on trackpads
      // are received, on both Windows and macOS.
      const scaleDown = clunkyScrollWheel ? 500 : event.ctrlKey ? 100 : 300;
      this._doPinchMagnify(event, 1 - deltaY / scaleDown);
    } else {
      const scaleDown = clunkyScrollWheel ? 3 : 1;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.origin.x -= deltaX / scaleDown;
      } else {
        this.origin[event.shiftKey ? "x" : "y"] -= deltaY / scaleDown;
      }
      this.requestUpdate();
      this._dispatchEvent("viewBoxChanged", "origin");
    }
  }

  handleSafariGestureStart(event) {
    event.preventDefault();
    this._initialMagnification = this.magnification;
    this._doPinchMagnify(event, event.scale);
  }

  handleSafariGestureChange(event) {
    event.preventDefault();
    const zoomFactor = (this._initialMagnification * event.scale) / this.magnification;
    this._doPinchMagnify(event, zoomFactor);
  }

  handleSafariGestureEnd(event) {
    event.preventDefault();
    delete this._initialMagnification;
  }

  _doPinchMagnify(event, zoomFactor) {
    const center = this.localPoint({ x: event.pageX, y: event.pageY });
    const prevMagnification = this.magnification;

    this.magnification = this.magnification * zoomFactor;
    this.magnification = Math.min(
      Math.max(this.magnification, MIN_MAGNIFICATION),
      MAX_MAGNIFICATION
    );
    zoomFactor = this.magnification / prevMagnification;

    // adjust origin
    this.origin.x += (1 - zoomFactor) * center.x * prevMagnification;
    this.origin.y -= (1 - zoomFactor) * center.y * prevMagnification;
    this._magnificationChangedCallback?.(this.magnification);
    this.requestUpdate();
    this._dispatchEvent("viewBoxChanged", "magnification");
  }

  onEvent(event) {
    console.log(event.type, event);
    event.preventDefault();
  }

  async testing(event) {
    console.log("testing async 1");
    await new Promise((r) => setTimeout(r, 500));
    console.log("testing async 2");
  }

  // helpers

  localPoint(event) {
    if (event.x === undefined) {
      event = { x: event.pageX, y: event.pageY };
    }
    const x =
      (event.x - this.canvas.parentElement.offsetLeft - this.origin.x) /
      this.magnification;
    const y =
      -(event.y - this.canvas.parentElement.offsetTop - this.origin.y) /
      this.magnification;
    return { x: x, y: y };
  }

  canvasPoint(point) {
    const x = point.x * this.magnification + this.origin.x;
    const y = -point.y * this.magnification + this.origin.y;
    return { x: x, y: y };
  }

  get onePixelUnit() {
    return 1 / this.magnification;
  }

  getViewBox() {
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const left = this.canvas.parentElement.offsetLeft;
    const top = this.canvas.parentElement.offsetTop;
    const bottomLeft = this.localPoint({ x: 0 + left, y: 0 + top });
    const topRight = this.localPoint({ x: width + left, y: height + top });
    return normalizeRect({
      xMin: bottomLeft.x,
      yMin: bottomLeft.y,
      xMax: topRight.x,
      yMax: topRight.y,
    });
  }

  isActualViewBox(viewBox) {
    const canvasCenter = this.canvasPoint(rectCenter(viewBox));
    return (
      this.magnification === this._getProposedViewBoxMagnification(viewBox) &&
      Math.round(this.origin.x) ===
        Math.round(this.canvasWidth / 2 + this.origin.x - canvasCenter.x) &&
      Math.round(this.origin.y) ===
        Math.round(this.canvasHeight / 2 + this.origin.y - canvasCenter.y)
    );
  }

  setViewBox(viewBox) {
    this.magnification = this._getProposedViewBoxMagnification(viewBox);
    const canvasCenter = this.canvasPoint(rectCenter(viewBox));
    this.origin.x = this.canvasWidth / 2 + this.origin.x - canvasCenter.x;
    this.origin.y = this.canvasHeight / 2 + this.origin.y - canvasCenter.y;
    this._magnificationChangedCallback?.(this.magnification);
    this.requestUpdate();
  }

  getProposedViewBoxClampAdjustment(viewBox) {
    const magnification = this._getProposedViewBoxMagnification(viewBox);
    if (magnification < MIN_MAGNIFICATION) {
      return magnification / MIN_MAGNIFICATION;
    } else if (magnification > MAX_MAGNIFICATION) {
      return magnification / MAX_MAGNIFICATION;
    }
    return 1;
  }

  _getProposedViewBoxMagnification(viewBox) {
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const magnificationX = Math.abs(width / (viewBox.xMax - viewBox.xMin));
    const magnificationY = Math.abs(height / (viewBox.yMax - viewBox.yMin));
    return Math.min(magnificationX, magnificationY);
  }

  _dispatchEvent(eventName, detail) {
    const event = new CustomEvent(eventName, {
      bubbles: false,
      detail: detail,
    });
    this.canvas.dispatchEvent(event);
  }
}
