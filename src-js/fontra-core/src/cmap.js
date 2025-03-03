import { makeUPlusStringFromCodePoint } from "./utils.js";

//
// A `characterMap` is an object with integer numbers representing unicode code
// points as keys, and glyph names as values. Note: we're using a JS Object, not
// Map, so the code point keys are stored as (decimal) string representations of
// the integers. Multiple code points may map to the same glyph name. Each code
// point maps to exactly one glyph name.
//
// A `glyphMap` is the opposite of a `characterMap`: it maps glyph names to
// arrays of (integer) code points. A code point may only occur one time in the
// entire mapping. Code point arrays may contain any number of code points:
// any glyph can be mapped to zero or more code points.
//
// For the sake of determinism, this module tries to keep the code point arrays
// in sorted order, even though the order has no intrinsic meaning.
//
// This module provides functions to convert `characterMap` to `glyphMap` and vice
// versa, as well as `characterMap` and `glyphMap` proxy objects that keep their
// matching counterpart (`glyphMap` and `characterMap` respectively) up-to-date.
//

export function makeGlyphMapFromCharacterMap(characterMap) {
  // Return a `glyphMap` constructed from `characterMap`
  const glyphMap = {};
  for (const [codeStr, glyphName] of Object.entries(characterMap)) {
    const codePoint = parseInt(codeStr);
    if (glyphMap[glyphName]) {
      arrayInsertSortedItem(glyphMap[glyphName], codePoint);
    } else {
      glyphMap[glyphName] = [codePoint];
    }
  }
  return glyphMap;
}

export function makeCharacterMapFromGlyphMap(glyphMap, strict = true) {
  // Return a `characterMap` constructed from `glyphMap`
  // If the `strict` flag is `true` (default), an Error is thrown when a code
  // point is defined multiple times.
  const characterMap = {};
  const ambiguousCodePoints = [];
  for (const [glyphName, codePoints] of Object.entries(glyphMap)) {
    for (const codePoint of codePoints) {
      if (codePoint in characterMap) {
        if (strict) {
          throw new Error(
            "invalid glyph map: duplicate code point " +
              `("${glyphName}", "${
                characterMap[codePoint]
              }", ${makeUPlusStringFromCodePoint(codePoint)})`
          );
        }
        ambiguousCodePoints.push(codePoint);
        if (characterMap[codePoint] < glyphName) {
          // Keep the glyph name that would be sorted lowest.
          // This is completely arbitrary, but ensures determinism.
          continue;
        }
      }
      characterMap[codePoint] = glyphName;
    }
  }
  if (ambiguousCodePoints.length) {
    console.log(
      `cmap: ${ambiguousCodePoints.length} code points were referenced ` +
        `by multiple glyphs`
    );
  }
  return characterMap;
}

export function getGlyphMapProxy(glyphMap, characterMap) {
  //
  // Return a wrapper (Proxy) for `glyphMap`, that behaves exactly like `glyphMap`,
  // while keeping the matching `characterMap` synchronized.
  //
  // `glyphMap` and `characterMap` are expected to be synchronized on input.
  //
  // Any changes made to `glyphMap` via the `glyphMap` proxy will be reflected in
  // the `characterMap` object. This does *not* catch mutations in the code point
  // arrays themselves, but only wholesale *replacement* the code point arrays.
  // In other words: you must treat the code point arrays as immutable.
  //

  const handler = {
    set(glyphMap, prop, value) {
      if (!Array.isArray(value)) {
        throw new Error("value expected to be an array of code points");
      }
      const existingCodePoints = glyphMap[prop] || [];
      glyphMap[prop] = value;
      existingCodePoints.forEach((codePoint) => delete characterMap[codePoint]);
      value.forEach((codePoint) => (characterMap[codePoint] = prop));
      return true;
    },

    get(glyphMap, prop) {
      return glyphMap[prop];
    },

    deleteProperty(glyphMap, prop) {
      const existingCodePoints = glyphMap[prop] || [];
      delete glyphMap[prop];
      existingCodePoints.forEach((codePoint) => delete characterMap[codePoint]);
      return true;
    },
  };

  return new Proxy(glyphMap, handler);
}

export function getCharacterMapProxy(characterMap, glyphMap) {
  //
  // Return a wrapper (Proxy) for `characterMap`, that behaves exactly like
  // `characterMap`, while keeping the matching `glyphMap` synchronized.
  //
  // `characterMap` and `glyphMap` are expected to be synchronized on input.
  //
  // Any changes made to `characterMap` via the `characterMap` proxy will be
  // reflected in the `glyphMap` object.
  //

  const handler = {
    set(characterMap, prop, value) {
      const existingValue = characterMap[prop];
      characterMap[prop] = value;
      if (!isNaN(prop)) {
        const codePoint = parseInt(prop);
        if (existingValue) {
          removeReverseMapping(glyphMap, existingValue, codePoint);
        }
        if (glyphMap[value]) {
          arrayInsertSortedItem(glyphMap[value], codePoint);
        } else {
          glyphMap[value] = [codePoint];
        }
      }
      return true;
    },

    get(characterMap, prop) {
      return characterMap[prop];
    },

    deleteProperty(characterMap, prop) {
      const existingValue = characterMap[prop];
      delete characterMap[prop];
      if (!isNaN(prop)) {
        const codePoint = parseInt(prop);
        if (existingValue) {
          removeReverseMapping(glyphMap, existingValue, codePoint);
        }
      }
      return true;
    },
  };

  return new Proxy(characterMap, handler);
}

function removeReverseMapping(glyphMap, glyphName, codePoint) {
  //
  // Given a `glyphMap`, remove the `codePoint` from the `glyphName` mapping,
  // if it exists. If no mapping is left for `glyphName`, remove the mapping
  // entirely.
  //
  const codePoints = glyphMap[glyphName];
  if (!codePoints) {
    return;
  }
  arrayDiscardItem(codePoints, codePoint);
  if (!codePoints.length) {
    delete glyphMap[glyphName];
  }
}

function arrayDiscardItem(array, item) {
  // Remove `item` from `array` if present
  const index = array.indexOf(item);
  if (index >= 0) {
    array.splice(index, 1);
  }
}

function arrayInsertSortedItem(array, item) {
  // Insert integer `item` into the sorted `array`, maintaining the sorted order
  // These arrays are generally very short, no need to bisect
  for (let index = 0; index < array.length; index++) {
    if (item < array[index]) {
      array.splice(index, 0, item);
      return;
    }
  }
  array.push(item);
}
