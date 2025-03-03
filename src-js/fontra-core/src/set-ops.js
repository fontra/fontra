// Copied mostly from
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set

export function isEqualSet(set1, set2) {
  if (set1.size !== set2.size) {
    return false;
  }
  for (let elem of set1) {
    if (!set2.has(elem)) {
      return false;
    }
  }
  return true;
}

export function isSuperset(set, subset) {
  for (let elem of subset) {
    if (!set.has(elem)) {
      return false;
    }
  }
  return true;
}

export function union(setA, setB) {
  let _union = new Set(setA);
  for (let elem of setB) {
    _union.add(elem);
  }
  return _union;
}

export function intersection(setA, setB) {
  let _intersection = new Set();
  for (let elem of setB) {
    if (setA.has(elem)) {
      _intersection.add(elem);
    }
  }
  return _intersection;
}

export function symmetricDifference(setA, setB) {
  let _difference = new Set(setA);
  for (let elem of setB) {
    if (_difference.has(elem)) {
      _difference.delete(elem);
    } else {
      _difference.add(elem);
    }
  }
  return _difference;
}

export function difference(setA, setB) {
  let _difference = new Set(setA);
  for (let elem of setB) {
    _difference.delete(elem);
  }
  return _difference;
}

export function lenientIsEqualSet(set1, set2) {
  if (set1 === set2) {
    // same object, or both undefined
    return true;
  }
  if (set1 && set2 && isEqualSet(set1, set2)) {
    return true;
  }
  return false;
}

export function updateSet(set, iterable) {
  for (const item of iterable) {
    set.add(item);
  }
}

export function filterSet(set, func) {
  return new Set([...set].filter(func));
}

export function setPopFirst(set) {
  if (!set.size) {
    return;
  }
  let firstItem;
  for (firstItem of set) {
    break;
  }
  set.delete(firstItem);
  return firstItem;
}
