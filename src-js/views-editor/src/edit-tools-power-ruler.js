import { translate } from "@fontra/core/localization.js";
import { range, round, throttleCalls } from "@fontra/core/utils.js";
import * as vector from "@fontra/core/vector.js";
import { constrainHorVerDiag } from "./edit-behavior.js";
import { BaseTool } from "./edit-tools-base.js";
import {
  registerVisualizationLayerDefinition,
  strokeLine,
} from "./visualization-layer-definitions.js";

let thePowerRulerTool; // singleton

const POWER_RULER_IDENTIFIER = "fontra.power.ruler";

registerVisualizationLayerDefinition({
  identifier: POWER_RULER_IDENTIFIER,
  name: "sidebar.user-settings.glyph.powerruler",
  selectionMode: "editing",
  userSwitchable: true,
  defaultOn: true,
  zIndex: 600,
  screenParameters: { strokeWidth: 1, fontSize: 12, intersectionRadius: 4 },
  colors: {
    strokeColor: "#0004",
    insideBlobColor: "#FFFB",
    insideTextColor: "#000B",
    outsideBlobColor: "#000B",
    outsideTextColor: "#FFFB",
    intersectionColor: "#F085",
  },
  colorsDarkMode: {
    strokeColor: "#FFF6",
    insideBlobColor: "#444B",
    insideTextColor: "#FFFB",
    outsideBlobColor: "#FFFB",
    outsideTextColor: "#444B",
    intersectionColor: "#F696",
  },
  draw: (context, positionedGlyph, parameters, model, controller) =>
    thePowerRulerTool?.draw(context, positionedGlyph, parameters, model, controller),
});

export class PowerRulerTool extends BaseTool {
  iconPath = "/images/ruler.svg";
  identifier = "power-ruler-tool";

  constructor(editor) {
    super(editor);
    thePowerRulerTool = this;
    this.fontController = editor.fontController;
    this.glyphRulers = {};
    this.active = editor.visualizationLayersSettings.model[POWER_RULER_IDENTIFIER];

    editor.sceneSettingsController.addKeyListener(
      ["fontLocationSourceMapped", "glyphLocation"],
      throttleCalls(() => setTimeout(() => this.locationChanged(), 0), 20)
    );

    editor.visualizationLayersSettings.addKeyListener(
      POWER_RULER_IDENTIFIER,
      (event) => {
        this.active = event.newValue;
        if (event.newValue) {
          this.recalc();
        }
      }
    );

    editor.visualizationLayersSettings.addKeyListener(
      "fontra.cjk.design.frame",
      (event) => this.recalc()
    );

    this.sceneController.addCurrentGlyphChangeListener((event) => {
      this.recalc();
    });
  }

  get currentGlyphName() {
    return this.sceneSettings.selectedGlyphName;
  }

  draw(context, positionedGlyph, parameters, model, controller) {
    if (!this.currentGlyphName) {
      return; // Shouldn't happen
    }
    const rulerData = this.glyphRulers[this.currentGlyphName];
    if (!rulerData) {
      return;
    }
    const { intersections, measurePoints } = rulerData;
    if (intersections?.length < 2) {
      return;
    }
    const p1 = intersections[0];
    const p2 = intersections.at(-1);

    context.lineWidth = parameters.strokeWidth;
    context.strokeStyle = parameters.strokeColor;
    strokeLine(context, p1.x, p1.y, p2.x, p2.y);

    context.fillStyle = parameters.intersectionColor;
    for (const intersection of intersections) {
      fillCircle(
        context,
        intersection.x,
        intersection.y,
        parameters.intersectionRadius
      );
    }

    context.font = `bold ${parameters.fontSize}px fontra-ui-regular, sans-serif`;
    context.textAlign = "center";

    context.scale(1, -1);
    for (const measurePoint of measurePoints) {
      if (measurePoint.distance < 0.1) {
        continue;
      }
      const distance = measurePoint.distance.toString();
      context.fillStyle = measurePoint.inside
        ? parameters.insideBlobColor
        : parameters.outsideBlobColor;
      const width = context.measureText(distance).width;
      fillPill(
        context,
        measurePoint.x,
        -measurePoint.y,
        width + parameters.fontSize,
        parameters.fontSize * 1.3
      );
      context.fillStyle = measurePoint.inside
        ? parameters.insideTextColor
        : parameters.outsideTextColor;
      context.fillText(
        distance,
        measurePoint.x,
        -measurePoint.y + parameters.fontSize * 0.33
      );
    }
  }

  glyphChanged(glyphName) {
    this.recalc();
  }

  locationChanged() {
    this.recalc();
  }

  async recalc() {
    if (!this.active || !this.currentGlyphName) {
      return;
    }
    const ruler = this.glyphRulers[this.currentGlyphName];
    if (!ruler) {
      return;
    }
    const glyphController = await this.sceneModel.getSelectedStaticGlyphController();
    const extraLines = this.computeSideBearingLines(glyphController);

    this.glyphRulers[this.currentGlyphName] = this.recalcRulerFromLine(
      glyphController,
      ruler.basePoint,
      ruler.directionVector,
      extraLines
    );
    this.canvasController.requestUpdate();
  }

  recalcRulerFromPoint(glyphController, point, shiftConstrain) {
    delete this.glyphRulers[this.currentGlyphName];

    const extraLines = this.computeSideBearingLines(glyphController);

    const pathHitTester = glyphController.flattenedPathHitTester;
    const nearestHit = pathHitTester.findNearest(point, extraLines);
    if (nearestHit) {
      const derivative = nearestHit.segment.bezier.derivative(nearestHit.t);
      let directionVector = vector.normalizeVector({
        x: -derivative.y,
        y: derivative.x,
      });

      if (shiftConstrain) {
        directionVector = constrainHorVerDiag(directionVector);
      }

      this.glyphRulers[this.currentGlyphName] = this.recalcRulerFromLine(
        glyphController,
        point,
        directionVector,
        extraLines
      );
    }
    this.canvasController.requestUpdate();
  }

  recalcRulerFromLine(glyphController, basePoint, directionVector, extraLines) {
    const pathHitTester = glyphController.flattenedPathHitTester;

    const intersections = pathHitTester.rayIntersections(
      basePoint,
      directionVector,
      extraLines
    );
    const measurePoints = [];
    let winding = 0;
    for (const i of range(intersections.length - 1)) {
      winding += intersections[i].winding;
      const j = i + 1;
      const v = vector.subVectors(intersections[j], intersections[i]);
      const measurePoint = vector.addVectors(
        intersections[i],
        vector.mulVectorScalar(v, 0.5)
      );
      measurePoint.distance = round(Math.hypot(v.x, v.y), 1);
      measurePoint.inside = !!winding;
      measurePoints.push(measurePoint);
    }
    return {
      basePoint,
      directionVector,
      intersections,
      measurePoints,
    };
  }

  computeSideBearingLines(glyphController) {
    const extraLines = [];
    let doTopAndBottom = false;
    let left, right, top, bottom;
    if (this.editor.visualizationLayersSettings.model["fontra.cjk.design.frame"]) {
      doTopAndBottom = true;
      const { frameBottomLeft, frameHeight } =
        this.editor.cjkDesignFrame.cjkDesignFrameParameters;
      left = frameBottomLeft.x;
      right = glyphController.xAdvance - frameBottomLeft.x;
      bottom = frameBottomLeft.y;
      top = bottom + frameHeight;
    } else {
      left = 0;
      right = glyphController.xAdvance;
      top = this.fontController.unitsPerEm;
      bottom = -this.fontController.unitsPerEm;
    }

    for (const x of [left, right]) {
      extraLines.push({ p1: { x: x, y: bottom }, p2: { x: x, y: top } });
    }

    if (doTopAndBottom) {
      for (const y of [bottom, top]) {
        extraLines.push({ p1: { x: left, y: y }, p2: { x: right, y: y } });
      }
    }
    return extraLines;
  }

  haveHoveredGlyph(event) {
    const point = this.sceneController.localPoint(event);
    return !!this.sceneModel.glyphAtPoint(point);
  }

  handleHover(event) {
    if (!this.sceneModel.selectedGlyph?.isEditing || this.haveHoveredGlyph(event)) {
      this.editor.tools["pointer-tool"].handleHover(event);
      return;
    }
    this.setCursor();
  }

  setCursor() {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      this.editor.tools["pointer-tool"].setCursor();
    } else {
      this.canvasController.canvas.style.cursor = "default";
    }
  }

  async handleDrag(eventStream, initialEvent) {
    if (
      !this.sceneModel.selectedGlyph?.isEditing ||
      this.haveHoveredGlyph(initialEvent)
    ) {
      await this.editor.tools["pointer-tool"].handleDrag(eventStream, initialEvent);
      return;
    }
    if (!this.currentGlyphName) {
      return;
    }
    const isDoubleClick = initialEvent.detail == 2;
    this.editor.visualizationLayersSettings.model[POWER_RULER_IDENTIFIER] =
      !isDoubleClick;
    if (isDoubleClick) {
      return;
    }

    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    const point = this.sceneController.localPoint(initialEvent);
    point.x -= positionedGlyph.x;
    point.y -= positionedGlyph.y;
    this.recalcRulerFromPoint(positionedGlyph.glyph, point, initialEvent.shiftKey);

    let lastPoint = point;
    for await (const event of eventStream) {
      let point;
      if (event.x === undefined) {
        // Possibly modifier key changed event
        point = lastPoint;
      } else {
        point = this.sceneController.localPoint(event);
        point.x -= positionedGlyph.x;
        point.y -= positionedGlyph.y;
        lastPoint = point;
      }
      this.recalcRulerFromPoint(positionedGlyph.glyph, point, event.shiftKey);
    }
  }

  handleKeyDown(event) {
    if (event.key === "Backspace" && this.currentGlyphName) {
      event.stopImmediatePropagation();
      delete this.glyphRulers[this.currentGlyphName];
      this.canvasController.requestUpdate();
    }
  }
}

// TODO: we need drawing-tools.js
function fillPill(context, cx, cy, length, height) {
  const radius = height / 2;
  const offset = length / 2 - radius;
  context.beginPath();
  context.arc(cx - offset, cy, radius, 0.5 * Math.PI, -0.5 * Math.PI, false);
  context.arc(cx + offset, cy, radius, -0.5 * Math.PI, 0.5 * Math.PI, false);
  context.fill();
}

function fillCircle(context, cx, cy, radius) {
  context.beginPath();
  context.arc(cx, cy, radius, 0, 2 * Math.PI, false);
  context.fill();
}
