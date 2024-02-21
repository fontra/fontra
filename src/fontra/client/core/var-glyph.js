import { VarPackedPath } from "./var-path.js";

export class VariableGlyph {
  static fromObject(obj) {
    const glyph = new VariableGlyph();
    glyph.name = obj.name;
    glyph.axes =
      obj.axes?.map((axis) => {
        return { ...axis };
      }) || [];
    glyph.sources = obj.sources.map((source) => Source.fromObject(source));
    glyph.layers = Object.fromEntries(
      Object.entries(obj.layers).map(([name, layer]) => [name, Layer.fromObject(layer)])
    );
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

export class Source {
  static fromObject(obj) {
    const source = new Source();
    source.name = obj.name;
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
    return source;
  }

  copy() {
    return StaticGlyph.fromObject(this);
  }
}

const identityTransformation = {
  translateX: 0,
  translateY: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  skewX: 0,
  skewY: 0,
  tCenterX: 0,
  tCenterY: 0,
};

export function copyComponent(component) {
  return {
    name: component.name,
    transformation: { ...identityTransformation, ...component.transformation },
    location: { ...component.location },
  };
}

function copyCustomData(data) {
  return JSON.parse(JSON.stringify(data));
}
