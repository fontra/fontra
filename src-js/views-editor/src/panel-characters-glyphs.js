import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
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

    this.sceneSettingsController.addKeyListener(["positionedLines"], (event) =>
      this.throttledUpdate()
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
        get: (item) => makeUPlusStringFromCodePoint(item.codePoint),
      },
    ];
    this.characterList = new UIList();
    this.characterList.columnDescriptions = characterListColumnDescriptions;
    this.characterList.showHeader = true;
    this.characterList.minHeight = "5em";
    this.characterList.addEventListener("listSelectionChanged", (event) => {
      const characterIndex = this.characterList.getSelectedItemIndex();
      const glyphIndex = this.characterGlyphMapping.charToGlyphs[characterIndex][0];
      this.sceneSettings.selectedGlyph = {
        lineIndex: this.selectedLineIndex,
        glyphIndex,
      };
    });

    const glyphListColumnDescriptions = [
      {
        key: "glyphName",
        title: "Glyph",
        width: "10em",
      },
      {
        key: "advance",
        title: "Adv",
        width: "3em",
        formatter: NumberFormatterOneDecimal,
        align: "right",
      },
      {
        key: "dx",
        title: "dx",
        width: "3em",
        formatter: NumberFormatterOneDecimal,
        align: "right",
      },
      {
        key: "dy",
        title: "dy",
        width: "3em",
        formatter: NumberFormatterOneDecimal,
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
    this.glyphList.addEventListener("listSelectionChanged", (event) => {
      const glyphIndex = this.glyphList.getSelectedItemIndex();
      this.sceneSettings.selectedGlyph = {
        lineIndex: this.selectedLineIndex,
        glyphIndex,
      };
    });

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
        label: "Characters",
        open: true,
        content: this.characterList,
      },
      {
        label: "Glyphs",
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
    const glyphIndex = selectedGlyph?.glyphIndex ?? undefined;

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

    const charItems = charLine.map(({ character }) => ({
      character,
      codePoint: character ? character.codePointAt(0) : 0,
    }));

    const glyphItems = positionedLine.glyphs.map((glyph) => ({
      glyphName: glyph.glyphName,
      advance: glyph.glyphInfo.ax, // TODO: ay for vertical
      dx: glyph.glyphInfo.dx,
      dy: glyph.glyphInfo.dy,
      cluster: glyph.cluster,
    }));

    this.characterGlyphMapping = characterGlyphMapping(
      positionedLine.glyphs.map(({ cluster }) => cluster),
      charLine.length
    );

    const currentSelectedCharacterIndex = this.characterList.getSelectedItemIndex();

    this.characterList.setItems(charItems);
    this.glyphList.setItems(glyphItems);

    if (selectedGlyph) {
      const currentSelectedGlyphIndex =
        this.characterGlyphMapping.charToGlyphs[currentSelectedCharacterIndex]?.[0];

      const characterIndex = this.characterGlyphMapping.glyphToChars[glyphIndex][0];

      this.characterList.setSelectedItemIndex(
        glyphIndex != currentSelectedGlyphIndex
          ? characterIndex
          : currentSelectedCharacterIndex,
        false,
        true
      );

      this.glyphList.setSelectedItemIndex(glyphIndex, false, true);
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
}

const NumberFormatterOneDecimal = {
  toString(value) {
    return value ? round(value, 1).toString() : 0;
  },
};

customElements.define("panel-characters-glyphs", CharactersGlyphsPanel);
