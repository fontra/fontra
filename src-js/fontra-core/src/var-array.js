import { VariationError } from "./errors.js";

export default class VarArray extends Array {
  copy() {
    return this.slice();
  }

  addItemwise(other) {
    const numItems = this.length;
    if (numItems !== other.length) {
      throw new VariationError(
        `arrays have different lengths: ${numItems} vs. ${other.length}`
      );
    }
    const result = new this.constructor(numItems);
    for (let i = 0; i < numItems; i++) {
      result[i] = this[i] + other[i];
    }
    return result;
  }

  subItemwise(other) {
    const numItems = this.length;
    if (numItems !== other.length) {
      throw new VariationError(
        `arrays have different lengths: ${numItems} vs. ${other.length}`
      );
    }
    const result = new this.constructor(numItems);
    for (let i = 0; i < numItems; i++) {
      result[i] = this[i] - other[i];
    }
    return result;
  }

  mulScalar(scalar) {
    const numItems = this.length;
    const result = new this.constructor(numItems);
    for (let i = 0; i < numItems; i++) {
      result[i] = this[i] * scalar;
    }
    return result;
  }
}
