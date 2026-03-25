import { applicationSettingsController } from "@fontra/core/application-settings.js";
import { getGlyphInfoFromCodePoint } from "@fontra/core/glyph-data.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { isDisjoint, updateSet } from "@fontra/core/set-ops.js";
import { characterGlyphMapping } from "@fontra/core/shaper.js";
import {
  assert,
  makeUPlusStringFromCodePoint,
  range,
  round,
  throttleCalls,
} from "@fontra/core/utils.js";
import { showMenu } from "@fontra/web-components/menu-panel.js";
import {
  Accordion,
  makeAccordionHeaderButton,
} from "@fontra/web-components/ui-accordion.js";
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

    this.sceneSettingsController.addKeyListener(
      ["applyTextShaping", "shapingDebuggerMessages"],
      (event) =>
        this.updateShapingDebuggerMessages(
          this.sceneSettings.shapingDebuggerMessages ?? []
        )
    );
    applicationSettingsController.addKeyListener(
      "shapingDebuggerShowIneffectiveItems",
      (event) =>
        this.updateShapingDebuggerMessages(
          this.sceneSettings.shapingDebuggerMessages ?? []
        )
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
    this.shapingDebuggerList.rowsElement.addEventListener("keydown", (event) =>
      this._shapingDebuggerHandleArrowLeftRight(event)
    );
    this.shapingDebuggerList.columnDescriptions = [
      {
        key: "formattedMessage",
        title: "Message",
      },
    ];
    this.shapingDebuggerList.appendStyle(`
      .ot-tag {
        padding: 0em 0.2em 0em 0.2em;
        border-radius: 0.25em;
        font-family: monospace;
      }

      .table-tag {
        background-color: #8CF5;
      }

      .script-tag {
        background-color: #8CF5;
      }

      .feature-tag {
        background-color: #C8F5;
      }

      .indent-block {
        display: inline-block;
        width: 1em; // don't change: it'll change the icon size
        height: 1em;
        margin-right: 0.2em; // change this to tune the indent level
      }

      .changed-icon {
        transform: scale(110%) translate(0, 15%);
        margin-right: 0.25em;
      }

      .changed-icon.nested {
        color: #9999;
      }

      .folding-icon {
        transform: scale(125%) translate(0, 0%) rotate(180deg);
        margin-right: 0.25em;
        transition: 120ms;
      }

      .folding-icon.closed {
        transform: scale(125%) translate(0, 5%) rotate(90deg);
        margin-right: 0.25em;
      }

    `);

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
        label: translate("sidebar.characters-glyphs.shaping-debugger"),
        open: false,
        content: this.shapingDebuggerList,
        id: "shaper-debugger",
        auxiliaryHeaderElement: makeAccordionHeaderButton({
          icon: "menu-2",
          id: "shaping-debugger-options-button",
          tooltip: translate(
            "sidebar.characters-glyphs.shaping-debugger.options-menu-tooltip"
          ),
          tooltipposition: "left",
          onclick: (event) => this.showShapingDebuggerOptionsMenu(event),
        }),
      },
      {
        label: translate("sidebar.characters-glyphs.output-glyphs"),
        open: true,
        content: this.glyphList,
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

  showShapingDebuggerOptionsMenu() {
    const menuItems = [
      {
        title: translate(
          "sidebar.characters-glyphs.shaping-debugger.show-ineffective-items"
        ),
        callback: () => {
          applicationSettingsController.model.shapingDebuggerShowIneffectiveItems =
            !applicationSettingsController.model.shapingDebuggerShowIneffectiveItems;
        },
        checked:
          applicationSettingsController.model.shapingDebuggerShowIneffectiveItems,
      },
    ];

    const button = this.accordion.querySelector("#shaping-debugger-options-button");
    const buttonRect = button.getBoundingClientRect();
    showMenu(menuItems, { x: buttonRect.left, y: buttonRect.bottom });
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

  async shapingDebuggerListClickHandler(event) {
    const breakIndex = this.shapingDebuggerList.getSelectedItem()?.breakIndex;

    if (breakIndex == this.sceneSettings.shapingDebuggerBreakIndex) {
      return;
    }

    this.sceneSettings.shapingDebuggerBreakIndex = breakIndex ?? null;

    if (breakIndex == null) {
      return;
    }

    // We need to wait for positionedLines to get updated so we can flip the
    // glyph index when doing RTL
    await this.sceneSettingsController.waitForKeyChange("positionedLines");

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

  _shapingDebuggerHandleArrowLeftRight(event) {
    if (event.key != "ArrowLeft" && event.key != "ArrowRight") {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const messageItem = this.shapingDebuggerList.getSelectedItem();
    if (messageItem) {
      this._toggleShaperMessageItem(
        messageItem,
        event.altKey,
        event.key == "ArrowRight"
      );
    }
  }

  updateShapingDebuggerMessages(shaperMessages) {
    if (!this.sceneSettings.applyTextShaping) {
      this.shapingDebuggerList.setItems([]);
      return;
    }

    const items = this._structureShaperMessages(shaperMessages);

    this.shapingDebuggerList.setItems(items);
  }

  _structureShaperMessages(shaperMessages) {
    const rootMessageItem = { children: [], childChanged: true };
    const stack = [rootMessageItem];

    shaperMessages.forEach((message, breakIndex) => {
      // For now we can't use "recurse/recursed" because these messages aren't
      // guaranteed to be balanced.
      // if (message.message.match(/^end (?!processing)|recursed /)) {
      if (message.message.match(/^end (?!processing)/)) {
        const topMessageItem = stack.pop();
        topMessageItem.childChanged = anyChildChanged(topMessageItem);

        const { startToken } = topMessageItem;

        const endToken = message.message.startsWith("end ")
          ? message.message.slice(4) // strip "end "
          : message.message.slice(9); // strip "recursed " // See comment above

        assert(
          startToken.startsWith(endToken),
          `message stack mismatch: expected ${startToken}, found ${endToken}`
        );
        return;
      }

      const messageItem = {
        ...message,
        breakIndex,
        level: stack.length - 1,
        hidden: stack.at(-1).hideChildren,
      };

      stack.at(-1).children.push(messageItem);

      // For now we can't use "recurse/recursed" because these messages aren't
      // guaranteed to be balanced.
      // if (message.message.match(/^start (?!processing)|recursing /)) {
      if (message.message.match(/^start (?!processing)/)) {
        const strippedMessage = message.message.startsWith("start ")
          ? message.message.slice(6) // strip "start "
          : message.message;
        const startToken = message.message.startsWith("start ")
          ? strippedMessage
          : message.message.slice(10); // strip "recursing " // See comment above

        messageItem.children = [];
        messageItem.open = stack.length < 2;
        messageItem.message = strippedMessage;
        messageItem.startToken = startToken;
        messageItem.hideChildren = !messageItem.open;
        stack.push(messageItem);
      }
    });

    assert(stack.length == 1, `shaping debugger start/end mismatch, stack: ${stack}`);

    const messageItems = flattenMessageItemChildren(
      rootMessageItem,
      !applicationSettingsController.model.shapingDebuggerShowIneffectiveItems
    ).slice(1); // drop the rootMessageItem

    // Add indentation, add folding control, format message
    messageItems.forEach((messageItem, rowIndex) => {
      messageItem.rowIndex = rowIndex;
      const { message, changed, level, children } = messageItem;

      const changedElement =
        changed || messageItem.childChanged
          ? html.createDomElement("inline-svg", {
              class: `indent-block changed-icon ${
                messageItem.childChanged ? "nested" : ""
              }`,
              src: "/tabler-icons/arrow-big-right.svg",
            })
          : html.span({ class: "indent-block changed-icon" });

      const foldingChevron = children?.length
        ? html.createDomElement("inline-svg", {
            class: `indent-block folding-icon ${messageItem.open ? "" : "closed"}`,
            src: "/tabler-icons/chevron-up.svg",
            onclick: (event) => {
              event.preventDefault();
              event.stopImmediatePropagation();
              this._toggleShaperMessageItem(messageItem, event.altKey);
            },
          })
        : html.span({ class: "indent-block folding-icon" });

      messageItem.formattedMessage = html.span({}, [
        changedElement,
        ...repeat(level, () => html.span({ class: "indent-block" })),
        foldingChevron,
        ...formatShaperMessage(message),
      ]);
    });

    return messageItems;
  }

  _toggleShaperMessageItem(messageItem, toggleChildren = false, force = undefined) {
    if (!messageItem.children) {
      return;
    }

    messageItem.open = force ?? !messageItem.open;

    const foldingChevron = messageItem.formattedMessage.querySelector(".folding-icon");
    foldingChevron.classList.toggle("closed", !messageItem.open);

    const childrenToToggle = [...messageItem.children];
    for (const child of childrenToToggle) {
      if (child.children) {
        if (toggleChildren) {
          this._toggleShaperMessageItem(child, true, messageItem.open);
        } else if (!messageItem.open || child.open) {
          childrenToToggle.push(...child.children);
        }
      }
      const rowElement = this.shapingDebuggerList.getRowElement(child.rowIndex);
      rowElement?.classList.toggle("hidden", !messageItem.open);
    }
  }

  updateShapingDebuggerBreakIndex(breakIndex) {
    let itemIndex = this.shapingDebuggerList.items.findIndex(
      (item) => item.breakIndex == breakIndex && item.breakIndex != undefined
    );

    if (itemIndex == -1) {
      itemIndex = undefined;
    }

    if (this.shapingDebuggerList.getSelectedItemIndex() != itemIndex) {
      this.shapingDebuggerList.setSelectedItemIndex(itemIndex, false, true);
    }
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

function formatShaperMessage(message) {
  const parts = [message];

  for (const [cls, regex] of [
    ["ot-tag table-tag", /(?<=table )(GSUB|GPOS)/],
    ["ot-tag script-tag", /(?<=script tag )'(.+?)'/],
    ["ot-tag feature-tag", /(?<=feature )'(.+?)'/],
  ]) {
    const part = parts.at(-1);
    const m = part.match(regex);
    if (m) {
      const [match, repl] = m;
      parts.splice(-1, 1, part.slice(0, m.index));
      parts.push(html.span({ class: cls }, [repl]));
      parts.push(part.slice(m.index + match.length));
    }
  }

  return parts;
}

function* repeat(n, f) {
  for (const i of range(n)) {
    yield f(i);
  }
}

function anyChildChanged(messageItem) {
  if (!messageItem.children?.length) {
    return false;
  }
  return messageItem.children.some((child) => child.changed || anyChildChanged(child));
}

function flattenMessageItemChildren(messageItem, filterIneffective = false) {
  if (
    filterIneffective &&
    !messageItem.changed &&
    !messageItem.childChanged &&
    !messageItem.message.match(/recursing|start processing|end processing/)
  ) {
    return [];
  }
  return [
    messageItem,
    ...(messageItem.children?.length
      ? messageItem.children.flatMap((childItem) =>
          flattenMessageItemChildren(childItem, filterIneffective)
        )
      : []),
  ];
}

customElements.define("panel-characters-glyphs", CharactersGlyphsPanel);
