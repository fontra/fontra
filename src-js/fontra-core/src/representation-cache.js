//
// A general Cached Representation mechanism
//

export function registerRepresentationFactory(classObject, representationKey, func) {
  let factories = classObject._representationFactories;
  if (!factories) {
    factories = {};
    classObject._representationFactories = factories;
  }
  factories[representationKey] = func;
}

export function getRepresentation(obj, representationKey, argument) {
  let cacheKey = representationKey;
  if (argument !== undefined) {
    cacheKey = `${cacheKey}.${JSON.stringify(argument)}`;
  }
  let representation = obj._representationCache?.[cacheKey];
  if (representation === undefined) {
    if (!obj._representationCache) {
      obj._representationCache = {};
    }
    const classObject = obj.constructor;
    const factory = classObject._representationFactories[representationKey];
    if (!factory) {
      throw new Error(`Can't find representation factory for '${representationKey}'`);
    }
    representation = factory(obj, argument);
    obj._representationCache[cacheKey] = representation;
  }
  return representation;
}

export function clearRepresentationCache(obj) {
  obj._representationCache = {};
}
