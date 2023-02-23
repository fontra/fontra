export function objectsEqual(obj1, obj2) {
  // Shallow object compare. Arguments may be null or undefined
  if (!obj1 || !obj2) {
    return obj1 === obj2;
  }
  const keys = Object.keys(obj1);
  if (keys.length !== Object.keys(obj2).length) {
    return false;
  }
  for (const key of keys) {
    if (obj1[key] !== obj2[key]) {
      return false;
    }
  }
  return true;
}

export function withSavedState(context, func) {
  context.save();
  try {
    func();
  } catch (error) {
    context.restore();
    throw error;
  }
  context.restore();
}

export function scheduleCalls(func, timeout = 0) {
  // Schedule calls to func with a timer. If a previously scheduled call
  // has not yet run, cancel it and let the new one override it.
  // Returns a wrapped function that should be called instead of func.
  // This is useful for calls triggered by events that can supersede
  // previous calls; it avoids scheduling many redundant tasks.
  let timeoutID = null;
  return (...args) => {
    if (timeoutID !== null) {
      clearTimeout(timeoutID);
    }
    timeoutID = setTimeout(() => {
      timeoutID = null;
      func(...args);
    }, timeout);
  };
}

export function throttleCalls(func, minTime) {
  // Return a wrapped function. If the function gets called before
  // minTime (in ms) has elapsed since the last call, don't call
  // the function.
  let lastTime = 0;
  let timeoutID = null;
  return (...args) => {
    if (timeoutID !== null) {
      clearTimeout(timeoutID);
      timeoutID = null;
    }
    const now = Date.now();
    if (now - lastTime > minTime) {
      func(...args);
      lastTime = now;
    } else {
      // Ensure that the wrapped function gets called eventually,
      // in the case that no superceding calls come soon enough.
      timeoutID = setTimeout(() => {
        timeoutID = null;
        func(...args);
      }, minTime);
    }
    return timeoutID;
  };
}

export function parseCookies(str) {
  // https://www.geekstrick.com/snippets/how-to-parse-cookies-in-javascript/
  if (!str.trim()) {
    return {};
  }
  return str
    .split(";")
    .map((v) => v.split("="))
    .reduce((acc, v) => {
      acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
      return acc;
    }, {});
}

export function capitalizeFirstLetter(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function hyphenatedToCamelCase(s) {
  return s.replace(/-([a-z])/g, (m) => m[1].toUpperCase());
}

export const THEME_KEY = "fontra-theme";

export function themeSwitch(value) {
  const rootElement = document.querySelector("html");
  rootElement.classList.remove("light-theme");
  rootElement.classList.remove("dark-theme");
  if (value !== "automatic") {
    rootElement.classList.add(value + "-theme");
  }
}

export function themeSwitchFromLocalStorage() {
  _themeSwitchFromLocalStorage();

  addEventListener("storage", (event) => {
    if (event.key === THEME_KEY) {
      _themeSwitchFromLocalStorage();
    }
  });
}

function _themeSwitchFromLocalStorage() {
  const themeValue = localStorage.getItem(THEME_KEY);
  if (themeValue) {
    themeSwitch(themeValue);
  }
}

export function hasShortcutModifierKey(event) {
  if (navigator.platform.toLowerCase().indexOf("mac") >= 0) {
    return event.metaKey;
  } else {
    return event.ctrlKey;
  }
}

export const arrowKeyDeltas = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

export function modulo(v, n) {
  // Modulo with Python behavior for negative values of `v`
  // Assumes `n` to be positive
  return v >= 0 ? v % n : ((v % n) + n) % n;
}

export function sign(v) {
  if (v > 0) {
    return 1;
  } else if (v < 0) {
    return -1;
  } else {
    return 0;
  }
}

export function boolInt(v) {
  // Return 1 if `v` is true-y, 0 if `v` is false-y
  return v ? 1 : 0;
}

export function* reversed(seq) {
  // Like Python's reversed(seq) builtin
  for (let i = seq.length - 1; i >= 0; i--) {
    yield seq[i];
  }
}

export function* enumerate(iterable, start = 0) {
  let i = start;
  for (const item of iterable) {
    yield [i, item];
    i++;
  }
}

export function* range(start, stop, step = 1) {
  if (stop === undefined) {
    stop = start;
    start = 0;
  }
  for (let i = start; i < stop; i += step) {
    yield i;
  }
}

export async function tryFinally(func, finallyFunc) {
  let error;
  try {
    await func();
  } catch (e) {
    error = e;
  }
  await finallyFunc();
  if (error) {
    throw error;
  }
}

export function parseSelection(selection) {
  const result = {};
  for (const item of selection) {
    const [tp, index] = item.split("/");
    if (result[tp] === undefined) {
      result[tp] = [];
    }
    result[tp].push(parseInt(index));
  }
  for (const indices of Object.values(result)) {
    // Ensure indices are sorted
    indices.sort((a, b) => a - b);
  }
  return result;
}

export function makeUPlusStringFromCodePoint(codePoint) {
  if (codePoint && typeof codePoint != "number") {
    throw new Error(
      `codePoint argument must be a number or falsey; ${typeof codePoint} found`
    );
  }
  return typeof codePoint == "number"
    ? "U+" + codePoint.toString(16).toUpperCase().padStart(4, "0")
    : "";
}

export async function writeToClipboard(clipboardObject) {
  if (!clipboardObject) return;

  const clipboardItemObject = {};
  for (const [key, value] of Object.entries(clipboardObject)) {
    clipboardItemObject[key] = new Blob([`${value}`], {
      type: key,
    });
  }

  navigator.clipboard.write([new ClipboardItem(clipboardItemObject)]);
}
