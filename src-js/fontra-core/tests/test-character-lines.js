import { characterLinesFromString } from "@fontra/core/character-lines.js";
import { getSuggestedGlyphName } from "@fontra/core/glyph-data.js";
import { expect } from "chai";

import { parametrize } from "./test-support.js";

describe("character-lines", () => {
  const codePoints = [..." /AÄBCQ"].map((char) => chr(char));

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

  const testData = [
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
          { character: undefined, glyphName: "B.alt", isUndefined: true },
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

  const defaultGlyphInfo = { isPlaceholder: false, isUndefined: false };

  parametrize("characterLinesFromString tests", testData, (testItem) => {
    let { input, expectedLines } = testItem;

    expectedLines = expectedLines.map((line) =>
      line.map((glyphInfo) => ({ ...defaultGlyphInfo, ...glyphInfo }))
    );

    expect(
      characterLinesFromString(input, characterMap, glyphMap, placeholderGlyphName)
    ).to.deep.equal(expectedLines);
  });
});

function chr(s) {
  return s.codePointAt(0);
}
