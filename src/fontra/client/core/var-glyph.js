import { getDecomposedIdentity } from "./transform.js";
import { mapObjectValues, normalizeGuidelines } from "./utils.js";
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
    glyph.customData = copyCustomData(obj.customData || {});
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
    layer.customData = copyCustomData(obj.customData || {});
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
    source.customData = copyCustomData(obj.customData || {});
    return source;
  }
}

export class StaticGlyph {
  static fromObject(obj, noCopy = false) {
    const source = new StaticGlyph();
    source.xAdvance = obj.xAdvance;
    source.yAdvance = obj.yAdvance;
    source.verticalOrigin = obj.verticalOrigin;
    if (obj.path) {
      source.path = noCopy ? obj.path : VarPackedPath.fromObject(obj.path);
    } else {
      source.path = new VarPackedPath();
    }
    source.components =
      (noCopy ? obj.components : obj.components?.map(copyComponent)) || [];
    source.anchors = noCopy ? obj.anchors || [] : copyCustomData(obj.anchors || []);
    source.guidelines = noCopy
      ? obj.guidelines || []
      : normalizeGuidelines(obj.guidelines || []);
    source.backgroundImage = copyBackgroundImage(obj.backgroundImage);
    return source;
  }

  copy() {
    return StaticGlyph.fromObject(this);
  }
}

export function copyComponent(component) {
  return {
    name: component.name,
    transformation: { ...getDecomposedIdentity(), ...component.transformation },
    location: { ...component.location },
  };
}

function copyBackgroundImage(image) {
  if (!image) {
    return undefined;
  }
  return {
    identifier: image.identifier,
    transformation: { ...getDecomposedIdentity(), ...image.transformation },
    color: image.color ? { ...image.color } : undefined,
    customData: copyCustomData(image.customData || {}),
  };
}

function copyCustomData(data) {
  return JSON.parse(JSON.stringify(data));
}
