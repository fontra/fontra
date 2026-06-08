import { assert, chain } from "./utils.ts";

export const controllerKey = Symbol("controller-key");

export type Event<T, K extends keyof T> = {
  key: K;
  newValue: T[K];
  oldValue: T[K];
  senderInfo: any;
};

export type Listener<T> = (event: Event<T, keyof T>) => void;

export class ObservableController<T extends {}> {
  model: T;

  _rawModel: T;

  _generalListeners: {
    listener: Listener<T>;
    immediate: boolean;
  }[] = [];

  _keyListeners: Partial<
    Record<
      keyof T,
      {
        listener: Listener<T>;
        immediate: boolean;
      }[]
    >
  > = {};

  _senderInfoStack: any[] = [];

  _addSynchronizedItem:
    | (<K extends keyof T & string>(key: K, value: T[K], setOnModel: boolean) => void)
    | undefined;

  constructor(model: T) {
    this.model = newModelProxy(this, model);
    this._rawModel = model;
  }

  addListener(listener: Listener<T>, immediate = false) {
    this._generalListeners.push({ listener, immediate });
  }

  removeListener(listener: Listener<T>) {
    // Instead of using indexOf, we use filter, to ensure we also delete any duplicates
    this._generalListeners = this._generalListeners.filter(
      (item) => item.listener !== listener
    );
  }

  addKeyListener<K extends keyof T>(
    keyOrKeys: K | K[],
    listener: (event: Event<T, K>) => void,
    immediate = false
  ) {
    if (!Array.isArray(keyOrKeys)) {
      keyOrKeys = [keyOrKeys];
    }
    for (const key of keyOrKeys) {
      if (!(key in this._keyListeners)) {
        this._keyListeners[key] = [];
      }
      this._keyListeners[key]!.push({
        listener: listener as Listener<T>,
        immediate,
      });
    }
  }

  removeKeyListener<K extends keyof T>(
    keyOrKeys: K | K[],
    listener: (event: Event<T, K>) => void
  ) {
    if (!Array.isArray(keyOrKeys)) {
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

  setItem<K extends keyof T>(key: K, newValue: T[K], senderInfo?: any) {
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

  waitForKeyChange<K extends keyof T>(
    keyOrKeys: K | K[],
    immediate = false
  ): Promise<Event<T, keyof T>> {
    return new Promise((resolve) => {
      const tempListener: Listener<T> = (event) => {
        this.removeKeyListener(keyOrKeys, tempListener);
        resolve(event);
      };

      this.addKeyListener(keyOrKeys, tempListener, immediate);
    });
  }

  synchronizeItemWithLocalStorage<K extends keyof T & string>(
    key: K,
    defaultValue: T[K]
  ) {
    // For an observable that is already synchronized with localStorage, add
    // a key/value pair to the model. This reads the value from localStorage
    // if the `key` is present, else it uses the `defaultValue`.
    if (!this._addSynchronizedItem) {
      throw Error("observable is not synchronized wih localStorage");
    }
    this._addSynchronizedItem(key, defaultValue, true);
  }

  async withSenderInfo(senderInfo: any, func: () => Promise<void>) {
    this._senderInfoStack.push(senderInfo);
    try {
      await func();
    } finally {
      this._senderInfoStack.pop();
    }
  }

  _dispatchChange<K extends keyof T>(
    key: K,
    newValue: T[K],
    oldValue: T[K],
    senderInfo?: any
  ) {
    // Schedule the calls in the event loop rather than call immediately
    if (!senderInfo && this._senderInfoStack.length) {
      senderInfo = this._senderInfoStack.at(-1);
    }
    const event: Event<T, K> = { key, newValue, oldValue, senderInfo };
    for (const item of chain(this._generalListeners, this._keyListeners[key] || [])) {
      if (item.immediate) {
        item.listener(event);
      } else {
        setTimeout(() => item.listener(event), 0);
      }
    }
  }
}

function newModelProxy<T extends {}>(controller: ObservableController<T>, model: T) {
  const handler = {
    set<K extends keyof T>(model: T, key: K, newValue: T[K]) {
      const oldValue = model[key];
      if (newValue !== oldValue) {
        model[key] = newValue;
        controller._dispatchChange(key, newValue, oldValue);
      }
      return true;
    },

    get(model: T, key: keyof T) {
      if (key === controllerKey) {
        return controller;
      }
      return model[key];
    },

    deleteProperty(model: T, key: keyof T) {
      const oldValue = model[key];
      if (oldValue !== undefined) {
        delete model[key];
        // @ts-ignore
        //
        // Typescript doesn't like that the value is being set to undefined,
        // because it's possible that's not an acceptable type for this field;
        // however, because this proxy will be interacted with using the right
        // types that's not an issue- if a property is being deleted then that
        // is properly typechecked against the optional-ness of the field.
        controller._dispatchChange(key, undefined, oldValue);
      }
      return true;
    },
  };

  // Note, we do `handler as ProxyHandler<T>` here because we
  // overspecified the function types with the additional info
  // we have about how we're using this proxy.
  return new Proxy(model, handler as ProxyHandler<T>);
}

function synchronizeWithLocalStorage<T extends {}>(
  controller: ObservableController<T>,
  prefix = "",
  readItemsFromLocalStorage = false
) {
  const mapKeyToObject: Record<string, string> = {};
  const mapKeyToStorage: Record<string, string> = {};
  const stringKeys: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(controller.model)) {
    // @ts-ignore
    //
    // TypeScript isn't confident that the string key exists on the
    // object of type T, since theoretically it could be an empty object.
    //
    // But of course, we know that it's definitely a key since we got
    // it from Object.entries, so we can safely ignore this complaint.
    addItem(key, value, false);
  }

  if (readItemsFromLocalStorage) {
    assert(prefix.length > 0, "expect localstorage prefix not to be empty");
    for (const [prefixedKey, storedValue] of Object.entries(localStorage)) {
      if (!prefixedKey.startsWith(prefix)) {
        continue;
      }
      const key = prefixedKey.slice(prefix.length);
      try {
        JSON.parse(storedValue);
      } catch (e) {
        stringKeys[key] = true;
      }
      // @ts-ignore
      //
      // TypeScript doesn't like that this is an arbitrary string so might
      // not exist on the object, but we don't really care, if it doesn't
      // exist then it will be added and that doesn't hurt us at all, since
      // it's not like we're trying to use the value in any way that's prone
      // to error.
      addItem(key, null, false);
    }
  }

  function addItem<K extends keyof T & string>(
    key: K,
    value: T[K],
    setOnModel: boolean
  ) {
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

  function setItemOnObject<K extends keyof T & string>(key: K, value: string) {
    controller.model[key] = stringKeys[key] ? value : JSON.parse(value);
  }

  function setItemOnStorage<K extends keyof T & string>(key: K, value: T[K]) {
    const valueAsString =
      stringKeys[key] && typeof value === "string" ? value : JSON.stringify(value);
    const storageKey = mapKeyToStorage[key];
    if (localStorage.getItem(storageKey) !== valueAsString) {
      localStorage.setItem(storageKey, valueAsString);
    }
  }

  controller.addListener((event) => {
    if (event.key in mapKeyToStorage) {
      // @ts-ignore
      //
      // TypeScript isn't smart enough to figure out that the above check
      // of presence of the key in `mapKeyToStorage` implies that it is
      // necessarily a string and a keyof T.
      setItemOnStorage(event.key, event.newValue);
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key in mapKeyToObject) {
      // @ts-ignore
      //
      // TypeScript isn't smart enough to figure out that the above check
      // of presence of the key in `mapKeyToStorage` implies that it is
      // necessarily a string and a keyof T.
      setItemOnObject(mapKeyToObject[event.key], event.newValue);
    }
  });

  return addItem;
}
