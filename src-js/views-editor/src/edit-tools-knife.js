import { translate } from "@fontra/core/localization.js";
import { slicePaths } from "@fontra/core/path-functions.js";
import { mapObjectValues, zip } from "@fontra/core/utils.js";
import * as vector from "@fontra/core/vector.js";
import { constrainHorVerDiag } from "./edit-behavior.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import {
  fillRoundNode,
  glyphSelector,
  registerVisualizationLayerDefinition,
  strokeLine,
} from "./visualization-layer-definitions.js";

export class KnifeTool extends BaseTool {
  iconPath = "/tabler-icons/slice.svg";
  identifier = "knife-tool";

  setCursor() {
    if (this.sceneModel.selectedGlyph?.isEditing) {
      this.canvasController.canvas.style.cursor = "crosshair";
    }
  }

  handleHover(event) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      this.editor.tools["pointer-tool"].handleHover(event);
      return;
    }
    this.setCursor();
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      await this.editor.tools["pointer-tool"].handleDrag(eventStream, initialEvent);
      return;
    }

    if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
      return;
    }

    const pointA = this.sceneController.selectedGlyphPoint(initialEvent);
    this.sceneModel.knifeToolPointA = pointA;
    const glyphController = await this.sceneModel.getSelectedStaticGlyphController();

    let pointB;
    let intersections;
    for await (const event of eventStream) {
      const point = this.sceneController.selectedGlyphPoint(event);
      if (point.x === undefined) {
        // We can receive non-pointer events like keyboard events: ignore
        continue;
      }

      if (event.shiftKey) {
        const delta = constrainHorVerDiag(vector.subVectors(point, pointA));
        pointB = vector.addVectors(pointA, delta);
      } else {
        pointB = point;
      }

      this.sceneModel.knifeToolPointB = pointB;
      this.sceneModel.knifeToolIntersections = intersections =
        glyphController.pathHitTester.lineIntersections(pointA, pointB);

      this.canvasController.requestUpdate();
    }

    delete this.sceneModel.knifeToolPointB;
    delete this.sceneModel.knifeToolIntersections;
    this.canvasController.requestUpdate();

    if (intersections.length >= 1) {
      this.doSliceGlyph(intersections);
    }
  }

  async doSliceGlyph(intersections) {
    this.sceneController.selection = new Set(); // Clear selection

    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    const varGlyph = positionedGlyph.varGlyph.glyph;
    const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
      varGlyph.layers
    );
    const layerPaths = mapObjectValues(editLayerGlyphs, (layerGlyph) =>
      layerGlyph.path.copy()
    );
    slicePaths(intersections, ...Object.values(layerPaths));

    await this.sceneController.editGlyphAndRecordChanges(
      (glyph) => {
        for (const [layerName, layerPath] of Object.entries(layerPaths)) {
          glyph.layers[layerName].glyph.path = layerPath;
        }
        return translate("edit-tools-knife.undo.slice-glyph");
      },
      undefined,
      true
    );
  }

  deactivate() {
    super.deactivate();
    this.canvasController.requestUpdate();
  }
}

registerVisualizationLayerDefinition({
  identifier: "fontra.knifetool.line",
  name: "Knife tool line",
  selectionFunc: glyphSelector("editing"),
  zIndex: 500,
  screenParameters: { strokeWidth: 1, nodeSize: 10 },
  colors: { strokeColor: "#1118", nodeColor: "#3080FF80" },
  colorsDarkMode: { strokeColor: "#FFFB", nodeColor: "#50A0FF80" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const pointA = model.knifeToolPointA;
    const pointB = model.knifeToolPointB;
    if (!pointA || !pointB) {
      return;
    }

    context.strokeStyle = parameters.strokeColor;
    context.lineWidth = parameters.strokeWidth;
    strokeLine(context, pointA.x, pointA.y, pointB.x, pointB.y);

    context.fillStyle = parameters.nodeColor;
    for (const intersection of model.knifeToolIntersections) {
      fillRoundNode(context, intersection, parameters.nodeSize);
    }
  },
});
