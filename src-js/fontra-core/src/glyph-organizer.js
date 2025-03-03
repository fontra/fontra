import { getGlyphInfoFromCodePoint, getGlyphInfoFromGlyphName } from "./glyph-data.js";
import { block, script, scriptNames } from "./unicode-scripts-blocks.js";
import {
  capitalizeFirstLetter,
  getBaseGlyphName,
  getCodePointFromGlyphItem,
  getGlyphNameExtension,
} from "./utils.js";

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
    const searchItems = searchString.split(/\s+/).filter((item) => item.length);
    const hexSearchItems = searchItems
      .filter((item) => [...item].length === 1) // num chars, not utf16 units!
      .map((item) => {
        const hexCodePoint = item
          .codePointAt(0)
          .toString(16)
          .toUpperCase()
          .padStart(4, "0");
        // Only match if there are no hex digits before and after
        return new RegExp(`([^0-9A-F]|^)${hexCodePoint}([^0-9A-F]|$)`);
      });
    searchItems.push(...hexSearchItems);
    this._glyphNamesListFilterFunc = (item) => glyphFilterFunc(item, searchItems);
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

  filterGlyphs(glyphs) {
    return glyphs.filter(this._glyphNamesListFilterFunc);
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

function glyphFilterFunc(item, searchItems) {
  if (!searchItems.length) {
    return true;
  }
  for (const searchItem of searchItems) {
    if (item.glyphName.search(searchItem) >= 0) {
      return true;
    }
    if (item.codePoints[0] !== undefined) {
      const char = String.fromCodePoint(item.codePoints[0]);
      if (searchItem === char) {
        return true;
      }
    }
  }
  return false;
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
