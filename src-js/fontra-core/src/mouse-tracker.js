import { QueueIterator } from "./queue-iterator.js";

const modifierKeys = ["Shift", "Control", "Alt", "Meta"];

export class MouseTracker {
  constructor(options) {
    this._dragFunc = options.drag;
    this._hoverFunc = options.hover;
    this._eventStream = undefined;
    this._lastMouseDownEvent = undefined;
    this._getTapCount = getTapCounter();
    this._addEventListeners(options.element);
  }

  _addEventListeners(element) {
    element.addEventListener("mousedown", (event) => this.handleMouseDown(event));
    element.addEventListener("touchstart", (event) => this.handleMouseDown(event));
    window.addEventListener("keydown", (event) => this.handleModifierKeyChange(event));
    window.addEventListener("keyup", (event) => this.handleModifierKeyChange(event));
    element.addEventListener("mousemove", (event) => this.handleMouseMove(event));
    element.addEventListener("touchmove", (event) => this.handleMouseMove(event));
    element.addEventListener("touchend", (event) => this.handleMouseUp(event));

    if (!window._fontraDidInstallMouseTrackerListeners) {
      // We add "mouseup" and "mousemove" as window-level event listeners,
      // because otherwise we will not receive them if they occur outside the
      // target element's box.
      window.addEventListener("mouseup", (event) =>
        window._fontraMouseTracker?.handleMouseUp(event)
      );
      window.addEventListener("mousemove", (event) =>
        window._fontraMouseTracker?.handleMouseMove(event)
      );
      window._fontraDidInstallMouseTrackerListeners = true;
    }
  }

  handleMouseDown(event) {
    if (event.button === 2 || event.ctrlKey) {
      // We're not handling contextual menus
      return;
    }
    if (
      this._lastMouseDownEvent !== undefined &&
      event.type !== this._lastMouseDownEvent.type
    ) {
      // Ignore MouseEvents that com after TouchEvent, yet don't
      // do event.preventDefault().
      return;
    }
    // console.log("number of clicks:", event.detail);
    if (this._eventStream !== undefined && !this._eventStream.isDone()) {
      console.log("assert -- unfinished event stream");
    }
    event.myTapCount = this._getTapCount(event);
    this._lastMouseDownEvent = event;

    window._fontraMouseTracker = this;
    this._eventStream = new QueueIterator(1, true);
    this._dragFunc(this._eventStream, event);
  }

  handleMouseMove(event) {
    this._checkEventStreamDone();
    if (this._eventStream !== undefined) {
      // in mouse drag
      this._eventStream.put(event);
    } else {
      // hovering
      this._hoverFunc(event);
    }
    event.stopImmediatePropagation(); // handle element-level or window-level event, but not both
  }

  handleMouseUp(event) {
    delete window._fontraMouseTracker;
    this._checkEventStreamDone();
    this._eventStream?.put(event);
    this._eventStream?.done();
    this._eventStream = undefined;
  }

  handleModifierKeyChange(event) {
    this._checkEventStreamDone();
    this._eventStream?.put(event);
    if (!this._eventStream) {
      this._hoverFunc(event);
    }
  }

  _checkEventStreamDone() {
    if (this._eventStream?.isDone()) {
      this._eventStream = undefined;
    }
  }
}

function getTapCounter() {
  let lastEvent;
  let tapCount = 1;
  return (event) => {
    if (lastEvent && areEventsClose(event, lastEvent)) {
      const timeSince = event.timeStamp - lastEvent.timeStamp;
      if (timeSince < 600 && timeSince > 0) {
        tapCount += 1;
      } else {
        tapCount = 1;
      }
    } else {
      tapCount = 1;
    }
    lastEvent = event;
    return tapCount;
  };
}

function areEventsClose(event1, event2) {
  const maxDistance = 3;
  return (
    Math.abs(event1.pageX - event2.pageX) < maxDistance &&
    Math.abs(event1.pageY - event2.pageY) < maxDistance
  );
}
