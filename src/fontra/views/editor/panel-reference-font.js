import * as html from "/core/unlit.js";
import Panel from "./panel.js";

import { registerVisualizationLayerDefinition } from "./visualization-layer-definitions.js";

export default class ReferenceFontPanel extends Panel {
  name = "reference-font";
  icon = "/images/reference.svg";

  getContentElement() {
    return html.div(
      {
        class: "sidebar-reference-font",
      },
      [
        html.createDomElement("reference-font", {
          id: "reference-font",
        }),
      ]
    );
  }

  attach(editorController) {
    const referenceFontElement = document.querySelector("#reference-font");
    referenceFontElement.controller.addKeyListener("referenceFontName", (event) => {
      if (event.newValue) {
        editorController.visualizationLayersSettings.model[
          "fontra.reference.font"
        ] = true;
      }
      editorController.canvasController.requestUpdate();
    });
    let charOverride;
    referenceFontElement.controller.addKeyListener("charOverride", (event) => {
      charOverride = event.newValue;
      editorController.canvasController.requestUpdate();
    });
    const referenceFontModel = referenceFontElement.model;

    registerVisualizationLayerDefinition({
      identifier: "fontra.reference.font",
      name: "Reference font",
      selectionMode: "editing",
      userSwitchable: true,
      defaultOn: true,
      zIndex: 100,
      screenParameters: { strokeWidth: 1 },
      colors: { fillColor: "#AAA6" },
      // colorsDarkMode: { strokeColor: "red" },
      draw: (context, positionedGlyph, parameters, model, controller) => {
        if (!referenceFontModel.referenceFontName) {
          return;
        }
        let text = charOverride || positionedGlyph.character;
        if (!text && positionedGlyph.glyphName.includes(".")) {
          const baseGlyphName = positionedGlyph.glyphName.split(".")[0];
          const codePoint = (editorController.fontController.glyphMap[baseGlyphName] ||
            [])[0];
          if (codePoint) {
            text = String.fromCodePoint(codePoint);
          }
        }
        if (!text) {
          return;
        }
        context.lineWidth = parameters.strokeWidth;
        context.font = `${model.fontController.unitsPerEm}px ${referenceFontModel.referenceFontName}, AdobeBlank`;
        context.scale(1, -1);
        if (parameters.fillColor) {
          context.fillStyle = parameters.fillColor;
          context.fillText(text, 0, 0);
        }
        if (parameters.strokeColor) {
          context.strokeStyle = parameters.strokeColor;
          context.strokeText(text, 0, 0);
        }
      },
    });
  }
}
