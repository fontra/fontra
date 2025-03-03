import { decomposedToTransform } from "./transform.js";

export function staticGlyphToGLIF(glyphName, glyph, codePoints) {
  const lines = [
    "<?xml version='1.0' encoding='UTF-8'?>",
    `<glyph name="${glyphName}" format="2">`,
  ];

  lines.push(`  <advance width="${glyph.xAdvance}"/>`);

  for (const codePoint of codePoints || []) {
    const unicode_hex = codePoint.toString(16).toUpperCase().padStart(4, "0");
    lines.push(`  <unicode hex="${unicode_hex}"/>`);
  }

  const typeMap = { cubic: "curve", quad: "qcurve" };

  lines.push("  <outline>");

  for (const contour of glyph.path.iterUnpackedContours()) {
    const points = contour.points;
    lines.push("    <contour>");

    let curveType;
    if (contour.isClosed) {
      curveType = typeMap[points.at(-1).type] || "line";
    } else {
      // strip leading and trailing off-curve points
      while (points.length && points[0].type) {
        points.shift();
      }
      while (points.length && points.at(-1).type) {
        points.pop();
      }
      curveType = "move";
    }
    const numPoints = points.length;

    for (const point of points) {
      const attrs = { x: point.x, y: point.y };
      if (point.type) {
        curveType = typeMap[point.type] || "line";
      } else {
        attrs["type"] = curveType;
        curveType = "line";
      }
      if (point.smooth) {
        attrs["smooth"] = "yes";
      }
      lines.push(`      <point ${formatAttributes(attrs)}/>`);
    }
    lines.push("    </contour>");
  }

  for (const component of glyph.components) {
    if (Object.keys(component.location).length) {
      // Skip variable components for now
      // TODO: implement variable-components-in-ufo
      continue;
    }
    const t = decomposedToTransform(component.transformation);
    const attrs = { base: component.name };
    for (const [fontraField, ufoField, defaultValue] of transformFieldsMap) {
      if (t[fontraField] != defaultValue) {
        attrs[ufoField] = t[fontraField];
      }
    }
    lines.push(`    <component ${formatAttributes(attrs)}/>`);
  }

  lines.push("  </outline>");
  lines.push("</glyph>");
  return lines.join("\n") + "\n";
}

function formatAttributes(attrs) {
  return Object.entries(attrs)
    .map((item) => `${item[0]}="${item[1]}"`)
    .join(" ");
}

const transformFieldsMap = [
  ["xx", "xScale", 1],
  ["xy", "xyScale", 0],
  ["yx", "yxScale", 0],
  ["yy", "yScale", 1],
  ["dx", "xOffset", 0],
  ["dy", "yOffset", 0],
];
