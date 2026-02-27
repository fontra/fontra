import { getGlyphInfoFromCodePoint } from "@fontra/core/glyph-data.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { isDisjoint, updateSet } from "@fontra/core/set-ops.js";
import { characterGlyphMapping } from "@fontra/core/shaper.js";
import {
  makeUPlusStringFromCodePoint,
  round,
  throttleCalls,
} from "@fontra/core/utils.js";
import Panel from "./panel.js";

// import { showMenu } from "@fontra/web-components/menu-panel.js";
import { Accordion } from "@fontra/web-components/ui-accordion.js";
import { UIList } from "@fontra/web-components/ui-list.js";

export default class CharactersGlyphsPanel extends Panel {
  identifier = "characters-glyphs";
  iconPath = "/tabler-icons/columns.svg";

  static styles = `
    .main-section {
      box-sizing: border-box;
      height: 100%;
      overflow: hidden;
      padding: 1em;
    }
  `;

  constructor(editorController) {
    super(editorController);
    this.throttledUpdate = throttleCalls((senderID) => this.update(senderID), 100);
    this.sceneSettingsController =
      this.editorController.sceneController.sceneSettingsController;
    this.sceneSettings = this.editorController.sceneController.sceneSettings;

    this.sceneSettingsController.addKeyListener(
      ["positionedLines"],
      (event) => this.throttledUpdate(),
      true // immediate, avoids mismatch with characterLines
    );

    // this.sceneSettingsController.addKeyListener(
    //   ["selectedGlyph"],
    //   (event) => console.log("sel changed")
    // );

    this.selectedLineIndex = 0;
  }

  getContentElement() {
    const characterListColumnDescriptions = [
      {
        key: "character",
        title: " ",
        width: "1.8em",
      },
      {
        key: "codePoint",
        title: "Unicode",
        width: "5em",
        get: (item) =>
          item.codePoint
            ? makeUPlusStringFromCodePoint(item.codePoint)
            : item.glyphName,
      },
      {
        key: "unicodeName",
        title: "Unicode name",
        width: 170,
        minWidth: 80,
        get: (item) =>
          item.codePoint
            ? getGlyphInfoFromCodePoint(item.codePoint)?.description?.toLowerCase()
            : "",
      },
      {
        key: "script",
        title: "Script",
        width: "4em",
        get: (item) =>
          item.codePoint ? getGlyphInfoFromCodePoint(item.codePoint)?.script : "",
      },
      {
        key: "index",
        title: "Index",
        width: "3em",
      },
    ];
    this.characterList = new UIList();
    this.characterList.columnDescriptions = characterListColumnDescriptions;
    this.characterList.showHeader = true;
    this.characterList.minHeight = "5em";
    this.characterList.settingsStorageKey = "chars-glyphs-char-list";

    this.characterList.addEventListener("listSelectionChanged", (event) => {
      const characterIndex = this.characterList.getSelectedItemIndex();
      const glyphIndices = this.characterGlyphMapping.charToGlyphs[characterIndex];
      this.sceneSettings.selectedGlyph = {
        lineIndex: this.selectedLineIndex,
        glyphIndex: glyphIndices[0],
      };
      this.glyphList.setSelectedItemIndices(glyphIndices, false, true);
    });
    this.characterList.addEventListener("rowDoubleClicked", (event) =>
      this.doubleClickHandler(event)
    );

    const showKern = true; // could become a toggle

    const glyphListColumnDescriptions = [
      {
        key: "glyphName",
        title: "Glyph",
        width: 100,
        minWidth: 50,
      },
      {
        key: "advance",
        title: "Adv",
        width: "5em",
        align: "right",
        get: (item) => {
          const kern = item.advance - item.originalAdvance;
          const sign = kern < 0 ? "\u2212" : "+";
          return kern && showKern
            ? `${item.originalAdvance}\u200A${sign}\u200A${Math.abs(kern)}`
            : item.advance;
        },
      },
      {
        key: "dx",
        title: "ΔX",
        width: "3em",
        align: "right",
      },
      {
        key: "dy",
        title: "ΔY",
        width: "3em",
        align: "right",
      },
      {
        key: "cluster",
        title: "cluster",
        width: "3em",
        align: "right",
      },
    ];
    this.glyphList = new UIList();
    this.glyphList.columnDescriptions = glyphListColumnDescriptions;
    this.glyphList.showHeader = true;
    this.glyphList.minHeight = "5em";
    this.glyphList.settingsStorageKey = "chars-glyphs-glyph-list";
    this.glyphList.addEventListener("listSelectionChanged", (event) => {
      const glyphIndex = this.glyphList.getSelectedItemIndex();
      this.sceneSettings.selectedGlyph = {
        lineIndex: this.selectedLineIndex,
        glyphIndex,
      };
    });
    this.glyphList.addEventListener("rowDoubleClicked", (event) =>
      this.doubleClickHandler(event)
    );

    this.accordion = new Accordion();
    this.accordion.appendStyle(`
      ui-list {
        box-sizing: border-box;
        height: 100%;
        overflow: hidden;
      }
    `);

    this.accordion.items = [
      {
        label: translate("sidebar.characters-glyphs.input-characters"),
        open: true,
        content: this.characterList,
      },
      {
        label: translate("sidebar.characters-glyphs.output-glyphs"),
        open: true,
        content: this.glyphList,
      },
    ];

    return html.div({ class: "panel" }, [
      html.div({ class: "main-section" }, [this.accordion]),
    ]);
  }

  async update() {
    const selectedGlyph = this.sceneSettings.selectedGlyph;

    this.selectedLineIndex = selectedGlyph?.lineIndex ?? this.selectedLineIndex;
    const glyphIndex = selectedGlyph?.glyphIndex;

    const charLines = this.sceneSettings.characterLines;
    const positionedLines = this.sceneSettings.positionedLines;

    if (
      !this.selectedLineIndex === undefined ||
      !charLines[this.selectedLineIndex] ||
      !positionedLines[this.selectedLineIndex]
    ) {
      this.characterList.setItems([]);
      this.glyphList.setItems([]);
      return;
    }

    const charLine = charLines[this.selectedLineIndex];
    const positionedLine = positionedLines[this.selectedLineIndex];

    const charItems = charLine.map(({ character, glyphName }, index) => ({
      character,
      codePoint: character ? character.codePointAt(0) : 0,
      glyphName,
      index,
    }));

    const glyphItems = positionedLine.glyphs.map((glyph) => ({
      glyphName: glyph.glyphName,
      advance: glyph.glyphInfo.x_advance, // TODO: y_advance for vertical
      dx: glyph.glyphInfo.x_offset,
      dy: glyph.glyphInfo.y_offset,
      cluster: glyph.cluster,
      originalAdvance: glyph.glyphInfo.mark ? 0 : Math.round(glyph.glyph.xAdvance), // TODO: yAdvance for vertical
    }));

    this.characterGlyphMapping = characterGlyphMapping(
      positionedLine.glyphs.map(({ cluster }) => cluster),
      charLine.length
    );

    const currentGlyphIndices = this.glyphList.getSelectedItemIndices();
    const currentCharacterIndices = this.characterList.getSelectedItemIndices();
    const sameGlyphContents = sameGlyphNames(glyphItems, this.glyphList.items);
    const sameContents =
      JSON.stringify(glyphItems) == JSON.stringify(this.glyphList.items);

    if (!sameContents) {
      this.characterList.setItems(charItems);
      this.glyphList.setItems(glyphItems);
    }

    if (selectedGlyph) {
      const characterIndices = new Set(
        this.characterGlyphMapping.glyphToChars[glyphIndex]
      );

      this.glyphList.setSelectedItemIndices(
        currentGlyphIndices.has(glyphIndex) && sameGlyphContents
          ? currentGlyphIndices
          : new Set([glyphIndex]),
        false,
        true
      );

      this.characterList.setSelectedItemIndices(
        !isDisjoint(currentCharacterIndices, characterIndices) && sameGlyphContents
          ? currentCharacterIndices
          : characterIndices,
        false,
        true
      );
    } else {
      this.characterList.setSelectedItemIndex(undefined);
      this.glyphList.setSelectedItemIndex(undefined);
    }
  }

  async toggle(on, focus) {
    this.isActive = on;
    if (on) {
      this.update();
    }
  }

  doubleClickHandler(event) {
    const selectedGlyph = this.sceneSettings.selectedGlyph;
    const glyphExists =
      !!this.fontController.glyphMap[this.sceneSettings.selectedGlyphName];
    if (selectedGlyph) {
      if (glyphExists) {
        this.sceneSettings.selectedGlyph = { ...selectedGlyph, isEditing: true };
      } else {
        this.editorController.showDialogNewGlyph();
      }
    }
  }
}

function sameGlyphNames(items1, items2) {
  const key1 = items1.map((item) => item.glyphName).join("|");
  const key2 = items2.map((item) => item.glyphName).join("|");
  return key1 == key2;
}

customElements.define("panel-characters-glyphs", CharactersGlyphsPanel);
