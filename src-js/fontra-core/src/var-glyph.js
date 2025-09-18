import { getDecomposedIdentity } from "./transform.js";
import { deepCopyObject, mapObjectValues, normalizeGuidelines, zip } from "./utils.js";
import { VarPackedPath } from "./var-path.js";

export class VariableGlyph {
  static fromObject(obj) {
    const glyph = new VariableGlyph();
    glyph.name = obj.name;
    glyph.axes =
      obj.axes?.map((axis) => {
        return { ...axis };
      }) || [];
    glyph.sources = obj.sources.map((source) => GlyphSource.fromObject(source));
    glyph.layers = mapObjectValues(obj.layers, (layer) => Layer.fromObject(layer));
    glyph.customData = deepCopyObject(obj.customData || {});
    return glyph;
  }

  copy() {
    return VariableGlyph.fromObject(this);
  }
}

export class Layer {
  static fromObject(obj) {
    const layer = new Layer();
    layer.glyph = StaticGlyph.fromObject(obj.glyph);
    layer.customData = deepCopyObject(obj.customData || {});
    return layer;
  }
}

export class GlyphSource {
  static fromObject(obj) {
    const source = new GlyphSource();
    source.name = obj.name;
    source.locationBase = obj.locationBase;
    source.location = { ...obj.location } || {};
    source.layerName = obj.layerName;
    source.inactive = !!obj.inactive;
    source.customData = deepCopyObject(obj.customData || {});
    return source;
  }
}

export class StaticGlyph {
  static fromObject(obj, noCopy = false) {
    const glyph = new StaticGlyph();
    glyph.xAdvance = obj.xAdvance;
    glyph.yAdvance = obj.yAdvance;
    glyph.verticalOrigin = obj.verticalOrigin;
    if (obj.path) {
      glyph.path = noCopy ? obj.path : VarPackedPath.fromObject(obj.path);
    } else {
      glyph.path = new VarPackedPath();
    }
    glyph.components =
      (noCopy ? obj.components : obj.components?.map(copyComponent)) || [];
    glyph.anchors = noCopy ? obj.anchors || [] : deepCopyObject(obj.anchors || []);
    glyph.guidelines = noCopy
      ? obj.guidelines || []
      : normalizeGuidelines(obj.guidelines || []);
    glyph.backgroundImage = copyBackgroundImage(obj.backgroundImage);
    return glyph;
  }

  copy() {
    return StaticGlyph.fromObject(this);
  }

  getMoveReference() {
    const [x, y] = this.path.getPointPosition(0);
    return {
      path: { x, y },
      components: this.components.map((compo) => ({
        x: compo.transformation.translateX,
        y: compo.transformation.translateY,
      })),
      anchors: this.anchors.map((anchor) => ({
        x: anchor.x,
        y: anchor.y,
      })),
      guidelines: this.guidelines.map((guideline) => ({
        x: guideline.x,
        y: guideline.y,
      })),
      backgroundImage: {
        x: this.backgroundImage?.transformation.translateX,
        y: this.backgroundImage?.transformation.translateY,
      },
    };
  }

  moveWithReference(reference, dx, dy) {
    if (reference.path.x !== undefined) {
      this.path.moveAllWithFirstPoint(reference.path.x + dx, reference.path.y + dy);
    }

    for (const [{ x, y }, compo] of zip(reference.components, this.components)) {
      compo.transformation.translateX = x + dx;
      compo.transformation.translateY = y + dy;
    }

    for (const [{ x, y }, anchor] of zip(reference.anchors, this.anchors)) {
      anchor.x = x + dx;
      anchor.y = y + dy;
    }

    for (const [{ x, y }, guideline] of zip(reference.guidelines, this.guidelines)) {
      guideline.x = x + dx;
      guideline.y = y + dy;
    }

    if (reference.backgroundImage.x !== undefined) {
      this.backgroundImage.transformation.translateX = reference.backgroundImage.x + dx;
      this.backgroundImage.transformation.translateY = reference.backgroundImage.y + dy;
    }
  }
}

export function copyComponent(component) {
  return {
    name: component.name,
    transformation: { ...getDecomposedIdentity(), ...component.transformation },
    location: { ...component.location },
    customData: deepCopyObject(component.customData || {}),
  };
}

export function copyBackgroundImage(image) {
  if (!image) {
    return undefined;
  }
  return {
    identifier: image.identifier,
    transformation: { ...getDecomposedIdentity(), ...image.transformation },
    opacity: image.opacity !== undefined ? image.opacity : 1.0,
    color: image.color ? { ...image.color } : undefined,
    customData: deepCopyObject(image.customData || {}),
  };
}
