import { Transform } from './transform.js';
import {
  VariationModel,
  locationToString,
  mapForward,
  mapBackward,
  normalizeLocation,
  piecewiseLinearMap,
} from './var-model.js';
import { VarPackedPath } from './var-path.js';

export class VariableGlyphController {
  constructor(glyph, globalAxes) {
    this.glyph = glyph;
    this.globalAxes = globalAxes;
    this._locationToSourceIndex = {};
  }

  get name() {
    return this.glyph.name;
  }

  get axes() {
    return this.glyph.axes;
  }

  get sources() {
    return this.glyph.sources;
  }

  get combinedAxes() {
    if (this._combinedAxes === undefined) {
      this._setupAxisMapping();
    }
    return this._combinedAxes;
  }

  get localToGlobalMapping() {
    if (this._localToGlobalMapping === undefined) {
      this._setupAxisMapping();
    }
    return this._localToGlobalMapping;
  }

  _setupAxisMapping() {
    this._combinedAxes = Array.from(this.axes);
    this._localToGlobalMapping = [];
    const localAxisDict = {};
    for (const localAxis of this.axes) {
      localAxisDict[localAxis.name] = localAxis;
    }
    for (let globalAxis of this.globalAxes) {
      // Apply user-facing avar mapping: we need "designspace" coordinates here
      const mapFunc = makeAxisMapFunc(globalAxis);
      globalAxis = {
        name: globalAxis.name,
        minValue: mapFunc(globalAxis.minValue),
        defaultValue: mapFunc(globalAxis.defaultValue),
        maxValue: mapFunc(globalAxis.maxValue),
      };
      const localAxis = localAxisDict[globalAxis.name];
      if (localAxis) {
        const mapping = [
          [localAxis.minValue, globalAxis.minValue],
          [localAxis.defaultValue, globalAxis.defaultValue],
          [localAxis.maxValue, globalAxis.maxValue],
        ];
        this._localToGlobalMapping.push({
          name: globalAxis.name,
          mapping: mapping,
        });
      } else {
        this._combinedAxes.push(globalAxis);
      }
    }
  }

  getLayerGlyph(layerName) {
    return this.glyph.getLayerGlyph(layerName);
  }

  getLayerIndex(layerName) {
    return this.glyph.getLayerIndex(layerName);
  }

  getSourceIndex(location) {
    const locationStr = locationToString(location);
    // TODO: fix the unboundedness of the _locationToSourceIndex cache
    if (!(locationStr in this._locationToSourceIndex)) {
      this._locationToSourceIndex[locationStr] = this._getSourceIndex(location);
    }
    return this._locationToSourceIndex[locationStr];
  }

  _getSourceIndex(location) {
    location = this.mapLocationGlobalToLocal(location);
    for (let i = 0; i < this.sources.length; i++) {
      const source = this.sources[i];
      const seen = new Set();
      let found = true;
      for (const axis of this.axes.concat(this.globalAxes)) {
        if (seen.has(axis.name)) {
          continue;
        }
        seen.add(axis.name);
        const axisDefaultValue = piecewiseLinearMap(
          axis.defaultValue,
          Object.fromEntries(axis.mapping || [])
        );
        let varValue = location[axis.name];
        let sourceValue = source.location[axis.name];
        if (varValue === undefined) {
          varValue = axisDefaultValue;
        }
        if (sourceValue === undefined) {
          sourceValue = axisDefaultValue;
        }
        if (Math.abs(varValue - sourceValue) > 0.000000001) {
          found = false;
          break;
        }
      }
      if (found) {
        return i;
      }
    }
    return undefined;
  }

  getAllComponentNames() {
    // Return a set of all component names used by all layers of all sources
    const componentNames = new Set();
    for (const layer of this.glyph.layers) {
      for (const component of layer.glyph.components) {
        componentNames.add(component.name);
      }
    }
    return componentNames;
  }

  clearDeltasCache() {
    // Call this when a source layer changed
    delete this._deltas;
  }

  clearModelCache() {
    // Call this when global or local design spaces changed
    delete this._model;
    delete this._deltas;
    delete this._combinedAxes;
    delete this._localToGlobalMapping;
    this._locationToSourceIndex = {};
  }

  get model() {
    if (this._model === undefined) {
      const locations = this.sources.map((source) => source.location);
      this._model = new VariationModel(
        locations.map((location) =>
          sparsifyLocation(normalizeLocation(location, this.combinedAxes))
        ),
        this.axes.map((axis) => axis.name)
      );
    }
    return this._model;
  }

  get deltas() {
    if (this._deltas === undefined) {
      const masterValues = this.sources.map((source) =>
        this.getLayerGlyph(source.layerName)
      );
      this._deltas = this.model.getDeltas(masterValues);
    }
    return this._deltas;
  }

  instantiate(normalizedLocation) {
    try {
      return this.model.interpolateFromDeltas(normalizedLocation, this.deltas);
    } catch (error) {
      if (error.name !== 'VariationError') {
        throw error;
      }
      const errorMessage = `Interpolation error while instantiating glyph ${
        this.name
      } (${error.toString()})`;
      console.log(errorMessage);
      const indexInfo = findClosestSourceIndexFromLocation(
        this.glyph,
        normalizedLocation,
        this.combinedAxes
      );
      return this.getLayerGlyph(this.sources[indexInfo.index].layerName);
    }
  }

  async instantiateController(location, getGlyphFunc) {
    const sourceIndex = this.getSourceIndex(location);
    location = this.mapLocationGlobalToLocal(location);

    let instance;
    if (sourceIndex !== undefined) {
      instance = this.getLayerGlyph(this.sources[sourceIndex].layerName);
    } else {
      instance = this.instantiate(normalizeLocation(location, this.combinedAxes));
    }

    if (!instance) {
      throw new Error('assert -- instance is undefined');
    }
    const instanceController = new StaticGlyphController(
      this.name,
      instance,
      sourceIndex
    );

    await instanceController.setupComponents(getGlyphFunc, location);
    return instanceController;
  }

  mapLocationGlobalToLocal(location) {
    // Apply global axis mapping (user-facing avar)
    location = mapForward(location, this.globalAxes);
    // Map axes that exist both globally and locally to their local ranges
    location = mapBackward(location, this.localToGlobalMapping);
    // Expand folded NLI axes to their "real" axes
    location = mapLocationExpandNLI(location, this.axes);
    return location;
  }

  mapLocationLocalToGlobal(location) {
    // Fold NLI Axis into single user-facing axes
    location = mapLocationFoldNLI(location);
    // Map axes that exist both globally and locally to their global ranges
    location = mapForward(location, this.localToGlobalMapping);
    // Un-apply global axis mapping (user-facing avar)
    location = mapBackward(location, this.globalAxes);
    return location;
  }
}

export class StaticGlyphController {
  constructor(name, instance, sourceIndex) {
    this.name = name;
    this.instance = instance;
    this.sourceIndex = sourceIndex;
    this.canEdit = sourceIndex !== undefined;
    this.components = [];
  }

  async setupComponents(getGlyphFunc, parentLocation) {
    this.components = [];
    for (const compo of this.instance.components) {
      const compoController = new ComponentController(compo);
      await compoController.setupPath(getGlyphFunc, parentLocation);
      this.components.push(compoController);
    }
  }

  clearCache() {
    delete this._flattenedPath;
    delete this._flattenedPath2d;
    delete this._path2d;
    delete this._componentsPath;
    delete this._componentsPath2d;
    delete this._controlBounds;
    delete this._convexHull;
  }

  get xAdvance() {
    return this.instance.xAdvance;
  }

  get yAdvance() {
    return this.instance.yAdvance;
  }

  get verticalOrigin() {
    return this.instance.verticalOrigin;
  }

  get flattenedPath() {
    if (this._flattenedPath === undefined) {
      this._flattenedPath = joinPaths([this.instance.path, this.componentsPath]);
    }
    return this._flattenedPath;
  }

  get flattenedPath2d() {
    if (this._flattenedPath2d === undefined) {
      this._flattenedPath2d = new Path2D();
      this.flattenedPath.drawToPath2d(this._flattenedPath2d);
    }
    return this._flattenedPath2d;
  }

  get path() {
    return this.instance.path;
  }

  get path2d() {
    if (this._path2d === undefined) {
      this._path2d = new Path2D();
      this.instance.path.drawToPath2d(this._path2d);
    }
    return this._path2d;
  }

  get componentsPath() {
    if (this._componentsPath === undefined) {
      this._componentsPath = joinPaths(this.components.map((compo) => compo.path));
    }
    return this._componentsPath;
  }

  get componentsPath2d() {
    if (this._componentsPath2d === undefined) {
      this._componentsPath2d = new Path2D();
      this.componentsPath?.drawToPath2d(this._componentsPath2d);
    }
    return this._componentsPath2d;
  }

  get controlBounds() {
    if (this._controlBounds === undefined) {
      this._controlBounds = this.flattenedPath.getControlBounds();
    }
    return this._controlBounds;
  }

  get convexHull() {
    if (this._convexHull === undefined) {
      this._convexHull = this.flattenedPath.getConvexHull();
    }
    return this._convexHull;
  }
}

class ComponentController {
  constructor(compo) {
    this.compo = compo;
  }

  async setupPath(getGlyphFunc, parentLocation) {
    this.path = await getComponentPath(this.compo, getGlyphFunc, parentLocation);
  }

  get path2d() {
    if (this._path2d === undefined) {
      this._path2d = new Path2D();
      this.path.drawToPath2d(this._path2d);
    }
    return this._path2d;
  }

  get controlBounds() {
    if (this._controlBounds === undefined) {
      this._controlBounds = this.path.getControlBounds();
    }
    return this._controlBounds;
  }

  get convexHull() {
    if (this._convexHull === undefined) {
      this._convexHull = this.path.getConvexHull();
    }
    return this._convexHull;
  }
}

async function getComponentPath(compo, getGlyphFunc, parentLocation) {
  return flattenComponentPaths(
    await getNestedComponentPaths(compo, getGlyphFunc, parentLocation)
  );
}

async function getNestedComponentPaths(
  compo,
  getGlyphFunc,
  parentLocation,
  transformation = null
) {
  const compoLocation = mergeLocations(parentLocation, compo.location) || {};
  const glyph = await getGlyphFunc(compo.name);
  if (!glyph) {
    console.log(`component glyph ${compo.name} was not found`);
    return {};
  }
  let inst;
  try {
    inst = glyph.instantiate(normalizeLocation(compoLocation, glyph.combinedAxes));
  } catch (error) {
    if (error.name !== 'VariationError') {
      throw error;
    }
    const errorMessage = `Interpolation error while instantiating component ${
      compo.name
    } (${error.toString()})`;
    console.log(errorMessage);
    return { error: errorMessage };
  }
  let t = makeAffineTransform(compo.transformation);
  if (transformation) {
    t = transformation.transform(t);
  }
  const componentPaths = {};
  if (inst.path.numPoints) {
    componentPaths['path'] = inst.path.transformed(t);
  }
  componentPaths['children'] = await getComponentPaths(
    inst.components,
    getGlyphFunc,
    compoLocation,
    t
  );
  return componentPaths;
}

async function getComponentPaths(
  components,
  getGlyphFunc,
  parentLocation,
  transformation = null
) {
  const paths = [];

  for (const compo of components || []) {
    paths.push(
      await getNestedComponentPaths(compo, getGlyphFunc, parentLocation, transformation)
    );
  }
  return paths;
}

function flattenComponentPaths(item) {
  const paths = [];
  if (item.path !== undefined) {
    paths.push(item.path);
  }
  if (item.children !== undefined) {
    for (const child of item.children) {
      const childPath = flattenComponentPaths(child);
      if (!!childPath) {
        paths.push(childPath);
      }
    }
  }
  return joinPaths(paths);
}

export async function decomposeComponents(
  components,
  componentIndices,
  parentLocation,
  getGlyphFunc
) {
  if (!componentIndices) {
    componentIndices = range(instance.components.length);
  }

  const newPaths = [];
  const newComponents = [];
  for (const index of componentIndices) {
    const component = components[index];
    const baseGlyph = await getGlyphFunc(component.name);
    let location = { ...parentLocation, ...component.location };
    const normLocation = baseGlyph.mapLocationGlobalToLocal(location);
    const compoInstance = baseGlyph.instantiate(
      normalizeLocation(normLocation, baseGlyph.combinedAxes)
    );
    const t = makeAffineTransform(component.transformation);
    newPaths.push(compoInstance.path.transformed(t));
    for (const nestedCompo of compoInstance.components) {
      const nestedT = makeAffineTransform(nestedCompo.transformation);
      const newNestedT = t.transform(nestedT);
      newComponents.push({
        name: nestedCompo.name,
        transformation: decomposeAffineTransform(newNestedT),
        location: { ...nestedCompo.location },
      });
    }
  }
  const newPath = joinPaths(newPaths);
  return { path: newPath, components: newComponents };
}

function makeAxisMapFunc(axis) {
  if (!axis.mapping) {
    return (v) => v;
  }
  const mapping = Object.fromEntries(axis.mapping);
  return (v) => piecewiseLinearMap(v, mapping);
}

function sparsifyLocation(location) {
  // location must be normalized
  const sparseLocation = {};
  for (const [name, value] of Object.entries(location)) {
    if (value) {
      sparseLocation[name] = value;
    }
  }
  return sparseLocation;
}

export function getAxisBaseName(axisName) {
  return axisName.split('*', 1)[0];
}

function mapLocationExpandNLI(userLocation, axes) {
  const nliAxes = {};
  for (const axis of axes) {
    const baseName = axis.name.split('*', 1)[0];
    if (baseName !== axis.name) {
      if (!(baseName in nliAxes)) {
        nliAxes[baseName] = [];
      }
      nliAxes[baseName].push(axis.name);
    }
  }
  const location = {};
  for (const [baseName, value] of Object.entries(userLocation)) {
    for (const realName of nliAxes[baseName] || [baseName]) {
      location[realName] = value;
    }
  }
  return location;
}

function mapLocationFoldNLI(location, axes) {
  const userLocation = {};
  for (const [axisName, axisValue] of Object.entries(location)) {
    const baseName = axisName.split('*', 1)[0];
    userLocation[baseName] = axisValue;
  }
  return userLocation;
}

function joinPaths(paths) {
  if (paths.length) {
    return paths.reduce((p1, p2) => p1.concat(p2));
  }
  return new VarPackedPath();
}

function mergeLocations(loc1, loc2) {
  if (!loc1) {
    return loc2;
  }
  return { ...loc1, ...loc2 };
}

function makeAffineTransform(transformation) {
  let t = new Transform();
  t = t.translate(
    transformation.translateX + transformation.tCenterX,
    transformation.translateY + transformation.tCenterY
  );
  t = t.rotate(transformation.rotation * (Math.PI / 180));
  t = t.scale(transformation.scaleX, transformation.scaleY);
  t = t.skew(
    -transformation.skewX * (Math.PI / 180),
    transformation.skewY * (Math.PI / 180)
  );
  t = t.translate(-transformation.tCenterX, -transformation.tCenterY);
  return t;
}

function decomposeAffineTransform(affine) {
  // Decompose a 2x2 transformation matrix into components:
  // - rotation
  // - scaleX
  // - scaleY
  // - skewX
  // - skewY
  const [a, b, c, d] = [affine.xx, affine.xy, affine.yx, affine.yy];
  const delta = a * d - b * c;

  let rotation = 0;
  let scaleX = 0,
    scaleY = 0;
  let skewX = 0,
    skewY = 0;

  // Apply the QR-like decomposition.
  if (a != 0 || b != 0) {
    const r = Math.sqrt(a * a + b * b);
    rotation = b > 0 ? Math.acos(a / r) : -Math.acos(a / r);
    [scaleX, scaleY] = [r, delta / r];
    [skewX, skewY] = [Math.atan((a * c + b * d) / (r * r)), 0];
  } else if (c != 0 || d != 0) {
    const s = Math.sqrt(c * c + d * d);
    rotation = Math.PI / 2 - (d > 0 ? Math.acos(-c / s) : -Math.acos(c / s));
    [scaleX, scaleY] = [delta / s, s];
    [skewX, skewY] = [0, Math.atan((a * c + b * d) / (s * s))];
  } else {
    // a = b = c = d = 0
  }

  const transformation = {
    translateX: affine.dx,
    translateY: affine.dy,
    rotation: rotation * (180 / Math.PI),
    scaleX: scaleX,
    scaleY: scaleY,
    skewX: -skewX * (180 / Math.PI),
    skewY: skewY * (180 / Math.PI),
    tCenterX: 0,
    tCenterY: 0,
  };
  return transformation;
}

function subsetLocation(location, axes) {
  const subsettedLocation = {};
  for (const axis of axes) {
    if (axis.name in location) {
      subsettedLocation[axis.name] = location[axis.name];
    }
  }
  return subsettedLocation;
}

function findClosestSourceIndexFromLocation(glyph, location, axes) {
  const distances = [];
  for (let i = 0; i < glyph.sources.length; i++) {
    const sourceLocation = normalizeLocation(glyph.sources[i].location, axes);
    let distanceSquared = 0;
    for (const [axisName, value] of Object.entries(location)) {
      const sourceValue = sourceLocation[axisName];
      distanceSquared += (sourceValue - value) ** 2;
    }
    if (distanceSquared === 0) {
      // exact match, no need to look further
      return { distance: 0, index: i };
    }
    distances.push([distanceSquared, i]);
  }
  distances.sort((a, b) => {
    const da = a[0];
    const db = b[0];
    return (a > b) - (a < b);
  });
  return { distance: Math.sqrt(distances[0][0]), index: distances[0][1] };
}
