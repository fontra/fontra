import {
  BooleanFormatter,
  NumberArrayFormatter,
  PanoseArrayFormatter,
  _NumberFormatter,
} from "./formatters.js";

function getAscenderDefault(fontSource = undefined) {
  return fontSource.lineMetricsHorizontalLayout.ascender.value || 800;
}

function getDescenderDefault(fontSource = undefined) {
  return fontSource.lineMetricsHorizontalLayout.descender.value || -200;
}

function getDescenderWinDefault(fontSource = undefined) {
  return fontSource.lineMetricsHorizontalLayout.descender.value * -1 || 200;
}

function getFamilyNameDefault(fontSource = undefined) {
  return fontSource.familyName || "Family Name";
}

function getSubfamilyNameDefault(fontSource = undefined) {
  return fontSource.name || "Subfamily Name";
}

function getstrikeoutPositionDefault(fontSource = undefined) {
  return fontSource.lineMetricsHorizontalLayout.ascender.value / 2 || 250;
}

function getCreatedDefault() {
  // Note: UTC might differ from your local time.
  const date = new Date();

  const YYYY = date.getUTCFullYear();
  const MM = String(date.getUTCMonth() + 1).padStart(2, "0");
  const DD = String(date.getUTCDate()).padStart(2, "0");

  const HH = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const SS = String(date.getUTCSeconds()).padStart(2, "0");

  return `${YYYY}/${MM}/${DD} ${HH}:${mm}:${SS}`; // "YYYY/MM/DD HH:MM:SS"
}

export const customDataNameMapping = {
  // verticl metrics values
  openTypeHheaAscender: { default: getAscenderDefault, formatter: _NumberFormatter },
  openTypeHheaDescender: { default: getDescenderDefault, formatter: _NumberFormatter },
  openTypeHheaLineGap: { default: () => 0, formatter: _NumberFormatter },
  openTypeOS2TypoAscender: { default: getAscenderDefault, formatter: _NumberFormatter },
  openTypeOS2TypoDescender: {
    default: getDescenderDefault,
    formatter: _NumberFormatter,
  },
  openTypeOS2TypoLineGap: { default: () => 0, formatter: _NumberFormatter },
  openTypeOS2WinAscent: { default: getAscenderDefault, formatter: _NumberFormatter },
  openTypeOS2WinDescent: {
    default: getDescenderWinDefault,
    formatter: _NumberFormatter,
  },
  postscriptUnderlinePosition: { default: () => -100, formatter: _NumberFormatter },
  postscriptUnderlineThickness: { default: () => 50, formatter: _NumberFormatter },
  openTypeOS2StrikeoutPosition: {
    default: getstrikeoutPositionDefault,
    formatter: _NumberFormatter,
  },
  openTypeOS2StrikeoutSize: { default: () => 50, formatter: _NumberFormatter },
  // name table entries
  openTypeNameUniqueID: { default: () => "uniqueID Name ID 3" }, // Name ID 3
  openTypeNameVersion: { default: () => "Version 1.0" }, // Name ID 7
  openTypeNamePreferredFamilyName: { default: getFamilyNameDefault }, // Name ID 16
  openTypeNamePreferredSubfamilyName: { default: getSubfamilyNameDefault }, // Name ID 17
  openTypeNameCompatibleFullName: { default: () => "Compatible Full Name" }, // Name ID 18
  openTypeNameWWSFamilyName: { default: getFamilyNameDefault }, // Name ID 21
  openTypeNameWWSSubfamilyName: { default: getSubfamilyNameDefault }, // Name ID 22
  // misc
  openTypeOS2WeightClass: { default: () => 400, formatter: _NumberFormatter },
  openTypeOS2WidthClass: { default: () => 5, formatter: _NumberFormatter },
  openTypeHeadCreated: { default: getCreatedDefault }, // The timezone is UTC.
  openTypeOS2Selection: { default: () => [], formatter: NumberArrayFormatter }, // 7 = Use Typo Metrics, 8 = has WWS name, https://github.com/fonttools/fonttools/blob/598b974f87f35972da24e96e45bd0176d18930a0/Lib/fontTools/ufoLib/__init__.py#L1889
  openTypeOS2Type: { default: () => [3], formatter: NumberArrayFormatter }, // https://github.com/googlefonts/glyphsLib/blob/c4db6b981d577f456d64ebe9993818770e170454/Lib/glyphsLib/builder/custom_params.py#L1166
  openTypeOS2Panose: {
    default: () => [2, 11, 5, 2, 4, 5, 4, 2, 2, 4],
    formatter: PanoseArrayFormatter,
  }, // default: sans-serif
  openTypeOS2FamilyClass: { default: () => [8, 0], formatter: NumberArrayFormatter }, // Class ID 8 = Sans Serif, Subclass ID = 0: No Classification
  openTypeOS2UnicodeRanges: { default: () => [], formatter: NumberArrayFormatter },
  openTypeOS2CodePageRanges: { default: () => [], formatter: NumberArrayFormatter },
  // Postscript Font Level Hints, // https://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf
  postscriptBlueValues: { default: () => [], formatter: NumberArrayFormatter },
  postscriptOtherBlues: { default: () => [], formatter: NumberArrayFormatter },
  postscriptFamilyBlues: { default: () => [], formatter: NumberArrayFormatter },
  postscriptFamilyOtherBlues: { default: () => [], formatter: NumberArrayFormatter },
  postscriptBlueScale: { default: () => 0.039625, formatter: _NumberFormatter },
  postscriptBlueShift: { default: () => 1, formatter: _NumberFormatter },
  postscriptBlueFuzz: { default: () => 1, formatter: _NumberFormatter },
  postscriptStemSnapH: { default: () => [], formatter: NumberArrayFormatter },
  postscriptStemSnapV: { default: () => [], formatter: NumberArrayFormatter },
  postscriptForceBold: { default: () => false, formatter: BooleanFormatter },
  // PostScript Specific Data
  // postscriptFontName // NOTE: not in ufoInfoAttributesToRoundTrip
  // postscriptFullName // NOTE: not in ufoInfoAttributesToRoundTrip
  postscriptSlantAngle: { default: () => 0.0, formatter: _NumberFormatter },
  postscriptUniqueID: { default: () => 0, formatter: _NumberFormatter },
  postscriptWeightName: { default: () => "postscriptWeightName" },
  postscriptIsFixedPitch: { default: () => false, formatter: BooleanFormatter }, // Indicates if the font is monospaced.
  postscriptDefaultWidthX: { default: () => 0, formatter: _NumberFormatter },
  postscriptNominalWidthX: { default: () => 0, formatter: _NumberFormatter },
  postscriptDefaultCharacter: { default: () => "glyphName" }, // 	The name of the glyph that should be used as the default character in PFM files.
  postscriptWindowsCharacterSet: { default: () => 0, formatter: _NumberFormatter },
  // OpenType vhea Table Fields
  // openTypeVheaVertTypoAscender  // NOTE: not in ufoInfoAttributesToRoundTrip
  // openTypeVheaVertTypoDescender  // NOTE: not in ufoInfoAttributesToRoundTrip
  openTypeVheaVertTypoLineGap: { default: () => 0, formatter: _NumberFormatter },
  openTypeVheaCaretSlopeRise: { default: () => 0, formatter: _NumberFormatter },
  openTypeVheaCaretSlopeRun: { default: () => 0, formatter: _NumberFormatter },
  openTypeVheaCaretOffset: { default: () => 0, formatter: _NumberFormatter },
  // OpenType hhea Table Fields
  openTypeHheaCaretSlopeRise: { default: () => 0, formatter: _NumberFormatter },
  openTypeHheaCaretSlopeRun: { default: () => 0, formatter: _NumberFormatter },
  openTypeHheaCaretOffset: { default: () => 0, formatter: _NumberFormatter },
  // OpenType OS/2 Table Fields
  openTypeOS2SubscriptXSize: { default: () => 0, formatter: _NumberFormatter },
  openTypeOS2SubscriptYSize: { default: () => 0, formatter: _NumberFormatter },
  openTypeOS2SubscriptXOffset: { default: () => 0, formatter: _NumberFormatter },
  openTypeOS2SubscriptYOffset: { default: () => 0, formatter: _NumberFormatter },
  openTypeOS2SuperscriptXSize: { default: () => 0, formatter: _NumberFormatter },
  openTypeOS2SuperscriptYSize: { default: () => 0, formatter: _NumberFormatter },
  openTypeOS2SuperscriptXOffset: { default: () => 0, formatter: _NumberFormatter },
  openTypeOS2SuperscriptYOffset: { default: () => 0, formatter: _NumberFormatter },
  // OpenType OS/2 Table Fields
  openTypeHeadLowestRecPPEM: { default: () => 6, formatter: _NumberFormatter }, // Smallest readable size in pixels.
  openTypeHeadFlags: { default: () => [], formatter: NumberArrayFormatter },
};

// TODO: Based on ufoInfoAttributesToRoundTrip (designspace.py)
//   "openTypeGaspRangeRecords", // TODO: This is more complex, please see: https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-gasp-table-fields
//   "openTypeNameRecords", // TODO: This is more complex, please see: https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#name-record-format
