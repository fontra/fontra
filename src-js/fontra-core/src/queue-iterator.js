export class QueueIterator {
  constructor(maxQueueSize = 10, dropItems = false) {
    this._done = false;
    this._queue = [];
    this._maxQueueSize = maxQueueSize;
    this._dropItems = dropItems;
    this._signal = null;
  }

  put(item) {
    if (this._queue.length >= this._maxQueueSize) {
      if (this._dropItems) {
        this._queue.shift();
      } else {
        throw new Error("can't put item: queue is full");
      }
    }
    if (this._done) {
      throw new Error("can't put item: queue is done");
    }
    this._queue.push(item);
    this._signal?.();
  }

  done() {
    this._done = true;
    this._signal?.();
  }

  isDone() {
    return this._done;
  }

  isFull() {
    return this._queue.length >= this._maxQueueSize;
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  next() {
    if (this._queue.length) {
      return Promise.resolve({ value: this._queue.shift(), done: false });
    } else if (this._done) {
      return Promise.resolve({ done: true });
    } else {
      return new Promise((resolve) => {
        this._signal = () => {
          if (this._queue.length) {
            resolve({ value: this._queue.shift(), done: false });
          } else {
            resolve({ done: true });
          }
          this._signal = null;
        };
      });
    }
  }
}
