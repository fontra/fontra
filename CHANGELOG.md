# Changelog for Fontra

## 2025-02-28

Many smaller bugs were fixed:

- Allow menus from the menubar to be opened with click-drag [Issue 2049](https://github.com/googlefonts/fontra/issues/2049) [PR 2060](https://github.com/googlefonts/fontra/pull/2060)
- Paste only plain text in editable list cells [Issue 2043](https://github.com/googlefonts/fontra/issues/2043) [PR 2057](https://github.com/googlefonts/fontra/pull/2057)
- Fix tooltips layout issues [Issue 2050](https://github.com/googlefonts/fontra/issues/2050) [PR 2056](https://github.com/googlefonts/fontra/pull/2056)
- Show warning befor deleting a font source, as this can have deeper consequences than one might think [Issue 2048](https://github.com/googlefonts/fontra/issues/2048) [PR 2055](https://github.com/googlefonts/fontra/pull/2055)
- Improve point deletion if a point is overlapping another, or is a tangent [Issue 2033](https://github.com/googlefonts/fontra/issues/2033) [PR 2035](https://github.com/googlefonts/fontra/pull/2035) [PR 2038](https://github.com/googlefonts/fontra/pull/2038)
- Fix bug where the Italic Angle font source parameter was written as the wrong type [Issue 2036](https://github.com/googlefonts/fontra/issues/2036) [PR 2037](https://github.com/googlefonts/fontra/pull/2037)

## 2025-02-16

- Do not display the "selection bounds" handles if the selection is only a single point [Issue 2022](https://github.com/googlefonts/fontra/issues/2022) [PR 2024](https://github.com/googlefonts/fontra/pull/2024)
- Fix bug in reference font panel [Issue 2011](https://github.com/googlefonts/fontra/issues/2011) [PR 2012](https://github.com/googlefonts/fontra/pull/2012)
- Redesigned the Font Source panel [Issue 1997](https://github.com/googlefonts/fontra/issues/1997) [PR 2007](https://github.com/googlefonts/fontra/pull/2007)
- Added initial support for global guidelines. For now they need to be set in the Font Sources panel. Adding or editing global guidelines in the glyph editor will be implemented later. [Issue 909](https://github.com/googlefonts/fontra/issues/909) [Issue 1963](https://github.com/googlefonts/fontra/issues/1963) [PR 2021](https://github.com/googlefonts/fontra/pull/2021)

## 2025-01-30

- Added support for reading .woff and .woff2 [PR 1999](https://github.com/googlefonts/fontra/pull/1999)

## 2025-01-27

- Misc improvements to the Font Overview
- Added preset glyph sets from Google Fonts, Black Foundry, Adobe and Christoph Koeberlin
- Fixed a bug with point deletion [Issue 1980](https://github.com/googlefonts/fontra/issues/1980), [PR 1981](https://github.com/googlefonts/fontra/pull/1981)

## 2025-01-21

The Font Overview is ready to be used everywhere, including in Fontra Pak. Documentation will follow soon.

It has support for "template glyphsets", that can be chosen from collections of presets, or made from any publically hosted text, .tsv or .csv data. This includes files on GitHub and publically readable Google Docs or Sheets.

There will be further improvements and additions. Ongoing work: [Issue 1886](https://github.com/googlefonts/fontra/issues/1886)

## 2025-01-17

- A change in the URL format: the project identifier is now in the URL query, instead of part of the URL path [Issue 1960](https://github.com/googlefonts/fontra/issues/1960), [PR 1959](https://github.com/googlefonts/fontra/pull/1959)
- Editor tools: right-clicking or control-clicking on a tool with sub-tools will now show the subtools instead of the browser's context menu [Issue 1953](https://github.com/googlefonts/fontra/issues/1953), [PR 1956](https://github.com/googlefonts/fontra/pull/1956)

## 2025-01-14

- Fixed a regression with the Font menu [Issue 1941](https://github.com/googlefonts/fontra/issues/1941), [PR 1942](https://github.com/googlefonts/fontra/pull/1942)
- Fixed a regression with messages from server [PR 1939](https://github.com/googlefonts/fontra/pull/1939)

## 2025-01-06

- Fixed bug related to deleting points [Issue 1910](https://github.com/googlefonts/fontra/issues/1910), [PR 1916](https://github.com/googlefonts/fontra/pull/1916)
- Added robots.txt to HTTP root folder [PR 1905](https://github.com/googlefonts/fontra/pull/1905)
- Small improvements to Related Glyphs & Characters panel (selecting multiple glyphs, keyboard navigation) [PR 1906](https://github.com/googlefonts/fontra/pull/1906)
- Accordion view: alt-click on a header folds/unfolds all items [PR 1901](https://github.com/googlefonts/fontra/pull/1901)
- Implement finding glyph names for code points and code points for glyph names in JS, via a CSV version of GlyphData.xml. This is a performance improvement, and needed for the upcoming Font Overview [PR 1900](https://github.com/googlefonts/fontra/pull/1900)
- Fixed a regression witb CJK Design Frame settings [PR 1883](https://github.com/googlefonts/fontra/pull/1883)
- Fixed a regression with the Knife Tool [PR 1870](https://github.com/googlefonts/fontra/pull/1870)

## 2024-12-19

- Making the interface between server and client more explicit [PR 1863](https://github.com/googlefonts/fontra/pull/1863)
- Fixed editing bug with multiple edit views [PR 1870](https://github.com/googlefonts/fontra/pull/1870)
- Prevent `fontra-copy` and Fontra Pak's "Export as..." to write on top of the source data (as this destroyed the data)
  - `fontra-copy`: [PR 1860](https://github.com/googlefonts/fontra/pull/1860)
  - Fontra Pak: [PR 148](https://github.com/googlefonts/fontra-pak/pull/148)
- Fontra Pak: add button with link to documentation [PR 143](https://github.com/googlefonts/fontra-pak/pull/143)

## 2024-12-04

- Fixes "clean view" (space bar) on Safari [PR 1835](https://github.com/googlefonts/fontra/pull/1835)

## 2024-11-29

- Japanese UI translation (thanks Masaki Ando!)

## 2024-11-28

- Keep the focus on the canvas when clicking icon buttons and (some) list cell buttons [PR 1829](https://github.com/googlefonts/fontra/pull/1829)

## 2024-11-27

- Add 'Add background image' menu to context menu [PR 1827](https://github.com/googlefonts/fontra/pull/1827)
- Fixed bug with colorizing the background image on Safari [PR 1825](https://github.com/googlefonts/fontra/pull/1825)
- Reorganize context menu: put "Edit" items under a sub menu [PR 1824](https://github.com/googlefonts/fontra/pull/1824)
- Fix the Knife tool [PR 1823](https://github.com/googlefonts/fontra/pull/1823)

## 2024-11-20

- Add support for background image colorization [PR 1815](https://github.com/googlefonts/fontra/pull/1815)

## 2024-11-18

New feature: background images.

A background image can be added to a glyph in three ways:

- Paste image data
- Drop an image file onto the canvas
- Choose an image file from the user's hard drive, with the "Glyph" -> "Add background image..." menu.

The image file or data can be in PNG or JPEG format.

The glyph needs to be in edit mode, and at a selected source (not at an interpolation).

Fontra's background image feature is mostly compatible with UFO background images, although it doesn't implement UFO's colorization feature yet. Fontra does allow the opacity of the image to be set.

Background images are locked by default, and can be unlocked with the "Unlock background images" context menu item.

Selected background images can be moved around by dragging, and they participate in the Selection Transformation panel's operations.

The Selection Info panel shows the settings for a selected background image: the Opacity can be edited there and the Transformation settings can be edited numerically there.

Caveat: support for background images is limited to the `.designspace`/`.ufo` and `.fontra` backends. It is currently not supported in the `rcjk` backend.

[Issue 1660](https://github.com/googlefonts/fontra/issues/1660), [Issue 1777](https://github.com/googlefonts/fontra/issues/1777) (There were too many PRs to mention individually here.)

## 2024-11-13

- Improved UI translations [PR 1764](https://github.com/googlefonts/fontra/pull/1764)
- Added "Select previous/next glyph" menu items [PR 1706](https://github.com/googlefonts/fontra/pull/1706)
- Partial support for background images (more to come) [PR 1775](https://github.com/googlefonts/fontra/pull/1775)
- Add support for many UFO font info fields, so they won't get lost during round-tripping [PR 1770](https://github.com/googlefonts/fontra/pull/1770)
- Fixed cosmetic issue with scrollbars on Windows [PR 1767](https://github.com/googlefonts/fontra/pull/1767)
- Fixed bug with Copy/Paste menu items [PR 1756](https://github.com/googlefonts/fontra/pull/1756)

## 2024-10-24

- Various improvements to the font sources panel [PR 1739](https://github.com/googlefonts/fontra/pull/1739)
- Add changelog file [PR 1749](https://github.com/googlefonts/fontra/pull/1749)

## 2024-10-23

- New cross-axis mapping page for avar2 mappings [PR 1729](https://github.com/googlefonts/fontra/pull/1729)
- Allow custom shortcuts for selecting previous/next reference font [PR 1742](https://github.com/googlefonts/fontra/pull/1742)

## 2024-10-16

- New pen tool icon [PR 1726](https://github.com/googlefonts/fontra/pull/1726)

## 2024-10-14

- New languages: French, Dutch, German

## 2024-10-13

- Fontra Pak: build macOS application as "Universal2" binary, so it runs natively on all processor types [Fontra Pak PR 108](https://github.com/googlefonts/fontra-pak/pull/108)

## 2024-10-12

- Delete gear panel (move to difference locations, for example: View -> Glyph editor apperance) [PR 1701](https://github.com/googlefonts/fontra/pull/1701)

## 2024-10-10

- Fontra Pak: added "Export as..." functionality [Fontra Pak PR 133](https://github.com/googlefonts/fontra-pak/pull/133)

## 2024-09-27

- Shape tool (rectangle, ellipse)
- Knife tool

### New editor features

- Interactive transformation (scale, rotate)
- Glyph level guidelines
- Close/Join contours
- Anchors
- Glyph locking

### New panels

- Development status definitions panel (colors)
- Sources panel (Global sources editor)
- Shortcuts panel

### New sidebars

- Selection Transformation
  - transform objects (move, scale, rotate, skew)
  - Align and distribute objects
  - Path operations like remove overlaps
- Glyph Notes
- Related Glyphs & Characters

### New visualizations

- Line metrics
- Development status color
- Transform selection
- Guidelines
- Component nodes and handles
- Anchor names
- Contour indices
- Component names and indices
- Coordinates
- Point indices
- Glyph lock icon for non-editing glyphs

### Misc

- UI Translation (Chinese and English)

## 2024-03-01

- Fontra Pak: Create new font
- Menu bar
- Axis editor
  - Mapping (graph + list)
  - Axis value labels
  - Discrete axis
  - Axis reordering
- side bearings
- shift click
