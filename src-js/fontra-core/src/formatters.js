import { assert } from "./utils.js";
export function isString(value) {
  return typeof value === "string" || value instanceof String;
}

export const DefaultFormatter = {
  toString: (value) => (value !== undefined && value !== null ? value.toString() : ""),
  fromString: (value) => {
    return {
      value: value,
    };
  },
};

export const NumberFormatter = {
  toString: (value) => value.toString(),
  fromString: (value) => {
    const number = Number(value);
    if (isNaN(number) || !value) {
      return { error: "not a number" };
    } else {
      return { value: number };
    }
  },
};

export const OptionalNumberFormatter = {
  toString: (value) => (value != undefined ? value.toString() : ""),
  fromString: (value) => {
    if (!value) {
      return { value: null };
    }
    const number = Number(value);
    if (isNaN(number)) {
      return { error: "not a number" };
    } else {
      return { value: number };
    }
  },
};

export const IntegerFormatter = {
  toString: (value) => value.toString(),
  fromString: (
    value,
    minValue = Number.NEGATIVE_INFINITY,
    maxValue = Number.POSITIVE_INFINITY
  ) => {
    assert(isString(value), "input value not a string");
    const number = Number(value);
    if (!Number.isInteger(number) || !value) {
      return { error: "not an integer" };
    } else if (number < minValue || number > maxValue) {
      return { error: `not between ${minValue} and ${maxValue}` };
    } else {
      return { value: number };
    }
  },
};

export const IntegerFormatterMinMax = (minValue, maxValue) => ({
  toString: (value) => IntegerFormatter.toString(value),
  fromString: (value) => IntegerFormatter.fromString(value, minValue, maxValue),
});

export const UnsignedIntegerFormatter = {
  toString: (value) => value.toString(),
  fromString: (value) => {
    assert(isString(value), "input value not a string");
    const number = Number(value);
    if (!Number.isInteger(number) || !value) {
      return { error: "not an integer" };
    } else if (number < 0) {
      return { error: "not a positive integer" };
    } else {
      return { value: number };
    }
  },
};

export const UnsignedNumberFormatter = {
  toString: (value) => value.toString(),
  fromString: (value) => {
    assert(isString(value), "input value not a string");
    const number = Number(value);
    if (isNaN(number) || !value) {
      return { error: "not a number" };
    } else if (number < 0) {
      return { error: "not a positive number" };
    } else {
      return { value: number };
    }
  },
};

export const BooleanFormatter = {
  toString: (value) => value.toString(),
  fromString: (value) => {
    assert(isString(value), `input value not a string`);
    if (value.trim().toLowerCase() === "true") {
      return { value: true };
    } else if (value.trim().toLowerCase() === "false") {
      return { value: false };
    } else {
      return { error: "not a boolean" };
    }
  },
};

export const ArrayFormatter = {
  toString: (value) => value.toString(),
  fromString: (value, arrayLength) => {
    assert(isString(value), `input value not a string`);
    let array = [];
    try {
      array = JSON.parse("[" + value + "]");
    } catch (e) {
      return { error: "not an array" };
    }
    if (Array.isArray(array)) {
      if (arrayLength && array.length != arrayLength) {
        return { error: `array length must be ${arrayLength}` };
      }
      return { value: array };
    } else {
      return { error: "not an array" };
    }
  },
};

export const FixedLengthArrayFormatter = (arrayLength) => ({
  toString: (value) => ArrayFormatter.toString(value, arrayLength),
  fromString: (value) => ArrayFormatter.fromString(value, arrayLength),
});

export const DateTimeFormatter = {
  toString: (value) => value.toString(),
  fromString: (value) => {
    assert(isString(value), `input value not a string`);
    const dateTimePattern = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/;
    if (!dateTimePattern.test(value)) {
      return { error: "not a valid date-time format (YYYY/MM/DD HH:MM:SS)" };
    } else {
      return { value: value };
    }
  },
};
