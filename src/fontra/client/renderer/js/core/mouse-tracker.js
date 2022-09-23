const modifierKeys = ["Shift", "Control", "Alt", "Meta"];


export class MouseTracker {

  constructor(options) {
    this._dragFunc = options.drag;
    this._hoverFunc = options.hover;
    this._eventStream = undefined;
    this._lastMouseDownEvent = undefined;
    this._addEventListeners(options.element);
  }

  _addEventListeners(element) {
    element.addEventListener("mousedown", event => this.handleMouseDown(event))
    element.addEventListener("touchstart", event => this.handleMouseDown(event))
    element.addEventListener("keydown", event => this.handleModifierKeyChange(event));
    element.addEventListener("keyup", event => this.handleModifierKeyChange(event));
    element.addEventListener("mousemove", event => this.handleMouseMove(event));
    element.addEventListener("touchmove", event => this.handleMouseMove(event));
    element.addEventListener("touchend", event => this.handleMouseUp(event));

    if (!window._fontraDidInstallMouseTrackerListeners) {
      // We add "mouseup" and "mousemove" as window-level event listeners,
      // because otherwise we will not receive them if they occur outside the
      // target element's box.
      window.addEventListener("mouseup", event => window._fontraMouseTracker?.handleMouseUp(event));
      window.addEventListener("mousemove", event => window._fontraMouseTracker?.handleMouseMove(event));
      window._fontraDidInstallMouseTrackerListeners = true;
    }
  }

  handleMouseDown(event) {
    if (this._lastMouseDownEvent !== undefined && event.type !== this._lastMouseDownEvent.type) {
      // Ignore MouseEvents that com after TouchEvent, yet don't
      // do event.preventDefault().
      return;
    }
    // console.log("number of clicks:", event.detail);
    if (this._eventStream !== undefined && !this._eventStream.isDone()) {
      console.log("assert -- unfinished event stream");
    }
    event.myTapCount = 1;
    if (this._lastMouseDownEvent !== undefined && areEventsClose(event, this._lastMouseDownEvent)) {
      const timeSince = event.timeStamp - this._lastMouseDownEvent.timeStamp;
      if((timeSince < 600) && (timeSince > 0)) {
        event.myTapCount = 2;
      }
    }
    this._lastMouseDownEvent = event;

    window._fontraMouseTracker = this;
    this._eventStream = new EventStream();
    this._dragFunc(this._eventStream, event);
  }

  handleMouseMove(event) {
    if (this._eventStream !== undefined) {
      // in mouse drag
      this._eventStream.pushEvent(event);
    } else {
      // hovering
      this._hoverFunc(event);
    }
    event.stopImmediatePropagation();  // handle element-level or window-level event, but not both
  }

  handleMouseUp(event) {
    delete window._fontraMouseTracker;
    this._eventStream.pushEvent(event);
    this._eventStream.done();
    this._eventStream = undefined;
  }

  handleModifierKeyChange(event) {
    if (this._eventStream !== undefined && modifierKeys.indexOf(event.key) >= 0) {
      this._eventStream.pushEvent(event);
    }
  }

}


class EventStream {

  constructor() {
    this._reset();
    this._done = false;
  }

  _reset() {
    this._resolve = undefined;
    this._reject = undefined;
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  next() {
    if (this._resolve !== undefined) {
      throw new Error("can't make a new Promise: the previous Promise is still pending");
    }
    if (this._done) {
      return Promise.resolve({"done": true});
    } else {
      return new Promise((resolve, reject) => {
        this._resolve = resolve;
        this._reject = reject;
      });
    }
  }

  pushEvent(event) {
    if (this._resolve !== undefined) {
      this._resolve({"value": event, "done": false});
      this._reset();
    } else {
      // console.log("ignoring pushEvent: no iteration took place");
    }
  }

  pushError(error) {
    if (this._reject !== undefined) {
      this._reject(error);
      this._reset();
    } else {
      throw error;
    }
  }

  done() {
    this._done = true;
  }

  isDone() {
    return this._done;
  }

}


function areEventsClose(event1, event2) {
  const maxDistance = 3;
  return (
    Math.abs(event1.pageX - event2.pageX) < maxDistance &&
    Math.abs(event1.pageY - event2.pageY) < maxDistance
  )
}
