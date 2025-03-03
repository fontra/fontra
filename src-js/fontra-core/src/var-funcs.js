import { VariationError } from "./errors.js";

export function addItemwise(a, b) {
  if (typeof a !== typeof b) {
    throw new VariationError(`incompatible object types: typeof ${a} != typeof ${b}`);
  } else if (typeof a === "string") {
    if (a !== b) {
      throw new VariationError(`unexpected different strings: ${a} != ${b}`);
    }
    return a;
  } else if (typeof a === "number") {
    return a + b;
  } else if (typeof a === "boolean") {
    if (a !== b) {
      throw new VariationError(`unexpected different booleans: ${a} != ${b}`);
    }
    return a;
  } else if (a === undefined && b === undefined) {
    return undefined;
  } else if (a === null && b === null) {
    return null;
  } else if (a.addItemwise !== undefined) {
    return a.addItemwise(b);
  }
  return itemwiseFunc(a, b, addItemwise);
}

export function subItemwise(a, b) {
  if (typeof a !== typeof b) {
    throw new VariationError(`incompatible object types: typeof ${a} != typeof ${b}`);
  } else if (typeof a === "string") {
    if (a !== b) {
      throw new VariationError(`unexpected different strings: ${a} != ${b}`);
    }
    return a;
  } else if (typeof a === "number") {
    return a - b;
  } else if (typeof a === "boolean") {
    if (a !== b) {
      throw new VariationError(`unexpected different booleans: ${a} != ${b}`);
    }
    return a;
  } else if (a === undefined && b === undefined) {
    return undefined;
  } else if (a === null && b === null) {
    return null;
  } else if (a.subItemwise !== undefined) {
    return a.subItemwise(b);
  }
  return itemwiseFunc(a, b, subItemwise);
}

export function mulScalar(o, scalar) {
  if (scalar === 1 || typeof o === "string" || typeof o === "boolean") {
    return o;
  } else if (typeof o === "number") {
    return o * scalar;
  } else if (o === undefined) {
    return undefined;
  } else if (o === null) {
    return null;
  } else if (o.mulScalar !== undefined) {
    return o.mulScalar(scalar);
  }
  return objectMap(o, scalar, mulScalar);
}

function itemwiseFunc(a, b, func) {
  var result;
  if (Array.isArray(a)) {
    result = new a.constructor(a.length);
    if (a.length != b.length) {
      throw new VariationError(
        `arrays have incompatible lengths: ${a.length} != ${b.length}`
      );
    }
    for (let i = 0; i < a.length; i++) {
      result[i] = func(a[i], b[i]);
    }
  } else {
    result = new a.constructor();
    const keys = Object.keys(a);
    if (keys.length != Object.keys(b).length) {
      // console.log("--> a", a);
      // console.log("--> b", b);
      throw new VariationError(
        `objects have incompatible number of entries: ${keys.length} != ${
          Object.keys(b).length
        }`
      );
    }
    for (const key of keys) {
      const valueA = a[key];
      const valueB = b[key];
      if ((valueA === undefined) !== (valueB === undefined)) {
        throw new VariationError(
          `objects have incompatible key sets: ${keys} != ${Object.keys(b)}`
        );
      }
      result[key] = func(valueA, valueB);
    }
  }
  return result;
}

function objectMap(o, argument, func) {
  var result;
  if (Array.isArray(o)) {
    return o.map((item) => func(item, argument));
  } else {
    result = new o.constructor();
    for (const key of Object.keys(o)) {
      result[key] = func(o[key], argument);
    }
  }
  return result;
}
