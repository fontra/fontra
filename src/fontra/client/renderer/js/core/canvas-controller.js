import { rectCenter, normalizeRect } from "./rectangle.js";
import { withSavedState } from "./utils.js";
import { mulScalar } from "./var-funcs.js";


const MIN_MAGNIFICATION = 0.05;
const MAX_MAGNIFICATION = 200;


export class CanvasController {

  constructor(canvas, drawingParameters) {
    this.canvas = canvas;  // The HTML5 Canvas object
    this.context = canvas.getContext("2d");
    this.sceneView = undefined;  // will be set later

    this.magnification = 1;
    this.origin = {x: this.canvasWidth / 2, y: 0.85 * this.canvasHeight};  // TODO choose y based on initial canvas height
    this.needsUpdate = false;

    this.setDrawingParameters(drawingParameters);

    const resizeObserver = new ResizeObserver(entries => {
      this.setupSize();
      this.draw();
      // console.log('Size changed');
    });
    resizeObserver.observe(this.canvas);

    window.addEventListener("resize", event => this.handleResize(event));
    canvas.addEventListener("wheel", event => this.handleWheel(event));

    // Safari pinch zoom:
    canvas.addEventListener("gesturestart", event => this.handleSafariGestureStart(event));
    canvas.addEventListener("gesturechange", event => this.handleSafariGestureChange(event));
    canvas.addEventListener("gestureend", event => this.handleSafariGestureEnd(event));

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
    this.setNeedsUpdate();
  }

  get canvasWidth() {
    return this.canvas.parentElement.getBoundingClientRect().width;
  }

  get canvasHeight() {
    return this.canvas.parentElement.getBoundingClientRect().height;
  }

  setupSize() {
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const scale = window.devicePixelRatio; // Change to 1 on retina screens to see blurry canvas.
    this.canvas.width = Math.floor(width * scale);
    this.canvas.height = Math.floor(height * scale);
    this.canvas.style.width = width;
    this.canvas.style.height = height;
  }

  setNeedsUpdate() {
    if (!this.needsUpdate) {
      this.needsUpdate = true;
      setTimeout(() => this.draw(), 0);
    }
  }

  setDrawingParameters(drawingParameters) {
    this._unscaledDrawingParameters = drawingParameters;
    this._updateDrawingParameters();
    this.setNeedsUpdate();
  }

  _updateDrawingParameters() {
    this.drawingParameters = mulScalar(
      this._unscaledDrawingParameters, 1 / this.magnification
    );
  }

  draw() {
    this.needsUpdate = false;
    const scale = window.devicePixelRatio;
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

  // Event handlers

  handleResize(event) {
    this.setupSize();
    this.setNeedsUpdate();
    this._dispatchEvent("viewBoxChanged", "canvas-size");
  }

  handleWheel(event) {
    event.preventDefault();
    if (event.ctrlKey) {
      this._doPinchMagnify(event, 1 - event.deltaY / 100);
    } else {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        this.origin.x -= event.deltaX;
      } else {
        this.origin.y -= event.deltaY;
      }
      this.setNeedsUpdate();
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
    const zoomFactor = this._initialMagnification * event.scale / this.magnification;
    this._doPinchMagnify(event, zoomFactor);
  }

  handleSafariGestureEnd(event) {
    event.preventDefault();
    delete this._initialMagnification;
  }

  _doPinchMagnify(event, zoomFactor) {
    const center = this.localPoint({x: event.pageX, y: event.pageY});
    const prevMagnification = this.magnification;

    this.magnification = this.magnification * zoomFactor;
    this.magnification = Math.min(Math.max(this.magnification, MIN_MAGNIFICATION), MAX_MAGNIFICATION);
    zoomFactor = this.magnification / prevMagnification;

    // adjust origin
    this.origin.x += (1 - zoomFactor) * center.x * prevMagnification;
    this.origin.y -= (1 - zoomFactor) * center.y * prevMagnification;
    this._updateDrawingParameters();
    this.setNeedsUpdate();
    this._dispatchEvent("viewBoxChanged", "magnification");
  }

  onEvent(event) {
    console.log(event.type, event);
    event.preventDefault();
  }

  async testing(event) {
    console.log("testing async 1");
    await new Promise(r => setTimeout(r, 500));
    console.log("testing async 2");
  }

  // helpers

  localPoint(event) {
    if (event.x === undefined) {
      event = {"x": event.pageX, "y": event.pageY};
    }
    const x = (event.x - this.canvas.offsetLeft - this.origin.x) / this.magnification;
    const y = -(event.y - this.canvas.offsetTop - this.origin.y) / this.magnification;
    return {x: x, y: y}
  }

  canvasPoint(point) {
    const x = point.x * this.magnification + this.canvas.offsetLeft + this.origin.x;
    const y = -point.y * this.magnification + this.canvas.offsetTop + this.origin.y;
    return {x: x, y: y}
  }

  get onePixelUnit() {
    return 1 / this.magnification;
  }

  getViewBox() {
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const bottomLeft = this.localPoint({x: 0, y: 0});
    const topRight = this.localPoint({x: width, y: height});
    return normalizeRect(
      {xMin: bottomLeft.x, yMin: bottomLeft.y, xMax: topRight.x, yMax: topRight.y}
    );
  }

  setViewBox(viewBox) {
    const localCenter = rectCenter(viewBox);
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const magnificationX = Math.abs(width / (viewBox.xMax - viewBox.xMin));
    const magnificationY = Math.abs(height / (viewBox.yMax - viewBox.yMin));
    this.magnification = Math.min(magnificationX, magnificationY);
    const canvasCenter = this.canvasPoint(localCenter);
    this.origin.x = width / 2 + this.origin.x - canvasCenter.x;
    this.origin.y = height / 2 + this.origin.y - canvasCenter.y;
    this._updateDrawingParameters();
    this.setNeedsUpdate();
  }

  _dispatchEvent(eventName, detail) {
    const event = new CustomEvent(eventName, {
      "bubbles": false,
      "detail": detail,
    });
    this.canvas.dispatchEvent(event);
  }

}
