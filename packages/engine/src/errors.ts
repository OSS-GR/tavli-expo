/**
 * The one error type the engine throws.
 *
 * Callers can check `error instanceof EngineError` and switch on `code`.
 * The error is not part of the game state, so a class is fine here.
 */

export type EngineErrorCode =
  /** A helper got an argument outside its range (for example point 0). */
  | 'OUT_OF_RANGE'
  /** A text could not be parsed as JSON. */
  | 'INVALID_JSON'
  /** The JSON has a `schemaVersion` this engine cannot read. */
  | 'UNSUPPORTED_SCHEMA_VERSION'
  /** The data does not have the shape of a valid game state. */
  | 'INVALID_STATE'
  /** No variant with this id is in the registry. */
  | 'UNKNOWN_VARIANT'
  /** Two variants in one registry use the same id. */
  | 'DUPLICATE_VARIANT'
  /** A turn is not one of the legal turns for the state. */
  | 'ILLEGAL_TURN';

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  /** Where in the data the problem is, for example `board.points[3].white`. */
  readonly path: string | null;

  constructor(code: EngineErrorCode, message: string, path: string | null = null) {
    super(path === null ? message : `${message} (at ${path})`);
    this.name = 'EngineError';
    this.code = code;
    this.path = path;
  }
}
