import { getCodePointFromGlyphName, getSuggestedGlyphName } from "./glyph-data.js";

export const glyphSetDataFormats = [
  {
    value: "glyph-names",
    label: "Glyph names (whitespace-separated)",
  },
  {
    value: "tsv/csv",
    label: "TSV/CSV (tab-, comma-, or semicolon-separated)",
  },
];

export function parseGlyphSet(sourceData, dataFormat, dataOptions) {
  const sourceLines = sourceData.split(/\r?\n/);

  switch (dataFormat) {
    case "glyph-names":
      return parseGlyphSetGlyphNames(sourceLines, dataOptions);
    case "tsv/csv":
      return parseGlyphSetGlyphTable(sourceLines, dataOptions);
    default:
      throw new Error(`unknown data format: ${dataFormat}`);
  }
}

function parseGlyphSetGlyphNames(sourceLines, dataOptions) {
  const glyphSet = [];

  for (let line of sourceLines) {
    line = stripLineComments(line, dataOptions?.commentChars);
    line = line.trim();
    if (!line) {
      continue;
    }

    for (const glyphName of line.split(/\s+/)) {
      const codePoint = getCodePointFromGlyphName(glyphName);
      glyphSet.push({ glyphName, codePoints: codePoint ? [codePoint] : [] });
    }
  }

  return glyphSet;
}

function parseGlyphSetGlyphTable(sourceLines, dataOptions) {
  const rowSeparator = guessRowSeparator(sourceLines.slice(0, 200));

  let tableHeader;
  let glyphNameColumnIndex = parseInt(dataOptions.glyphNameColumn);
  let codePointColumnIndex = parseInt(dataOptions.codePointColumn);
  if (!dataOptions.hasHeader) {
    // If we don't have a header, we should at least have an index for the
    // code point column OR the glyph name column
    if (isNaN(glyphNameColumnIndex) && isNaN(codePointColumnIndex)) {
      throw new Error(
        `invalid glyph name column and/or code point column:
        “${dataOptions.glyphNameColumn}” / “${dataOptions.codePointColumn}”.

        Without a table header, these values must be zero-based indices.`
      );
    }
  }

  const glyphSet = [];
  for (let line of sourceLines) {
    line = stripLineComments(line, dataOptions?.commentChars);

    const row = line.split(rowSeparator).map((item) => item.trim());
    if (!tableHeader && dataOptions.hasHeader) {
      tableHeader = row;

      if (isNaN(glyphNameColumnIndex) && dataOptions.glyphNameColumn) {
        glyphNameColumnIndex = tableHeader.indexOf(dataOptions.glyphNameColumn);
        if (glyphNameColumnIndex < 0) {
          throw new Error(`invalid glyphNameColumn: ${dataOptions.glyphNameColumn}`);
        }
      }

      if (isNaN(codePointColumnIndex) && dataOptions.codePointColumn) {
        codePointColumnIndex = tableHeader.indexOf(dataOptions.codePointColumn);
        if (codePointColumnIndex < 0) {
          throw new Error(`invalid codePointColumn: ${dataOptions.codePointColumn}`);
        }
      }
      continue;
    }

    let glyphName = row[glyphNameColumnIndex];
    let codePoint;

    let codePointCell = row[codePointColumnIndex];
    if (codePointCell) {
      if (dataOptions.codePointIsDecimal) {
        codePoint = parseInt(codePointCell);
      } else {
        // Hex
        if (codePointCell.startsWith("U+") || codePointCell.startsWith("0x")) {
          codePointCell = codePointCell.slice(2);
        }
        codePoint = parseInt(codePointCell, 16);
      }
    }

    if (!glyphName && !codePoint) {
      continue;
    }
    if (!glyphName) {
      glyphName = getSuggestedGlyphName(codePoint);
    } else if (!codePoint) {
      codePoint = getCodePointFromGlyphName(glyphName);
    }

    glyphSet.push({ glyphName, codePoints: codePoint ? [codePoint] : [] });
  }

  return glyphSet;
}

function stripLineComments(line, commentChars) {
  for (const commentChar of commentChars || "") {
    const commentIndex = line.indexOf(commentChar);
    if (commentIndex >= 0) {
      line = line.slice(0, commentIndex);
    }
  }
  return line;
}

function guessRowSeparator(lines) {
  let tabCount = 0;
  let commaCount = 0;
  let semiColonCount = 0;
  for (const line of lines) {
    for (const char of line) {
      switch (char) {
        case "\t":
          tabCount++;
          break;
        case ",":
          commaCount++;
          break;
        case ";":
          semiColonCount++;
          break;
      }
    }
  }
  if (tabCount > commaCount && tabCount > semiColonCount) {
    return "\t";
  } else if (commaCount > semiColonCount) {
    return ",";
  }
  return ";";
}

function redirectGoogleSheets(url) {
  return redirectGoogleDocsOrSheets(url, "spreadsheets", "csv");
}

function redirectGoogleDocs(url) {
  return redirectGoogleDocsOrSheets(url, "document", "txt");
}

function redirectGoogleDocsOrSheets(url, kind, exportFormat) {
  const pathItems = url.pathname.split("/");
  if (
    url.hostname === "docs.google.com" &&
    pathItems[1] === kind &&
    pathItems.at(-1) === "edit"
  ) {
    pathItems.pop();
    pathItems.push("export");
    url.pathname = pathItems.join("/");
    url.searchParams.set("format", exportFormat);
    return url;
  }
  return null;
}

function redirectGitHubToJSDelivr(url) {
  const pathItems = url.pathname.split("/");
  if (url.hostname === "github.com" && pathItems[3] === "blob") {
    const org = pathItems[1];
    const repo = pathItems[2];
    const version = pathItems[4];
    const path = pathItems.slice(5).join("/");
    return new URL(`https://cdn.jsdelivr.net/gh/${org}/${repo}@${version}/${path}`);
  }
  return null;
}

const redirectors = [
  redirectGoogleSheets,
  redirectGoogleDocs,
  redirectGitHubToJSDelivr,
];

export function redirectGlyphSetURL(url) {
  url = new URL(url);
  for (const redirect of redirectors) {
    const newURL = redirect(url);
    if (newURL) {
      return newURL;
    }
  }
  return url;
}
