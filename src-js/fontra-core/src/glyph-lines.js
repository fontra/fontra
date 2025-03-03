import { getCodePointFromGlyphName, getSuggestedGlyphName } from "./glyph-data.js";
import { splitGlyphNameExtension } from "./utils.js";

export function glyphLinesFromText(text, characterMap, glyphMap) {
  const glyphLines = [];
  for (const line of text.split(/\r?\n/)) {
    glyphLines.push(glyphNamesFromText(line, characterMap, glyphMap));
  }
  return glyphLines;
}

const glyphNameRE = /[//\s]/g;

function glyphNamesFromText(text, characterMap, glyphMap) {
  const glyphNames = [];
  for (let i = 0; i < text.length; i++) {
    let glyphName;
    let char = text[i];
    if (char == "/") {
      i++;
      if (text[i] == "/") {
        glyphName = characterMap[char.charCodeAt(0)];
      } else {
        glyphNameRE.lastIndex = i;
        glyphNameRE.test(text);
        let j = glyphNameRE.lastIndex;
        if (j == 0) {
          glyphName = text.slice(i);
          i = text.length - 1;
        } else {
          j--;
          glyphName = text.slice(i, j);
          if (text[j] == "/") {
            i = j - 1;
          } else {
            i = j;
          }
        }
        char = undefined;
        for (const codePoint of glyphMap[glyphName] || []) {
          if (characterMap[codePoint] === glyphName) {
            char = String.fromCodePoint(codePoint);
            break;
          }
        }
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
      const charCode = text.codePointAt(i);
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
      glyphNames.push({
        character: char,
        glyphName: glyphName,
        isUndefined: isUndefined,
      });
    }
  }
  return glyphNames;
}

export function textFromGlyphLines(glyphLines) {
  const textLines = [];
  for (const glyphLine of glyphLines) {
    let textLine = "";
    for (let i = 0; i < glyphLine.length; i++) {
      const glyphInfo = glyphLine[i];
      if (glyphInfo.character === "/") {
        // special-case slash, since it is the glyph name indicator character,
        // and needs to be escaped
        textLine += "//";
      } else if (glyphInfo.character) {
        textLine += glyphInfo.character;
      } else {
        textLine += "/" + glyphInfo.glyphName;
        if (glyphLine[i + 1]?.character) {
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
