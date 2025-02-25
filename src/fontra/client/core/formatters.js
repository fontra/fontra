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
  toString: (value, arrayLength) => {
    if (!Array.isArray(value)) {
      return { error: "not an array" };
    }
    if (arrayLength && value.length != arrayLength) {
      return { error: `array length must be ${arrayLength}` };
    }
    return value.toString();
  },
  fromString: (value, arrayLength) => {
    let array = [];
    try {
      array = JSON.parse("[" + value + "]");
    } catch (e) {
      return { error: e };
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

export const PanoseArrayFormatter = {
  toString: (value) => ArrayFormatter.toString(value, 10),
  fromString: (value) => ArrayFormatter.fromString(value, 10),
};
