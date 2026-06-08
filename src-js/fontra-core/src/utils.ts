import { strFromU8, strToU8, unzlibSync, zlibSync } from "fflate";
import type { Point } from "./rectangle.ts";
import { Transform } from "./transform.js";
import { addItemwise } from "./var-funcs.js";

/**
 * Shallow object compare. Arguments may be null or undefined
 */
export function objectsEqual(obj1: any, obj2: any) {
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

export function withSavedState(context: CanvasRenderingContext2D, func: () => void) {
  context.save();
  try {
    func();
  } finally {
    context.restore();
  }
}

/**
 * Return a function that will request `func` to be called in the next
 * iteration of the event loop. If it gets called again before `func` was
 * actually called, ignore the call.
 *
 * This ensures that multiple calls within the same event loop cycle get
 * consolidated into a single call.
 *
 * Useful for things like "request update".
 */
export function consolidateCalls<Fn extends (...args: any[]) => void>(
  func: Fn
): (...args: Parameters<Fn>) => void {
  let didSchedule = false;

  return (...args) => {
    if (!didSchedule) {
      didSchedule = true;
      setTimeout(() => {
        didSchedule = false;
        func(...args);
      }, 0);
    } else {
    }
  };
}

export type TimeoutID = ReturnType<typeof setTimeout>;

/**
 * Schedule calls to func with a timer. If a previously scheduled call
 * has not yet run, cancel it and let the new one override it.
 *
 * Returns a wrapped function that should be called instead of func.
 *
 * This is useful for calls triggered by events that can supersede
 * previous calls; it avoids scheduling many redundant tasks.
 */
export function scheduleCalls<Fn extends (...args: any[]) => void>(
  func: Fn,
  timeout = 0
): (...args: Parameters<Fn>) => TimeoutID {
  let timeoutID: TimeoutID | null = null;
  return (...args) => {
    if (timeoutID !== null) {
      clearTimeout(timeoutID);
    }
    timeoutID = setTimeout(() => {
      timeoutID = null;
      func(...args);
    }, timeout);
    return timeoutID;
  };
}

/**
 * Return a wrapped function. If the function gets called before
 * minTime (in ms) has elapsed since the last call, don't call
 * the function.
 */
export function throttleCalls<Fn extends (...args: any[]) => void>(
  func: Fn,
  minTime = 0
): (...args: Parameters<Fn>) => TimeoutID | null {
  let lastTime = 0;
  let timeoutID: TimeoutID | null = null;
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
      // in the case that no superseding calls come soon enough.
      timeoutID = setTimeout(() => {
        timeoutID = null;
        func(...args);
      }, minTime);
    }
    return timeoutID;
  };
}

export function parseCookies(str: string) {
  // https://www.geekstrick.com/snippets/how-to-parse-cookies-in-javascript/
  if (!str.trim()) {
    return {};
  }
  return str
    .split(";")
    .filter((s) => s)
    .map((v) => v.split("="))
    .reduce(
      (acc, v) => {
        acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
        return acc;
      },
      {} as Record<string, string>
    );
}

export function capitalizeFirstLetter(s: String) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function hyphenatedToCamelCase(s: string) {
  return s.replace(/-([a-z])/g, (m) => m[1].toUpperCase());
}

export function hyphenatedToLabel(s: string) {
  return capitalizeFirstLetter(s).replaceAll("-", " ");
}

// platform is deprecated, please see:
// https://developer.mozilla.org/en-US/docs/Web/API/Navigator/platform
// export const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().indexOf("mac") >= 0

// Therefore use window.navigator https://developer.mozilla.org/en-US/docs/Web/API/Window/navigator
export const isMac =
  typeof navigator !== "undefined" && navigator.userAgent.indexOf("Mac") != -1;

// For several functions, we use the command key ("metaKey") on macOS,
// and the control key ("ctrlKey") on non-macOS. For example short cuts
// and selection behavior.
export const commandKeyProperty = isMac ? "metaKey" : "ctrlKey";

export const arrowKeyDeltas = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/**
 * Modulo with Python behavior for negative values of `v`
 *
 * Assumes `n` to be positive
 */
export function modulo(v: number, n: number) {
  return v >= 0 ? v % n : ((v % n) + n) % n;
}

/**
 * Return 1 if `v` is true-y, 0 if `v` is false-y
 */
export function boolInt(v: boolean) {
  return v ? 1 : 0;
}

/**
 * Like Python's reversed(seq) builtin
 */
export function* reversed<T>(seq: T[]) {
  for (let i = seq.length - 1; i >= 0; i--) {
    yield seq[i];
  }
}

export function* enumerate<T>(iterable: Iterable<T>, start = 0) {
  let i = start;
  for (const item of iterable) {
    yield [i, item];
    i++;
  }
}

export function* reversedEnumerate<T>(seq: T[]) {
  for (let i = seq.length - 1; i >= 0; i--) {
    yield [i, seq[i]];
  }
}

export function* range(start: number, stop?: number, step = 1) {
  if (stop === undefined) {
    stop = start;
    start = 0;
  }
  if (step > 0) {
    for (let i = start; i < stop; i += step) {
      yield i;
    }
  } else if (step < 0) {
    for (let i = start; i > stop; i += step) {
      yield i;
    }
  }
}

/**
 * After Python's itertools.chain()
 */
export function* chain<T>(...iterables: Iterable<T>[]) {
  for (const iterable of iterables) {
    for (const item of iterable) {
      yield item;
    }
  }
}

/**
 * Cartesian product of input iterables. Equivalent to nested for-loops.
 *
 * After Python's itertools.product()
 */
export function* product<T>(...args: Iterable<T>[]): Generator<T[], void, unknown> {
  if (!args.length) {
    yield [];
    return;
  }
  const first = args[0];
  args = args.slice(1);
  if (args.length) {
    for (const v of first) {
      const prod = [...product(...args)];
      for (const w of prod) {
        yield [v, ...w];
      }
    }
  } else {
    for (const v of first) {
      yield [v];
    }
  }
}

/**
 * Compares two values which can either be numbers or strings.
 *
 * This uses the JavaScript `<` and `>` operators, which means that strings
 * are compared by the values of their UTF-16 code units, starting at index
 * zero, until a difference is found or one string runs out of code units
 * (in which case the longer string is considered greater).
 *
 * Generally speaking, if strings are being sorted in order to be shown to
 * the user then this function should not be used. Instead, use the function
 * `String.localeCompare` or `Intl.Collator`, since they provide locale-aware
 * collation and ordering, which the `<` and `>` operators do not.
 *
 * Return -1 when a < b, 1 when a > b, and 0 when a == b
 */
export function compare<T extends number | string>(a: T, b: T): -1 | 0 | 1 {
  return (+(a > b) - +(a < b)) as -1 | 0 | 1;
}

export function valueInRange(min: number, v: number, max: number) {
  return min <= v && v <= max;
}

export function parseSelection(selection: string[]) {
  const result: Record<string, number[]> = {};
  for (const item of selection) {
    const [tp, index] = item.split("/");
    if (result[tp] === undefined) {
      result[tp] = [];
    }
    result[tp].push(parseInt(index, 10));
  }
  for (const indices of Object.values(result)) {
    // Ensure indices are sorted
    indices.sort((a, b) => a - b);
  }
  return result;
}

export function makeUPlusStringFromCodePoint(codePoint: number | undefined) {
  if (codePoint !== undefined && typeof codePoint !== "number") {
    throw new Error(
      `codePoint argument must be a number or undefined; ${typeof codePoint} found`
    );
  }
  return typeof codePoint === "number"
    ? "U+" + codePoint.toString(16).toUpperCase().padStart(4, "0")
    : "";
}

export async function writeToClipboard(
  clipboardObject: ConstructorParameters<typeof ClipboardItem>[0]
) {
  if (!clipboardObject) return;

  try {
    await navigator.clipboard.write([new ClipboardItem(clipboardObject)]);
  } catch (error) {
    console.log("Error while writing to clipboard, falling back to text/plain", error);
    // Write at least the plain/text MIME type to the clipboard
    if (typeof clipboardObject["text/plain"] === "string") {
      await navigator.clipboard.writeText(await clipboardObject["text/plain"]);
    }
  }
}

export async function readFromClipboard(types: string[], plainText = true) {
  const clipboardContents = await navigator.clipboard.read();
  for (const item of clipboardContents) {
    for (const type of types) {
      if (item.types.includes(type)) {
        const blob = await item.getType(type);
        return plainText ? await blob.text() : blob;
      }
    }
  }
  return undefined;
}

export function getCharFromCodePoint(codePoint: number | undefined) {
  return codePoint !== undefined ? String.fromCodePoint(codePoint) : "";
}

/**
 * Search for a 4-5 char hex string in the glyph name.
 *
 * Interpret the hex string as a unicode code point and convert to a
 * character. Else, return an empty string.
 */
export function guessCharFromGlyphName(glyphName: string) {
  const match = glyphName.match(/(^|[^0-9A-F])([0-9A-F]{4,5})($|[^0-9A-F])/);
  return match ? String.fromCodePoint(parseInt(match[2], 16)) : "";
}

export async function fetchJSON(url: string, options: Parameters<typeof fetch>[1]) {
  const response = await fetch(url, options);
  return await response.json();
}

const nonTypeableInputTypes = new Set(["range", "checkbox", "radio", "button"]);

export function isActiveElementTypeable() {
  const element = findNestedActiveElement(document.activeElement);

  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }
  if (element instanceof HTMLInputElement && !nonTypeableInputTypes.has(element.type)) {
    return true;
  }
  return false;
}

/**
 * If the element element is part of a Web Component's Shadow DOM, take
 * *its* active element, recursively.
 */
export function findNestedActiveElement(element?: Element | null): Element | null {
  if (!element) {
    element = document.activeElement;
  }
  return element?.shadowRoot?.activeElement
    ? findNestedActiveElement(element.shadowRoot.activeElement)
    : element;
}

export function fileNameExtension(name: string) {
  return name.split(".").pop();
}

const ARRAY_EXTEND_CHUNK_SIZE = 1024;

export function arrayExtend<T>(thisArray: T[], itemsArray: T[]) {
  // arrayExtend() is meant as a JS version of Python's list.extend().
  // array.push(...items) has an implementation-defined upper limit
  // in terms of numbers of items (the call stack will overflow).
  // Yet, array.push(...items) is presumably more efficient than pushing
  // items one by one, therefore we try to compromise: push the items in
  // chunks of a safe size.
  for (const i of range(0, itemsArray.length, ARRAY_EXTEND_CHUNK_SIZE)) {
    thisArray.push(...itemsArray.slice(i, i + ARRAY_EXTEND_CHUNK_SIZE));
  }
}

export function rgbaToCSS(rgba: [number, number, number, number]) {
  const channels = rgba.slice(0, 3).map((channel) => Math.round(channel * 255));
  const alpha = rgba[3];
  if (alpha !== undefined && 0 <= alpha && alpha < 1) {
    channels.push(alpha);
  }
  return `rgb(${channels.join(",")})`;
}

export type HexColor = `#${string}`;

export function hexToRgba(hexColor: HexColor): [number, number, number, number] {
  let c = hexColor.substring(1).split("");
  let r = [];
  if (/^#[A-Fa-f0-9]{8}$/.test(hexColor) || /^#[A-Fa-f0-9]{6}$/.test(hexColor)) {
    for (const i of range(0, c.length, 2)) {
      r.push(round(parseInt(c[i] + c[i + 1], 16) / 255, 4));
    }
  } else if (/^#[A-Fa-f0-9]{4}$/.test(hexColor) || /^#[A-Fa-f0-9]{3}$/.test(hexColor)) {
    for (const i of range(c.length)) {
      r.push(round(parseInt(c[i] + c[i], 16) / 255, 4));
    }
  } else {
    throw new Error(
      "Bad hex color format. Should be #RRGGBB or #RRGGBBAA or #RGB or #RGBA"
    );
  }
  if (r.length === 3) {
    r.push(1);
  }
  return r as [number, number, number, number];
}

export function rgbaToHex(
  rgba: [number, number, number] | [number, number, number, number]
) {
  if (rgba.length != 3 && rgba.length != 4) {
    throw new Error("rgba argument has to have 3 or 4 items in array");
  }
  const channels = rgba.map((channel) =>
    Math.round(channel * 255)
      .toString(16)
      .padStart(2, "0")
  );
  if (channels[3] === "ff") {
    channels.pop();
  }
  return `#${channels.join("")}`;
}

export function clamp(number: number, min: number, max: number) {
  return Math.max(Math.min(number, max), min);
}

const _digitFactors = [1, 10, 100, 1000, 10000];

export function round(number: number, nDigits = 0) {
  if (nDigits === 0) {
    return Math.round(number);
  }
  const factor = _digitFactors[nDigits];
  if (!factor) {
    throw new RangeError("nDigits out of range");
  }
  return Math.round(number * factor) / factor;
}

export function unionIndexSets(...indexSets: number[][]) {
  indexSets = indexSets.filter((item) => !!item);
  return [...new Set(indexSets.flat())].sort((a, b) => a - b);
}

/**
 * Return a promise that resolves when `thenable` resolves before
 * `timeout` ms have passed, or else gets rejected with an error.
 * Example:
 * ```ts
 * try {
 *   await withTimeout(somePromise, 1000);
 * catch (error) {
 *   // the promise timed out
 * }
 * ```
 */
export function withTimeout(thenable: Promise<any>, timeout: number) {
  return new Promise<void>((resolve, reject) => {
    const timerID = setTimeout(() => reject(new Error("timeout")), timeout);
    thenable.then(() => {
      clearTimeout(timerID);
      resolve();
    });
  });
}

export function memoize<Fn extends (...args: any[]) => any>(func: Fn): Fn {
  const cache = new Map();
  return ((...args) => {
    const cacheKey = JSON.stringify(args);
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    const result = func(...args);
    cache.set(cacheKey, result);
    return result;
  }) as Fn;
}

export function escapeHTMLCharacters(dangerousString: string) {
  const encodedSymbolMap: Record<string, string> = {
    // '"': '&quot;',
    // '\'': '&#39;',
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
  };
  const dangerousCharacters = dangerousString.split("");
  const safeCharacters = dangerousCharacters.map(
    (character) => encodedSymbolMap[character] || character
  );
  return safeCharacters.join("");
}

export function* zip(...args: Iterable<any>[]) {
  const iterators = args.map((arg) => iter(arg));
  while (true) {
    const results = iterators.map((it) => it.next());
    if (results.some((r) => r.done)) {
      if (!results.every((r) => r.done)) {
        throw new Error("zip: input arguments have different lengths");
      }
      break;
    }
    yield results.map((r) => r.value);
  }
}

export function* iter<T>(iterable: Iterable<T>) {
  for (const item of iterable) {
    yield item;
  }
}

export function splitGlyphNameExtension(glyphName: string, separator = ".") {
  const separatorIndex = glyphName.indexOf(separator);
  const baseGlyphName =
    separatorIndex >= 1 ? glyphName.slice(0, separatorIndex) : glyphName;
  const extension = separatorIndex >= 1 ? glyphName.slice(separatorIndex) : "";
  return [baseGlyphName, extension];
}

export function getBaseGlyphName(glyphName: string) {
  const i = glyphName.indexOf(".");
  return i >= 1 ? glyphName.slice(0, i) : glyphName;
}

export function getGlyphNameExtension(glyphName: string) {
  const i = glyphName.lastIndexOf(".");
  return i >= 1 ? glyphName.slice(i) : "";
}

/**
 * Return true if `obj` has no properties
 */
export function isObjectEmpty(obj: any) {
  for (const _ in obj) {
    return false;
  }
  return true;
}

export async function timeIt<Fn extends () => any>(
  func: Fn,
  label: string
): Promise<ReturnType<Fn>> {
  const t = performance.now();
  const returnValue = await func();
  const elapsed = round(performance.now() - t, 1);
  console.log(`time elapsed for ${label}: ${elapsed} ms`);
  return returnValue;
}

export function base64ToBytes(base64: string) {
  const binString = atob(base64);
  return Uint8Array.from(binString, (m) => m.codePointAt(0) as number);
}

export function bytesToBase64(bytes: Iterable<number>) {
  const binString = String.fromCodePoint(...bytes);
  return btoa(binString);
}

export function loadURLFragment(fragment: string) {
  if (fragment[0] != "#") {
    throw new Error("assert -- invalid fragment");
  }
  try {
    return JSON.parse(strFromU8(unzlibSync(base64ToBytes(fragment.slice(1)))));
  } catch {
    return null;
  }
}

export function dumpURLFragment(obj: any) {
  return "#" + bytesToBase64(zlibSync(strToU8(JSON.stringify(obj))));
}

export function readObjectFromURLFragment() {
  // @ts-ignore Typescript complains that window.location is missing some
  // URL properties, but none of those matter for turning it in to one.
  const url = new URL(window.location);
  return url.hash ? loadURLFragment(url.hash) : {};
}

export function writeObjectToURLFragment(obj: any, replace = false) {
  const newFragment = dumpURLFragment(obj);
  // @ts-ignore Typescript complains that window.location is missing some
  // URL properties, but none of those matter for turning it in to one.
  const url = new URL(window.location);
  if (url.hash === newFragment) {
    return;
  }
  url.hash = newFragment;
  if (replace) {
    window.history.replaceState({}, "", url);
  } else {
    window.history.pushState({}, "", url);
  }
}

/**
 * Checks whether the `guidelines` arrays of all `parents`
 * are matching by comparing the `name` field of each item.
 */
export function areGuidelinesCompatible<
  T extends {
    guidelines: { name: string }[];
  },
>(parents: T[]) {
  const referenceGuidelines = parents[0].guidelines;
  if (!referenceGuidelines) {
    return false;
  }

  for (const parent of parents.slice(1)) {
    if (parent.guidelines?.length !== referenceGuidelines.length) {
      return false;
    }
    for (const guidelineIndex in referenceGuidelines) {
      if (
        parent.guidelines[guidelineIndex].name !==
        referenceGuidelines[guidelineIndex].name
      ) {
        return false;
      }
    }
  }
  return true;
}

export function areCustomDatasCompatible<
  T extends {
    customData: any;
  },
>(parents: T[]) {
  const referenceCustomData = parents[0].customData;
  if (!referenceCustomData) {
    return false;
  }
  const referenceKeys = Object.keys(referenceCustomData).sort();

  for (const parent of parents.slice(1)) {
    const keys = Object.keys(parent.customData).sort();
    if (keys.length !== referenceKeys.length) {
      return false;
    }
    for (const [kA, kB] of zip(keys, referenceKeys)) {
      if (kA != kB) {
        return false;
      }

      const vA = parent.customData[kA];
      if (typeof vA === "object") {
        const vB = referenceCustomData[kB];
        try {
          const _ = addItemwise(vA, vB);
        } catch (error) {
          return false;
        }
      }
    }
  }
  return true;
}

// TODO: This should be temporary, in the future we should generate types
//       for Guideline and others based on the python class definitions.
export type Guideline = {
  x: number;
  y: number;
  angle: number;
  locked?: boolean;
  name?: string;
};

const identityGuideline = { x: 0, y: 0, angle: 0 };

export function normalizeGuidelines(guidelines: Guideline[], resetLocked = false) {
  return guidelines.map((guideline) => {
    return {
      ...identityGuideline,
      ...guideline,
      locked: resetLocked ? false : !!guideline.locked,
    };
  });
}

type ObjectKey = string | number | symbol;

export function mapObject<O extends {}>(
  obj: O,
  func: (entry: [keyof O, any]) => [ObjectKey, any]
): any {
  // Return a copy of the object, with each [key, value] passed through `func`
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => func([k as keyof O, v]))
  );
}

export function mapObjectKeys<O extends {}>(
  obj: O,
  func: (key: keyof O) => ObjectKey
): any {
  // Return a copy of the object, with each key passed through `func`
  return mapObject(obj, ([key, value]) => [func(key), value]);
}

export function mapObjectValues<O extends {}>(
  obj: O,
  func: (value: O[keyof O]) => any
): any {
  // Return a copy of the object, with each value passed through `func`
  return mapObject(obj, ([key, value]) => [key, func(value)]);
}

export async function mapObjectValuesAsync<O extends {}>(
  obj: O,
  func: (value: O[keyof O]) => any
): Promise<any> {
  // Return a copy of the object, with each value passed through `func`
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = await func(value as O[keyof O]);
  }
  return result;
}

export function filterObject<O extends {}>(
  obj: O,
  func: (key: keyof O, value: O[keyof O]) => boolean
): Partial<O> {
  // Return a copy of the object containing the items for which `func(key, value)`
  // returns `true`.
  return Object.fromEntries(
    Object.entries(obj).filter(([key, value]) =>
      func(key as keyof O, value as O[keyof O])
    )
  ) as Partial<O>;
}

let _uniqueID = 1;
export function uniqueID() {
  return _uniqueID++;
}

export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`assert failed${message ? ` -- ${message}` : ""}`);
  }
}

export function pointCompareFunc(pointA: Point, pointB: Point) {
  let d = pointA.x - pointB.x;
  if (Math.abs(d) < 0.00000001) {
    d = pointA.y - pointB.y;
  }
  return d;
}

export function sleepAsync(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function readFileOrBlobAsDataURL(fileOrBlob: File | Blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(fileOrBlob);
  });
}

export function colorizeImage(
  inputImage: HTMLImageElement,
  color: CanvasRenderingContext2D["fillStyle"]
) {
  const w = inputImage.naturalWidth;
  const h = inputImage.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d");

  assert(context !== null, "successfully acquired canvas rendering context");

  // First step, draw the image
  context.drawImage(inputImage, 0, 0, w, h);
  // Second step, reduce saturation to zero (making the image grayscale)
  context.fillStyle = "black";
  context.globalCompositeOperation = "saturation";
  context.fillRect(0, 0, w, h);
  // Last step, colorize the image, using screen (inverse multiply)
  context.fillStyle = color;
  context.globalCompositeOperation = "screen";
  context.fillRect(0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      assert(blob !== null, "successfully converted canvas to blob");

      const outputImage = new Image();
      outputImage.width = inputImage.width;
      outputImage.height = inputImage.height;
      const url = URL.createObjectURL(blob);
      outputImage.onload = () => {
        URL.revokeObjectURL(url);
        resolve(outputImage);
      };
      outputImage.src = url;
    });
  });
}

export class FocusKeeper {
  _focusedElement: Element | null = null;

  get save(): (event: any) => void {
    // Return a bound method that can be used as an event handler
    return (event) => {
      this._focusedElement = findNestedActiveElement();
    };
  }

  restore() {
    // @ts-ignore typescript doesn't like that some Elements don't have `focus`
    // but it doesn't matter since we do an optional invocation anyway so if it
    // doesn't exist it won't cause any problems.
    this._focusedElement?.focus?.();
  }
}

export function glyphMapToItemList(glyphMap: Record<string, number[]>) {
  return Object.entries(glyphMap).map(([glyphName, codePoints]) => ({
    glyphName,
    codePoints,
    associatedCodePoints: getAssociatedCodePoints(glyphName, glyphMap),
  }));
}

export function getAssociatedCodePoints(
  glyphName: string,
  glyphMap: Record<string, number[]>
) {
  return getBaseGlyphName(glyphName)
    .split("_")
    .filter((baseGlyphName) => baseGlyphName !== glyphName)
    .map((baseGlyphName) => glyphMap[baseGlyphName]?.[0])
    .filter((codePoint) => codePoint);
}

// TODO: proper typing for glyphs
export function getCodePointFromGlyphItem(glyphItem: any) {
  return glyphItem.codePoints[0] || glyphItem.associatedCodePoints[0];
}

/**
 * Return the index where to insert item x in list a, assuming a is sorted.
 *
 * The return value i is such that all e in a[:i] have e <= x, and all e in
 * a[i:] have e > x.  So if x already appears in the list, a.insert(i, x) will
 * insert just after the rightmost x already there.
 *
 * Optional args lo (default 0) and hi (default len(a)) bound the
 * slice of a to be searched.
 */
export function bisect_right<T>(a: T[], x: T, lo = 0, hi = a.length) {
  // This is adapted from the Python implementation

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (x < a[mid]) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  return lo;
}

export function isNumber(n: any) {
  return !isNaN(n) && typeof n === "number" && n !== Infinity && n !== -Infinity;
}

export function updateObject<O extends {}>(
  obj: O,
  prop: keyof O,
  value: O[typeof prop]
): O {
  obj = { ...obj };
  if (value === undefined) {
    delete obj[prop];
  } else {
    obj[prop] = value;
  }
  return obj;
}

export function longestCommonPrefix(strings: string[]) {
  if (!strings.length) {
    return "";
  }

  const firstString = strings[0];
  let i = 0;

  for (; ; i++) {
    const c = firstString[i];
    if (c === undefined) {
      break;
    }
    if (strings.some((s) => s[i] !== c)) {
      break;
    }
  }

  return firstString.slice(0, i);
}

export const friendlyHttpStatus = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  203: "Non-Authoritative Information",
  204: "No Content",
  205: "Reset Content",
  206: "Partial Content",
  300: "Multiple Choices",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  305: "Use Proxy",
  306: "Unused",
  307: "Temporary Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Required",
  413: "Request Entry Too Large",
  414: "Request-URI Too Long",
  415: "Unsupported Media Type",
  416: "Requested Range Not Satisfiable",
  417: "Expectation Failed",
  418: "I'm a teapot",
  429: "Too Many Requests",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
};

export function deepCopyObject<O extends {}>(obj: O): O {
  return JSON.parse(JSON.stringify(obj));
}

export async function asyncMap<T>(
  iterable: Iterable<T>,
  func: (value: T) => T
): Promise<T[]> {
  const result = [];
  for (const item of iterable) {
    result.push(await func(item));
  }
  return result;
}

export function parseDataURL(dataURL: string) {
  const [header, data] = dataURL.split(",");
  const typeRegex = /data:(.+?\/.+?);/g;
  const match = typeRegex.exec(header);
  if (match === null || match.length < 1) {
    throw Error("invalid data URL");
  }
  const type = match[1];
  return { type, data };
}

export function objectsEqualSerialized(a: any, b: any) {
  return JSON.stringify(a) === JSON.stringify(b);
}
