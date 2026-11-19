/**
 * A rule of the domain refused the operation. Services throw these rather
 * than Nest's HTTP exceptions, so the same code serves HTTP requests, gRPC
 * calls, BullMQ jobs and agent tools; each transport turns the `kind` into its
 * own status (`DomainExceptionFilter` for HTTP).
 *
 * Without a message, each error uses the text Nest's matching HTTP exception
 * would, so a response reads the same either way.
 */
export interface DomainErrorI18n {
  key: string;
  args?: Record<string, unknown>;
}

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;

  readonly i18n?: DomainErrorI18n;

  protected constructor(
    message: string,
    options?: { cause?: unknown; i18n?: DomainErrorI18n },
  ) {
    super(message, options);
    this.name = new.target.name;
    this.i18n = options?.i18n;
  }
}

export type DomainErrorKind =
  | 'invalid_input'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict';

/** The request itself is wrong: a bad value, a missing field, a broken rule. HTTP 400. */
export class InvalidInputError extends DomainError {
  readonly kind = 'invalid_input';
  constructor(message = 'Bad Request', options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** The caller could not be identified (a bad or missing token). HTTP 401. */
export class UnauthenticatedError extends DomainError {
  readonly kind = 'unauthenticated';
  constructor(message = 'Unauthorized', options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** The caller is known but may not do this. HTTP 403. */
export class ForbiddenError extends DomainError {
  readonly kind = 'forbidden';
  constructor(message = 'Forbidden', options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** The thing does not exist, or not where the caller may see it. HTTP 404. */
export class NotFoundError extends DomainError {
  readonly kind = 'not_found';
  constructor(message = 'Not Found', options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** The request clashes with the current state (a duplicate, a wrong status). HTTP 409. */
export class ConflictError extends DomainError {
  readonly kind = 'conflict';
  constructor(message = 'Conflict', options?: { cause?: unknown }) {
    super(message, options);
  }
}
