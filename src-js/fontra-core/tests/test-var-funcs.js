import { expect } from "chai";

import VarArray from "@fontra/core/var-array.js";
import { addItemwise, mulScalar, subItemwise } from "@fontra/core/var-funcs.js";

describe("var-funcs tests", () => {
  describe("testing addition", () => {
    it("add arrays of ints", () => {
      const result = addItemwise([1, 2, 3], [4, 5, 6]);
      expect(result).to.deep.equal([5, 7, 9]);
    });

    it("add incompatible arrays of ints", () => {
      expect(() => addItemwise([1, 2, 3], [4, 5])).to.throw(
        "arrays have incompatible lengths: 3 != 2"
      );
    });

    it("add arrays of strings", () => {
      const result = addItemwise(["1", "2"], ["1", "2"]);
      expect(result).to.deep.equal(["1", "2"]);
    });

    it("add incompatible arrays of strings", () => {
      expect(() => addItemwise(["a", "b"], ["a", "c"])).to.throw(
        "unexpected different strings: b != c"
      );
    });

    it("add objects", () => {
      const result = addItemwise({ a: 1, b: 2 }, { b: 2, a: 1 });
      expect(result).to.deep.equal({ a: 2, b: 4 });
    });

    it("add incompatible objects", () => {
      expect(() => addItemwise({ a: 1, b: 2 }, { b: 2 })).to.throw(
        "objects have incompatible number of entries: 2 != 1"
      );
    });

    it("add incompatible objects", () => {
      expect(() => addItemwise({ a: 1, b: 2 }, { b: 2, c: 3 })).to.throw(
        "objects have incompatible key sets: a,b != b,c"
      );
    });

    it("add nested objects", () => {
      const result = addItemwise({ a: { x: 10 }, b: 2 }, { b: 2, a: { x: 20 } });
      expect(result).to.deep.equal({ a: { x: 30 }, b: 4 });
    });

    it("add nested arrays", () => {
      const result = addItemwise([[1, 2], 3, 4], [[5, 6], 7, 8]);
      expect(result).to.deep.equal([[6, 8], 10, 12]);
    });

    it("add array of objects", () => {
      const result = addItemwise([{ x: 10 }, 2], [{ x: 20 }, 5]);
      expect(result).to.deep.equal([{ x: 30 }, 7]);
    });

    it("add VarArray", () => {
      const result = addItemwise(new VarArray(1, 2, 3), new VarArray(1, 2, 3));
      expect(result).to.deep.equal([2, 4, 6]);
      expect(result).to.be.an.instanceof(VarArray);
    });

    it("add undefined", () => {
      expect(() => addItemwise(123, undefined)).to.throw(
        "incompatible object types: typeof 123 != typeof undefined"
      );
      expect(() => addItemwise(undefined, 123)).to.throw(
        "incompatible object types: typeof undefined != typeof 123"
      );
      expect(addItemwise(undefined, undefined)).to.equal(undefined);
    });

    it("add null", () => {
      expect(() => addItemwise(123, null)).to.throw(
        "incompatible object types: typeof 123 != typeof null"
      );
      expect(() => addItemwise(null, 123)).to.throw(
        "incompatible object types: typeof null != typeof 123"
      );
      expect(addItemwise(null, null)).to.equal(null);
    });

    it("add bool", () => {
      expect(() => addItemwise(true, false)).to.throw(
        "unexpected different booleans: true != false"
      );
      expect(addItemwise(true, true)).to.equal(true);
      expect(addItemwise(false, false)).to.equal(false);
    });
  });

  describe("testing subtraction", () => {
    it("sub arrays of ints", () => {
      const result = subItemwise([1, 2, 3], [4, 5, 6]);
      expect(result).to.deep.equal([-3, -3, -3]);
    });

    it("sub incompatible arrays of ints", () => {
      expect(() => subItemwise([1, 2, 3], [4, 5])).to.throw(
        "arrays have incompatible lengths: 3 != 2"
      );
    });

    it("sub arrays of strings", () => {
      const result = subItemwise(["1", "2"], ["1", "2"]);
      expect(result).to.deep.equal(["1", "2"]);
    });

    it("sub incompatible arrays of strings", () => {
      expect(() => subItemwise(["a", "b"], ["a", "c"])).to.throw(
        "unexpected different strings: b != c"
      );
    });

    it("sub objects", () => {
      const result = subItemwise({ a: 10, b: 20 }, { b: 2, a: 1 });
      expect(result).to.deep.equal({ a: 9, b: 18 });
    });

    it("sub incompatible objects", () => {
      expect(() => subItemwise({ a: 1, b: 2 }, { b: 2 })).to.throw(
        "objects have incompatible number of entries: 2 != 1"
      );
    });

    it("sub incompatible objects", () => {
      expect(() => subItemwise({ a: 1, b: 2 }, { b: 2, c: 3 })).to.throw(
        "objects have incompatible key sets: a,b != b,c"
      );
    });

    it("sub nested objects", () => {
      const result = subItemwise({ a: { x: 10 }, b: 2 }, { b: 2, a: { x: 20 } });
      expect(result).to.deep.equal({ a: { x: -10 }, b: 0 });
    });

    it("sub nested arrays", () => {
      const result = subItemwise([[1, 2], 3, 4], [[5, 6], 7, 8]);
      expect(result).to.deep.equal([[-4, -4], -4, -4]);
    });

    it("sub array of objects", () => {
      const result = subItemwise([{ x: 10 }, 2], [{ x: 20 }, 5]);
      expect(result).to.deep.equal([{ x: -10 }, -3]);
    });

    it("sub VarArray", () => {
      const result = subItemwise(new VarArray(1, 2, 3), new VarArray(1, 2, 3));
      expect(result).to.deep.equal([0, 0, 0]);
      expect(result).to.be.an.instanceof(VarArray);
    });

    it("sub undefined", () => {
      expect(() => subItemwise(123, undefined)).to.throw(
        "incompatible object types: typeof 123 != typeof undefined"
      );
      expect(() => subItemwise(undefined, 123)).to.throw(
        "incompatible object types: typeof undefined != typeof 123"
      );
      expect(subItemwise(undefined, undefined)).to.equal(undefined);
    });

    it("sub null", () => {
      expect(() => subItemwise(123, null)).to.throw(
        "incompatible object types: typeof 123 != typeof null"
      );
      expect(() => subItemwise(null, 123)).to.throw(
        "incompatible object types: typeof null != typeof 123"
      );
      expect(subItemwise(null, null)).to.equal(null);
    });

    it("sub bool", () => {
      expect(() => subItemwise(true, false)).to.throw(
        "unexpected different booleans: true != false"
      );
      expect(subItemwise(true, true)).to.equal(true);
      expect(subItemwise(false, false)).to.equal(false);
    });
  });

  describe("testing multiplication", () => {
    it("mul arrays of ints", () => {
      const result = mulScalar([1, 2, 3], 10);
      expect(result).to.deep.equal([10, 20, 30]);
    });

    it("mul arrays of strings", () => {
      const result = mulScalar(["1", "2"], 3);
      expect(result).to.deep.equal(["1", "2"]);
    });

    it("mul objects", () => {
      const result = mulScalar({ a: 1, b: 2 }, 3);
      expect(result).to.deep.equal({ a: 3, b: 6 });
    });

    it("mul nested objects", () => {
      const result = mulScalar({ a: { x: 10 }, b: 2 }, 100);
      expect(result).to.deep.equal({ a: { x: 1000 }, b: 200 });
    });

    it("mul nested arrays", () => {
      const result = mulScalar([[1, 2], 3, 4], 10);
      expect(result).to.deep.equal([[10, 20], 30, 40]);
    });

    it("mul array of objects", () => {
      const result = mulScalar([{ x: 10 }, 2], 5);
      expect(result).to.deep.equal([{ x: 50 }, 10]);
    });

    it("mul VarArray", () => {
      const result = mulScalar(new VarArray(1, 2, 3), 5);
      expect(result).to.deep.equal([5, 10, 15]);
      expect(result).to.be.an.instanceof(VarArray);
    });

    it("mul undefined", () => {
      expect(mulScalar(undefined, 3)).to.equal(undefined);
    });

    it("mul null", () => {
      expect(mulScalar(null, 3)).to.equal(null);
    });

    it("mul bool", () => {
      expect(mulScalar(false, 3)).to.equal(false);
    });
  });
});
