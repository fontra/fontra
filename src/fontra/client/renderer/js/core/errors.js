export class RemoteError extends Error {
  constructor(message) {
    super(message);
    this.name = "RemoteError";
  }
}

export class VariationError extends Error {
  constructor(message) {
    super(message);
    this.name = "VariationError";
  }
};
