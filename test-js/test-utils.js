import { expect } from "chai";
import {
  ArrayFormatter,
  BooleanFormatter,
  NumberArrayFormatter,
  _NumberFormatter,
  arrayExtend,
  bisect_right,
  boolInt,
  capitalizeFirstLetter,
  chain,
  clamp,
  consolidateCalls,
  dumpURLFragment,
  enumerate,
  fileNameExtension,
  getCharFromCodePoint,
  glyphMapToItemList,
  guessCharFromGlyphName,
  hexToRgba,
  hyphenatedToCamelCase,
  hyphenatedToLabel,
  loadURLFragment,
  makeUPlusStringFromCodePoint,
  mapObjectValues,
  mapObjectValuesAsync,
  memoize,
  modulo,
  objectsEqual,
  parseCookies,
  parseSelection,
  product,
  range,
  reversed,
  reversedEnumerate,
  rgbaToCSS,
  rgbaToHex,
  round,
  scheduleCalls,
  sleepAsync,
  splitGlyphNameExtension,
  throttleCalls,
  withTimeout,
} from "../src/fontra/client/core/utils.js";

import { getTestData, parametrize } from "./test-support.js";

describe("objectsEquals", () => {
  it("falsy values", () => {
    expect(objectsEqual(null, null)).equals(true);
    expect(objectsEqual(undefined, null)).equals(false);
    expect(objectsEqual("", "")).equals(true);
    expect(objectsEqual("", null)).equals(false);
  });
  it("with things inside", () => {
    expect(objectsEqual({}, { a: 1 })).equals(false);
    expect(objectsEqual({ a: 1 }, {})).equals(false);
    expect(objectsEqual({ a: 1 }, { a: 2 })).equals(false);
    expect(objectsEqual({ a: 2 }, { a: 2 })).equals(true);
  });
  it("thing in their prototype", () => {
    // making sure only objects own properties checked
    class Thing {
      constructor(value) {
        this.b = value;
      }
    }
    Thing.prototype.a = 1;
    expect(objectsEqual(new Thing(1), { b: 1 })).equals(true);
    expect(objectsEqual(new Thing(1), { b: 1, a: 1 })).equals(false);
  });
});

describe("consolidateCalls", () => {
  it("returns a function that will be executed in the next cycle of event loop", () => {
    let itWorked = false;
    const fun = consolidateCalls(() => {
      itWorked = true;
    });
    fun();
    expect(itWorked).to.be.false;
    setTimeout(() => {
      expect(itWorked).to.be.true;
    });
  });
  it("the callback should be executed only once", () => {
    let workedTimes = 0;
    const fun = consolidateCalls(() => {
      workedTimes++;
    });
    expect(workedTimes).to.be.equals(0);
    fun();
    expect(workedTimes).to.be.equals(0);
    fun();
    setTimeout(() => {
      expect(workedTimes).to.be.equals(1);
    });
  });
});

describe("scheduleCalls", () => {
  it("schedules a function to be executed with given timeout", () => {
    let worked = false;
    const fun = scheduleCalls(() => {
      worked = true;
    });
    fun();
    expect(worked).to.be.false;
    setTimeout(() => {
      expect(worked).to.be.true;
    });
  });
  it("delete the previous schedule, creates a new one, if the function executed before timeout", () => {
    let worked = false;
    const fun = scheduleCalls(() => {
      worked = true;
    }, 5);
    fun();
    setTimeout(() => {
      expect(worked).to.be.false;
      fun();
    }, 4);
    setTimeout(() => {
      expect(worked).to.be.false;
    }, 8);
    setTimeout(() => {
      expect(worked).to.be.true;
    }, 12);
  });
});

describe("throttleCalls", () => {
  it("delays the consequent call if it is executed before the given time in milliseconds", () => {
    let workedTimes = 0;
    const fun = throttleCalls(() => {
      workedTimes++;
    }, 10);
    fun();
    fun();
    expect(workedTimes).to.be.equal(1);
    setTimeout(() => {
      expect(workedTimes).to.be.equal(2);
    }, 20);
  });
  it("ignore the consequent call if it is another call already scheduled", () => {
    let workedTimes = 0;
    const fun = throttleCalls(() => {
      workedTimes++;
    }, 10);
    fun();
    fun();
    setTimeout(() => {
      fun();
    }, 5);
    expect(workedTimes).to.be.equal(1);
    setTimeout(() => {
      expect(workedTimes).to.be.equal(2);
    }, 20);
  });
});

describe("parseCookies", () => {
  it("should parse the given cookie string", () => {
    expect(parseCookies("cacao=yes;fruits=no")).deep.equal({
      cacao: "yes",
      fruits: "no",
    });
    expect(parseCookies("cacao=no;fruits=no;fruits=yes")).deep.equal({
      cacao: "no",
      fruits: "yes",
    });
  });
  it("should parse the given cookie with trailing semicolon", () => {
    expect(parseCookies("cacao=yes;fruits=no;")).deep.equal({
      cacao: "yes",
      fruits: "no",
    });
  });
});

describe("capitalizeFirstLetter", () => {
  it("basic functionality", () => {
    expect(capitalizeFirstLetter("sam")).equals("Sam");
    expect(capitalizeFirstLetter("Sam")).equals("Sam");
  });
  it("with spaces prefixed", () => {
    expect(capitalizeFirstLetter(" sam")).equals(" sam");
  });
});

describe("hyphenatedToCamelCase", () => {
  it("should camelize", () => {
    expect(hyphenatedToCamelCase("test-case")).equals("testCase");
  });
  it("should not delete the hyphen when the second part is not a lowercase letter", () => {
    expect(hyphenatedToCamelCase("test-1")).equals("test-1");
  });
});

describe("hyphenatedToLabel", () => {
  parametrize(
    "hyphenatedToLabel tests",
    [
      ["", ""],
      ["pen-tool", "Pen tool"],
      ["power-ruler-tool", "Power ruler tool"],
    ],
    (testData) => {
      const [inputGlyphName, expectedResult] = testData;
      expect(hyphenatedToLabel(inputGlyphName)).equals(expectedResult);
    }
  );
});

describe("modulo", () => {
  it("should return the remaining when divide", () => {
    expect(modulo(12, 5)).equals(2);
  });
  it("python behavior of modulus when mod a minus value", () => {
    expect(modulo(-3, 5)).equals(2);
  });
});

describe("boolInt", () => {
  it("1 for truthy", () => {
    expect(boolInt(true)).equals(1);
    expect(boolInt([])).equals(1);
    expect(boolInt(1)).equals(1);
    expect(boolInt({})).equals(1);
  });
  it("0 for falsy", () => {
    expect(boolInt(false)).equals(0);
    expect(boolInt("")).equals(0);
    expect(boolInt(0)).equals(0);
    expect(boolInt(null)).equals(0);
    expect(boolInt(undefined)).equals(0);
  });
});

describe("reversed", () => {
  it("reverse an iterator", () => {
    const numbers = [1, 2, 3];
    const numbersReversed = [...reversed(numbers)];
    expect(numbersReversed).deep.equals([3, 2, 1]);
  });
});

describe("enumerate", () => {
  it("enumerate an array, enumeration start with 0 by default", () => {
    const numbers = [1, 2, 3];
    const numbersEnumerated = [...enumerate(numbers)];
    expect(numbersEnumerated).deep.equals([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });
  it("enumaration start with a different number than 0", () => {
    const numbers = [1, 2, 3];
    const numbersEnumerated = [...enumerate(numbers, 1)];
    expect(numbersEnumerated).deep.equals([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });
});

describe("reversedEnumerate", () => {
  it("enumerate and reverse an iterator", () => {
    const numbers = [1, 2, 3];
    const numbersReversed = [...reversedEnumerate(numbers)];
    expect(numbersReversed).deep.equals([
      [2, 3],
      [1, 2],
      [0, 1],
    ]);
  });
});

describe("range", () => {
  it("should generate a range of numbers", () => {
    const numbers = [...range(3)];
    expect(numbers).deep.equals([0, 1, 2]);
  });
  it("should generate a range of numbers, with start and stop values", () => {
    const numbers = [...range(10, 13)];
    expect(numbers, [10, 11, 12]);
  });
  it("should generate a range of numbers, with start, stop and step values", () => {
    const numbers = [...range(10, 15, 2)];
    expect(numbers, [10, 12, 14]);
  });
});

describe("chain", () => {
  it("chain iterators", () => {
    const chained = [...chain(range(2), range(2))];
    expect(chained, [0, 1, 0, 1]);
  });
});

describe("makeUPlusStringFromCodePoint", () => {
  it("throws an exception when an invalid parameter is given", () => {
    expect(() => makeUPlusStringFromCodePoint("not-a-number")).to.throw();
  });
  it("should not throw an exception for a falsy value", () => {
    expect(() => makeUPlusStringFromCodePoint("")).to.not.throw();
  });
  it("make a number unicode hex", () => {
    expect(makeUPlusStringFromCodePoint(97)).equals("U+0061"); // a
    expect(makeUPlusStringFromCodePoint(65)).equals("U+0041"); // A
  });
});

describe("parseSelection", () => {
  it("should parse given selection info, return in order", () => {
    expect(parseSelection(["point/2", "point/3", "point/4"])).deep.equal({
      point: [2, 3, 4],
    });
  });
});

describe("getCharFromCodePoint", () => {
  it("should return an empty string if an argument is not passed", () => {
    expect(getCharFromCodePoint()).equals("");
  });
  it("should convert a unicode symbol number to a character", () => {
    expect(getCharFromCodePoint(97)).equals("a");
  });
});

describe("guessCharFromGlyphName", () => {
  it("should guess a character from code points in free text", () => {
    expect(guessCharFromGlyphName("text 0061 text")).equals("a");
    expect(guessCharFromGlyphName("text ff0061 text")).equals("a");
    expect(guessCharFromGlyphName("text ff0041 text")).equals("A");
    expect(guessCharFromGlyphName("text 110000 text")).equals("");
    expect(guessCharFromGlyphName("text 10FFFF text")).equals("");
    expect(guessCharFromGlyphName("text 100000 text")).equals("");
    expect(guessCharFromGlyphName("text 1F440 text")).equals("👀");
  });
});

describe("fileNameExtension", () => {
  it("should return the file extension of a file name", () => {
    expect(fileNameExtension("test-utils.js")).equals("js");
  });
  it("should work well when there is a dot in the file name", () => {
    expect(fileNameExtension("test.utils.js")).equals("js");
  });
  it("should return the given file name when there is no extension", () => {
    expect(fileNameExtension("utils")).equals("utils");
  });
});

describe("arrayExtend", () => {
  it("should extend arrays with another one", () => {
    const array = [1, 2, 3];
    arrayExtend(array, [4, 5]);
    expect(array).deep.equals([1, 2, 3, 4, 5]);
  });
  it("test chunk-by-chunk addition by 1024", () => {
    const destinationArray = [1, 2, 3];
    arrayExtend(destinationArray, [...range(1025)]);
    expect(destinationArray).deep.equals([1, 2, 3, ...range(1025)]);
  });
});

describe("rgbaToCSS", () => {
  it("should convert an array of decimals to rgb string", () => {
    expect(rgbaToCSS([0, 0, 0])).to.be.equal("rgb(0,0,0)");
    expect(rgbaToCSS([0, 1, 0])).to.be.equal("rgb(0,255,0)");
    expect(rgbaToCSS([1, 0, 0, 1])).to.be.equal("rgb(255,0,0)");
  });
  it("should convert an array of decimals to rgba string", () => {
    expect(rgbaToCSS([0, 0, 0, 0])).to.be.equal("rgb(0,0,0,0)");
    expect(rgbaToCSS([0, 0, 0, 0.2])).to.be.equal("rgb(0,0,0,0.2)");
  });
  it("should always create rgb if the opacity is 1", () => {
    expect(rgbaToCSS([0, 0, 0, 1])).to.be.equal("rgb(0,0,0)");
  });
});

describe("hexToRgba", () => {
  it("should convert a hex color string to rgba array of decimals", () => {
    let array = hexToRgba("#FF0000");
    expect(array).deep.equals([1, 0, 0, 1]); // red
  });
  it("should convert short hex color string to rgba array of decimals", () => {
    const array = hexToRgba("#F00");
    expect(array).deep.equals([1, 0, 0, 1]); // red
  });
  it("should convert a hex color string with opacity to rgba array of decimals", () => {
    const array = hexToRgba("#FF000080");
    expect(array).deep.equals([1, 0, 0, 0.502]); // red with 80% opacity
  });
  it("should convert short hex color string with opacity to rgba array of decimals", () => {
    const array = hexToRgba("#F008");
    expect(array).deep.equals([1, 0, 0, 0.5333]); // red with 80% opacity
  });
  it("bad hex string -> Default value", () => {
    expect(() => {
      hexToRgba("#X008");
    }).to.throw(
      "Bad hex color format. Should be #RRGGBB or #RRGGBBAA or #RGB or #RGBA"
    );
  });
});

describe("rgbaToHex", () => {
  it("should convert rgba array of decimals to a hex color string", () => {
    expect(rgbaToHex([1, 0, 0, 1])).deep.equals("#ff0000");
  });
  it("should convert rgba array of decimals to a hex color string with opacity", () => {
    expect(rgbaToHex([1, 0, 0, 0.5333])).deep.equals("#ff000088");
    expect(rgbaToHex([1, 0, 0, 0.502])).deep.equals("#ff000080");
  });
  it("throw error because not enough components", () => {
    parametrize(
      "round-trip tests",
      [
        [1, 0],
        [1, 0, 1, 2, 5],
      ],
      (testData) => {
        expect(() => {
          rgbaToHex(testData);
        }).to.throw("rgba argument has to have 3 or 4 items in array");
      }
    );
  });
});

describe("hexToRgba to rgbaToHex", () => {
  parametrize(
    "round-trip tests",
    [
      "#ff0000",
      "#ff000088",
      "#ff000080", // red + opacity
      "#008000",
      "#00800088",
      "#00800080", // green + opacity
      "#0000ff",
      "#0000ff88",
      "#0000ff80", // blue + opacity
      "#000000",
      "#00000088",
      "#00000080", // black + opacity
      "#ffffff",
      "#ffffff88",
      "#ffffff80", // white + opacity
    ],
    (testData) => {
      expect(rgbaToHex(hexToRgba(testData))).deep.equals(testData);
    }
  );
});

describe("clamp", () => {
  it("should give the minimum when the number is below the range", () => {
    expect(clamp(10, 50, 80)).equals(50);
  });
  it("should give the minimum when the number exceeds the range", () => {
    expect(clamp(81, 50, 80)).equals(80);
  });
});

describe("round", () => {
  parametrize(
    "round tests",
    [
      [1, 0, 1],
      [1.1, 0, 1],
      [1.1, 1, 1.1],
      [1.12, 1, 1.1],
      [1.07, 1, 1.1],
      [1.123456, 2, 1.12],
      [1.123456, 3, 1.123],
      [1.123456, 4, 1.1235],
      [1.123456, 5, "nDigits out of range"],
      [1.123456, -1, "nDigits out of range"],
      [1.123456, 0.5, "nDigits out of range"],
    ],
    (testData) => {
      const [inputNumber, nDigits, expectedResult] = testData;
      if (typeof expectedResult === "number") {
        expect(round(inputNumber, nDigits)).to.equal(expectedResult);
      } else {
        expect(() => round(inputNumber, nDigits)).to.throw(expectedResult);
      }
    }
  );
});

describe("memoize", () => {
  it("should memoize the result of given function", () => {
    let nTimesWorked = 0;
    const func = memoize((n) => {
      nTimesWorked += 1;
      return n * n;
    });
    expect(func(2)).equal(4);
    expect(nTimesWorked).equal(1);
    expect(func(2)).to.equal(func(2));
    expect(func(2)).to.not.equal(func(4));
  });
  it("should memoize the result of given async function", async () => {
    let nTimesWorked = 0;
    const func = memoize(async (n) => {
      nTimesWorked += 1;
      return n * n;
    });
    expect(await func(2)).equal(4);
    expect(await func(2)).equal(4);
    expect(nTimesWorked).equal(1);
  });
  it("should give the awaiting promise when a function called before the previous execution is done", async () => {
    let nTimesWorked = 0;
    const func = memoize(async (n) => {
      nTimesWorked += 1;
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      return n * n;
    });
    const pending = func(2);
    expect(nTimesWorked).equal(1);
    await func(2);
    await pending;
    expect(nTimesWorked).equal(1);
    const result = await func(4);
    expect(nTimesWorked).equal(2);
    expect(result).equal(16);
  });
});

describe("withTimeout", () => {
  // Use thennableFactory instead of specifying thennable directly because
  // sleepAsync's timer will start when the test case is *defined*, not when
  // it is run.
  parametrize(
    "withTimeout tests",
    [
      {
        thennableFactory: () => "not a thennable",
        timeout: 5,
        expectedThrown: true,
      },
      { thennableFactory: () => Promise.resolve(), timeout: 5, expectedThrown: false },
      {
        thennableFactory: () => sleepAsync(1),
        timeout: 5,
        expectedThrown: false,
      },
      {
        thennableFactory: () => sleepAsync(10),
        timeout: 5,
        expectedThrown: true,
      },
    ],
    async (testCase) => {
      let thrown = false;
      try {
        await withTimeout(testCase.thennableFactory(), testCase.timeout);
      } catch {
        thrown = true;
      }
      expect(thrown).to.equal(testCase.expectedThrown);
    }
  );
});

describe("splitGlyphNameExtension", () => {
  parametrize(
    "splitGlyphNameExtension tests",
    [
      ["", ["", ""]],
      ["a", ["a", ""]],
      [".notdef", [".notdef", ""]],
      [".x", [".x", ""]],
      ["a.alt", ["a", ".alt"]],
      ["a.alt.etc", ["a", ".alt.etc"]],
      ["aring.alt.etc", ["aring", ".alt.etc"]],
    ],
    (testData) => {
      const [inputGlyphName, expectedResult] = testData;
      expect(splitGlyphNameExtension(inputGlyphName)).to.deep.equal(expectedResult);
    }
  );
});

describe("loadURLFragment + dumpURLFragment", () => {
  const testData = getTestData("url-fragment-test-data.json");
  parametrize("loadURLFragment/dumpURLFragment tests", testData, (testCase) => {
    const obj = testCase.object;
    const expectedFragment = testCase.fragment;
    expect(dumpURLFragment(obj)).to.equal(expectedFragment);
    expect(loadURLFragment(expectedFragment)).to.deep.equal(obj);
    expect(loadURLFragment(dumpURLFragment(obj))).to.deep.equal(obj);
  });
});

describe("product", () => {
  const testData = [
    { args: [], product: [[]] },
    { args: [[]], product: [] },
    { args: [[1], []], product: [] },
    { args: [[], [2]], product: [] },
    { args: [[1, 2]], product: [[1], [2]] },
    {
      args: [
        [1, 2],
        [3, 4],
      ],
      product: [
        [1, 3],
        [1, 4],
        [2, 3],
        [2, 4],
      ],
    },
    {
      args: [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      product: [
        [1, 3, 5],
        [1, 3, 6],
        [1, 4, 5],
        [1, 4, 6],
        [2, 3, 5],
        [2, 3, 6],
        [2, 4, 5],
        [2, 4, 6],
      ],
    },
  ];
  parametrize("product test", testData, (testCase) => {
    expect([...product(...testCase.args)]).to.deep.equal(testCase.product);
  });
});

describe("mapObjectValues", () => {
  const testData = [
    { obj: {}, func: (v) => v, result: {} },
    { obj: { a: 1 }, func: (v) => v + 1, result: { a: 2 } },
    { obj: { a: 1, b: 2, c: 3 }, func: (v) => v * v, result: { a: 1, b: 4, c: 9 } },
  ];
  parametrize("mapObjectValues test", testData, (testCase) => {
    expect(mapObjectValues(testCase.obj, testCase.func)).to.deep.equal(testCase.result);
  });

  const testDataAsync = [
    {
      obj: {},
      func: async (v) => {
        await sleepAsync(0);
        return v;
      },
      result: {},
    },
    {
      obj: { a: 1 },
      func: async (v) => {
        await sleepAsync(0);
        return v + 1;
      },
      result: { a: 2 },
    },
    {
      obj: { a: 1, b: 2, c: 3 },
      func: async (v) => {
        await sleepAsync(0);
        return v * v;
      },
      result: { a: 1, b: 4, c: 9 },
    },
  ];
  parametrize("mapObjectValuesAsync test", testDataAsync, async (testCase) => {
    expect(await mapObjectValuesAsync(testCase.obj, testCase.func)).to.deep.equal(
      testCase.result
    );
  });
});

describe("glyphMapToItemList", () => {
  const testData = [
    {
      glyphMap: { "A.alt": [], "A": [65], "a": [97], "B": [66, 98] },
      result: [
        { glyphName: "A.alt", codePoints: [], associatedCodePoints: [65] },
        { glyphName: "A", codePoints: [65], associatedCodePoints: [] },
        { glyphName: "a", codePoints: [97], associatedCodePoints: [] },
        { glyphName: "B", codePoints: [66, 98], associatedCodePoints: [] },
      ],
    },
  ];

  parametrize("glyphMapToItemList test", testData, (testCase) => {
    expect(glyphMapToItemList(testCase.glyphMap)).to.deep.equal(testCase.result);
  });
});

describe("bisect_right", () => {
  const testData = [
    { a: [], x: 1, i: 0 },
    { a: [1], x: 0, i: 0 },
    { a: [1], x: 1, i: 1 },
    { a: [1], x: 2, i: 1 },
    { a: [1, 1], x: 0, i: 0 },
    { a: [1, 1], x: 1, i: 2 },
    { a: [1, 1], x: 2, i: 2 },
    { a: [1, 1, 1], x: 0, i: 0 },
    { a: [1, 1, 1], x: 1, i: 3 },
    { a: [1, 1, 1], x: 2, i: 3 },
    { a: [1, 1, 1, 1], x: 0, i: 0 },
    { a: [1, 1, 1, 1], x: 1, i: 4 },
    { a: [1, 1, 1, 1], x: 2, i: 4 },
    { a: [1, 2], x: 0, i: 0 },
    { a: [1, 2], x: 1, i: 1 },
    { a: [1, 2], x: 1.5, i: 1 },
    { a: [1, 2], x: 2, i: 2 },
    { a: [1, 2], x: 3, i: 2 },
    { a: [1, 1, 2, 2], x: 0, i: 0 },
    { a: [1, 1, 2, 2], x: 1, i: 2 },
    { a: [1, 1, 2, 2], x: 1.5, i: 2 },
    { a: [1, 1, 2, 2], x: 2, i: 4 },
    { a: [1, 1, 2, 2], x: 3, i: 4 },
    { a: [1, 2, 3], x: 0, i: 0 },
    { a: [1, 2, 3], x: 1, i: 1 },
    { a: [1, 2, 3], x: 1.5, i: 1 },
    { a: [1, 2, 3], x: 2, i: 2 },
    { a: [1, 2, 3], x: 2.5, i: 2 },
    { a: [1, 2, 3], x: 3, i: 3 },
    { a: [1, 2, 3], x: 4, i: 3 },
    { a: [1, 2, 2, 3, 3, 3, 4, 4, 4, 4], x: 0, i: 0 },
    { a: [1, 2, 2, 3, 3, 3, 4, 4, 4, 4], x: 1, i: 1 },
    { a: [1, 2, 2, 3, 3, 3, 4, 4, 4, 4], x: 1.5, i: 1 },
    { a: [1, 2, 2, 3, 3, 3, 4, 4, 4, 4], x: 2, i: 3 },
    { a: [1, 2, 2, 3, 3, 3, 4, 4, 4, 4], x: 2.5, i: 3 },
    { a: [1, 2, 2, 3, 3, 3, 4, 4, 4, 4], x: 3, i: 6 },
    { a: [1, 2, 2, 3, 3, 3, 4, 4, 4, 4], x: 3.5, i: 6 },
    { a: [1, 2, 2, 3, 3, 3, 4, 4, 4, 4], x: 4, i: 10 },
    { a: [1, 2, 2, 3, 3, 3, 4, 4, 4, 4], x: 5, i: 10 },
  ];

  parametrize("bisect_right test", testData, (testCase) => {
    expect(bisect_right(testCase.a, testCase.x)).to.equal(testCase.i);
  });
});

describe("NumberFormatter", () => {
  parametrize(
    "NumberFormatter tests",
    [
      ["1", 1],
      ["11234", 11234],
      ["0", 0],
      ["-200", -200],
      ["asdfg200", undefined],
      ["", undefined],
      ["test", undefined],
      [undefined, undefined],
      [true, undefined],
      [false, undefined],
      [null, undefined],
      [200, 200],
      [0, 0],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(_NumberFormatter.fromString(input).value).to.equal(expectedResult);
    }
  );
});

describe("ArrayFormatter", () => {
  parametrize(
    "ArrayFormatter fromString tests",
    [
      ["1,2,3,4", [1, 2, 3, 4]],
      ["1, 2,3,4", [1, 2, 3, 4]],
      ["", []],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(ArrayFormatter.fromString(input).value).to.deep.equal(expectedResult);
    }
  );
});

describe("ArrayFormatter", () => {
  parametrize(
    "ArrayFormatter toString tests",
    [
      [[1, 2, 3, 4], "1,2,3,4"],
      [[], ""],
      [true, undefined],
      [new Set([1, 2, 3]), undefined],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(ArrayFormatter.toString(input)).to.deep.equal(expectedResult);
    }
  );
});

describe("NumberArrayFormatter", () => {
  parametrize(
    "NumberArrayFormatter fromString tests",
    [
      ["1,2,3,4", [1, 2, 3, 4], 4],
      ["1, 2,3, 4", [1, 2, 3, 4], 4],
      ["1, 2,3,4", undefined, 3],
      ["", [], 0],
    ],
    (testData) => {
      const [input, expectedResult, arrayLength] = testData;
      expect(NumberArrayFormatter.fromString(input, arrayLength).value).to.deep.equal(
        expectedResult
      );
    }
  );
});

describe("BooleanFormatter", () => {
  parametrize(
    "BooleanFormatter fromString tests",
    [
      ["false", false],
      ["true", true],
      ["False", false],
      ["True", true],
      ["FALSE", false],
      ["TRUE", true],
      [false, false],
      [true, true],
      ["", undefined],
      ["Hello", undefined],
      ["   false    ", false],
      ["   true    ", true],
    ],
    (testData) => {
      const [input, expectedResult] = testData;
      expect(BooleanFormatter.fromString(input).value).to.deep.equal(expectedResult);
    }
  );
});
