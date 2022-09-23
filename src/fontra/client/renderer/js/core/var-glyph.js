import VarPath from "./var-path.js";


export class VariableGlyph {

  static fromObject(obj) {
    const glyph = new VariableGlyph();
    glyph.name = obj.name;
    glyph.axes = obj.axes || [];
    glyph.unicodes = obj.unicodes || [];
    glyph.sources = obj.sources.map(source => Source.fromObject(source));
    glyph.layers = obj.layers.map(layer => {
      return {
        "name": layer.name,
        "glyph": StaticGlyph.fromObject(layer.glyph),
      }
    });
    return glyph;
  }

  getLayerGlyph(layerName) {
    return this.getLayer(layerName).glyph;
  }

  getLayer(layerName) {
    return this.layers[this.getLayerIndex(layerName)];
  }

  getLayerIndex(layerName) {
    // Optimize with a dict?
    for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex++) {
      const layer = this.layers[layerIndex];
      if (layer.name === layerName) {
        return layerIndex;
      }
    }
  }

}


class Source {

  static fromObject(obj) {
    const source = new Source();
    source.name = obj.name;
    source.location = obj.location;
    source.layerName = obj.layerName;
    return source;
  }

}


export class StaticGlyph {

  static fromObject(obj) {
    const source = new StaticGlyph();
    source.xAdvance = obj.xAdvance;
    source.yAdvance = obj.yAdvance;
    source.verticalOrigin = obj.verticalOrigin;
    if (obj.path) {
      source.path = VarPath.fromObject(obj.path);
    } else {
      source.path = new VarPath();
    }
    source.components = obj.components || [];
    return source
  }

}
