import Panel from "./panel.js";
import * as html from "/core/html-utils.js";
import { translate } from "/core/localization.js";
import {
  getCodePointFromGlyphName,
  getSuggestedGlyphName,
} from "/core/server-utils.js";
import { unicodeMadeOf, unicodeUsedBy } from "/core/unicode-utils.js";

import { getCharFromCodePoint, throttleCalls } from "/core/utils.js";
import { GlyphCell } from "/web-components/glyph-cell.js";
import { showMenu } from "/web-components/menu-panel.js";
import { Accordion } from "/web-components/ui-accordion.js";

export default class RelatedGlyphPanel extends Panel {
  identifier = "related-glyphs";
  iconPath = "/tabler-icons/binary-tree-2.svg";

  static styles = `
    .sidebar-glyph-relationships {
      box-sizing: border-box;
      height: calc(100% - 2em); // Would be nice to do without the calc
      width: 100%;
    }

    #related-glyphs-header {
      padding: 1em 1em 0 1em;
      text-wrap: wrap;
    }

    .no-related-glyphs {
      color: #AAA;
      padding-top: 1em;
    }
  `;

  constructor(editorController) {
    super(editorController);
    this.throttledUpdate = throttleCalls((senderID) => this.update(senderID), 100);
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;

    this.setupGlyphRelationshipsElement();

    this.sceneController.sceneSettingsController.addKeyListener(
      ["selectedGlyphName"],
      (event) => this.throttledUpdate()
    );

    this.fontController.addChangeListener({ glyphMap: null }, (event) =>
      this.throttledUpdate()
    );
  }

  getContentElement() {
    this.accordion = new Accordion();

    this.accordion.appendStyle(`
    .placeholder-label {
      font-size: 0.9em;
      opacity: 40%;
    }

    .related-glyphs-accordion-item {
      height: 100%;
      width: 100%;
      overflow-y: scroll;
      white-space: normal;
    }
    `);

    this.accordion.items = [
      {
        label: translate("sidebar.related-glyphs.alternate-glyphs"),
        open: true,
        content: html.div({ class: "related-glyphs-accordion-item" }, []),
        getRelatedGlyphsFunc: getRelatedGlyphsByExtension,
      },
      {
        label: translate("sidebar.related-glyphs.components-used-by-this-glyph"),
        open: true,
        content: html.div({ class: "related-glyphs-accordion-item" }, []),
        getRelatedGlyphsFunc: getComponentGlyphs,
      },
      {
        label: translate(
          "sidebar.related-glyphs.glyphs-using-this-glyph-as-a-component"
        ),
        open: true,
        content: html.div({ class: "related-glyphs-accordion-item" }, []),
        getRelatedGlyphsFunc: getUsedByGlyphs,
      },
      {
        label: translate("sidebar.related-glyphs.character-decomposition"),
        open: true,
        content: html.div({ class: "related-glyphs-accordion-item" }, []),
        getRelatedGlyphsFunc: getUnicodeDecomposed,
      },
      {
        label: translate("sidebar.related-glyphs.character-decompose-with-character"),
        open: true,
        content: html.div({ class: "related-glyphs-accordion-item" }, []),
        getRelatedGlyphsFunc: getUnicodeUsedBy,
      },
    ];

    return html.div(
      {
        class: "sidebar-glyph-relationships",
      },
      [
        html.div({ id: "related-glyphs-header" }, [
          translate("sidebar.related-glyphs.related-glyphs"),
        ]),
        this.accordion,
      ]
    );
  }

  setupGlyphRelationshipsElement() {
    this.relatedGlyphsHeaderElement = this.contentElement.querySelector(
      "#related-glyphs-header"
    );
  }

  async update() {
    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    const character = glyphName
      ? getCharFromCodePoint(
          this.fontController.codePointForGlyph(glyphName) ||
            (await getCodePointFromGlyphName(glyphName))
        ) || ""
      : "";
    const codePoint = character ? character.codePointAt(0) : undefined;

    const varGlyphController =
      await this.sceneController.sceneModel.getSelectedVariableGlyphController();
    const varGlyph = varGlyphController?.glyph;

    const displayGlyphString =
      character && character != glyphName ? `“${character}”, ${glyphName}` : glyphName;

    this.relatedGlyphsHeaderElement.innerHTML = glyphName
      ? `<b>${translate("sidebar.related-glyphs.title", displayGlyphString)}</b>`
      : `<b>${translate("sidebar.related-glyphs")}</b>`;

    const results = [];

    for (const item of this.accordion.items) {
      this._updateAccordionItem(item, glyphName, codePoint).then((hasResult) => {
        results.push(hasResult);
        if (results.length === this.accordion.items.length) {
          if (!results.some((hasResult) => hasResult)) {
            this.relatedGlyphsHeaderElement.appendChild(
              html.div({ class: "no-related-glyphs" }, [
                glyphName
                  ? translate(
                      "sidebar.related-glyphs.no-related-glyphs-or-characters-were-found"
                    )
                  : translate("sidebar.related-glyphs.no-glyph-selected"),
              ])
            );
          }
        }
      });
    }

    this.accordion.hidden = !glyphName;
  }

  async _updateAccordionItem(item, glyphName, codePoint) {
    const element = item.content;
    const parent = findParentWithClass(element, "ui-accordion-item");

    element.innerHTML = "";
    let hideAccordionItem = true;
    if (glyphName) {
      element.appendChild(
        html.span({ class: "placeholder-label" }, [
          translate("sidebar.related-glyphs.loading"),
        ])
      );
      const relatedGlyphs = await item.getRelatedGlyphsFunc(
        this.fontController,
        glyphName,
        codePoint
      );

      if (relatedGlyphs?.length) {
        const documentFragment = document.createDocumentFragment();
        for (const { glyphName, codePoints } of relatedGlyphs) {
          const glyphCell = new GlyphCell(
            this.fontController,
            glyphName,
            codePoints,
            this.sceneController.sceneSettingsController,
            "fontLocationSourceMapped"
          );
          glyphCell.ondblclick = (event) => this.handleDoubleClick(event, glyphCell);
          glyphCell.addEventListener("contextmenu", (event) =>
            this.handleContextMenu(event, glyphCell, item)
          );

          documentFragment.appendChild(glyphCell);
        }
        element.innerHTML = "";
        element.appendChild(documentFragment);

        // At least in Chrome, we need to reset the scroll position, but it doesn't
        // work if we do it right away, only after the next event iteration.
        setTimeout(() => {
          element.scrollTop = 0;
        }, 0);

        hideAccordionItem = false;
      } else {
        element.innerHTML = "";
      }
    }
    parent.hidden = hideAccordionItem;
    return !hideAccordionItem;
  }

  handleDoubleClick(event, glyphCell) {
    this.insertGlyphIntoTextString(glyphCell, event.altKey ? 1 : 0, !event.altKey);
  }

  insertGlyphIntoTextString(glyphCell, where, select) {
    const glyphInfos = [
      {
        glyphName: glyphCell.glyphName,
        character: getCharFromCodePoint(glyphCell.codePoints[0]),
      },
    ];
    this.editorController.insertGlyphInfos(glyphInfos, where, select);
  }

  handleContextMenu(event, glyphCell, item) {
    event.preventDefault();

    const items = [
      {
        title: translate("sidebar.related-glyphs.replace-selected-glyph"),
        callback: () => {
          this.insertGlyphIntoTextString(glyphCell, 0, true);
        },
      },
      {
        title: translate("sidebar.related-glyphs.insert-after-selected-glyph"),
        callback: () => {
          this.insertGlyphIntoTextString(glyphCell, 1, false);
        },
      },
      {
        title: translate(
          "sidebar.related-glyphs.insert-after-selected-glyph-and-select"
        ),
        callback: () => {
          this.insertGlyphIntoTextString(glyphCell, 1, true);
        },
      },
      {
        title: translate("sidebar.related-glyphs.insert-before-selected-glyph"),
        callback: () => {
          this.insertGlyphIntoTextString(glyphCell, -1, false);
        },
      },
      {
        title: translate(
          "sidebar.related-glyphs.insert-before-selected-glyph-and-select"
        ),
        callback: () => {
          this.insertGlyphIntoTextString(glyphCell, -1, true);
        },
      },
    ];
    const { x, y } = event;
    showMenu(items, { x: x + 1, y: y - 1 }, document.documentElement);
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }
}

function getRelatedGlyphsByExtension(fontController, targetGlyphName, targetCodePoint) {
  const targetBaseGlyphName = targetGlyphName.split(".")[0];
  const glyphNames = Object.keys(fontController.glyphMap)
    .filter((glyphName) => {
      const baseGlyphName = glyphName.split(".")[0];
      return baseGlyphName == targetBaseGlyphName && glyphName != targetGlyphName;
    })
    .sort();
  return addCharInfo(fontController, glyphNames);
}

async function getComponentGlyphs(fontController, targetGlyphName, targetCodePoint) {
  const varGlyph = await fontController.getGlyph(targetGlyphName);
  const componentNames = [...(varGlyph?.getAllComponentNames() || [])];
  componentNames.sort();

  return addCharInfo(fontController, componentNames);
}

async function getUsedByGlyphs(fontController, targetGlyphName, targetCodePoint) {
  const glyphNames = await fontController.findGlyphsThatUseGlyph(targetGlyphName);
  return addCharInfo(fontController, glyphNames);
}

async function getUnicodeDecomposed(fontController, targetGlyphName, targetCodePoint) {
  return await _getRelatedUnicode(
    fontController,
    targetGlyphName,
    targetCodePoint,
    unicodeMadeOf
  );
}

async function getUnicodeUsedBy(fontController, targetGlyphName, targetCodePoint) {
  return await _getRelatedUnicode(
    fontController,
    targetGlyphName,
    targetCodePoint,
    unicodeUsedBy
  );
}

async function _getRelatedUnicode(
  fontController,
  targetGlyphName,
  targetCodePoint,
  uniFunc
) {
  const codePoint =
    fontController.codePointForGlyph(targetGlyphName) || targetCodePoint;
  if (!codePoint) {
    return [];
  }
  const usedByCodePoints = uniFunc(codePoint);
  const glyphInfo = [];
  for (const codePoint of usedByCodePoints) {
    const glyphName =
      fontController.characterMap[codePoint] ||
      (await getSuggestedGlyphName(codePoint));
    glyphInfo.push({ glyphName, codePoints: [codePoint] });
  }
  return glyphInfo;
}

function addCharInfo(fontController, glyphNames) {
  const glyphMap = fontController.glyphMap;
  return glyphNames.map((glyphName) => {
    return { glyphName, codePoints: glyphMap[glyphName] || [] };
  });
}

function findParentWithClass(element, parentClass) {
  let parent = element;
  do {
    parent = parent.parentElement;
  } while (parent && !parent.classList.contains(parentClass));
  return parent;
}

customElements.define("panel-related-glyph", RelatedGlyphPanel);
