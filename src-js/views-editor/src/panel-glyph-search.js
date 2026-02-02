import * as html from "@fontra/core/html-utils.js";
import "@fontra/web-components/glyph-search-list.js";
import Panel from "./panel.js";

export default class GlyphSearchPanel extends Panel {
  identifier = "glyph-search";
  iconPath = "/images/magnifyingglass.svg";

  static styles = `
    .glyph-search-section {
      height: 100%;
      display: flex;
      flex-direction: column;
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
      this.glyphSearch.updateGlyphNamesListContent();
    });
    this.editorController.fontController.ensureInitialized.then(() => {
      this.glyphSearch.glyphMap = this.editorController.fontController.glyphMap;
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
          ]
        ),
      ]
    );
  }

  async toggle(on, focus) {
    if (on && focus) {
      this.glyphSearch.focusSearchField();
    }
  }
}

customElements.define("panel-glyph-search", GlyphSearchPanel);
