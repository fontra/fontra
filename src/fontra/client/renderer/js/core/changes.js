export function consolidateChanges(changes, prefixPath) {
  // TODO: consolidate common path prefix in changes
  let change;
  let path = prefixPath || [];
  if (!Array.isArray(changes)) {
    changes = [changes];
  }
  if (changes.length === 1) {
    change = {...changes[0]};
    path = path.concat(change.p || []);
  } else {
    change = {"c": changes};
  }
  if (path.length) {
    change["p"] = path;
  } else {
    delete change["p"];
  }
  return change;
}


export const baseChangeFunctions = {
  "=": (subject, key, value) => subject[key] = value,
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
// "k": a key or index into the "subject"
//
// "v": "value", a single argument for the change function
// "a": "arguments", an array of arguments for the change function
// If the change has a change function ("f" key), it MUST also have
// a "v" key/value or an "a" key/value, but NOT both
//
// "c": Array of child changes. Optional.
//


export function applyChange(subject, change, changeFunctions) {
  const path = change["p"] || [];
  const functionName = change["f"];
  const children = change["c"] || [];

  for (const pathElement of path) {
    subject = subject[pathElement];
    if (subject === undefined) {
      throw new Error(`assert -- invalid change path: ${path}`);
    }
  }

  if (functionName) {
    const changeFunc = changeFunctions[functionName];
    const arg = change["v"];
    if (arg !== undefined) {
      changeFunc(subject, change["k"], arg);
    } else {
      changeFunc(subject, change["k"], ...change["a"]);
    }
  }

  for (const subChange of children) {
    applyChange(subject, subChange, changeFunctions);
  }
}


export function matchChange(change, matchPath) {
  const path = change["p"] || [];
  const children = change["c"] || [];
  matchPath = Array.from(matchPath);

  for (const pathElement of path) {
    if (pathElement !== matchPath.shift()) {
      return false;
    }
    if (!matchPath.length) {
      return true;
    }
  }

  for (const subChange of children) {
    if (matchChange(subChange, matchPath)) {
      return true;
    }
  }

  return false;
}
