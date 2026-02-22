import {
  characterLinesFromString,
  stringFromCharacterLines,
} from "@fontra/core/character-lines.js";
import { getSuggestedGlyphName } from "@fontra/core/glyph-data.js";
import { expect } from "chai";

import { parametrize } from "./test-support.js";

describe("character-lines", () => {
  const codePoints = [..." /AÄBCQ"].map((char) => ord(char));

  const glyphMap = Object.fromEntries(
    codePoints.map((codePoint) => [getSuggestedGlyphName(codePoint), [codePoint]])
  );

  ["A.alt", "Adieresis.alt"].forEach((glyphName) => {
    glyphMap[glyphName] = [];
  });

  const characterMap = Object.fromEntries(
    Object.entries(glyphMap).map(([glyphName, codePoints]) => [
      codePoints[0],
      glyphName,
    ])
  );

  const characterLinesFromStringTestData = [
    {
      input: "AÄBC",
      expectedLines: [
        [
          { character: "A", glyphName: "A" },
          { character: "Ä", glyphName: "Adieresis" },
          { character: "B", glyphName: "B" },
          { character: "C", glyphName: "C" },
        ],
      ],
    },
    {
      input: "/A.alt",
      expectedLines: [[{ character: undefined, glyphName: "A.alt" }]],
    },
    {
      input: "/A.alt/",
      expectedLines: [[{ character: undefined, glyphName: "A.alt" }]],
    },
    {
      input: "/",
      expectedLines: [[]],
    },
    {
      input: "Ä",
      expectedLines: [[{ character: "Ä", glyphName: "Adieresis" }]],
    },
    {
      input: "/Ä",
      expectedLines: [[{ character: "Ä", glyphName: "Adieresis" }]],
    },
    {
      input: "/Ä.alt",
      expectedLines: [[{ character: undefined, glyphName: "Adieresis.alt" }]],
    },
    {
      input: "A/A.alt/B.alt C //",
      expectedLines: [
        [
          { character: "A", glyphName: "A" },
          { character: undefined, glyphName: "A.alt" },
          { character: undefined, glyphName: "B.alt" },
          { character: "C", glyphName: "C" },
          { character: " ", glyphName: "space" },
          { character: "/", glyphName: "slash" },
        ],
      ],
    },
    {
      input: "A/?C",
      expectedLines: [
        [
          { character: "A", glyphName: "A" },
          { character: "Q", glyphName: "Q", isPlaceholder: true },
          { character: "C", glyphName: "C" },
        ],
      ],
    },
  ];

  const placeholderGlyphName = "Q";

  const defaultGlyphInfo = { isPlaceholder: false };

  parametrize(
    "characterLinesFromString tests",
    characterLinesFromStringTestData,
    (testItem) => {
      let { input, expectedLines } = testItem;

      expectedLines = expectedLines.map((line) =>
        line.map((glyphInfo) => ({ ...defaultGlyphInfo, ...glyphInfo }))
      );

      expect(
        characterLinesFromString(input, characterMap, glyphMap, placeholderGlyphName)
      ).to.deep.equal(expectedLines);
    }
  );

  const stringFromCharacterLinesTestData = [
    { input: [[{ character: "A" }]], expectedOutput: "A" },
    { input: [[{ character: "/" }]], expectedOutput: "//" },
    { input: [[{ glyphName: "A" }]], expectedOutput: "/A" },
    { input: [[{ glyphName: "A" }, { glyphName: "A" }]], expectedOutput: "/A/A" },
    { input: [[{ glyphName: "A" }, { character: "A" }]], expectedOutput: "/A A" },
    { input: [[{ character: "A" }, { glyphName: "A" }]], expectedOutput: "A/A" },
    {
      input: [[{ character: "A", isPlaceholder: true }, { character: "A" }]],
      expectedOutput: "/?A",
    },
    {
      input: [[{ character: "A", isPlaceholder: true }, { glyphName: "A" }]],
      expectedOutput: "/?/A",
    },
  ];

  parametrize(
    "stringFromCharacterLines tests",
    stringFromCharacterLinesTestData,
    (testItem) => {
      const { input, expectedOutput } = testItem;

      expect(stringFromCharacterLines(input)).to.deep.equal(expectedOutput);
    }
  );
});

function ord(s) {
  return s.codePointAt(0);
}
