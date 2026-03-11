import {
  getGlyphSetsUIControllers,
  glyphSetsUIStyles,
} from "@fontra/core/glyphsets-ui.js";
import * as html from "@fontra/core/html-utils.js";
import { glyphMapToItemList, isObjectEmpty } from "@fontra/core/utils.js";
import "@fontra/web-components/glyph-search-list.js";
import { Accordion } from "@fontra/web-components/ui-accordion.js";
import Panel from "./panel.js";

export default class GlyphSearchPanel extends Panel {
  identifier = "glyph-search";
  iconPath = "/images/magnifyingglass.svg";

  static styles = `
    .glyph-search-section {
      height: 100%;
      display: flex;
      gap: 0.5em;
      flex-direction: column;
      justify-content: space-between;
    }
  `;

  constructor(editorController) {
    super(editorController);
    this.glyphSearch = this.contentElement.querySelector("#glyph-search-list");
    this.glyphSearch.addEventListener("selectedGlyphNameChanged", (event) =>
      this.glyphNameChangedCallback(event.detail, false)
    );
    this.glyphSearch.addEventListener("selectedGlyphNameDoubleClicked", (event) =>
      this.glyphNameChangedCallback(event.detail, true)
    );
    this.editorController.fontController.addChangeListener({ glyphMap: null }, () => {
      this._updateFontGlyphItemList();
      this._updateSearchListContents();
    });
    this.editorController.fontController.ensureInitialized.then(() => {
      this.glyphSearch.glyphMap = this.editorController.fontController.glyphMap;
      this._updateFontGlyphItemList();
    });

    this.editorController.sceneSettingsController.addKeyListener(
      ["selectedGlyphName", "substituteGlyphName"],
      (event) => {
        if (
          event.newValue &&
          event.newValue !== this.glyphSearch.getSelectedGlyphName()
        ) {
          this.glyphSearch.setSelectedGlyphName(event.newValue);
        }
      }
    );

    this.editorController.sceneSettingsController.addKeyListener(
      ["projectGlyphSetSelection", "myGlyphSetSelection"],
      (event) => {
        if (!event.newValue.length && !event.oldValue.length) {
          // Noise during startup
          return;
        }

        this._updateSearchListContents();
      }
    );
  }

  _updateFontGlyphItemList() {
    this.fontGlyphItemList = glyphMapToItemList(
      this.editorController.fontController.glyphMap
    );
  }

  async _updateSearchListContents() {
    const { combinedGlyphMap } =
      await this.editorController.sceneController.glyphSetsController.getCombinedGlyphMap(
        this.fontGlyphItemList
      );
    this.glyphSearch.glyphMap = isObjectEmpty(combinedGlyphMap)
      ? this.editorController.fontController.glyphMap
      : combinedGlyphMap;
  }

  async glyphNameChangedCallback(glyphName, isDoubleClick) {
    if (!glyphName) {
      return;
    }

    const glyphInfo =
      this.editorController.fontController.glyphInfoFromGlyphName(glyphName);

    let selectedGlyphState = this.editorController.sceneSettings.selectedGlyph;

    if (selectedGlyphState && !isDoubleClick) {
      this.editorController.insertGlyphInfos([glyphInfo], 0, true);
    } else if (!selectedGlyphState && isDoubleClick) {
      const characterLines = [...this.editorController.sceneSettings.characterLines];

      if (!characterLines.length) {
        characterLines.push([]);
      }

      const lineIndex = characterLines.length - 1;
      const characterIndex = characterLines[lineIndex].length;
      characterLines[lineIndex].push(glyphInfo);
      this.editorController.sceneSettings.characterLines = characterLines;

      await this.editorController.sceneSettingsController.waitForKeyChange(
        "positionedLines"
      );

      selectedGlyphState =
        this.editorController.sceneModel.characterSelectionToGlyphSelection({
          lineIndex,
          characterIndex,
        });
    }

    this.editorController.sceneSettings.selectedGlyph = selectedGlyphState;
    this.editorController.sceneSettings.substituteGlyphName = glyphName;
  }

  getContentElement() {
    this.accordion = html.div({});

    this.editorController.fontController.ensureInitialized.then(() => {
      this.accordion.replaceWith(this.setupGlyphSetsAccordion());
    });

    return html.div(
      {
        class: "panel",
      },
      [
        html.div(
          {
            class: "panel-section panel-section--flex glyph-search-section",
          },
          [
            html.createDomElement("glyph-search-list", {
              id: "glyph-search-list",
            }),
            this.accordion,
          ]
        ),
      ]
    );
  }

  setupGlyphSetsAccordion() {
    const sceneSettingsController = this.editorController.sceneSettingsController;

    const accordionId = "panel-glyph-search-accordion";
    const [projectGlyphSets, myGlyphSets] = getGlyphSetsUIControllers(
      this.editorController.sceneSettingsController,
      accordionId
    );

    const accordion = new Accordion();
    accordion.id = accordionId;

    accordion.appendStyle(glyphSetsUIStyles);

    const accordionItems = [projectGlyphSets.accordionItem, myGlyphSets.accordionItem];

    accordion.items = accordionItems;

    return accordion;
  }

  async toggle(on, focus) {
    if (on && focus) {
      this.glyphSearch.focusSearchField();
    }
  }
}

customElements.define("panel-glyph-search", GlyphSearchPanel);
