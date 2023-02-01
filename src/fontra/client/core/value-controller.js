export class ValueController {
  constructor() {
    this._observers = new Map();
  }

  get value() {
    return this._value;
  }

  set(value, observerID) {
    if (observerID && !this._observers.has(observerID)) {
      throw new Error("can't set value: unknown observerID");
    }
    this._value = value;
    this._observers.forEach((valueCallback, valueObserverID, map) => {
      if (valueObserverID !== observerID) {
        // Don't execute immediately
        setTimeout(() => valueCallback(value), 0);
      }
    });
  }

  addObserver(observerID, valueCallback) {
    if (!observerID) {
      throw new Error('missing/falsey observerID argument');
    }
    if (this._observers.has(observerID)) {
      throw new Error('observerID must be unique');
    }
    this._observers.set(observerID, valueCallback);
  }

  removeObserver(observerID) {
    this._observers.delete(observerID);
  }
}
