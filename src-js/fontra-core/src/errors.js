export class RemoteError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class VariationError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}
