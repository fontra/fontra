import { assert, range } from "@fontra/core/utils.js";
import {
  registerVisualizationLayerDefinition,
  strokeLine,
} from "./visualization-layer-definitions.js";

const cjkDesignFrameGlyphName = "_cjkDesignFrame";

let _theCJKDesignFrame;

registerVisualizationLayerDefinition({
  identifier: "fontra.cjk.design.frame",
  name: "sidebar.user-settings.glyph.cjkframe",
  selectionMode: "editing",
  userSwitchable: true,
  defaultOn: false,
  zIndex: 200,
  screenParameters: { strokeWidth: 1 },
  colors: {
    strokeColor: "#0004",
    overshootColor: "#00BFFF26",
    secondLineColor: "#A6296344",
  },
  colorsDarkMode: {
    strokeColor: "#FFF6",
    secondLineColor: "#A62963AA",
  },
  draw: (context, positionedGlyph, parameters, model, controller) =>
    _theCJKDesignFrame.draw(context, positionedGlyph, parameters, model, controller),
});

export class CJKDesignFrame {
  constructor(editor) {
    assert(!_theCJKDesignFrame, "CJKDesignFrame can't be instantiated multiple times");
    _theCJKDesignFrame = this;

    this.editor = editor;
    this.fontController = editor.fontController;
    this.fontController.addGlyphChangeListener(cjkDesignFrameGlyphName, () =>
      this.updateCJKDesignFrame(cjkDesignFrameGlyphName)
    );

    editor.sceneSettingsController.addKeyListener(
      ["fontLocationSourceMapped", "glyphLocation"],
      (event) => {
        this.updateCJKDesignFrame(cjkDesignFrameGlyphName);
      }
    );

    this.fontController.ensureInitialized.then(() => {
      this.updateCJKDesignFrame(cjkDesignFrameGlyphName);
    });
  }

  get sceneController() {
    return this.editor.sceneController;
  }

  async updateCJKDesignFrame(glyphName) {
    // set up fallback default paramaters
    const unitsPerEm = this.fontController.unitsPerEm;
    this.cjkDesignFrameParameters = makeParametersFromSettings({
      frameBottomLeft: { x: 0, y: -0.12 * unitsPerEm },
      frameHeight: unitsPerEm,
      faceScale: 0.9,
      overshootOutside: 20,
      overshootInside: 20,
      gridDivisionsX: 2,
      gridDivisionsY: 2,
    });

    const frameGlyph =
      await this.sceneController.sceneModel.getGlyphInstance(glyphName);
    if (frameGlyph && frameGlyph.path.numPoints >= 1) {
      this.cjkDesignFrameParameters = makeParametersFromGlyph(frameGlyph, unitsPerEm);
    } else {
      const legacyParameters =
        this.sceneController.sceneModel.fontController.customData[
          "CJKDesignFrameSettings"
        ];
      if (legacyParameters) {
        this.cjkDesignFrameParameters = makeParametersFromSettings({
          frameBottomLeft: legacyParameters.shift
            ? {
                x: legacyParameters.shift[0],
                y: legacyParameters.shift[1],
              }
            : { x: 0, y: 0 },
          frameHeight: legacyParameters.em_Dimension[1],
          faceScale: legacyParameters.characterFace / 100,
          overshootInside: legacyParameters.overshoot[0],
          overshootOutside: legacyParameters.overshoot[1],
          gridDivisionsX:
            legacyParameters.type === "han" ? 2 : legacyParameters.verticalLine,
          gridDivisionsY:
            legacyParameters.type === "han" ? 2 : legacyParameters.horizontalLine,
        });
      }
    }
    this.editor.canvasController.requestUpdate();
  }

  draw(context, positionedGlyph, parameters, model, controller) {
    if (!this.cjkDesignFrameParameters) {
      return;
    }
    const {
      frameBottomLeft,
      frameHeight,
      faceBottomLeft,
      faceHeight,
      overshootOutsideBottomLeft,
      overshootOutsideHeight,
      overshootInsideBottomLeft,
      overshootInsideHeight,
      gridDivisionsX,
      gridDivisionsY,
    } = this.cjkDesignFrameParameters;

    const advanceWidth = positionedGlyph.glyph.xAdvance;

    context.lineWidth = parameters.strokeWidth;
    context.strokeStyle = parameters.strokeColor;

    // frame
    const frameWidth = advanceWidth - 2 * frameBottomLeft.x;
    context.strokeRect(frameBottomLeft.x, frameBottomLeft.y, frameWidth, frameHeight);

    // face
    const faceWidth = advanceWidth - 2 * faceBottomLeft.x;
    context.strokeRect(faceBottomLeft.x, faceBottomLeft.y, faceWidth, faceHeight);

    // overshoot rect
    const overshootOutsideWidth = advanceWidth - 2 * overshootOutsideBottomLeft.x;
    const overshootInsideWidth = advanceWidth - 2 * overshootInsideBottomLeft.x;
    context.fillStyle = parameters.overshootColor;
    context.beginPath();
    context.rect(
      overshootOutsideBottomLeft.x,
      overshootOutsideBottomLeft.y,
      overshootOutsideWidth,
      overshootOutsideHeight
    );
    context.rect(
      overshootInsideBottomLeft.x,
      overshootInsideBottomLeft.y,
      overshootInsideWidth,
      overshootInsideHeight
    );
    context.fill("evenodd");

    // face grid
    context.strokeStyle = parameters.secondLineColor;
    const stepX = faceWidth / gridDivisionsX;
    const stepY = faceHeight / gridDivisionsY;
    for (let i = 1; i < gridDivisionsY; i++) {
      const y = faceBottomLeft.y + i * stepY;
      strokeLine(context, faceBottomLeft.x, y, faceBottomLeft.x + faceWidth, y);
    }
    for (let i = 1; i < gridDivisionsX; i++) {
      const x = faceBottomLeft.x + i * stepX;
      strokeLine(context, x, faceBottomLeft.y, x, faceBottomLeft.y + faceHeight);
    }
  }
}

function minmax(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}

function makeParametersFromGlyph(frameGlyph, unitsPerEm) {
  const points = [];
  for (const i of range(6)) {
    points.push(frameGlyph.path.getPoint(i));
  }
  const frameBottomLeft = points[0];
  const frameTop = points[1] ? points[1].y : frameBottomLeft.y + unitsPerEm;
  const frameHeight = frameTop - frameBottomLeft.y;
  const faceBottomLeft = points[2]
    ? points[2]
    : {
        x: frameBottomLeft.x + 0.05 * frameHeight,
        y: frameBottomLeft.y + 0.05 * frameHeight,
      };
  const faceHeight = frameTop + frameBottomLeft.y - 2 * faceBottomLeft.y;
  const overshootOutsideBottomLeft = points[3]
    ? points[3]
    : { x: faceBottomLeft.x - 20, y: faceBottomLeft.y - 20 };
  const overshootOutsideHeight =
    frameTop + frameBottomLeft.y - 2 * overshootOutsideBottomLeft.y;
  const overshootInsideBottomLeft = points[4]
    ? points[4]
    : { x: faceBottomLeft.x + 20, y: faceBottomLeft.y + 20 };
  const overshootInsideHeight =
    frameTop + frameBottomLeft.y - 2 * overshootInsideBottomLeft.y;

  const gridPoint = points[5];
  const faceWidth = frameGlyph.xAdvance + frameBottomLeft.x - 2 * faceBottomLeft.x;
  const gridDivisionsX = gridPoint
    ? minmax(Math.round(faceWidth / (gridPoint.x - faceBottomLeft.x)), 1, 32)
    : 2;
  const gridDivisionsY = gridPoint
    ? minmax(Math.round(faceHeight / (gridPoint.y - faceBottomLeft.y)), 1, 32)
    : 2;

  return {
    frameBottomLeft,
    frameHeight,
    faceBottomLeft,
    faceHeight,
    overshootOutsideBottomLeft,
    overshootOutsideHeight,
    overshootInsideBottomLeft,
    overshootInsideHeight,
    gridDivisionsX,
    gridDivisionsY,
  };
}

function makeParametersFromSettings(settings) {
  const frameLeft = settings.frameBottomLeft.x;
  const frameBottom = settings.frameBottomLeft.y;
  const faceHeight = settings.faceScale * settings.frameHeight;
  const faceOffset = (settings.frameHeight - faceHeight) / 2;
  return {
    frameBottomLeft: settings.frameBottomLeft,
    frameHeight: settings.frameHeight,
    faceBottomLeft: {
      x: settings.frameBottomLeft.x + faceOffset,
      y: settings.frameBottomLeft.y + faceOffset,
    },
    faceHeight: faceHeight,
    overshootOutsideBottomLeft: {
      x: frameLeft + faceOffset - settings.overshootOutside,
      y: frameBottom + faceOffset - settings.overshootOutside,
    },
    overshootOutsideHeight: faceHeight + 2 * settings.overshootOutside,
    overshootInsideBottomLeft: {
      x: frameLeft + faceOffset + settings.overshootInside,
      y: frameBottom + faceOffset + settings.overshootInside,
    },
    overshootInsideHeight: faceHeight - 2 * settings.overshootInside,
    gridDivisionsX: settings.gridDivisionsX,
    gridDivisionsY: settings.gridDivisionsY,
  };
}
