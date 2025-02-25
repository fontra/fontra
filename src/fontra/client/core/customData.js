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
};

// TODO: Based on ufoInfoAttributesToRoundTrip (designspace.py)
//   "openTypeGaspRangeRecords",
//   "openTypeHeadFlags",
//   "openTypeHeadLowestRecPPEM",
//   "openTypeHheaCaretOffset",
//   "openTypeHheaCaretSlopeRise",
//   "openTypeHheaCaretSlopeRun",
//   "openTypeNameRecords",
//   "openTypeOS2FamilyClass",
//   "openTypeOS2SubscriptXOffset",
//   "openTypeOS2SubscriptXSize",
//   "openTypeOS2SubscriptYOffset",
//   "openTypeOS2SubscriptYSize",
//   "openTypeOS2SuperscriptXOffset",
//   "openTypeOS2SuperscriptXSize",
//   "openTypeOS2SuperscriptYOffset",
//   "openTypeOS2SuperscriptYSize",
//   "openTypeVheaCaretOffset",
//   "openTypeVheaCaretSlopeRise",
//   "openTypeVheaCaretSlopeRun",
//   "openTypeVheaVertTypoLineGap",
//   "postscriptDefaultCharacter",
//   "postscriptDefaultWidthX",
//   "postscriptIsFixedPitch",
//   "postscriptNominalWidthX",
//   "postscriptSlantAngle",
//   "postscriptUniqueID",
//   "postscriptWeightName",
//   "postscriptWindowsCharacterSet",
