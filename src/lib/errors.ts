export class FirmwareError extends Error {
  constructor(message: string, public status = 400, public log = "") { super(message); }
}
