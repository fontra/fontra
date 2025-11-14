// To parse this data:
//
//   import { Convert, IndexD } from "./file";
//
//   const indexD = Convert.toIndexD(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

export interface IndexD {
  Font: Font;
  FontInfo: FontInfo;
  VariableGlyph: VariableGlyph;
  GlyphAxis: GlyphAxis;
  GlyphSource: GlyphSource;
  Layer: Layer;
  StaticGlyph: StaticGlyph;
  PackedPath: PackedPath;
  ContourInfo: ContourInfo;
  Component: Component;
  DecomposedTransform: DecomposedTransform;
  Anchor: Anchor;
  Guideline: Guideline;
  BackgroundImage: BackgroundImage;
  RGBAColor: RGBAColor;
  Axes: Axes;
  FontAxis: FontAxis;
  AxisValueLabel: AxisValueLabel;
  DiscreteFontAxis: FontAxis;
  CrossAxisMapping: CrossAxisMapping;
  FontSource: FontSource;
  LineMetric: LineMetric;
  Kerning: Kerning;
  OpenTypeFeatures: OpenTypeFeatures;
}

export interface Anchor {
  name: Name;
  x: X;
  y: X;
  customData: CustomData;
}

export interface CustomData {
  type: Type;
  subtype: string;
}

export enum Type {
  Dict = "dict",
  List = "list",
}

export interface Name {
  type: string;
  optional: boolean;
}

export interface X {
  type: string;
}

export interface Axes {
  axes: CustomData;
  mappings: CustomData;
  elidedFallBackname: Name;
  customData: CustomData;
}

export interface AxisValueLabel {
  name: X;
  value: X;
  minValue: Name;
  maxValue: Name;
  linkedValue: Name;
  elidable: X;
  olderSibling: X;
}

export interface BackgroundImage {
  identifier: X;
  transformation: X;
  opacity: X;
  color: Name;
  customData: CustomData;
}

export interface Component {
  name: X;
  transformation: X;
  location: CustomData;
}

export interface ContourInfo {
  endPoint: X;
  isClosed: X;
}

export interface CrossAxisMapping {
  description: Name;
  groupDescription: Name;
  inputLocation: CustomData;
  outputLocation: CustomData;
}

export interface DecomposedTransform {
  translateX: X;
  translateY: X;
  rotation: X;
  scaleX: X;
  scaleY: X;
  skewX: X;
  skewY: X;
  tCenterX: X;
  tCenterY: X;
}

export interface FontAxis {
  name: X;
  label: X;
  tag: X;
  values?: CustomData;
  defaultValue: X;
  mapping: CustomData;
  valueLabels: CustomData;
  hidden: X;
  customData: CustomData;
  minValue?: X;
  maxValue?: X;
}

export interface Font {
  unitsPerEm: X;
  fontInfo: X;
  glyphs: CustomData;
  glyphMap: CustomData;
  axes: X;
  sources: CustomData;
  kerning: CustomData;
  features: X;
  customData: CustomData;
}

export interface FontInfo {
  familyName: Name;
  versionMajor: Name;
  versionMinor: Name;
  copyright: Name;
  trademark: Name;
  description: Name;
  sampleText: Name;
  designer: Name;
  designerURL: Name;
  manufacturer: Name;
  manufacturerURL: Name;
  licenseDescription: Name;
  licenseInfoURL: Name;
  vendorID: Name;
  customData: CustomData;
}

export interface FontSource {
  name: X;
  isSparse: X;
  location: CustomData;
  lineMetricsHorizontalLayout: CustomData;
  lineMetricsVerticalLayout: CustomData;
  italicAngle: X;
  guidelines: CustomData;
  customData: CustomData;
}

export interface GlyphAxis {
  name: X;
  minValue: X;
  defaultValue: X;
  maxValue: X;
  customData: CustomData;
}

export interface GlyphSource {
  name: X;
  layerName: X;
  location: CustomData;
  locationBase: Name;
  inactive: X;
  customData: CustomData;
}

export interface Guideline {
  name: Name;
  x: X;
  y: X;
  angle: X;
  locked: X;
  customData: CustomData;
}

export interface Kerning {
  groups: CustomData;
  sourceIdentifiers: CustomData;
  values: CustomData;
}

export interface Layer {
  glyph: StaticGlyph;
  customData: CustomData;
}

export interface LineMetric {
  value: X;
  zone: X;
  customData: CustomData;
}

export interface OpenTypeFeatures {
  language: X;
  text: X;
  customData: CustomData;
}

export interface PackedPath {
  coordinates: CustomData;
  pointTypes: CustomData;
  contourInfo: CustomData;
  pointAttributes: Name;
}

export interface RGBAColor {
  red: X;
  green: X;
  blue: X;
  alpha: X;
}

export interface StaticGlyph {
  path: X;
  components: CustomData;
  xAdvance: Name;
  yAdvance: Name;
  verticalOrigin: Name;
  anchors: CustomData;
  guidelines: CustomData;
  backgroundImage: Name;
}

export interface VariableGlyph {
  name: X;
  axes: GlyphAxis[];
  sources: GlyphSource[];
  layers: Record<string, Layer>;
  customData: CustomData;
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
  public static toIndexD(json: string): IndexD {
    return cast(JSON.parse(json), r("IndexD"));
  }

  public static indexDToJson(value: IndexD): string {
    return JSON.stringify(uncast(value, r("IndexD")), null, 2);
  }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ""): never {
  const prettyTyp = prettyTypeName(typ);
  const parentText = parent ? ` on ${parent}` : "";
  const keyText = key ? ` for key "${key}"` : "";
  throw Error(
    `Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(
      val
    )}`
  );
}

function prettyTypeName(typ: any): string {
  if (Array.isArray(typ)) {
    if (typ.length === 2 && typ[0] === undefined) {
      return `an optional ${prettyTypeName(typ[1])}`;
    } else {
      return `one of [${typ
        .map((a) => {
          return prettyTypeName(a);
        })
        .join(", ")}]`;
    }
  } else if (typeof typ === "object" && typ.literal !== undefined) {
    return typ.literal;
  } else {
    return typeof typ;
  }
}

function jsonToJSProps(typ: any): any {
  if (typ.jsonToJS === undefined) {
    const map: any = {};
    typ.props.forEach((p: any) => (map[p.json] = { key: p.js, typ: p.typ }));
    typ.jsonToJS = map;
  }
  return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
  if (typ.jsToJSON === undefined) {
    const map: any = {};
    typ.props.forEach((p: any) => (map[p.js] = { key: p.json, typ: p.typ }));
    typ.jsToJSON = map;
  }
  return typ.jsToJSON;
}

function transform(
  val: any,
  typ: any,
  getProps: any,
  key: any = "",
  parent: any = ""
): any {
  function transformPrimitive(typ: string, val: any): any {
    if (typeof typ === typeof val) return val;
    return invalidValue(typ, val, key, parent);
  }

  function transformUnion(typs: any[], val: any): any {
    // val must validate against one typ in typs
    const l = typs.length;
    for (let i = 0; i < l; i++) {
      const typ = typs[i];
      try {
        return transform(val, typ, getProps);
      } catch (_) {}
    }
    return invalidValue(typs, val, key, parent);
  }

  function transformEnum(cases: string[], val: any): any {
    if (cases.indexOf(val) !== -1) return val;
    return invalidValue(
      cases.map((a) => {
        return l(a);
      }),
      val,
      key,
      parent
    );
  }

  function transformArray(typ: any, val: any): any {
    // val must be an array with no invalid elements
    if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
    return val.map((el) => transform(el, typ, getProps));
  }

  function transformDate(val: any): any {
    if (val === null) {
      return null;
    }
    const d = new Date(val);
    if (isNaN(d.valueOf())) {
      return invalidValue(l("Date"), val, key, parent);
    }
    return d;
  }

  function transformObject(
    props: { [k: string]: any },
    additional: any,
    val: any
  ): any {
    if (val === null || typeof val !== "object" || Array.isArray(val)) {
      return invalidValue(l(ref || "object"), val, key, parent);
    }
    const result: any = {};
    Object.getOwnPropertyNames(props).forEach((key) => {
      const prop = props[key];
      const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
      result[prop.key] = transform(v, prop.typ, getProps, key, ref);
    });
    Object.getOwnPropertyNames(val).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(props, key)) {
        result[key] = transform(val[key], additional, getProps, key, ref);
      }
    });
    return result;
  }

  if (typ === "any") return val;
  if (typ === null) {
    if (val === null) return val;
    return invalidValue(typ, val, key, parent);
  }
  if (typ === false) return invalidValue(typ, val, key, parent);
  let ref: any = undefined;
  while (typeof typ === "object" && typ.ref !== undefined) {
    ref = typ.ref;
    typ = typeMap[typ.ref];
  }
  if (Array.isArray(typ)) return transformEnum(typ, val);
  if (typeof typ === "object") {
    return typ.hasOwnProperty("unionMembers")
      ? transformUnion(typ.unionMembers, val)
      : typ.hasOwnProperty("arrayItems")
      ? transformArray(typ.arrayItems, val)
      : typ.hasOwnProperty("props")
      ? transformObject(getProps(typ), typ.additional, val)
      : invalidValue(typ, val, key, parent);
  }
  // Numbers can be parsed by Date but shouldn't be.
  if (typ === Date && typeof val !== "number") return transformDate(val);
  return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
  return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
  return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
  return { literal: typ };
}

function a(typ: any) {
  return { arrayItems: typ };
}

function u(...typs: any[]) {
  return { unionMembers: typs };
}

function o(props: any[], additional: any) {
  return { props, additional };
}

function m(additional: any) {
  return { props: [], additional };
}

function r(name: string) {
  return { ref: name };
}

const typeMap: any = {
  IndexD: o(
    [
      { json: "Font", js: "Font", typ: r("Font") },
      { json: "FontInfo", js: "FontInfo", typ: r("FontInfo") },
      { json: "VariableGlyph", js: "VariableGlyph", typ: r("VariableGlyph") },
      { json: "GlyphAxis", js: "GlyphAxis", typ: r("GlyphAxis") },
      { json: "GlyphSource", js: "GlyphSource", typ: r("GlyphSource") },
      { json: "Layer", js: "Layer", typ: r("Layer") },
      { json: "StaticGlyph", js: "StaticGlyph", typ: r("StaticGlyph") },
      { json: "PackedPath", js: "PackedPath", typ: r("PackedPath") },
      { json: "ContourInfo", js: "ContourInfo", typ: r("ContourInfo") },
      { json: "Component", js: "Component", typ: r("Component") },
      {
        json: "DecomposedTransform",
        js: "DecomposedTransform",
        typ: r("DecomposedTransform"),
      },
      { json: "Anchor", js: "Anchor", typ: r("Anchor") },
      { json: "Guideline", js: "Guideline", typ: r("Guideline") },
      { json: "BackgroundImage", js: "BackgroundImage", typ: r("BackgroundImage") },
      { json: "RGBAColor", js: "RGBAColor", typ: r("RGBAColor") },
      { json: "Axes", js: "Axes", typ: r("Axes") },
      { json: "FontAxis", js: "FontAxis", typ: r("FontAxis") },
      { json: "AxisValueLabel", js: "AxisValueLabel", typ: r("AxisValueLabel") },
      { json: "DiscreteFontAxis", js: "DiscreteFontAxis", typ: r("FontAxis") },
      { json: "CrossAxisMapping", js: "CrossAxisMapping", typ: r("CrossAxisMapping") },
      { json: "FontSource", js: "FontSource", typ: r("FontSource") },
      { json: "LineMetric", js: "LineMetric", typ: r("LineMetric") },
      { json: "Kerning", js: "Kerning", typ: r("Kerning") },
      { json: "OpenTypeFeatures", js: "OpenTypeFeatures", typ: r("OpenTypeFeatures") },
    ],
    false
  ),
  Anchor: o(
    [
      { json: "name", js: "name", typ: r("Name") },
      { json: "x", js: "x", typ: r("X") },
      { json: "y", js: "y", typ: r("X") },
      { json: "customData", js: "customData", typ: r("CustomData") },
    ],
    false
  ),
  CustomData: o(
    [
      { json: "type", js: "type", typ: r("Type") },
      { json: "subtype", js: "subtype", typ: "" },
    ],
    false
  ),
  Name: o(
    [
      { json: "type", js: "type", typ: "" },
      { json: "optional", js: "optional", typ: true },
    ],
    false
  ),
  X: o([{ json: "type", js: "type", typ: "" }], false),
  Axes: o(
    [
      { json: "axes", js: "axes", typ: r("CustomData") },
      { json: "mappings", js: "mappings", typ: r("CustomData") },
      { json: "elidedFallBackname", js: "elidedFallBackname", typ: r("Name") },
      { json: "customData", js: "customData", typ: r("CustomData") },
    ],
    false
  ),
  AxisValueLabel: o(
    [
      { json: "name", js: "name", typ: r("X") },
      { json: "value", js: "value", typ: r("X") },
      { json: "minValue", js: "minValue", typ: r("Name") },
      { json: "maxValue", js: "maxValue", typ: r("Name") },
      { json: "linkedValue", js: "linkedValue", typ: r("Name") },
      { json: "elidable", js: "elidable", typ: r("X") },
      { json: "olderSibling", js: "olderSibling", typ: r("X") },
    ],
    false
  ),
  BackgroundImage: o(
    [
      { json: "identifier", js: "identifier", typ: r("X") },
      { json: "transformation", js: "transformation", typ: r("X") },
      { json: "opacity", js: "opacity", typ: r("X") },
      { json: "color", js: "color", typ: r("Name") },
      { json: "customData", js: "customData", typ: r("CustomData") },
    ],
    false
  ),
  Component: o(
    [
      { json: "name", js: "name", typ: r("X") },
      { json: "transformation", js: "transformation", typ: r("X") },
      { json: "location", js: "location", typ: r("CustomData") },
    ],
    false
  ),
  ContourInfo: o(
    [
      { json: "endPoint", js: "endPoint", typ: r("X") },
      { json: "isClosed", js: "isClosed", typ: r("X") },
    ],
    false
  ),
  CrossAxisMapping: o(
    [
      { json: "description", js: "description", typ: r("Name") },
      { json: "groupDescription", js: "groupDescription", typ: r("Name") },
      { json: "inputLocation", js: "inputLocation", typ: r("CustomData") },
      { json: "outputLocation", js: "outputLocation", typ: r("CustomData") },
    ],
    false
  ),
  DecomposedTransform: o(
    [
      { json: "translateX", js: "translateX", typ: r("X") },
      { json: "translateY", js: "translateY", typ: r("X") },
      { json: "rotation", js: "rotation", typ: r("X") },
      { json: "scaleX", js: "scaleX", typ: r("X") },
      { json: "scaleY", js: "scaleY", typ: r("X") },
      { json: "skewX", js: "skewX", typ: r("X") },
      { json: "skewY", js: "skewY", typ: r("X") },
      { json: "tCenterX", js: "tCenterX", typ: r("X") },
      { json: "tCenterY", js: "tCenterY", typ: r("X") },
    ],
    false
  ),
  FontAxis: o(
    [
      { json: "name", js: "name", typ: r("X") },
      { json: "label", js: "label", typ: r("X") },
      { json: "tag", js: "tag", typ: r("X") },
      { json: "values", js: "values", typ: u(undefined, r("CustomData")) },
      { json: "defaultValue", js: "defaultValue", typ: r("X") },
      { json: "mapping", js: "mapping", typ: r("CustomData") },
      { json: "valueLabels", js: "valueLabels", typ: r("CustomData") },
      { json: "hidden", js: "hidden", typ: r("X") },
      { json: "customData", js: "customData", typ: r("CustomData") },
      { json: "minValue", js: "minValue", typ: u(undefined, r("X")) },
      { json: "maxValue", js: "maxValue", typ: u(undefined, r("X")) },
    ],
    false
  ),
  Font: o(
    [
      { json: "unitsPerEm", js: "unitsPerEm", typ: r("X") },
      { json: "fontInfo", js: "fontInfo", typ: r("X") },
      { json: "glyphs", js: "glyphs", typ: r("CustomData") },
      { json: "glyphMap", js: "glyphMap", typ: r("CustomData") },
      { json: "axes", js: "axes", typ: r("X") },
      { json: "sources", js: "sources", typ: r("CustomData") },
      { json: "kerning", js: "kerning", typ: r("CustomData") },
      { json: "features", js: "features", typ: r("X") },
      { json: "customData", js: "customData", typ: r("CustomData") },
    ],
    false
  ),
  FontInfo: o(
    [
      { json: "familyName", js: "familyName", typ: r("Name") },
      { json: "versionMajor", js: "versionMajor", typ: r("Name") },
      { json: "versionMinor", js: "versionMinor", typ: r("Name") },
      { json: "copyright", js: "copyright", typ: r("Name") },
      { json: "trademark", js: "trademark", typ: r("Name") },
      { json: "description", js: "description", typ: r("Name") },
      { json: "sampleText", js: "sampleText", typ: r("Name") },
      { json: "designer", js: "designer", typ: r("Name") },
      { json: "designerURL", js: "designerURL", typ: r("Name") },
      { json: "manufacturer", js: "manufacturer", typ: r("Name") },
      { json: "manufacturerURL", js: "manufacturerURL", typ: r("Name") },
      { json: "licenseDescription", js: "licenseDescription", typ: r("Name") },
      { json: "licenseInfoURL", js: "licenseInfoURL", typ: r("Name") },
      { json: "vendorID", js: "vendorID", typ: r("Name") },
      { json: "customData", js: "customData", typ: r("CustomData") },
    ],
    false
  ),
  FontSource: o(
    [
      { json: "name", js: "name", typ: r("X") },
      { json: "isSparse", js: "isSparse", typ: r("X") },
      { json: "location", js: "location", typ: r("CustomData") },
      {
        json: "lineMetricsHorizontalLayout",
        js: "lineMetricsHorizontalLayout",
        typ: r("CustomData"),
      },
      {
        json: "lineMetricsVerticalLayout",
        js: "lineMetricsVerticalLayout",
        typ: r("CustomData"),
      },
      { json: "italicAngle", js: "italicAngle", typ: r("X") },
      { json: "guidelines", js: "guidelines", typ: r("CustomData") },
      { json: "customData", js: "customData", typ: r("CustomData") },
    ],
    false
  ),
  GlyphAxis: o(
    [
      { json: "name", js: "name", typ: r("X") },
      { json: "minValue", js: "minValue", typ: r("X") },
      { json: "defaultValue", js: "defaultValue", typ: r("X") },
      { json: "maxValue", js: "maxValue", typ: r("X") },
      { json: "customData", js: "customData", typ: r("CustomData") },
    ],
    false
  ),
  GlyphSource: o(
    [
      { json: "name", js: "name", typ: r("X") },
      { json: "layerName", js: "layerName", typ: r("X") },
      { json: "location", js: "location", typ: r("CustomData") },
      { json: "locationBase", js: "locationBase", typ: r("Name") },
      { json: "inactive", js: "inactive", typ: r("X") },
      { json: "customData", js: "customData", typ: r("CustomData") },
    ],
    false
  ),
  Guideline: o(
    [
      { json: "name", js: "name", typ: r("Name") },
      { json: "x", js: "x", typ: r("X") },
      { json: "y", js: "y", typ: r("X") },
      { json: "angle", js: "angle", typ: r("X") },
      { json: "locked", js: "locked", typ: r("X") },
      { json: "customData", js: "customData", typ: r("CustomData") },
    ],
    false
  ),
  Kerning: o(
    [
      { json: "groups", js: "groups", typ: r("CustomData") },
      { json: "sourceIdentifiers", js: "sourceIdentifiers", typ: r("CustomData") },
      { json: "values", js: "values", typ: r("CustomData") },
    ],
    false
  ),
  Layer: o(
    [
      { json: "glyph", js: "glyph", typ: r("X") },
      { json: "customData", js: "customData", typ: r("CustomData") },
    ],
    false
  ),
  LineMetric: o(
    [
      { json: "value", js: "value", typ: r("X") },
      { json: "zone", js: "zone", typ: r("X") },
      { json: "customData", js: "customData", typ: r("CustomData") },
    ],
    false
  ),
  OpenTypeFeatures: o(
    [
      { json: "language", js: "language", typ: r("X") },
      { json: "text", js: "text", typ: r("X") },
      { json: "customData", js: "customData", typ: r("CustomData") },
    ],
    false
  ),
  PackedPath: o(
    [
      { json: "coordinates", js: "coordinates", typ: r("CustomData") },
      { json: "pointTypes", js: "pointTypes", typ: r("CustomData") },
      { json: "contourInfo", js: "contourInfo", typ: r("CustomData") },
      { json: "pointAttributes", js: "pointAttributes", typ: r("Name") },
    ],
    false
  ),
  RGBAColor: o(
    [
      { json: "red", js: "red", typ: r("X") },
      { json: "green", js: "green", typ: r("X") },
      { json: "blue", js: "blue", typ: r("X") },
      { json: "alpha", js: "alpha", typ: r("X") },
    ],
    false
  ),
  StaticGlyph: o(
    [
      { json: "path", js: "path", typ: r("X") },
      { json: "components", js: "components", typ: r("CustomData") },
      { json: "xAdvance", js: "xAdvance", typ: r("Name") },
      { json: "yAdvance", js: "yAdvance", typ: r("Name") },
      { json: "verticalOrigin", js: "verticalOrigin", typ: r("Name") },
      { json: "anchors", js: "anchors", typ: r("CustomData") },
      { json: "guidelines", js: "guidelines", typ: r("CustomData") },
      { json: "backgroundImage", js: "backgroundImage", typ: r("Name") },
    ],
    false
  ),
  VariableGlyph: o(
    [
      { json: "name", js: "name", typ: r("X") },
      { json: "axes", js: "axes", typ: r("CustomData") },
      { json: "sources", js: "sources", typ: r("CustomData") },
      { json: "layers", js: "layers", typ: r("CustomData") },
      { json: "customData", js: "customData", typ: r("CustomData") },
    ],
    false
  ),
  Type: ["dict", "list"],
};
