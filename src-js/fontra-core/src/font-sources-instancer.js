import { DiscreteVariationModel } from "./discrete-variation-model.js";
import { LRUCache } from "./lru-cache.js";
import {
  areCustomDatasCompatible,
  areGuidelinesCompatible,
  normalizeGuidelines,
} from "./utils.js";
import { locationToString, mapAxesFromUserSpaceToSourceSpace } from "./var-model.js";

export class FontSourcesInstancer {
  constructor(fontAxes, fontSources) {
    this.fontAxes = fontAxes;
    this.fontSources = fontSources;
    this._setup();
  }

  _setup() {
    this._fontSourcesList = Object.values(this.fontSources).filter(
      (source) => !source.isSparse
    );
    this.fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(this.fontAxes);
    this.defaultSourceLocation = Object.fromEntries(
      this.fontAxesSourceSpace.map((axis) => [axis.name, axis.defaultValue])
    );
    this._sourceIdsByLocationString = Object.fromEntries(
      Object.entries(this.fontSources).map(([sourceIdentifier, source]) => [
        locationToString({ ...this.defaultSourceLocation, ...source.location }),
        sourceIdentifier,
      ])
    );
    this.defaultSourceIdentifier =
      this._sourceIdsByLocationString[locationToString(this.defaultSourceLocation)];

    this._instanceCache = new LRUCache(50);
  }

  getLocationIdentifierForLocation(location) {
    location = { ...this.defaultSourceLocation, ...location };
    return this._sourceIdsByLocationString[locationToString(location)];
  }

  get model() {
    if (!this._model) {
      const locations = this._fontSourcesList.map((source) => source.location);
      this._model = new DiscreteVariationModel(locations, this.fontAxesSourceSpace);
    }
    return this._model;
  }

  get deltas() {
    const guidelinesAreCompatible = areGuidelinesCompatible(this._fontSourcesList);
    const customDatasAreCompatible = areCustomDatasCompatible(this._fontSourcesList);

    const fixedSourceValues = this._fontSourcesList.map((source) => {
      return {
        ...source,
        location: null,
        name: null,
        guidelines: guidelinesAreCompatible
          ? normalizeGuidelines(source.guidelines, true)
          : [],
        customData: customDatasAreCompatible ? source.customData : {},
      };
    });
    return this.model.getDeltas(fixedSourceValues);
  }

  instantiate(sourceLocation) {
    if (!this._fontSourcesList.length) {
      return undefined;
    }
    sourceLocation = { ...this.defaultSourceLocation, ...sourceLocation };
    const locationString = locationToString(sourceLocation);

    const sourceIdentifier = this._sourceIdsByLocationString[locationString];
    let sourceInstance = sourceIdentifier
      ? this.fontSources[sourceIdentifier]
      : undefined;

    if (sourceInstance && !sourceInstance.isSparse) {
      return sourceInstance;
    }

    sourceInstance = this._instanceCache.get(locationString);

    if (!sourceInstance) {
      const deltas = this.deltas;
      const { instance, errors } = this.model.interpolateFromDeltas(
        sourceLocation,
        deltas
      );
      if (errors?.length) {
        console.log("error while interpolating font sources", errors);
      }
      sourceInstance = instance;
      this._instanceCache.put(locationString, sourceInstance);
    }

    return sourceInstance;
  }
}
