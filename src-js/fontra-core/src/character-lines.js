import { getCodePointFromGlyphName, getSuggestedGlyphName } from "./glyph-data.js";
import { splitGlyphNameExtension } from "./utils.js";

export function characterLinesFromString(
  string,
  characterMap,
  glyphMap,
  substituteGlyphName
) {
  const characterLines = [];
  for (const line of string.split(/\r?\n/)) {
    characterLines.push(
      characterLineFromSingleLineString(
        line,
        characterMap,
        glyphMap,
        substituteGlyphName
      )
    );
  }
  return characterLines;
}

const glyphNameRE = /[//\s]/g;

function characterLineFromSingleLineString(
  string,
  characterMap,
  glyphMap,
  substituteGlyphName
) {
  const characterInfo = [];

  for (let i = 0; i < string.length; i++) {
    let glyphName;
    let character = string[i];
    let isPlaceholder = false;
    if (character == "/") {
      i++;
      if (string[i] == "/") {
        glyphName = characterMap[character.charCodeAt(0)];
      } else if (string[i] == "?") {
        glyphName = substituteGlyphName || "--placeholder--";
        character = charFromGlyphName(glyphName, characterMap, glyphMap);
        isPlaceholder = true;
      } else {
        glyphNameRE.lastIndex = i;
        glyphNameRE.test(string);
        let j = glyphNameRE.lastIndex;
        if (j == 0) {
          glyphName = string.slice(i);
          i = string.length - 1;
        } else {
          j--;
          glyphName = string.slice(i, j);
          if (string[j] == "/") {
            i = j - 1;
          } else {
            i = j;
          }
        }
        character = charFromGlyphName(glyphName, characterMap, glyphMap);
        if (glyphName && !character && !glyphMap[glyphName]) {
          // See if the "glyph name" after stripping the extension (if any)
          // happens to be a character that we know a glyph name for.
          // This allows us to write /Å.alt instead of /Aring.alt in the
          // text entry field.
          const [baseGlyphName, extension] = splitGlyphNameExtension(glyphName);
          const baseCodePoint = baseGlyphName.codePointAt(0);
          const charString = String.fromCodePoint(baseCodePoint);
          if (baseGlyphName === charString && !isPlainLatinLetter(baseGlyphName)) {
            // The base glyph name is a single character, let's see if there's
            // a glyph name associated with that character
            let properBaseGlyphName = characterMap[baseCodePoint];
            if (!properBaseGlyphName) {
              properBaseGlyphName = getSuggestedGlyphName(baseCodePoint);
            }
            if (properBaseGlyphName) {
              glyphName = properBaseGlyphName + extension;
              if (!extension) {
                character = charString;
              }
            }
          } else {
            // This is a regular glyph name, but it doesn't exist in the font.
            // Try to see if there's a code point associated with it.
            const codePoint = getCodePointFromGlyphName(glyphName);
            if (codePoint) {
              character = String.fromCodePoint(codePoint);
            }
          }
        }
      }
    } else {
      const codePoint = string.codePointAt(i);
      glyphName = characterMap[codePoint];
      if (codePoint >= 0x10000) {
        i++;
      }
      character = String.fromCodePoint(codePoint);
    }
    if (glyphName !== "") {
      let isUndefined = false;
      if (!glyphName && character) {
        glyphName = getSuggestedGlyphName(character.codePointAt(0));
        isUndefined = true;
      } else if (glyphName) {
        isUndefined = !(glyphName in glyphMap);
      }

      characterInfo.push({ character, glyphName, isUndefined, isPlaceholder });
    }
  }

  return characterInfo;
}

export function stringFromCharacterLines(characterLines) {
  const textLines = [];
  for (const characterLine of characterLines) {
    let textLine = "";
    for (let i = 0; i < characterLine.length; i++) {
      const glyphInfo = characterLine[i];
      if (glyphInfo.isPlaceholder) {
        textLine += "/?";
      } else if (glyphInfo.character === "/") {
        // special-case slash, since it is the glyph name indicator character,
        // and needs to be escaped
        textLine += "//";
      } else if (glyphInfo.character) {
        textLine += glyphInfo.character;
      } else {
        textLine += "/" + glyphInfo.glyphName;
        if (characterLine[i + 1]?.character) {
          textLine += " ";
        }
      }
    }
    textLines.push(textLine);
  }
  return textLines.join("\n");
}

function isPlainLatinLetter(glyphName) {
  return glyphName.match(/^[A-Za-z]$/);
}

function charFromGlyphName(glyphName, characterMap, glyphMap) {
  var char = undefined;
  for (const codePoint of glyphMap[glyphName] || []) {
    if (characterMap[codePoint] === glyphName) {
      char = String.fromCodePoint(codePoint);
      break;
    }
  }
  return char;
}
