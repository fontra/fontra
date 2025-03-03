export class TaskPool {
  constructor(maxTasks) {
    this._maxTasks = maxTasks;
    this._numTasks = 0;
    this._eventQueue = [];
  }

  wait() {
    return this._allDoneEvent?.wait();
  }

  async schedule(func) {
    if (this._numTasks === 0) {
      this._allDoneEvent = new OneOffEvent();
    }
    if (this._numTasks >= this._maxTasks) {
      const event = new OneOffEvent();
      this._eventQueue.push(event);
      await event.wait();
    }
    this._numTasks++;
    func()
      .then(() => this._doneTask())
      .catch((error) => this._doneTask(error));
  }

  _doneTask(error) {
    this._numTasks--;
    if (this._numTasks < this._maxTasks && this._eventQueue.length) {
      const event = this._eventQueue.shift();
      event.set();
    }
    if (this._numTasks === 0) {
      this._allDoneEvent?.set();
      this._allDoneEvent = null;
    }
    if (error) {
      console.error(error);
    }
  }
}

class OneOffEvent {
  constructor() {
    this._resolvePromise = new Promise((resolve) => (this._resolve = resolve));
  }

  set() {
    this._resolve?.();
  }

  wait() {
    return this._resolvePromise;
  }
}
