import {
  getGlyphInfoFromCodePoint,
  getGlyphInfoFromGlyphName,
  getSuggestedGlyphName,
} from "./glyph-data.js";
import { block, script, scriptNames } from "./unicode-scripts-blocks.js";
import {
  capitalizeFirstLetter,
  getBaseGlyphName,
  getCodePointFromGlyphItem,
  getGlyphNameExtension,
} from "./utils.ts";

function getGlyphInfo(codePoint, glyphName) {
  return (
    getGlyphInfoFromCodePoint(codePoint) ||
    getGlyphInfoFromGlyphName(glyphName) ||
    getGlyphInfoFromGlyphName(getBaseGlyphName(glyphName))
  );
}

function getGroupByInfo(glyphItem, options) {
  const codePoint = getCodePointFromGlyphItem(glyphItem);

  const glyphInfo = getGlyphInfo(codePoint, glyphItem.glyphName) || {};

  const groupByInfo = {
    ...Object.fromEntries(
      Object.entries(glyphInfo).filter(([key, value]) => options[key])
    ),
    glyphNameExtension: options.glyphNameExtension
      ? getGlyphNameExtension(glyphItem.glyphName)
      : undefined,
  };

  if (codePoint) {
    if (options.script) {
      // Override script from unicode-scripts-blocks.js
      const scriptCode = script(codePoint);
      groupByInfo.script = scriptNames[scriptCode] || scriptCode;
    }
    if (options.block) {
      groupByInfo.block = block(codePoint);
    }
  }

  return groupByInfo;
}

export const groupByProperties = [
  { key: "script", label: "Script" },
  { key: "block", label: "Block" },
  { key: "case", label: "Case", compare: compareCase },
  { key: "category", label: "Category" },
  { key: "subCategory", label: "Sub-category" },
  { key: "glyphNameExtension", label: "Glyph name extension" },
];

export const groupByKeys = groupByProperties.map(({ key }) => key);

export class GlyphOrganizer {
  constructor() {
    this._glyphNamesListFilterFunc = (item) => true; // pass all through

    this.setGroupByKeys([]);
  }

  setSearchString(searchString) {
    const searchStrings = searchString.split(/\s+/).filter((item) => item.length);

    const singleCharSearchItems = searchStrings
      .filter((item) => [...item].length === 1) // num chars, not utf16 units!
      .map((item) => item.codePointAt(0));

    // If a search item is a 2-5 characters long hex string, prefixed by U+ or 0x,
    // look for the character this hex code point represents
    const literalHexSearchItems = searchStrings
      .map((item) => {
        const match = item.match(/(?<=U\+|0x)([0-9A-F]{2,5})$/i);
        return match ? parseInt(match[0], 16) : undefined;
      })
      .filter((item) => item);

    // If a search item is a single character, search for glyph names that contain
    // the character's codepoint as an uppercase hex string. For example, if a search
    // item is 'A', then search for glyph names containing '0041'.
    // This functionality was requested by CJK designers who use hex code points in
    // variable component glyphs.
    const hexSearchItems = singleCharSearchItems.map((codePoint) => {
      const hexCodePoint = codePoint.toString(16).toUpperCase().padStart(4, "0");
      // Only match if there are no hex digits before and after
      return new RegExp(`([^0-9A-F]|^)${hexCodePoint}([^0-9A-F]|$)`);
    });

    const regexSearchItems = [
      ...searchStrings.map((s) => new RegExp(RegExp.escape(s))),
      ...hexSearchItems,
    ];

    const codePointSearchItems = [...singleCharSearchItems, ...literalHexSearchItems];

    this._codePointSearchItems = codePointSearchItems;
    this._glyphNamesListFilterFunc = (item) =>
      glyphFilterFunc(item, regexSearchItems, codePointSearchItems);
  }

  setGroupByKeys(groupByKeys) {
    const options = {};
    groupByKeys.forEach((groupByKey) => (options[groupByKey] = true));

    this.setGroupByFunc((glyph) => getGroupByKey(glyph, options));
  }

  setGroupByFunc(groupByFunc) {
    this._groupByFunc = groupByFunc;
  }

  sortGlyphs(glyphs) {
    glyphs = [...glyphs];
    glyphs.sort(glyphItemSortFunc);
    return glyphs;
  }

  filterGlyphs(glyphs, appendUndefinedCharacters = false) {
    const filteredGlyphs = glyphs.filter(this._glyphNamesListFilterFunc);

    if (appendUndefinedCharacters) {
      for (const codePoint of this._codePointSearchItems) {
        if (
          filteredGlyphs.some((glyphItem) => glyphItem.codePoints.includes(codePoint))
        ) {
          continue;
        }

        filteredGlyphs.push({
          glyphName: getSuggestedGlyphName(codePoint),
          codePoints: [codePoint],
          associatedCodePoints: [],
        });
      }
    }

    return filteredGlyphs;
  }

  groupGlyphs(glyphs) {
    const groups = new Map();

    for (const item of glyphs) {
      const groupByInfo = this._groupByFunc(item);
      let group = groups.get(groupByInfo.groupByKey);
      if (!group) {
        group = { groupByInfo, glyphs: [] };
        groups.set(groupByInfo.groupByKey, group);
      }
      group.glyphs.push(item);
    }

    const groupEntries = [...groups.values()];
    groupEntries.sort(compareGroupInfo);

    const sections = groupEntries.map(({ groupByInfo, glyphs }) => ({
      label: groupByInfo.groupByKey,
      glyphs: glyphs,
    }));

    return sections;
  }
}

function compareGroupInfo(groupByEntryA, groupByEntryB) {
  const groupByInfoA = groupByEntryA.groupByInfo;
  const groupByInfoB = groupByEntryB.groupByInfo;

  for (const { key, compare } of groupByProperties) {
    const valueA = groupByInfoA[key]?.toLowerCase(); // compare non-case sensitive
    const valueB = groupByInfoB[key]?.toLowerCase();

    if (valueA === valueB) {
      continue;
    }

    if (valueA === undefined) {
      return 1;
    } else if (valueB === undefined) {
      return -1;
    }

    return compare ? compare(valueA, valueB) : valueA < valueB ? -1 : 1;
  }

  return 0;
}

function glyphFilterFunc(item, regexSearchItems, codePointSearchItems) {
  if (!regexSearchItems.length && !codePointSearchItems.length) {
    return true;
  }

  for (const regex of regexSearchItems) {
    if (item.glyphName.search(regex) >= 0) {
      return true;
    }
  }

  return item.codePoints.some((codePoint) => {
    return codePointSearchItems.some((codePointItem) => codePointItem == codePoint);
  });
}

function glyphItemSortFunc(item1, item2) {
  const uniCmp = compare(item1.codePoints[0], item2.codePoints[0]);
  const glyphNameCmp = compare(item1.glyphName, item2.glyphName);
  return uniCmp ? uniCmp : glyphNameCmp;
}

function compare(a, b) {
  // sort undefined at the end
  if (a === b) {
    return 0;
  } else if (a === undefined) {
    return 1;
  } else if (b === undefined) {
    return -1;
  } else if (a < b) {
    return -1;
  } else {
    return 1;
  }
}

function getGroupByKey(glyph, options) {
  const groupByInfo = getGroupByInfo(glyph, options);

  const groupByKeyItems = [];

  if (groupByInfo.script) {
    groupByKeyItems.push(capitalizeFirstLetter(groupByInfo.script));
  }

  if (groupByInfo.block) {
    groupByKeyItems.push(groupByInfo.block);
  }

  if (groupByInfo.case) {
    groupByKeyItems.push(capitalizeFirstLetter(groupByInfo.case));
  }

  if (groupByInfo.category) {
    groupByKeyItems.push(groupByInfo.category);
  }

  if (groupByInfo.subCategory) {
    groupByKeyItems.push(groupByInfo.subCategory);
  }

  if (groupByInfo.glyphNameExtension) {
    groupByKeyItems.push(`*${groupByInfo.glyphNameExtension}`);
  }

  if (!groupByKeyItems.length) {
    groupByKeyItems.push("Other");
  }

  return { groupByKey: groupByKeyItems.join(" / "), ...groupByInfo };
}

function compareCase(caseA, caseB) {
  const cases = ["upper", "lower", "minor"];
  const indexA = cases.indexOf(caseA);
  const indexB = cases.indexOf(caseB);
  return indexA - indexB;
}
