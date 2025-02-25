// TODO: Keep in mind, that we have NumberFormatter in ui-utils.js.
// _NumberFormatter is different because of:
// NumberFormatter.fromString(0) == undefined -> but should be 0
// NumberFormatter.fromString(true) == 1 -> but should be undefined
export const _NumberFormatter = {
  toString: (value) => value.toString(),
  fromString: (value) => {
    if (typeof value === "number") {
      return { value: value };
    } else if (typeof value === "boolean" || !value) {
      return { error: "not a number" };
    }
    const number = Number(value);
    if (isNaN(number)) {
      return { error: "not a number" };
    } else {
      return { value: number };
    }
  },
};

export const BooleanFormatter = {
  toString: (value) => value.toString(),
  fromString: (value) => {
    if (typeof value === "boolean") {
      return { value: value };
    }
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
  toString: (value) => {
    if (Array.isArray(value)) {
      return value.toString();
    }
  },
  fromString: (value) => {
    const array = JSON.parse("[" + value + "]");
    if (Array.isArray(array)) {
      return { value: array };
    } else {
      return { error: "not an array" };
    }
  },
};

export const NumberArrayFormatter = {
  toString: (value) => value.toString(),
  fromString: (value, arrayLength) => {
    const array = JSON.parse("[" + value + "]");
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

export const PanoseArrayFormatter = {
  toString: (value) => NumberArrayFormatter.toString(value),
  fromString: (value) => NumberArrayFormatter.fromString(value, 10),
};
