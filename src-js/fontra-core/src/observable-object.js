import { assert, chain } from "./utils.js";

export const controllerKey = Symbol("controller-key");

export class ObservableController {
  constructor(model) {
    if (!model) {
      model = {};
    }
    this.model = newModelProxy(this, model);
    this._rawModel = model;
    this._generalListeners = [];
    this._keyListeners = {};
    this._senderInfoStack = [];
  }

  addListener(listener, immediate = false) {
    this._generalListeners.push({ listener, immediate });
  }

  removeListener(listener) {
    // Instead of using indexOf, we use filter, to ensure we also delete any duplicates
    this._generalListeners = this._generalListeners.filter(
      (item) => item.listener !== listener
    );
  }

  addKeyListener(keyOrKeys, listener, immediate = false) {
    if (typeof keyOrKeys === "string") {
      keyOrKeys = [keyOrKeys];
    }
    for (const key of keyOrKeys) {
      if (!(key in this._keyListeners)) {
        this._keyListeners[key] = [];
      }
      this._keyListeners[key].push({ listener, immediate });
    }
  }

  removeKeyListener(keyOrKeys, listener) {
    if (typeof keyOrKeys === "string") {
      keyOrKeys = [keyOrKeys];
    }
    for (const key of keyOrKeys) {
      if (!this._keyListeners[key]) {
        continue;
      }
      // Instead of using indexOf, we use filter, to ensure we also delete any duplicates
      this._keyListeners[key] = this._keyListeners[key].filter(
        (item) => item.listener !== listener
      );
    }
  }

  setItem(key, newValue, senderInfo) {
    const oldValue = this._rawModel[key];
    if (newValue !== oldValue) {
      this._rawModel[key] = newValue;
      this._dispatchChange(key, newValue, oldValue, senderInfo);
    }
  }

  synchronizeWithLocalStorage(prefix = "", readItemsFromLocalStorage = false) {
    this._addSynchronizedItem = synchronizeWithLocalStorage(
      this,
      prefix,
      readItemsFromLocalStorage
    );
  }

  waitForKeyChange(keyOrKeys, immediate = false) {
    let resolvePromise;

    const tempListener = (event) => {
      this.removeKeyListener(keyOrKeys, tempListener);
      resolvePromise(event);
    };

    this.addKeyListener(keyOrKeys, tempListener, immediate);

    return new Promise((resolve) => {
      resolvePromise = resolve;
    });
  }

  synchronizeItemWithLocalStorage(key, defaultValue) {
    // For an observable that is already synchronized with localStorage, add
    // a key/value pair to the model. This reads the value from localStorage
    // if the `key` is present, else it uses the `defaultValue`.
    if (!this._addSynchronizedItem) {
      throw Error("observable is not synchronized wih localStorage");
    }
    this._addSynchronizedItem(key, defaultValue, true);
  }

  async withSenderInfo(senderInfo, func) {
    this._senderInfoStack.push(senderInfo);
    try {
      await func();
    } finally {
      this._senderInfoStack.pop();
    }
  }

  _dispatchChange(key, newValue, oldValue, senderInfo) {
    // Schedule the calls in the event loop rather than call immediately
    if (!senderInfo && this._senderInfoStack.length) {
      senderInfo = this._senderInfoStack.at(-1);
    }
    const event = { key, newValue, oldValue, senderInfo };
    for (const item of chain(this._generalListeners, this._keyListeners[key] || [])) {
      if (item.immediate) {
        item.listener(event);
      } else {
        setTimeout(() => item.listener(event), 0);
      }
    }
  }
}

function newModelProxy(controller, model) {
  const handler = {
    set(model, key, newValue) {
      const oldValue = model[key];
      if (newValue !== oldValue) {
        model[key] = newValue;
        controller._dispatchChange(key, newValue, oldValue);
      }
      return true;
    },

    get(model, key, receiver) {
      if (key === controllerKey) {
        return controller;
      }
      return model[key];
    },

    deleteProperty(model, key) {
      const oldValue = model[key];
      if (oldValue !== undefined) {
        delete model[key];
        controller._dispatchChange(key, undefined, oldValue);
      }
      return true;
    },
  };

  return new Proxy(model, handler);
}

function synchronizeWithLocalStorage(
  controller,
  prefix = "",
  readItemsFromLocalStorage = false
) {
  const mapKeyToObject = {};
  const mapKeyToStorage = {};
  const stringKeys = {};
  for (const [key, value] of Object.entries(controller.model)) {
    addItem(key, value, false);
  }

  if (readItemsFromLocalStorage) {
    assert(prefix.length);
    for (const [prefixedKey, storedValue] of Object.entries(localStorage)) {
      if (!prefixedKey.startsWith(prefix)) {
        continue;
      }
      const key = prefixedKey.slice(prefix.length);
      try {
        const _ = JSON.parse(storedValue);
      } catch (e) {
        stringKeys[key] = true;
      }
      addItem(key, null, false);
    }
  }

  function addItem(key, value, setOnModel) {
    const storageKey = prefix + key;
    mapKeyToObject[storageKey] = key;
    mapKeyToStorage[key] = storageKey;
    stringKeys[key] = typeof value === "string";
    const storedValue = localStorage.getItem(storageKey);
    if (storedValue !== null) {
      setItemOnObject(key, storedValue);
    } else if (setOnModel) {
      controller.model[key] = value;
    }
  }

  function setItemOnObject(key, value) {
    if (!stringKeys[key]) {
      value = JSON.parse(value);
    }
    controller.model[key] = value;
  }

  function setItemOnStorage(key, value) {
    if (!stringKeys[key]) {
      value = JSON.stringify(value);
    }
    const storageKey = mapKeyToStorage[key];
    if (localStorage.getItem(storageKey) !== value) {
      localStorage.setItem(storageKey, value);
    }
  }

  controller.addListener((event) => {
    if (event.key in mapKeyToStorage) {
      setItemOnStorage(event.key, event.newValue);
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key in mapKeyToObject) {
      setItemOnObject(mapKeyToObject[event.key], event.newValue);
    }
  });

  return addItem;
}
