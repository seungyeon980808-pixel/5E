export class PackValidationError extends Error {
  constructor(field, reason) {
    super(`Invalid PDF pack ${field}: ${reason}`);
    this.name = "PackValidationError";
    this.field = field;
    this.reason = reason;
  }
}

export class PackNotInstalledError extends Error {
  constructor(packId) {
    super(`PDF pack is not installed: ${packId}`);
    this.name = "PackNotInstalledError";
    this.packId = packId;
  }
}
