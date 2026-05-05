import { normalizeRect, rectCenter, validateRect } from "./rectangle.js";
import { assert, clamp, consolidateCalls, isNumber, withSavedState } from "./utils.js";

/** @import { Rectangle } from "./rectangle.js" */
/** @import { SceneView } from "./scene-view.js" */

const DEFAULT_MIN_MAGNIFICATION = 0.005;
const DEFAULT_MAX_MAGNIFICATION = 200;

export class CanvasController {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {undefined | (number) => void} magnificationChangedCallback
   */
  constructor(canvas, magnificationChangedCallback) {
    /** @type {HTMLCanvasElement} */
    this.canvas = canvas; // The HTML5 Canvas object
    /** @type {CanvasRenderingContext2D} */
    this.context = canvas.getContext("2d");
    /** @type {SceneView} */
    this.sceneView = undefined; // will be set later

    /** @type {number} */
    this.magnification = 1;
    /** @type {{ x: number, y: number }} */
    this.origin = { x: this.canvasWidth / 2, y: 0.85 * this.canvasHeight }; // TODO choose y based on initial canvas height

    /** @type {number} */
    this._minMagnification = DEFAULT_MIN_MAGNIFICATION;
    /** @type {number} */
    this._maxMagnification = DEFAULT_MAX_MAGNIFICATION;

    /** @type {undefined | (number) => void} */
    this._magnificationChangedCallback = magnificationChangedCallback;

    const resizeObserver = new ResizeObserver((entries) => {
      this.setupSize();
      this.draw();
      // console.log('Size changed');
    });
    resizeObserver.observe(this.canvas.parentElement);

    this._setupScrollBlocker();

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

  _setupScrollBlocker() {
    this._initialScrollTarget = null;
    this._scrollTimerID = null;

    document.addEventListener("wheel", (event) => {
      clearTimeout(this._scrollTimerID);
      if (!this._initialScrollTarget) {
        this._initialScrollTarget = event.target;
      }
      this._scrollTimerID = setTimeout(() => {
        this._initialScrollTarget = null;
      }, 100);
    });
  }

  _shouldBlockScroll(event) {
    return this._initialScrollTarget && this._initialScrollTarget !== this.canvas;
  }

  get canvasWidth() {
    const w = this.canvas.parentElement.getBoundingClientRect().width;
    assert(isNumber(w));
    return w;
  }

  get canvasHeight() {
    const h = this.canvas.parentElement.getBoundingClientRect().height;
    assert(isNumber(h));
    return h;
  }

  get devicePixelRatio() {
    // return 1;  // To test normal resolution on Retina displays
    return window.devicePixelRatio;
  }

  setupSize() {
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const scale = this.devicePixelRatio;

    // We want to be sure that we have at least enough pixels to cover the
    // entire area of the canvas, accounting for dpi and browser scaling.
    //
    // To do this, we take the ceiling of the CSS pixel width and height
    // values multiplied by the pixel ratio, which is a number that should
    // be guaranteed to be equal to or greater than the final number of screen
    // pixels that the canvas element (or rather its container) takes up.
    this.canvas.width = Math.ceil(width * scale);
    this.canvas.height = Math.ceil(height * scale);

    // We then take those numbers and divide them back down by the scale
    // and tell the browser to display the canvas at that many CSS pixels
    // wide and tall. This should ensure that there is a 1 to 1 mapping
    // between pixels in the canvas's data buffer and pixels as displayed
    // on screen for the user.
    //
    // If we didn't do this, and just used the container's size, then the
    // browser might end up stretching the canvas data very slightly to
    // make it fit the final size. This isn't ideal but usually isn't
    // noticeable except in Safari where the scaling is switched to
    // nearest neighbor if the texture is more than 2K pixels wide,
    // which can cause a column or row of pixels in the center of
    // the canvas to be repeated and it's very noticeable.
    this.canvas.style.width = this.canvas.width / scale + "px";
    this.canvas.style.height = this.canvas.height / scale + "px";

    const parentOffsetX = this.canvas.parentElement.offsetLeft;
    const parentOffsetY = this.canvas.parentElement.offsetTop;

    if (this.previousOffsets) {
      // Try to keep the scroll position constant relative to the
      // parent container
      const dx = this.previousOffsets["parentOffsetX"] - parentOffsetX;
      const dy = this.previousOffsets["parentOffsetY"] - parentOffsetY;
      assert(isNumber(dx));
      assert(isNumber(dy));
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

    if (this._shouldBlockScroll(event)) {
      // The scroll didn't start in the canvas: ignore
      return;
    }

    let { deltaX, deltaY, wheelDeltaX, wheelDeltaY } = event;
    // We try to detect whether the event comes from a "clunky" scroll wheel, one
    // that outputs rather large values for deltaY (this appears to be common on
    // Windows), so we can scale down to keep zoom speed and scroll speed in check.
    assert(isNumber(deltaX));
    assert(isNumber(deltaY));
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

  _clampMagnification() {
    const oldMagnification = this.magnification;
    this.magnification = clamp(
      this.magnification,
      this._minMagnification,
      this._maxMagnification
    );

    if (this.magnification !== oldMagnification) {
      this._magnificationChangedCallback?.(this.magnification);
      this.requestUpdate();
      this._dispatchEvent("viewBoxChanged", "magnification");
    }
  }

  set minMagnification(newValue) {
    // If there's no change then we don't have to do anything.
    if (newValue == this._minMagnification) {
      return;
    }

    this._minMagnification = newValue;

    this._clampMagnification();
  }

  set maxMagnification(newValue) {
    // If there's no change then we don't have to do anything.
    if (newValue == this._maxMagnification) {
      return;
    }

    this._maxMagnification = newValue;

    this._clampMagnification();
  }

  get minMagnification() {
    return this._minMagnification;
  }

  get maxMagnification() {
    return this._maxMagnification;
  }

  _doPinchMagnify(event, zoomFactor) {
    assert(isNumber(zoomFactor));
    const center = this.localPoint({ x: event.pageX, y: event.pageY });
    const prevMagnification = this.magnification;

    this.magnification = this.magnification * zoomFactor;
    this.magnification = clamp(
      this.magnification,
      this.minMagnification,
      this.maxMagnification
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

    assert(isNumber(x));
    assert(isNumber(y));
    return { x, y };
  }

  canvasPoint(point) {
    const x = point.x * this.magnification + this.origin.x;
    const y = -point.y * this.magnification + this.origin.y;
    assert(isNumber(x));
    assert(isNumber(y));
    return { x, y };
  }

  get onePixelUnit() {
    return 1 / this.magnification;
  }

  /** @returns {Rectangle} */
  getViewBox() {
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const left = this.canvas.parentElement.offsetLeft;
    const top = this.canvas.parentElement.offsetTop;
    const bottomLeft = this.localPoint({ x: 0 + left, y: 0 + top });
    const topRight = this.localPoint({ x: width + left, y: height + top });
    const viewBox = normalizeRect({
      xMin: bottomLeft.x,
      yMin: bottomLeft.y,
      xMax: topRight.x,
      yMax: topRight.y,
    });
    validateRect(viewBox);
    return viewBox;
  }

  /** @param {Rectangle} viewBox */
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

  /** @param {Rectangle} viewBox */
  setViewBox(viewBox) {
    validateRect(viewBox);
    this.magnification = this._getProposedViewBoxMagnification(viewBox);
    const canvasCenter = this.canvasPoint(rectCenter(viewBox));
    this.origin.x = this.canvasWidth / 2 + this.origin.x - canvasCenter.x;
    this.origin.y = this.canvasHeight / 2 + this.origin.y - canvasCenter.y;
    this._magnificationChangedCallback?.(this.magnification);
    this.requestUpdate();
    this._dispatchEvent("viewBoxChanged", "set-view-box");
  }

  /** @param {Rectangle} viewBox */
  getProposedViewBoxClampAdjustment(viewBox) {
    const magnification = this._getProposedViewBoxMagnification(viewBox);
    if (magnification < this.minMagnification) {
      return magnification / this.minMagnification;
    } else if (magnification > this.maxMagnification) {
      return magnification / this.maxMagnification;
    }
    return 1;
  }

  /** @param {Rectangle} viewBox */
  _getProposedViewBoxMagnification(viewBox) {
    validateRect(viewBox);
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    assert(isNumber(width));
    assert(isNumber(height));
    const magnificationX = Math.abs(width / (viewBox.xMax - viewBox.xMin));
    const magnificationY = Math.abs(height / (viewBox.yMax - viewBox.yMin));
    return Math.min(magnificationX, magnificationY);
  }

  /** @param {string} eventName */
  _dispatchEvent(eventName, detail) {
    const event = new CustomEvent(eventName, {
      bubbles: false,
      detail: detail,
    });
    this.canvas.dispatchEvent(event);
  }
}
