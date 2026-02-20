# Changelog for Fontra

## 2026-02-?? [version 2026.3.0]

- [fontra-glyphs] Add support for right-to-left kerning [fontra-glyphs PR 124](https://github.com/fontra/fontra-glyphs/pull/124)
- [selection info / dimensions field] When a single off-curve point is selected, show the dimensions of the handle instead of (0, 0). Suggested by Aleksandra Samuļenkova. [PR 2418](https://github.com/fontra/fontra/pull/2418)
- [designspace/ufo] Fix reading and writing of right-to-left kerning. [PR 2416](https://github.com/fontra/fontra/pull/2416), [PR 2417](https://github.com/fontra/fontra/pull/2417)
- Fix a bug in anchor sorting, so inconsistently ordered anchors can now really be interpolated. This fixes a bug in the previous attempt to fix this. [PR 2415](https://github.com/fontra/fontra/pull/2415)
- [fontra-glyphs] When reading OpenType features, expand include statements and Glyphs-specific dynamic feature syntax into traditional feature syntax. [fontra-glyphs PR 123](https://github.com/fontra/fontra-glyphs/pull/123)
- [fontra-glyphs] Accept invalid OpenType feature code, as this is inevitable when editing, given Fontra's autosave nature. [fontra-glyphs PR 122](https://github.com/fontra/fontra-glyphs/pull/122)
- Ignore component custom data when interpolating. This fixes interpolation for .glyphs files that have inconsistent component align settings. [PR 2409](https://github.com/fontra/fontra/pull/2409)
- Make the topic list of the application settings and font info views foldable. [PR 2408](https://github.com/fontra/fontra/pull/2408)
- Fix minor layout bug in glyph sets UI. [Commit b292d8ee](https://github.com/fontra/fontra/commit/b292d8ee980438a4152da8d3af1b8fb5408f2f75)

## 2026-02-03 [version 2026.2.0]

- [ufo] Fix creating a single-UFO project. [PR 2405](https://github.com/fontra/fontra/pull/2405)
- [designspace/ufo] Fix regression in editing OpenType features, caused by unneeded reloading. [PR 2404](https://github.com/fontra/fontra/pull/2404)
- [opentype backend] When reading TrueType or OpenType, setup font sources, so we can see the line metrics in the editor, and so that glyph sources will reference font sources where possible. [Issue 2399](https://github.com/fontra/fontra/issues/2399), [PR 2401](https://github.com/fontra/fontra/pull/2401)
- [opentype backend] When reading TrueType or OpenType, use the user-visible axis ranges instead of normalized values for glyph source locations. [PR 2398](https://github.com/fontra/fontra/pull/2398)

## 2026-01-24 [version 2026.1.3]

- [designspace] Fix a writing failure when multiple glyphs use the same layer name but for different locations. [Issue 2393](https://github.com/fontra/fontra/issues/2393), [PR 2394](https://github.com/fontra/fontra/pull/2394)
- [designspace] Fix writing the `italicAngle` property to source UFOs. [Issue 2386](https://github.com/fontra/fontra/issues/2386), [PR 2389](https://github.com/fontra/fontra/pull/2389)

## 2026-01-15 [version 2026.1.2]

- [designspace] Fix a synchronization problem when doing Undo/Redo faster than the backend handles writing the changed glyphs. This would be most noticable with a multiple-glyph selection in the font overview and a complex designspace, where each glyph is represented by many .glif files on disk. [PR 2374](https://github.com/fontra/fontra/pull/2374)

## 2026-01-12 [version 2026.1.1]

- Add read support for .ttx [PR 2372](https://github.com/fontra/fontra/pull/2372)
- Implement automatic reload for .ttf/.otf/.woff/.woff2/.ttx [PR 2372](https://github.com/fontra/fontra/pull/2372)

## 2026-01-11 [version 2026.1.0]

### Font overview

- Implement copy/paste, with multi-glyph selection. [Issue 2356](https://github.com/fontra/fontra/issues/2356), [PR 2366](https://github.com/fontra/fontra/pull/2366), [PR 2369](https://github.com/fontra/fontra/pull/2369), [PR 2367](https://github.com/fontra/fontra/pull/2367), [PR 2370](https://github.com/fontra/fontra/pull/2370)
- Implement glyph deletion, added context menu, implement "select all" and "select none". [Issue 2354](https://github.com/fontra/fontra/issues/2354), [PR 2355](https://github.com/fontra/fontra/pull/2355)

### Responding to external changes

- [fontra-glyphs] Respond to external changes. [fontra-glyphs Issue 117](https://github.com/fontra/fontra-glyphs/issues/117), [fontra-glyphs PR 118](https://github.com/fontra/fontra-glyphs/pull/118), [fontra-glyphs PR 119](https://github.com/fontra/fontra-glyphs/pull/119).
- [designspace] Respond to more external changes: font info, kerning, groups, features, encoding/cmap changes [Issue 2360](https://github.com/fontra/fontra/issues/2360), [Issue 2338](https://github.com/fontra/fontra/issues/2338), [PR 2361](https://github.com/fontra/fontra/pull/2361)
- [.fontra backend] Respond to external changes. [Issue 1872](https://github.com/fontra/fontra/issues/1872), [PR 2364](https://github.com/fontra/fontra/pull/2364)
- [.ufo .fontra] Reload when a .ufo or .fontra folder gets replaced externally. [PR 2368](https://github.com/fontra/fontra/pull/2368)

### Miscellaneous

- [editor] Reworked "paste" logic so it works better in Firefox and Safari. [Issue 2339](https://github.com/fontra/fontra/issues/2339), [PR 2367](https://github.com/fontra/fontra/pull/2367)
- [designspace] Maintain glyph order when re-adding a previously deleted glyph. [PR 2357](https://github.com/fontra/fontra/pull/2357)
- [fontra-glyphs] Maintain glyph order when re-adding a previously deleted glyph. [fontra-glyphs PR 115](https://github.com/fontra/fontra-glyphs/pull/115)
- [fontra-glyphs] Fix kerning group behavior when deleting a glyph and re-adding it. [fontra-glyphs PR 116](https://github.com/fontra/fontra-glyphs/pull/116)
- [editor] Moved the menu items that are also part of the context menu from the Edit menu to the Glyph menu, where they make more sense. This also fixes a menu redundancy. [Issue 1833](https://github.com/fontra/fontra/issues/1833), [PR 2371](https://github.com/fontra/fontra/pull/2371)

## 2025-12-30 [version 2025.12.6]

- [fontra pak] Fix update detection mechanism on MacOS.

## 2025-12-30 [version 2025.12.5]

- [font overview] Implement dragging in the glyph cell view to quickly select ranges. [PR 2350](https://github.com/fontra/fontra/pull/2350)
- [font overview] Fix arrow key up/down behavior to not skip lines that are shorter than the current position. [PR 2351](https://github.com/fontra/fontra/pull/2351)
- [opentype feature editor] Fix scrolling behavior in the OpenType feature editor. [Issue 2345](https://github.com/fontra/fontra/issues/2345)
- [designspace] Write OpenType features only to the default source, write empty features to the other sources. When applicable, add a warning to the feature text to inform about Fontra's current destructive behavior when editing features. [PR 2346](https://github.com/fontra/fontra/pull/2346)

## 2025-12-19 [version 2025.12.4]

- Accept differently ordered anchor lists when interpolating. This matches fontmake's behavior. [PR 2344](https://github.com/fontra/fontra/pull/2344)
- Fix buggy behavior when trying to add an axis to a UFO. [Issue 1142](https://github.com/fontra/fontra/issues/1142), [PR 2343](https://github.com/fontra/fontra/pull/2343)
- Fix bad shortcut key repeat behavior [Issue 1930](https://github.com/fontra/fontra/issues/1930), [PR 2342](https://github.com/fontra/fontra/pull/2342)
- [font overview] Fix odd selection behavior when using both shift-click and command-click. [Issue 2034](https://github.com/fontra/fontra/issues/2034), [PR 2341](https://github.com/fontra/fontra/pull/2341)
- [fontra pak] When quitting, prompt the user if there are still open fonts. [fontra-pak Issue 195](https://github.com/fontra/fontra-pak/issues/195), [fontra-pak PR 206](https://github.com/fontra/fontra-pak/pull/206)

## 2025-12-13 [version 2025.12.3]

- [fontra-pak ubuntu] Make sure the binary for Ubuntu is executable. [fontra-pak PR 205](https://github.com/fontra/fontra-pak/pull/205)
- [shape tool] Fix the stroke color when dragging a new shape in dark mode. [commit](https://github.com/fontra/fontra/commit/a7d58f8437b7da8540541f11964841ffcba8b470)

## 2025-12-05 [version 2025.12.2]

- [fontra-pak] Add a binary for Linux to the release. Contributed by Dr Anirban Mitra. [fontra-pak PR 203](https://github.com/fontra/fontra-pak/pull/203)
- [designspace] Fixed a bug where Fontra would create an invalid UFO when opening a .designspace file that refers to a non-existent UFO. [Issue 2335](https://github.com/fontra/fontra/issues/2335), [PR 2336](https://github.com/fontra/fontra/pull/2336)

## 2025-12-03 [version 2025.12.1]

- Fixed two regressions with the font sources panel and designspace files that were introduced with version `2025.12.0` ([PR 2333](https://github.com/fontra/fontra/pull/2333)):
  - Fix "unknown kerning identifier" error when creating a new font source
  - Fix warning when a sparse (designspace) source cannot be made not sparse

## 2025-12-02 [version 2025.12.0]

- [editor] Fix UI glitch where "select all" could unexpectedly cause all UI text to be selected instead of doing "select all" in the editor. [PR 2332](https://github.com/fontra/fontra/pull/2332)
- [font sources] Prompt the user with a warning when toggling the "Is sparse" source checkbox. Part of [PR 2331](https://github.com/fontra/fontra/pull/2331).
- [kerning] Various kerning improvements ([PR 2324](https://github.com/fontra/fontra/pull/2324)):
  - Bring Fontra's kerning behavior in line with how fontmake treats designspace/ufo: every non-sparse source participates, falling back to zeros when values are missing
  - Fix a bug that allowed adding kerning to sparse sources
  - Improve "insert interpolated kerning source" so it will keep sparse kerning exceptions as sparse as possible
- [font overview] Distinguish more clearly between glyphs that exist and glyphs that do not exist in the font. Additionally, display the fallback glyph in _existing_ but _empty_ glyphs, both in the font overview and in the editor view. [Issue 2311](https://github.com/fontra/fontra/issues/2311), [PR 2313](https://github.com/fontra/fontra/pull/2313)
- Prevent deletion or deactivation of last active glyph source. This prevents confusing behavior. [Issue 2321](https://github.com/fontra/fontra/issues/2321), [PR 2322](https://github.com/fontra/fontra/pull/2322)
- Improve the "just start editing and the glyph source will come into existence" behavior for these cases ([PR 2319](https://github.com/fontra/fontra/pull/2319)):
  - Dragging the selection bounds handles to scale or rotate
  - Using various items in the Selection Transformation panel
- [font sources panel] Make source name list and source info panel scroll independently. [Issue 2318](https://github.com/fontra/fontra/issues/2318)
- Add "Is Sparse" checkbox to the font source UI. A "sparse" font source does not participate in kerning and in line metrics. (Part of the designspace PR mentioned below)
- In the sources panel, the default source name is now highlighted in bold. (Part of the designspace PR mentioned below)
- [designspace] Synchronize "sparse master" behavior with fontmake's behavior: if a `<source>` element has a `layer` attribute, consider the source "sparse". (Fontra's old behavior only considered sources sparse when the layer attribute was present _and_ differed from the default layer name.) [Issue 2314](https://github.com/fontra/fontra/issues/2314), [PR 2315](https://github.com/fontra/fontra/pull/2315)

## 2025-11-15 [version 2025.11.3]

- Improve pasting vector data from other applications. This is done by recognizing SVG data on the clipboard with type `image/svg+xml`. Previously Fontra only recognized SVG when it was on the `text/plain` clipboard, but not all applications provide that. [Issue 2032](https://github.com/fontra/fontra/issues/2032), [PR 2312](https://github.com/fontra/fontra/pull/2312)

## 2025-11-14 [version 2025.11.2]

[PR 2310](https://github.com/fontra/fontra/pull/2310):

- Fix some edge cases related to creating kerning exceptions
- Fix kerning pair deletion (there were some stale cache issues)
- Add explicit "Delete kerning pair" context menus for "all sources" and "this source"

## 2025-11-13 [version 2025.11.1]

- [fontra-pak] Issue releases instead of nightly builds. Fontra Pak releases use a [Calender Versioning](https://calver.org/) scheme: "YYYY.MM.PATCH" and can be [found here](https://github.com/fontra/fontra-pak/releases). So, with a GitHub account, you can now subscribe to release notifications by watching releases on the [fontra-pak repository](https://github.com/fontra/fontra-pak).
- Add support for sparse kerning exceptions. These are kerning exceptions that only exist in some locations and not all. [Issue 2305](https://github.com/fontra/fontra/issues/2305), [PR 2306](https://github.com/fontra/fontra/pull/2306)
- Improve support for global axes in variable components, by allowing the designer to override or fine-tune global axis values. The component sections in selection info panel now have a "hamburger" menu with some options: 1. Show global axes (as part of the component location) (default off), 2. Sort glyph axes (default on). Co-authored with NightFurySL2001. [Issue 2155](https://github.com/fontra/fontra/issues/2155), [PR 2276](https://github.com/fontra/fontra/pull/2276)

## 2025-10-18 [version 2025.11.0]

- Add "Font overview" menu item to "Font" menu, so users can go to the Font overview from other views. [PR 2293](https://github.com/fontra/fontra/pull/2293)
- Fixed the Reference Font panel for Safari. [Issue 2156](https://github.com/fontra/fontra/issues/2156), [PR 2165](https://github.com/fontra/fontra/pull/2165)

## 2025-10-16

- Display the project name in the top bar, next to the menu bar. [Issue 2089](https://github.com/fontra/fontra/issues/2089), [PR 2289](https://github.com/fontra/fontra/pull/2289)
- [fontra-workflow] Add `drop-cross-axis-mappings` filter that drops all cross-axis (avar-2) mappings. [PR 2290](https://github.com/fontra/fontra/pull/2290)

## 2025-10-13

- Fixed bug with project identifiers (file system paths in Fontra Pak) containing `%` characters. [PR 2287](https://github.com/fontra/fontra/pull/2287)

## 2025-10-09

- Report a better error message when failing to open a font file. [PR 2286](https://github.com/fontra/fontra/pull/2286)

## 2025-09-17

- [designspace/ufo] Keep UFO's public.glyphOrder up-to-date when adding or removing glyphs. This is a general improvement, but also specifically improves how RoboFont responds to Fontra adding or deleting glyphs, improving RoboFont/Fontra interoperability. [PR 2278](https://github.com/fontra/fontra/pull/2278)

## 2025-09-11

- Improved behavior of "inactive" glyph sources. [PR 2277](https://github.com/fontra/fontra/pull/2277)

## 2025-08-28

- [Select next/previous source] Fix bad behavior when doing "select next source" or "select previous source" when no glyph is selected and there are no font sources. [PR 2269](https://github.com/fontra/fontra/pull/2269)
- [Clean view] Fix edge case where Fontra wouldn't exit "clean mode", despite the space key being released. [PR 2270](https://github.com/fontra/fontra/pull/2270)
- [Transformations panel] Fixed Flip buttons (regression) [PR 2267](https://github.com/fontra/fontra/pull/2267)
- [Transformations panel] Add editable "Dimensions" fields to the Transformation panel. These show the width and height of the selection, and allow the selection to be scaled to the entered dimensions. [Issue 2265](https://github.com/fontra/fontra/issues/2265), [PR 2266](https://github.com/fontra/fontra/pull/2266)
- [Transformations panel] Add "Type Enter to apply transformation" behavior to all numeric transformation fields. Typing Enter is often much more convenient than clicking the icon button. [PR 2266](https://github.com/fontra/fontra/pull/2266)

## 2025-08-26

- [designspace] Fixed a bug where adding a font source caused an error when writing kerning. [Issue 2263](https://github.com/fontra/fontra/issues/2263), [PR 2264](https://github.com/fontra/fontra/pull/2264)
- Fixed a bug where the glyph cells in the font overview would not respond to changes made in the editor. [Issue 2253](https://github.com/fontra/fontra/issues/2253), [PR 2262](https://github.com/fontra/fontra/pull/2262)

## 2025-08-19

- When adding a new font source, instantiate the kerning for the new location. [Issue 2252](https://github.com/fontra/fontra/issues/2252), [PR 2254](https://github.com/fontra/fontra/pull/2254)
- When deleting a font source, also delete associated kerning sources. [Issue 2255](https://github.com/fontra/fontra/issues/2255), [PR 2256](https://github.com/fontra/fontra/pull/2256)

## 2025-08-13

- Fixed a bug with pasting into a new glyph source (where the glyph source is created implicitly as part of the edit): the pasted item was added twice. [Issue 2241](https://github.com/fontra/fontra/issues/2241), [PR 2245](https://github.com/fontra/fontra/pull/2245)
- New "Add guideline between two points" functionality. It is an Edit menu and context menu item. Contributed by Dec/752986. [PR 2226](https://github.com/fontra/fontra/pull/2226)

## 2025-07-25

- Fixed a serious bug with writing kerning to UFO: group references did not use the correct prefix. [Issue 2238](https://github.com/fontra/fontra/issues/2238), [PR 2239](https://github.com/fontra/fontra/pull/2239)
- [Selection info panel] Added "inline calculator" functionality to the metrics fields. Expressions evaluate to a concrete value once you type enter or leave the field. [Issue 2236](https://github.com/fontra/fontra/issues/2236), [PR 2237](https://github.com/fontra/fontra/pull/2237) Quick rundown:
  - It supports most common operators and parentheses, for example `10 * (5 + 3) / 2`.
  - It allows to use glyph names as variable names, to refer to the metric value for that glyph. For example, if you type `E` in the advance width field, it will take the advance width of the `E` glyph and put that in the field. Likewise, if you type `E` in the left sidebearing field, it will put the left sidebearing value from the `E` glyph in the field.
  - Glyph names can also be used as part of an expression, for example `E + 10`.
  - There is a special notation for the _opposite_ sidebearing, by adding a `!` to the glyph name: if in the _left_ sidebearing field you use `E!` in the expression, it will take the _right_ sidebearing from `E`.

## 2025-07-24

- Read/write guideline.locked flags from/to UFO. [Issue 1390](https://github.com/fontra/fontra/issues/1390), [PR 2235](https://github.com/fontra/fontra/pull/2235)
- Allow glyph guidelines to be selected anywhere along the line, instead of just at their anchor point. [PR 2234](https://github.com/fontra/fontra/pull/2234)

## 2025-07-23

- [Selection info panel] Improved the sidebearing fields (advance, left sidebearing, right sidebearing) to alternatively accept a glyph name, to copy the value from. For example, if you enter `A` in the left sidebearing field, the left sidebearing from glyph `A` is copied into the field, once you type enter or leave the field otherwise. [Issue 2230](https://github.com/fontra/fontra/issues/2230), [PR 2231](https://github.com/fontra/fontra/pull/2231)
- [fontra-pak] New contributor sintfar fixed an issue that in some cases caused an error dialog to appear when exiting Fontra Pak on Windows. [fontra-pak PR 178](https://github.com/fontra/fontra-pak/pull/178)

## 2025-07-16

- [Kerning tool] Changed delete vs. alt-delete behavior: plain delete will now delete the selected kerning pairs across the entire designspace. Alt-delete will only delete the selected kerning pairs for the currently selected source location. [PR 2224](https://github.com/fontra/fontra/pull/2224)

## 2025-07-15

- Implemented a special placeholder notation `/?` for the text entry field, which will be substituted by the "current glyph". This is handy when spacing, kerning, or just looking at the current glyph in different context. Largely contributed by Gaëtan Baehr. [Issue 2198](https://github.com/fontra/fontra/issues/2198), [PR 2206](https://github.com/fontra/fontra/pull/2206) Some notes:
  - When deselecting the current glyph (by clicking elsewhere), the "current glyph" is not reset, but kept.
  - The glyph search panel can be used to change the "current glyph", even if there's no glyph selected in the canvas.
  - The "select next/previous glyph" shortcuts work on the "current glyph", even if there's no glyph selected in the canvas.

## 2025-07-14

- Added a new Sidebearing tool, as a companion to the Kerning tool. Both tools occupy the same slot in the toolbar, with the Sidebearing tool being the default. [Issue 2213](https://github.com/fontra/fontra/issues/2213), [PR 2216](https://github.com/fontra/fontra/pull/2216) Quick intro:
  - Hover over a glyph to see the sidebearing and advance values.
  - Click-drag near a sidebearing to move it
  - Click-drag on the glyph shape to move the glyph within its "advance area".
  - Use shift-click to select multiple sidebearings.
  - Clicking on the glyph shape is equivalent to selecting the left sidebearing and the right sidebearing together.
  - When dragging multiple sidebearings across multiple glyphs, the sidebearings all move with the pointer.
  - Use the alt key to make opposite sidebearings move in opposite directions. For example, if you drag a right sidebearing to the right while holding the alt key, selected left side bearings move to the left, and vice versa.
  - Using the alt key while dragging the glyph shape will increase or decrease both sidebearings.
  - Arrow keys can use used to nudge selected sidebearings.
  - Shift-arrow key will increment/decrement sidebearing values in steps of 10.
  - The tab key can be used to navigate to the next sidebearing. Shift-tab will navigate to the previous sidebearing.
- Some minor changes to the Kerning tool that we done in [PR 2216](https://github.com/fontra/fontra/pull/2216):
  - The cursor used for dragging is now a left-right arrow, to be more in line with the Sidebearing tool.
  - The tab key can now be used to navigate to the next kerning pair. Shift-tab will navigate to the previous kerning pair.

## 2025-07-08

- Herlan/navv-1 contributed several improvements and additions for the OpenType Features panel:

  - added syntax coloring
  - added comment toggle (command/control /)
  - fixed undo/redo
  - fixed a cosmetic issue on Windows
  - and more

  [Issue 2101](https://github.com/fontra/fontra/issues/2101), [Issue 2186](https://github.com/fontra/fontra/issues/2186), [PR 2212](https://github.com/fontra/fontra/pull/2212)

## 2025-07-04

- Gaëtan Baehr and Jérémie Hornus redesigned several of the edit tools: the knife tool, the shape/rectangle/oval tool, the kerning tool and the (soon-to-be-used) sidebearings tool. [PR 2210](https://github.com/fontra/fontra/pull/2210)
- [Kerning] The kerning tool now has a context menu, allowing users to make kerning exceptions for group kerning. [Issue 2204](https://github.com/fontra/fontra/issues/2204) [PR 2209](https://github.com/fontra/fontra/pull/2209)
- Added a Bengali glyph set, kindly contributed by Dr Anirban Mitra. [Issue 2189](https://github.com/fontra/fontra/issues/2189) [PR 2190](https://github.com/fontra/fontra/pull/2190)

## 2025-07-03

- [Glyphs backend] Implemented "Find glyphs that use _this glyph_". [fontra-glyphs issue 103](https://github.com/fontra/fontra-glyphs/issues/103) [fontra-glyphs PR 104](https://github.com/fontra/fontra-glyphs/pull/104)
- [Kerning] Allow kerning edits to be constrained to 5, 10 or 50 units, by using alt, shift or als-shift while dragging. Make arrow key kerning editing behave the same with respect to these modifier keys. Contributed by Gaëtan Baehr. [PR 2205](https://github.com/fontra/fontra/pull/2205)

## 2025-07-01

- Fixed a bug that caused interpolated kerning to show the wrong value after editing a kerning pair. [PR 2194](https://github.com/fontra/fontra/pull/2194)
- Fixed a problem with the placeholder string for undefined glyphs in the edit canvas. [Issue 2192](https://github.com/fontra/fontra/issues/2192) [PR 2195](https://github.com/fontra/fontra/pull/2195)
- Fix writing of the units-per-em value when copying/exporting to .designspace/.ufo. [Issue 2196](https://github.com/fontra/fontra/issues/2196) [PR 2197](https://github.com/fontra/fontra/pull/2197)

## 2025-06-30

- Fixed a bug that broke interpolation when adding kerning to a new source. [PR 2191](https://github.com/fontra/fontra/pull/2191)

## 2025-06-27

- [Glyphs backend] Improve editing experience with larger .glyphs files. [fontra-glyphs PR 101](https://github.com/fontra/fontra-glyphs/pull/101)

## 2025-06-25

- [Glyphs backend] Added support for writing kerning [fontra-glyphs PR 99](https://github.com/fontra/fontra-glyphs/pull/99)
- [Glyphs backend] Added support for deleting glyphs [fontra-glyphs PR 100](https://github.com/fontra/fontra-glyphs/pull/100)

## 2025-06-21

- Initial support for editing kerning has landed. There is a new Kerning tool among the edit tools: ove the pointer to a combination and the pair will highlight and you can drag it to change the value. Or use arrow left or right. Tou can select multiple pairs using shift-click. A kern group can be assigned for either side of the glyph in the selection info panel, when a glyph is selected. [Tracking issue 1501](https://github.com/fontra/fontra/issues/1501).
- The relatively new sorting behavior in the Glyph sources panel is not loved by everyone. There is now a little hamburger menu where you can turn off sorting. [Issue 2126](https://github.com/fontra/fontra/issues/2126) [PR 2182](https://github.com/fontra/fontra/pull/2182)
- [Glyphs backend] Olli Meier implemented OpenType feature reading and writing for the Glyphs backend. [fontra-glyphs PR 95](https://github.com/fontra/fontra-glyphs/pull/95)
- [Windows] Fixed a bug on Windows where Fontra Pak would refuse to launch if another application was listening to the default port (8000). [Issue 2180](https://github.com/fontra/fontra/issues/2180) [PR 2181](https://github.com/fontra/fontra/pull/2181) [fontra-pak PR 172](https://github.com/fontra/fontra-pak/pull/172)

## 2025-06-04

- Fix warning caused by HTML Canvas API misuse. [Issue 2171](https://github.com/fontra/fontra/issues/2171) [PR 2174](https://github.com/fontra/fontra/pull/2174)
- Added Georgian glyph sets. [PR 2167](https://github.com/fontra/fontra/pull/2167)
- Update glyph-data.csv. [PR 2172](https://github.com/fontra/fontra/pull/2172)

## 2025-05-08

- Fix miscellaneous bugs with the glyph source UI [PR 2161](https://github.com/fontra/fontra/pull/2161)
  - Don't misbehave when creating a new glyph source from a font source immediately after font axis/sources were edited
  - Don't misbehave when trying to edit a glyph off-source, when a glyph axis is involved
  - Fix default source/layer name fields in Add Source and Edit Source Properties dialog for variable glyphs (glyphs that have local axes)
- Fix "disconnect" between two windows/tabs after network disconnect / computer sleep. [PR 2152](https://github.com/fontra/fontra/pull/2152)

## 2025-04-11

- Create better placeholder strings for "undefined" glyphs, in the font overview and in the editor. This is especially effective for Arabic contextual alternates, and ligatures. Contributed by Khaled Hosny. [Issue 2005](https://github.com/fontra/fontra/issues/2005) [PR 2010](https://github.com/fontra/fontra/pull/2010)
- Fix glitch where the source layers (background layers) UI list does not immediately show when putting a glyph in edit mode. [Issue 2143](https://github.com/fontra/fontra/issues/2143) [PR 2144](https://github.com/fontra/fontra/pull/2144)

## 2025-04-07

- Fixed Fontra application settings: due to a regression this view gave a 403 error. [PR 2138](https://github.com/fontra/fontra/pull/2138)

## 2025-04-06

- Implement applying kerning in the editor canvas. [Issue 2135](https://github.com/fontra/fontra/issues/2135) [PR 2136](https://github.com/fontra/fontra/pull/2136)

## 2025-03-30

- [fontra-glyphs] The Glyphs backend now supports background layers, for reading and writing. [fontra-glyphs issue 88](https://github.com/fontra/fontra-glyphs/issues/88) [fontra-glyphs PR 92](https://github.com/fontra/fontra-glyphs/pull/92)

## 2025-03-26

- Fixed bug with undo and source (background) layers: undo wouldn't switch to the correct source layer, with a visual glitch because the correct layer would be in edit mode. [Issue 2119](https://github.com/fontra/fontra/issues/2119) [PR 2120](https://github.com/fontra/fontra/pull/2120)
- Fixed various problems with the font sources panel (in the font info view), when there were no sources at all. [Issue 2117](https://github.com/fontra/fontra/issues/2117) [PR 2118](https://github.com/fontra/fontra/pull/2118)

## 2025-03-25

- New features in the glyph sources list:
  - The glyph sources are now sorted according to the axes (they used to be in creation order)
  - The _default_ source's name is now rendered in bold, so it's easier to find
  - For each _font source_ location ("global location") for which the glyph does _not_ have a source, there is now a "virtual source" in the list, rendered in gray. To create an _actual_ source at that location, either double-click the virtual source, or, while the virtual source is selected, start modifying the glyph.
  - [Issue 1572](https://github.com/fontra/fontra/issues/1572), [Issue 1639](https://github.com/fontra/fontra/issues/1639), [Issue 1640](https://github.com/fontra/fontra/issues/1640), [Issue 2114](https://github.com/fontra/fontra/issues/2114)
  - [PR 2102](https://github.com/fontra/fontra/pull/2102), [PR 2098](https://github.com/fontra/fontra/pull/2098)
- Fixed subtle key handling bug with popup menus inside a dialog [Issue 2113](https://github.com/fontra/fontra/issues/2113) [PR 2115](https://github.com/fontra/fontra/pull/2115)

## 2025-03-22

- [designspace/ufo] Fixed background layers for sparse masters. [Issue 2111](https://github.com/fontra/fontra/issues/2111) [PR 2112](https://github.com/fontra/fontra/pull/2112)

## 2025-03-20

- New feature: we added a Font Info panel for editing OpenType features. [Issue 2080](https://github.com/fontra/fontra/issues/2080) [PR 2104](https://github.com/fontra/fontra/pull/2104)

## 2025-03-19

- New feature: we added UI for lower level OpenType settings, as part of the Font Info panel and the Font Sources panel. [Issue 2023](https://github.com/fontra/fontra/issues/2023) [PR 2039](https://github.com/fontra/fontra/pull/2039)
- Vastly improved keyboard navigation of the menu bar and (contextual) menus. [Issue 2061](https://github.com/fontra/fontra/issues/2061) [PR 2062](https://github.com/fontra/fontra/pull/2062)
- Fixed bug where components appeared incompatible. [Issue 2092](https://github.com/fontra/fontra/issues/2092) [PR 2093](https://github.com/fontra/fontra/pull/2093)
- [fontra-rcjk] Fixed bug where the list of projects was duplicated. [Issue 2094](https://github.com/fontra/fontra/issues/2094) [PR 2095](https://github.com/fontra/fontra/pull/2095)

## 2025-03-16

- Fixed several bugs in the designspace backend related to editing font sources. [Issue 2040](https://github.com/fontra/fontra/issues/2040) [PR 2091](https://github.com/fontra/fontra/pull/2091)

## 2025-03-14

New features:

- Background layers are here! [Issue 50](https://github.com/fontra/fontra/issues/50), many PR's, see issue.
- Beginnings of writing .glyphs and .glyphspackage files. First step: glyph data. [fontra-glyphs issue 75](https://github.com/fontra/fontra-glyphs/issues/75) [fontra-glyphs PR 76](https://github.com/fontra/fontra-glyphs/pull/76) [Issue for future work](https://github.com/fontra/fontra-glyphs/issues/87)

Bugfixes:

- Units Per Em is now exported properly (This affected "Export as", `fontra-workflow` and `fontra-copy`). [Issue 2044](https://github.com/fontra/fontra/issues/2044) [PR 2046](https://github.com/fontra/fontra/pull/2046)
- Fixed bug where the context menu wouldn't go away [Issue 2068](https://github.com/fontra/fontra/issues/2068) [PR 2069](https://github.com/fontra/fontra/pull/2069)
- Fixed false positive with the interpolation compatibility checker. [Issue 2081](https://github.com/fontra/fontra/issues/2081) [PR 2083](https://github.com/fontra/fontra/pull/2083)

Enhancements:

- Don't write empty kern data to .fontra project. [Issue 2045](https://github.com/fontra/fontra/issues/2045) [PR 2047](https://github.com/fontra/fontra/pull/2047)
- Show a warning when deleting a font source. [Issue 2048](https://github.com/fontra/fontra/issues/2048) [PR 2055](https://github.com/fontra/fontra/pull/2055)
- Allow menus to be opened with click-drag, not just click. [Issue 2049](https://github.com/fontra/fontra/issues/2049) [PR 2060](https://github.com/fontra/fontra/pull/2060)

## 2025-03-05

There have been some major changes in the front end, in order to have a clearer separation between the Python server code and the front end. This makes the front-end usable independently from the server.

- All front end code and assets moved to a new folder, `src-js`
- A bundler (webpack) is now used to package assets and code
  - To run the bundler once: `npm run bundle`
  - To run the bundler in "watch" mode (updates bundle on changes): `npm run bundle-watch`
  - Or start the server with the new `--dev` option, which runs `npm run bundle-watch` in the background. For example:
    - `fontra --dev filesystem path/to/fonts/`
  - `pip install path/to/fontra/` will run the bundler implicitly
- Similar changes were made in the `fontra-rcjk` repository
- Fontra Pak was adjusted to these changes as well
- [Issue 1952](https://github.com/fontra/fontra/issues/1952) [PR 2053](https://github.com/fontra/fontra/pull/2053) [fontra-rcjk PR 224](https://github.com/fontra/fontra-rcjk/pull/224)

## 2025-02-28

Many smaller bugs were fixed:

- Allow menus from the menubar to be opened with click-drag [Issue 2049](https://github.com/fontra/fontra/issues/2049) [PR 2060](https://github.com/fontra/fontra/pull/2060)
- Paste only plain text in editable list cells [Issue 2043](https://github.com/fontra/fontra/issues/2043) [PR 2057](https://github.com/fontra/fontra/pull/2057)
- Fix tooltips layout issues [Issue 2050](https://github.com/fontra/fontra/issues/2050) [PR 2056](https://github.com/fontra/fontra/pull/2056)
- Show warning befor deleting a font source, as this can have deeper consequences than one might think [Issue 2048](https://github.com/fontra/fontra/issues/2048) [PR 2055](https://github.com/fontra/fontra/pull/2055)
- Improve point deletion if a point is overlapping another, or is a tangent [Issue 2033](https://github.com/fontra/fontra/issues/2033) [PR 2035](https://github.com/fontra/fontra/pull/2035) [PR 2038](https://github.com/fontra/fontra/pull/2038)
- Fix bug where the Italic Angle font source parameter was written as the wrong type [Issue 2036](https://github.com/fontra/fontra/issues/2036) [PR 2037](https://github.com/fontra/fontra/pull/2037)

## 2025-02-16

- Do not display the "selection bounds" handles if the selection is only a single point [Issue 2022](https://github.com/fontra/fontra/issues/2022) [PR 2024](https://github.com/fontra/fontra/pull/2024)
- Fix bug in reference font panel [Issue 2011](https://github.com/fontra/fontra/issues/2011) [PR 2012](https://github.com/fontra/fontra/pull/2012)
- Redesigned the Font Source panel [Issue 1997](https://github.com/fontra/fontra/issues/1997) [PR 2007](https://github.com/fontra/fontra/pull/2007)
- Added initial support for global guidelines. For now they need to be set in the Font Sources panel. Adding or editing global guidelines in the glyph editor will be implemented later. [Issue 909](https://github.com/fontra/fontra/issues/909) [Issue 1963](https://github.com/fontra/fontra/issues/1963) [PR 2021](https://github.com/fontra/fontra/pull/2021)

## 2025-01-30

- Added support for reading .woff and .woff2 [PR 1999](https://github.com/fontra/fontra/pull/1999)

## 2025-01-27

- Misc improvements to the Font Overview
- Added preset glyph sets from Google Fonts, Black Foundry, Adobe and Christoph Koeberlin
- Fixed a bug with point deletion [Issue 1980](https://github.com/fontra/fontra/issues/1980), [PR 1981](https://github.com/fontra/fontra/pull/1981)

## 2025-01-21

The Font Overview is ready to be used everywhere, including in Fontra Pak. Documentation will follow soon.

It has support for "template glyphsets", that can be chosen from collections of presets, or made from any publically hosted text, .tsv or .csv data. This includes files on GitHub and publically readable Google Docs or Sheets.

There will be further improvements and additions. Ongoing work: [Issue 1886](https://github.com/fontra/fontra/issues/1886)

## 2025-01-17

- A change in the URL format: the project identifier is now in the URL query, instead of part of the URL path [Issue 1960](https://github.com/fontra/fontra/issues/1960), [PR 1959](https://github.com/fontra/fontra/pull/1959)
- Editor tools: right-clicking or control-clicking on a tool with sub-tools will now show the subtools instead of the browser's context menu [Issue 1953](https://github.com/fontra/fontra/issues/1953), [PR 1956](https://github.com/fontra/fontra/pull/1956)

## 2025-01-14

- Fixed a regression with the Font menu [Issue 1941](https://github.com/fontra/fontra/issues/1941), [PR 1942](https://github.com/fontra/fontra/pull/1942)
- Fixed a regression with messages from server [PR 1939](https://github.com/fontra/fontra/pull/1939)

## 2025-01-06

- Fixed bug related to deleting points [Issue 1910](https://github.com/fontra/fontra/issues/1910), [PR 1916](https://github.com/fontra/fontra/pull/1916)
- Added robots.txt to HTTP root folder [PR 1905](https://github.com/fontra/fontra/pull/1905)
- Small improvements to Related Glyphs & Characters panel (selecting multiple glyphs, keyboard navigation) [PR 1906](https://github.com/fontra/fontra/pull/1906)
- Accordion view: alt-click on a header folds/unfolds all items [PR 1901](https://github.com/fontra/fontra/pull/1901)
- Implement finding glyph names for code points and code points for glyph names in JS, via a CSV version of GlyphData.xml. This is a performance improvement, and needed for the upcoming Font Overview [PR 1900](https://github.com/fontra/fontra/pull/1900)
- Fixed a regression witb CJK Design Frame settings [PR 1883](https://github.com/fontra/fontra/pull/1883)
- Fixed a regression with the Knife Tool [PR 1870](https://github.com/fontra/fontra/pull/1870)

## 2024-12-19

- Making the interface between server and client more explicit [PR 1863](https://github.com/fontra/fontra/pull/1863)
- Fixed editing bug with multiple edit views [PR 1870](https://github.com/fontra/fontra/pull/1870)
- Prevent `fontra-copy` and Fontra Pak's "Export as..." to write on top of the source data (as this destroyed the data)
  - `fontra-copy`: [PR 1860](https://github.com/fontra/fontra/pull/1860)
  - Fontra Pak: [PR 148](https://github.com/fontra/fontra-pak/pull/148)
- Fontra Pak: add button with link to documentation [PR 143](https://github.com/fontra/fontra-pak/pull/143)

## 2024-12-04

- Fixes "clean view" (space bar) on Safari [PR 1835](https://github.com/fontra/fontra/pull/1835)

## 2024-11-29

- Japanese UI translation (thanks Masaki Ando!)

## 2024-11-28

- Keep the focus on the canvas when clicking icon buttons and (some) list cell buttons [PR 1829](https://github.com/fontra/fontra/pull/1829)

## 2024-11-27

- Add 'Add background image' menu to context menu [PR 1827](https://github.com/fontra/fontra/pull/1827)
- Fixed bug with colorizing the background image on Safari [PR 1825](https://github.com/fontra/fontra/pull/1825)
- Reorganize context menu: put "Edit" items under a sub menu [PR 1824](https://github.com/fontra/fontra/pull/1824)
- Fix the Knife tool [PR 1823](https://github.com/fontra/fontra/pull/1823)

## 2024-11-20

- Add support for background image colorization [PR 1815](https://github.com/fontra/fontra/pull/1815)

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

[Issue 1660](https://github.com/fontra/fontra/issues/1660), [Issue 1777](https://github.com/fontra/fontra/issues/1777) (There were too many PRs to mention individually here.)

## 2024-11-13

- Improved UI translations [PR 1764](https://github.com/fontra/fontra/pull/1764)
- Added "Select previous/next glyph" menu items [PR 1706](https://github.com/fontra/fontra/pull/1706)
- Partial support for background images (more to come) [PR 1775](https://github.com/fontra/fontra/pull/1775)
- Add support for many UFO font info fields, so they won't get lost during round-tripping [PR 1770](https://github.com/fontra/fontra/pull/1770)
- Fixed cosmetic issue with scrollbars on Windows [PR 1767](https://github.com/fontra/fontra/pull/1767)
- Fixed bug with Copy/Paste menu items [PR 1756](https://github.com/fontra/fontra/pull/1756)

## 2024-10-24

- Various improvements to the font sources panel [PR 1739](https://github.com/fontra/fontra/pull/1739)
- Add changelog file [PR 1749](https://github.com/fontra/fontra/pull/1749)

## 2024-10-23

- New cross-axis mapping page for avar2 mappings [PR 1729](https://github.com/fontra/fontra/pull/1729)
- Allow custom shortcuts for selecting previous/next reference font [PR 1742](https://github.com/fontra/fontra/pull/1742)

## 2024-10-16

- New pen tool icon [PR 1726](https://github.com/fontra/fontra/pull/1726)

## 2024-10-14

- New languages: French, Dutch, German

## 2024-10-13

- Fontra Pak: build macOS application as "Universal2" binary, so it runs natively on all processor types [Fontra Pak PR 108](https://github.com/fontra/fontra-pak/pull/108)

## 2024-10-12

- Delete gear panel (move to difference locations, for example: View -> Glyph editor apperance) [PR 1701](https://github.com/fontra/fontra/pull/1701)

## 2024-10-10

- Fontra Pak: added "Export as..." functionality [Fontra Pak PR 133](https://github.com/fontra/fontra-pak/pull/133)

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
