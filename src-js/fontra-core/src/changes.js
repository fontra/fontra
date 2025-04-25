export class ChangeCollector {
  constructor(parentCollector, path) {
    this._parentCollector = parentCollector;
    this._path = path;
    this._forwardChanges = undefined;
    this._rollbackChanges = undefined;
  }

  static fromChanges(forwardChanges, rollbackChanges) {
    if (!Array.isArray(forwardChanges)) {
      forwardChanges = hasChange(forwardChanges) ? [forwardChanges] : [];
    }
    if (!Array.isArray(rollbackChanges)) {
      rollbackChanges = hasChange(rollbackChanges) ? [rollbackChanges] : [];
    }
    const collector = new ChangeCollector();
    collector._forwardChanges = forwardChanges;
    collector._rollbackChanges = rollbackChanges;
    return collector;
  }

  _ensureForwardChanges() {
    if (this._forwardChanges) {
      return;
    }
    this._forwardChanges = [];
    if (this._parentCollector) {
      this._parentCollector._ensureForwardChanges();
      if (equalPath(this._path, lastItem(this._parentCollector._forwardChanges)?.p)) {
        this._forwardChanges = lastItem(this._parentCollector._forwardChanges).c;
      } else {
        this._parentCollector._forwardChanges.push({
          p: this._path,
          c: this._forwardChanges,
        });
      }
    }
  }

  _ensureRollbackChanges() {
    if (this._rollbackChanges) {
      return;
    }
    this._rollbackChanges = [];
    if (this._parentCollector) {
      this._parentCollector._ensureRollbackChanges();
      if (equalPath(this._path, this._parentCollector._rollbackChanges[0]?.p)) {
        this._rollbackChanges = this._parentCollector._rollbackChanges[0].c;
      } else {
        this._parentCollector._rollbackChanges.splice(0, 0, {
          p: this._path,
          c: this._rollbackChanges,
        });
      }
    }
  }

  get hasChange() {
    return !!this._forwardChanges?.length;
  }

  get change() {
    return consolidateChanges(this._forwardChanges || {});
  }

  get hasRollbackChange() {
    return !!this._rollbackChanges?.length;
  }

  get rollbackChange() {
    return consolidateChanges(this._rollbackChanges || {});
  }

  addChange(func, ...args) {
    this._ensureForwardChanges();
    this._forwardChanges.push({ f: func, a: args });
  }

  addRollbackChange(func, ...args) {
    this._ensureRollbackChanges();
    this._rollbackChanges.splice(0, 0, { f: func, a: args });
  }

  subCollector(...path) {
    return new ChangeCollector(this, path);
  }

  concat(...others) {
    const forwardChanges = [];
    const rollbackChanges = [];
    if (this.hasChange) {
      forwardChanges.push(...this._forwardChanges);
    }
    if (this.hasRollbackChange) {
      rollbackChanges.push(...this._rollbackChanges);
    }
    for (const other of others) {
      if (other.hasChange) {
        forwardChanges.push(...other._forwardChanges);
      }
      if (other.hasRollbackChange) {
        rollbackChanges.splice(0, 0, ...other._rollbackChanges);
      }
    }
    return ChangeCollector.fromChanges(forwardChanges, rollbackChanges);
  }

  prefixed(pathPrefix) {
    return ChangeCollector.fromChanges(
      consolidateChanges(this.change, pathPrefix),
      consolidateChanges(this.rollbackChange, pathPrefix)
    );
  }
}

export function consolidateChanges(changes, prefixPath) {
  let change;
  let path;
  if (!Array.isArray(changes)) {
    changes = [changes];
  }
  if (changes.length === 1) {
    change = { ...changes[0] };
    path = change.p;
  } else {
    const commonPrefix = findCommonPrefix(changes);
    const numCommonElements = commonPrefix.length;
    if (numCommonElements) {
      changes = changes.map((change) => {
        const newChange = { ...change };
        newChange.p = change.p.slice(numCommonElements);
        if (!newChange.p.length) {
          delete newChange.p;
        }
        return newChange;
      });
      path = commonPrefix;
    } else {
      // Zap empty p
      changes = changes.map((change) => {
        const newChange = { ...change };
        if (newChange.p && !newChange.p.length) {
          delete newChange.p;
        }
        return newChange;
      });
    }
    change = { c: changes };
  }
  if (path?.length) {
    change["p"] = path;
  } else {
    delete change["p"];
  }

  change = unnestSingleChildren(change);

  if (prefixPath?.length) {
    change = addPathPrefix(change, prefixPath);
  }

  return change;
}

function unnestSingleChildren(change) {
  const children = change.c?.map(unnestSingleChildren).filter(hasChange);

  if (!children?.length) {
    if (children?.length === 0) {
      // Remove empty children array
      change = { ...change };
      delete change.c;
    }
    if (!change.f) {
      // This change doesn't do anything
      change = {};
    }
    return change;
  }
  // Recursively unnest and prune
  if (children.length !== 1) {
    change = { ...change };
    change.c = children;
    return change;
  }
  const child = children[0];
  let path;
  const childPath = child.p || [];
  if (change.p?.length) {
    path = change.p.concat(childPath);
  } else {
    path = childPath;
  }
  change = { ...child };
  if (path.length) {
    change.p = path;
  } else {
    delete change.p;
  }
  return change;
}

function addPathPrefix(change, prefixPath) {
  const prefixedChanged = { ...change };
  prefixedChanged.p = prefixPath.concat(prefixedChanged.p || []);
  return prefixedChanged;
}

function findCommonPrefix(changes) {
  const commonPrefix = [];
  if (!changes.length) {
    return commonPrefix;
  }
  for (const change of changes) {
    if (!change.p || !change.p.length) {
      return commonPrefix;
    }
  }
  let index = 0;
  while (true) {
    let pathElement = changes[0].p[index];
    if (!pathElement) {
      return commonPrefix;
    }
    for (let i = 1; i < changes.length; i++) {
      if (changes[i].p[index] !== pathElement) {
        return commonPrefix;
      }
    }
    commonPrefix.push(pathElement);
    index++;
  }
  return commonPrefix;
}

const baseChangeFunctions = {
  "=": (subject, itemCast, key, item) => (subject[key] = itemCast(item)),
  "d": (subject, itemCast, key) => delete subject[key],
  "-": (subject, itemCast, index, deleteCount = 1) =>
    subject.splice(index, deleteCount),
  "+": (subject, itemCast, index, ...items) =>
    subject.splice(index, 0, ...items.map(itemCast)),
  ":": (subject, itemCast, index, deleteCount, ...items) =>
    subject.splice(index, deleteCount, ...items.map(itemCast)),
};

// TODO: Refactor. These don't really belong here, and should ideally be registered from outside
const changeFunctions = {
  ...baseChangeFunctions,
  "=xy": (path, itemCast, pointIndex, x, y) => path.setPointPosition(pointIndex, x, y),
  "appendPath": (path, itemCast, newPath) => {
    path.appendPath(newPath);
  },
  "deleteNTrailingContours": (path, itemCast, numContours) => {
    path.deleteNTrailingContours(numContours);
  },
  "insertContour": (path, itemCast, contourIndex, contour) =>
    path.insertContour(contourIndex, contour),
  "deleteContour": (path, itemCast, contourIndex) => path.deleteContour(contourIndex),
  "deletePoint": (path, itemCast, contourIndex, contourPointIndex) =>
    path.deletePoint(contourIndex, contourPointIndex),
  "insertPoint": (path, itemCast, contourIndex, contourPointIndex, point) =>
    path.insertPoint(contourIndex, contourPointIndex, point),
};

//
// A "change" object is a simple JS object containing several
// keys.
//
// "p": an array of path items, eg. ["glyphs", "Aring"]
// Optional: can be omitted if empty.
//
// "f": function name, to be lookud up in the changeFunctions dict
// Optional: can be omitted if the change has children
//
// "a": "arguments", an array of arguments for the change function
// Optional: if omitted, defaults to an empty array
//
// "c": Array of child changes. Optional.
//

const atomicTypes = new Set(["str", "int", "float", "bool", "Any"]);

export function applyChange(subject, change, subjectClassDef) {
  const path = change["p"] || [];
  const functionName = change["f"];
  const children = change["c"] || [];

  for (const pathElement of path) {
    subjectClassDef = subjectClassDef?.getSubType(pathElement);
    subject = subject[pathElement];
    if (subject === undefined) {
      throw new Error(`assert -- invalid change path: ${path}`);
    }
  }

  if (functionName) {
    const changeFunc = changeFunctions[functionName];
    const args = change["a"] || [];
    let itemCast = subjectClassDef?.itemCast;
    if (
      !subjectClassDef?.subType &&
      args.length &&
      functionName in baseChangeFunctions
    ) {
      // Ensure we cast list/dict with typed elements
      const classDef = subjectClassDef?.getSubType(args[0]);
      if (classDef && !atomicTypes.has(classDef.subType)) {
        itemCast = classDef.cast.bind(classDef);
      }
    }
    changeFunc(subject, itemCast || noopItemCast, ...args);
  }

  for (const subChange of children) {
    applyChange(subject, subChange, subjectClassDef);
  }
}

export function matchChangePath(change, matchPath) {
  return matchChangePattern(change, patternFromPath(matchPath));
}

function patternFromPath(matchPath) {
  const pattern = {};
  let node;
  if (matchPath.length == 1) {
    node = null;
  } else if (matchPath.length > 1) {
    node = patternFromPath(matchPath.slice(1));
  }
  if (node !== undefined) {
    pattern[matchPath[0]] = node;
  }
  return pattern;
}

export const wildcard = "__WILDCARD__"; // A Symbol would be better, but JSON.

export function matchChangePattern(change, matchPattern) {
  //
  // Return `true` or `false`, depending on whether the `change` matches
  // the `matchPattern`.
  //
  // A `matchPattern` is tree in the form of a dict, where keys are change path
  // elements, and values are either nested pattern dicts or `None`, to indicate
  // a leaf node.
  //
  let node = matchPattern;
  for (const pathElement of change.p || []) {
    let childNode = node[pathElement];
    if (childNode === undefined) {
      childNode = node[wildcard];
    }
    if (childNode === undefined) {
      return false;
    }
    if (childNode === null) {
      // leaf node
      return true;
    }
    node = childNode;
  }

  const firstArgument = change.f in baseChangeFunctions ? change.a?.[0] : undefined;
  if (firstArgument !== undefined && node[firstArgument] === null) {
    // Leaf node on first argument
    return true;
  }

  for (const childChange of change.c || []) {
    if (matchChangePattern(childChange, node)) {
      return true;
    }
  }

  return false;
}

export function filterChangePattern(change, matchPattern, inverse) {
  //
  // Return a subset of the `change` according to the `matchPattern`, or `None`
  // if the `change` doesn't match `matchPattern` at all. If there is a match,
  // all parts of the change that do not match are not included in the returned
  // change object.

  // A `matchPattern` is tree in the form of a dict, where keys are change path
  // elements, and values are either nested pattern dicts or `None`, to indicate
  // a leaf node.

  // If `inverse` is True, `matchPattern` is used to exclude the change items
  // that match from the return value.
  //
  let node = matchPattern;
  for (const pathElement of change.p || []) {
    const childNode = node[pathElement];
    if (childNode === undefined) {
      return inverse ? change : null;
    }
    if (childNode === null) {
      // leaf node
      return inverse ? null : change;
    }
    node = childNode;
  }

  const firstArgument = change.f in baseChangeFunctions ? change.a?.[0] : undefined;
  const matchedRootChange = firstArgument !== undefined && node[firstArgument] === null;

  const filteredChildren = [];
  for (let childChange of change.c || []) {
    childChange = filterChangePattern(childChange, node, inverse);
    if (childChange !== null) {
      filteredChildren.push(childChange);
    }
  }

  const result = { ...change, c: filteredChildren };
  if (inverse === matchedRootChange) {
    // inverse  matchedRootChange
    // -------  -------  -------
    // false    false    -> don't include root change in result
    // false    true     -> do include root change in result
    // true     false    -> do include root change in result
    // true     true     -> don't include root change in result
    delete result.f;
    delete result.a;
  }

  return normalizeChange(result);
}

function normalizeChange(change) {
  let result;
  const children = change.c || [];

  if (!("f" in change) && children.length == 1) {
    // Turn only child into root change
    result = { ...children[0] };
    // Prefix child path with original root path
    result["p"] = (change.p || []).concat(result.p || []);
  } else {
    result = { ...change };
  }

  if (result.p !== undefined && !result.p.length) {
    // Remove empty path
    delete result.p;
  }

  if (result.c !== undefined && !result.c.length) {
    // Remove empty children list
    delete result.c;
  }

  if (result.p !== undefined && Object.keys(result).length === 1) {
    // Nothing left but a path: no-op change
    delete result.p;
  }

  if (!hasChange(result)) {
    result = null;
  }

  return result;
}

export function collectChangePaths(change, depth) {
  //
  // Return a sorted list of paths of the specified `depth` that the `change`
  // includes.
  //
  const pathsSet = new Set();
  for (const path of iterateChangePaths(change, depth)) {
    pathsSet.add(JSON.stringify(path));
  }
  const paths = [...pathsSet];
  paths.sort();
  return paths.map((item) => JSON.parse(item));
}

function* iterateChangePaths(change, depth, prefix) {
  if (!prefix) {
    prefix = [];
  }
  const path = prefix.concat(change.p || []);
  if (path.length >= depth) {
    yield path.slice(0, depth);
    return;
  }
  for (const childChange of change.c || []) {
    for (const resultPath of iterateChangePaths(childChange, depth, path)) {
      yield resultPath;
    }
  }
}

function equalPath(p1, p2) {
  if (p1.length !== p2?.length) {
    return false;
  }
  for (let i = 0; i < p1.length; i++) {
    if (p1[i] !== p2[i]) {
      return false;
    }
  }
  return true;
}

function lastItem(array) {
  if (array.length) {
    return array[array.length - 1];
  }
}

export function hasChange(obj) {
  // This assumes a change object that has passed through consolidateChanges,
  // And therefore is a simple empty object {} when the change is a no-op.
  for (const _ in obj) {
    return true;
  }
  return false;
}

function noopItemCast(value) {
  return value;
}
