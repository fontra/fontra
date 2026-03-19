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
import { showMenu } from "@fontra/web-components/menu-panel.js";
import { Accordion } from "@fontra/web-components/ui-accordion.js";
import { UIList } from "@fontra/web-components/ui-list.js";
import Panel from "./panel.js";
import { equalGlyphSelection } from "./scene-controller.js";

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

    this.sceneSettingsController.addKeyListener("shapingDebuggerMessages", (event) =>
      this.updateShapingDebuggerMessages(event.newValue)
    );
    this.sceneSettingsController.addKeyListener("shapingDebuggerBreakIndex", (event) =>
      this.updateShapingDebuggerBreakIndex(event.newValue)
    );
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
        lineIndex: this.sceneSettings.glyphRenderInfoLineIndex,
        glyphIndex: glyphIndices[0],
      };
      this.glyphList.setSelectedItemIndices(glyphIndices, false, true);
    });
    this.characterList.addEventListener("rowDoubleClicked", (event) =>
      this.replaceSelectedCharacter(event)
    );
    this.characterList.addEventListener("deleteKey", (event) =>
      this.deleteSelectedCharacter(event)
    );
    this.characterList.addEventListener("contextmenu", (event) => {
      event.preventDefault();

      const itemIndex =
        this.characterList.getItemIndexAtPoint(event.x, event.y) ??
        this.characterList.getSelectedItemIndex() ??
        0;

      if (this.characterList.items.length) {
        this.characterList.setSelectedItemIndex(itemIndex, true);
      }

      const menuItems = this.characterList.items.length
        ? [
            {
              title: "Replace this character...",
              callback: () => this.replaceSelectedCharacter(),
            },
            {
              title: "Insert character before this character...",
              callback: () => this.insertCharacter(itemIndex),
            },
            {
              title: "Insert character after this character...",
              callback: () => this.insertCharacter(itemIndex + 1),
            },
          ]
        : [
            {
              title: "Insert character...",
              callback: () => this.insertCharacter(itemIndex),
            },
          ];
      showMenu(menuItems, event);
    });

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
        title: "Advance",
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
        lineIndex: this.sceneSettings.glyphRenderInfoLineIndex,
        glyphIndex,
      };
    });
    this.glyphList.addEventListener("rowDoubleClicked", (event) =>
      this.glyphDoubleClickHandler(event)
    );

    this.shapingDebuggerList = new UIList();
    this.shapingDebuggerList.minHeight = "5em";
    this.shapingDebuggerList.settingsStorageKey = "chars-glyphs-shaping-debugger-list";
    this.shapingDebuggerList.addEventListener("listSelectionChanged", (event) =>
      this.shapingDebuggerListClickHandler(event)
    );
    this.shapingDebuggerList.columnDescriptions = [
      {
        key: "changed",
        title: "",
        width: "1.5em",
        get: (item) => (item.changed ? "🟢" : ""),
      },
      {
        key: "message",
        title: "Message",
      },
    ];

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
      {
        label: translate("sidebar.characters-glyphs.shaping-debugger"),
        open: false,
        content: this.shapingDebuggerList,
        id: "shaper-debugger",
      },
    ];

    this.accordion.onItemOpenClose = (item, open) =>
      this._accordionItemOpenClose(item, open);

    return html.div({ class: "panel" }, [
      html.div({ class: "main-section" }, [this.accordion]),
    ]);
  }

  _accordionItemOpenClose(item, open) {
    if (item.id == "shaper-debugger") {
      this.sceneSettings.shapingDebuggerEnabled = open;
    }
  }

  async update() {
    const selectedGlyph = this.sceneSettings.selectedGlyph;

    const glyphIndex = selectedGlyph?.glyphIndex;
    const lineIndex = this.sceneSettings.glyphRenderInfoLineIndex;

    const charLines = this.sceneSettings.characterLines;
    const positionedLines = this.sceneSettings.positionedLines;

    if (
      !lineIndex === undefined ||
      !charLines[lineIndex] ||
      !positionedLines[lineIndex]
    ) {
      this.characterList.setItems([]);
      this.glyphList.setItems([]);
      return;
    }

    const charLine = charLines[lineIndex];
    const positionedLine = positionedLines[lineIndex];

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

  shapingDebuggerListClickHandler(event) {
    const breakIndex = this.shapingDebuggerList.getSelectedItem()?.index;

    if (breakIndex == this.sceneSettings.shapingDebuggerBreakIndex) {
      return;
    }

    this.sceneSettings.shapingDebuggerBreakIndex = breakIndex ?? null;

    if (breakIndex == null) {
      return;
    }

    const selectedMessage = this.sceneSettings.shapingDebuggerMessages[breakIndex];
    if (selectedMessage) {
      let selectedGlyph;
      const m = selectedMessage.message.match(/at (\d+(,\d+)*)/);
      if (m) {
        const { glyphs, direction } =
          this.sceneSettings.positionedLines[
            this.sceneSettings.glyphRenderInfoLineIndex
          ];
        const adjustForDirection =
          direction == "rtl" ? (i) => glyphs.length - 1 - i : (i) => i;
        const indices = m[1].split(",").map((v) => adjustForDirection(Number(v)));
        selectedGlyph = {
          lineIndex: this.sceneSettings.glyphRenderInfoLineIndex,
          glyphIndex: indices[0],
        };
      } else {
        selectedGlyph = null;
      }
      if (!equalGlyphSelection(this.sceneSettings.selectedGlyph, selectedGlyph)) {
        this.sceneSettings.selectedGlyph = selectedGlyph;
      }
    }
  }

  updateShapingDebuggerMessages(shaperMessages) {
    shaperMessages = shaperMessages.concat([{ message: "the end" }]);

    const items = shaperMessages.map(({ message, changed }, index) => ({
      message,
      changed,
      index,
    }));
    this.shapingDebuggerList.setItems(items);
  }

  updateShapingDebuggerBreakIndex(breakIndex) {
    const itemIndex = this.shapingDebuggerList.items.findIndex(
      (item) => item.index == breakIndex && item.index != undefined
    );

    this.shapingDebuggerList.setSelectedItemIndex(
      itemIndex != -1 ? itemIndex : undefined,
      false
    );
  }

  async toggle(on, focus) {
    this.isActive = on;
    if (on) {
      this.update();
    }
  }

  async replaceSelectedCharacter(event) {
    const item = this.characterList.getSelectedItem();
    if (!item) {
      return;
    }

    const glyphName = await this.editorController.runGlyphSearchDialog(
      "Replace selected character",
      translate("dialog.replace")
    );
    if (!glyphName) {
      return;
    }

    this._insertCharacter(glyphName, item.index, true);
  }

  deleteSelectedCharacter(event) {
    const item = this.characterList.getSelectedItem();
    if (!item) {
      return;
    }

    this._insertCharacter(null, item.index, true);
    this.sceneSettings.selectedGlyph = undefined;
  }

  async insertCharacter(charIndex) {
    const glyphName = await this.editorController.runGlyphSearchDialog(
      "Index character",
      "Insert"
    );
    if (!glyphName) {
      return;
    }

    this._insertCharacter(glyphName, charIndex, false);
  }

  _insertCharacter(glyphName, charIndex, replace) {
    let lineIndex = 0;
    if (this.sceneSettings.selectedGlyph) {
      ({ lineIndex } = this.sceneSettings.selectedGlyph);
    }
    const glyphInfo = glyphName
      ? this.editorController.sceneController.glyphInfoFromGlyphName(glyphName)
      : null;
    const characterLines = [...this.sceneSettings.characterLines];
    const items = glyphInfo ? [glyphInfo] : [];
    characterLines[lineIndex].splice(charIndex, replace ? 1 : 0, ...items);
    this.sceneSettings.characterLines = characterLines;
  }

  glyphDoubleClickHandler(event) {
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
