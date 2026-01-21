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
    let char = string[i];
    let isPlaceholder = false;
    if (char == "/") {
      i++;
      if (string[i] == "/") {
        glyphName = characterMap[char.charCodeAt(0)];
      } else if (string[i] == "?") {
        glyphName = substituteGlyphName || "--placeholder--";
        char = charFromGlyphName(glyphName, characterMap, glyphMap);
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
        char = charFromGlyphName(glyphName, characterMap, glyphMap);
        if (glyphName && !char && !glyphMap[glyphName]) {
          // See if the "glyph name" after stripping the extension (if any)
          // happens to be a character that we know a glyph name for.
          // This allows us to write /Å.alt instead of /Aring.alt in the
          // text entry field.
          const [baseGlyphName, extension] = splitGlyphNameExtension(glyphName);
          const baseCharCode = baseGlyphName.codePointAt(0);
          const charString = String.fromCodePoint(baseCharCode);
          if (baseGlyphName === charString && !isPlainLatinLetter(baseGlyphName)) {
            // The base glyph name is a single character, let's see if there's
            // a glyph name associated with that character
            let properBaseGlyphName = characterMap[baseCharCode];
            if (!properBaseGlyphName) {
              properBaseGlyphName = getSuggestedGlyphName(baseCharCode);
            }
            if (properBaseGlyphName) {
              glyphName = properBaseGlyphName + extension;
              if (!extension) {
                char = charString;
              }
            }
          } else {
            // This is a regular glyph name, but it doesn't exist in the font.
            // Try to see if there's a code point associated with it.
            const codePoint = getCodePointFromGlyphName(glyphName);
            if (codePoint) {
              char = String.fromCodePoint(codePoint);
            }
          }
        }
      }
    } else {
      const charCode = string.codePointAt(i);
      glyphName = characterMap[charCode];
      if (charCode >= 0x10000) {
        i++;
      }
      char = String.fromCodePoint(charCode);
    }
    if (glyphName !== "") {
      let isUndefined = false;
      if (!glyphName && char) {
        glyphName = getSuggestedGlyphName(char.codePointAt(0));
        isUndefined = true;
      } else if (glyphName) {
        isUndefined = !(glyphName in glyphMap);
      }

      characterInfo.push({
        character: char,
        glyphName: glyphName,
        isUndefined: isUndefined,
        isPlaceholder: isPlaceholder,
      });
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
