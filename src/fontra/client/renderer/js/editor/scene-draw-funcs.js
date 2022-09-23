import { union } from "../core/set-ops.js";
import { withSavedState } from "../core/utils.js";
import { subVectors } from "../core/vector.js";


function requireEditingGlyph(func) {
  function wrapper(model, controller) {
    if (!model.selectedGlyph || !model.selectedGlyphIsEditing) {
      return;
    }
    func(model, controller);
  }
  return wrapper;
}


function requireSelectedGlyph(func) {
  function wrapper(model, controller) {
    if (!model.selectedGlyph || model.selectedGlyphIsEditing) {
      return;
    }
    func(model, controller);
  }
  return wrapper;
}


function requireHoveredGlyph(func) {
  function wrapper(model, controller) {
    if (!model.hoveredGlyph || model.hoveredGlyph === model.selectedGlyph) {
      return;
    }
    func(model, controller);
  }
  return wrapper;
}


function glyphTranslate(func) {
  function wrapper(model, controller) {
    const positionedGlyph = model.getSelectedPositionedGlyph();
    controller.context.translate(positionedGlyph.x, positionedGlyph.y);
    func(model, controller, controller.context, positionedGlyph.glyph, controller.drawingParameters);
  }
  return wrapper;
}


export function drawMultiGlyphsLayer(model, controller) {
  _drawMultiGlyphsLayer(model, controller);
}


export function drawMultiGlyphsLayerClean(model, controller) {
  _drawMultiGlyphsLayer(model, controller, false);
}


function _drawMultiGlyphsLayer(model, controller, skipSelected = true) {
  if (!model.positionedLines) {
    return;
  }
  const context = controller.context;
  const selectedGlyph = model.getSelectedPositionedGlyph();
  context.fillStyle = controller.drawingParameters.glyphFillColor;
  for (const glyphLine of model.positionedLines) {
    for (const glyph of glyphLine.glyphs) {
      if (skipSelected && glyph === selectedGlyph && model.selectedGlyphIsEditing) {
        continue;
      }
      withSavedState(context, () => {
        context.translate(glyph.x, glyph.y);

        // context.fillStyle = "#CCC";
        // fillPolygon(context, glyph.glyph.convexHull);
        // context.fillStyle = controller.drawingParameters.glyphFillColor;

        context.fill(glyph.glyph.flattenedPath2d);
      });
    }
  }
}


export const drawCJKDesignFrameLayer = requireEditingGlyph(glyphTranslate(
(model, controller, context, glyph, drawingParameters) => {
  const cjkDesignFrameParameters = model.fontController.fontLib["CJKDesignFrameSettings"];
  if (!cjkDesignFrameParameters) {
    return;
  }
  const [emW, emH] = cjkDesignFrameParameters["em_Dimension"];
  const characterFace = cjkDesignFrameParameters["characterFace"] / 100;
  const [shiftX, shiftY] = cjkDesignFrameParameters["shift"] || [0, -120];
  const [overshootInside, overshootOutside] = cjkDesignFrameParameters["overshoot"];
  const [faceW, faceH] = [emW * characterFace, emH * characterFace];
  const [faceX, faceY] = [(emW - faceW) / 2, (emH - faceH) / 2]
  let horizontalLine = cjkDesignFrameParameters["horizontalLine"];
  let verticalLine = cjkDesignFrameParameters["verticalLine"];
  const [overshootInsideW, overshootInsideH] = [faceW - overshootInside * 2, faceH - overshootInside * 2];
  const [overshootOutsideW, overshootOutsideH] = [faceW + overshootOutside * 2, faceH + overshootOutside * 2];

  context.translate(shiftX, shiftY);

  context.strokeStyle = drawingParameters.cjkFrameStrokeColor;
  context.lineWidth = drawingParameters.cjkFrameLineWidth;
  context.strokeRect(0, 0, emW, emH);
  context.strokeRect(faceX, faceY, faceW, faceH);

  context.strokeStyle = drawingParameters.cjkFrameSecondLineColor;
  if (cjkDesignFrameParameters["type"] === "han") {
    horizontalLine /= 100;
    verticalLine /= 100;
    const centerX = emW / 2;
    const centerY = emH / 2;
    for (const y of [centerY + emH * horizontalLine, centerY - emH * horizontalLine]) {
      strokeLine(context, 0, y, emW, y);
    }
    for (const x of [centerX + emW * verticalLine, centerX - emW * verticalLine]) {
      strokeLine(context, x, 0, x, emH);
    }
  } else {
    // hangul
    const stepX = faceW / verticalLine;
    const stepY = faceH / horizontalLine;
    for (let i = 1; i < horizontalLine; i++) {
      const y = faceY + i * stepY;
      strokeLine(context, faceX, y, faceX + faceW, y);
    }
    for (let i = 1; i < verticalLine; i++) {
      const x = faceX + i * stepX;
      strokeLine(context, x, faceY, x, faceY + faceH);
    }
  }

  // overshoot rect
  context.fillStyle = drawingParameters.cjkFrameOvershootColor;
  context.beginPath();
  context.rect(faceX - overshootOutside, faceY - overshootOutside, overshootOutsideW, overshootOutsideH);
  context.rect(faceX + overshootInside, faceY + overshootInside, overshootInsideW, overshootInsideH);
  context.fill("evenodd");
}
));


export const drawSelectedBaselineLayer = requireEditingGlyph(glyphTranslate(
(model, controller, context, glyph, drawingParameters) => {
  context.strokeStyle = drawingParameters.sidebearingBarColor;
  context.lineWidth = drawingParameters.pathLineWidth;
  strokeLine(context, 0, 0, glyph.xAdvance, 0);
}
));


export const drawSidebearingsLayer = requireEditingGlyph(glyphTranslate(
(model, controller, context, glyph, drawingParameters) => {
  context.strokeStyle = drawingParameters.sidebearingBarColor;
  context.lineWidth = drawingParameters.pathLineWidth;
  const extent = drawingParameters.sidebearingBarExtent;
  strokeLine(context, 0, -extent, 0, extent);
  strokeLine(context, glyph.xAdvance, -extent, glyph.xAdvance, extent);
  if (extent < glyph.xAdvance / 2) {
    strokeLine(context, 0, 0, extent, 0);
    strokeLine(context, glyph.xAdvance, 0, glyph.xAdvance - extent, 0);
  } else {
    strokeLine(context, 0, 0, glyph.xAdvance, 0);
  }
}
));


export const drawHoveredEmptyGlyphLayer = requireHoveredGlyph(
(model, controller) => {
  _drawSelectedEmptyGlyphLayer(model, controller, model.hoveredGlyph, "hoveredEmptyGlyphColor");
}
);


export const drawSelectedEmptyGlyphLayer = requireSelectedGlyph(
(model, controller) => {
  _drawSelectedEmptyGlyphLayer(model, controller, model.selectedGlyph, "selectedEmptyGlyphColor");
}
);


function _drawSelectedEmptyGlyphLayer(model, controller, selectedGlyph, emptyGlyphColorName) {
  const context = controller.context;
  const [lineIndex, glyphIndex] = selectedGlyph.split("/");
  const positionedGlyph = model.positionedLines[lineIndex].glyphs[glyphIndex];

  if (!positionedGlyph.isEmpty) {
    return;
  }
  const box = positionedGlyph.bounds;
  const fillColor = controller.drawingParameters[emptyGlyphColorName];
  if (fillColor[0] === "#" && fillColor.length === 7) {
    const gradient = context.createLinearGradient(0, box.yMin, 0, box.yMax);
    gradient.addColorStop(0.00, fillColor + "00");
    gradient.addColorStop(0.20, fillColor + "DD");
    gradient.addColorStop(0.50, fillColor + "FF");
    gradient.addColorStop(0.80, fillColor + "DD");
    gradient.addColorStop(1.00, fillColor + "00");
    context.fillStyle = gradient;
  } else {
    context.fillStyle = fillColor;
  }
  context.fillRect(box.xMin, box.yMin, box.xMax - box.xMin, box.yMax - box.yMin);
}


export const drawHoveredGlyphLayer = requireHoveredGlyph(
(model, controller) => {
  _drawSelectedGlyphLayer(model, controller, model.hoveredGlyph, "hoveredGlyphStrokeColor");
}
);


export const drawSelectedGlyphLayer = requireSelectedGlyph(
(model, controller) => {
  _drawSelectedGlyphLayer(model, controller, model.selectedGlyph, "selectedGlyphStrokeColor");
}
);


function _drawSelectedGlyphLayer(model, controller, selectedGlyph, strokeColorName) {
  const context = controller.context;
  const [lineIndex, glyphIndex] = selectedGlyph.split("/");
  const positionedGlyph = model.positionedLines[lineIndex].glyphs[glyphIndex];

  if (positionedGlyph.isEmpty) {
    return;
  }
  context.translate(positionedGlyph.x, positionedGlyph.y);
  drawWithDoubleStroke(
    context,
    positionedGlyph.glyph.flattenedPath2d,
    10 * controller.onePixelUnit,
    3 * controller.onePixelUnit,
    controller.drawingParameters[strokeColorName],
    controller.drawingParameters.glyphFillColor,
  )
}


export const drawPathFillLayer = requireEditingGlyph(glyphTranslate(
(model, controller, context, glyph, drawingParameters) => {
  context.fillStyle = drawingParameters.pathFillColor;
  context.fill(glyph.flattenedPath2d);
}
));


export const drawPathStrokeLayer = requireEditingGlyph(glyphTranslate(
(model, controller, context, glyph, drawingParameters) => {
  context.lineJoin = "round";
  context.lineWidth = drawingParameters.pathLineWidth;
  context.strokeStyle = drawingParameters.pathStrokeColor;
  context.stroke(glyph.flattenedPath2d);
}
));


export const drawGhostPathLayer = requireEditingGlyph(glyphTranslate(
(model, controller, context, glyph, drawingParameters) => {
  if (!model.ghostPath) {
    return;
  }
  context.lineJoin = "round";
  context.lineWidth = drawingParameters.pathLineWidth;
  context.strokeStyle = drawingParameters.ghostPathStrokeColor;
  context.stroke(model.ghostPath);
}
));


export const drawHandlesLayer = requireEditingGlyph(glyphTranslate(
(model, controller, context, glyph, drawingParameters) => {
  context.strokeStyle = drawingParameters.handleColor;
  context.lineWidth = drawingParameters.handleLineWidth;
  for (const [pt1, pt2] of glyph.path.iterHandles()) {
    strokeLine(context, pt1.x, pt1.y, pt2.x, pt2.y);
  }
}
));


const START_POINT_ARC_GAP_ANGLE = 0.25 * Math.PI;


export const drawStartPointsLayer = requireEditingGlyph(glyphTranslate(
(model, controller, context, glyph, drawingParameters) => {
  context.strokeStyle = drawingParameters.startPointIndicatorColor;
  context.lineWidth = drawingParameters.startPointIndicatorLineWidth;
  const radius = drawingParameters.startPointIndicatorRadius;
  let startPointIndex = 0;
  for (const contourInfo of glyph.path.contourInfo) {
    const startPoint = glyph.path.getPoint(startPointIndex);
    let angle;
    if (startPointIndex <= contourInfo.endPoint) {
      const nextPoint = glyph.path.getPoint(startPointIndex + 1);
      const direction = subVectors(nextPoint, startPoint);
      angle = Math.atan2(direction.y, direction.x);
    }
    let startAngle = 0;
    let endAngle = 2 * Math.PI;
    if (angle !== undefined) {
      startAngle += angle + START_POINT_ARC_GAP_ANGLE;
      endAngle += angle - START_POINT_ARC_GAP_ANGLE;
    }
    context.beginPath();
    context.arc(startPoint.x, startPoint.y, radius, startAngle, endAngle, false);
    context.stroke();
    startPointIndex = contourInfo.endPoint + 1;
  }
}
));


export const drawNodesLayer = requireEditingGlyph(glyphTranslate(
(model, controller, context, glyph, drawingParameters) => {
  const cornerNodeSize = drawingParameters.cornerNodeSize;
  const smoothNodeSize = drawingParameters.smoothNodeSize;
  const handleNodeSize = drawingParameters.handleNodeSize;

  context.fillStyle = drawingParameters.nodeFillColor;
  for (const pt of glyph.path.iterPoints()) {
    fillNode(context, pt, cornerNodeSize, smoothNodeSize, handleNodeSize);
  }
}
));


export const drawComponentSelectionLayer = requireEditingGlyph(glyphTranslate(
(model, controller, context, glyph, drawingParameters) => {
  _drawSelectionLayer(model, controller, context, glyph, drawingParameters, "component");
}
));


export const drawPathSelectionLayer = requireEditingGlyph(glyphTranslate(
(model, controller, context, glyph, drawingParameters) => {
  _drawSelectionLayer(model, controller, context, glyph, drawingParameters, "point");
}
));


function _drawSelectionLayer(model, controller, context, glyph, drawingParameters, drawType) {
  const selection = model.selection;
  const hoverSelection = model.hoverSelection;
  const combinedSelection = lenientUnion(selection, hoverSelection);
  const selectionStrings = Array.from(combinedSelection);
  selectionStrings.sort();

  const cornerNodeSize = drawingParameters.cornerNodeSize;
  const smoothNodeSize = drawingParameters.smoothNodeSize;
  const handleNodeSize = drawingParameters.handleNodeSize;
  const hoveredComponentStrokeColor = drawingParameters.hoveredComponentStrokeColor;
  const selectedComponentStrokeColor = drawingParameters.selectedComponentStrokeColor;
  const hoveredComponentLineWidth = drawingParameters.hoveredComponentLineWidth;
  const selectedComponentLineWidth = drawingParameters.selectedComponentLineWidth;

  context.strokeStyle = drawingParameters.hoveredNodeStrokeColor;
  context.lineWidth = drawingParameters.hoveredNodeLineWidth;
  const hoverStrokeOffset = 4 * controller.onePixelUnit
  context.fillStyle = drawingParameters.selectedNodeFillColor;

  for (const selItem of selectionStrings) {
    const drawHoverStroke = hoverSelection?.has(selItem);
    const drawSelectionFill = selection.has(selItem);
    const [tp, index] = selItem.split("/");
    if (tp != drawType) {
      continue;
    }
    if (tp === "point") {
      const pt = glyph.path.getPoint(index);
      if (drawHoverStroke) {
        strokeNode(context, pt, cornerNodeSize + hoverStrokeOffset, smoothNodeSize + hoverStrokeOffset, handleNodeSize + hoverStrokeOffset);
      }
      if (drawSelectionFill) {
        fillNode(context, pt, cornerNodeSize, smoothNodeSize, handleNodeSize);
      }
    } else if (tp === "component") {
      const componentPath = glyph.components[index].path2d;
      context.save();
      context.lineJoin = "round";
      context.lineWidth = drawSelectionFill ? selectedComponentLineWidth : hoveredComponentLineWidth;
      context.strokeStyle = drawSelectionFill ? selectedComponentStrokeColor : hoveredComponentStrokeColor;
      context.stroke(componentPath);
      context.restore();
    }
  }
}


export function drawRectangleSelectionLayer(model, controller) {
  if (model.selectionRect === undefined) {
    return;
  }
  const selRect = model.selectionRect;
  const context = controller.context;
  const x = selRect.xMin;
  const y = selRect.yMin;
  const w = selRect.xMax - x;
  const h = selRect.yMax - y;
  context.lineWidth = controller.drawingParameters.rectSelectLineWidth;
  context.strokeStyle = "#000";
  context.strokeRect(x, y, w, h);
  context.strokeStyle = "#FFF";
  context.setLineDash(controller.drawingParameters.rectSelectLineDash);
  context.strokeRect(x, y, w, h);
}


function fillNode(context, pt, cornerNodeSize, smoothNodeSize, handleNodeSize) {
  if (!pt.type && !pt.smooth) {
    fillSquareNode(context, pt, cornerNodeSize);
  } else if (!pt.type) {
    fillRoundNode(context, pt, smoothNodeSize);
  } else {
    fillRoundNode(context, pt, handleNodeSize);
  }
}


function strokeNode(context, pt, cornerNodeSize, smoothNodeSize, handleNodeSize) {
  if (!pt.type && !pt.smooth) {
    strokeSquareNode(context, pt, cornerNodeSize);
  } else if (!pt.type) {
    strokeRoundNode(context, pt, smoothNodeSize);
  } else {
    strokeRoundNode(context, pt, handleNodeSize);
  }
}


function fillSquareNode(context, pt, nodeSize) {
  context.fillRect(
    pt.x - nodeSize / 2,
    pt.y - nodeSize / 2,
    nodeSize,
    nodeSize
  );
}

function fillRoundNode(context, pt, nodeSize) {
  context.beginPath();
  context.arc(pt.x, pt.y, nodeSize / 2, 0, 2 * Math.PI, false);
  context.fill();
}


function strokeSquareNode(context, pt, nodeSize) {
  context.strokeRect(
    pt.x - nodeSize / 2,
    pt.y - nodeSize / 2,
    nodeSize,
    nodeSize
  );
}


function strokeRoundNode(context, pt, nodeSize) {
  context.beginPath();
  context.arc(pt.x, pt.y, nodeSize / 2, 0, 2 * Math.PI, false);
  context.stroke();
}


function strokeLine(context, x1, y1, x2, y2) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}


function fillPolygon(context, points, isClosed = true) {
  context.fill(polygonPath(points));
}


function polygonPath(points, isClosed = true) {
  const path = new Path2D();
  if (points && points.length) {
    path.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      path.lineTo(points[i].x, points[i].y);
    }
    if (isClosed) {
      path.closePath();
    }
  }
  return path;
}


function drawWithDoubleStroke(context, path, outerLineWidth, innerLineWidth, strokeStyle, fillStyle) {
  context.lineJoin = "round";
  context.lineWidth = outerLineWidth;
  context.strokeStyle = strokeStyle;
  context.stroke(path);
  context.lineWidth = innerLineWidth;
  context.strokeStyle = "black";
  context.globalCompositeOperation = "destination-out"
  context.stroke(path);
  context.globalCompositeOperation = "source-over"
  context.fillStyle = fillStyle;
  context.fill(path);
}


function lenientUnion(setA, setB) {
  if (!setA) {
    return setB || new Set();
  }
  if (!setB) {
    return setA || new Set();
  }
  return union(setA, setB);
}
