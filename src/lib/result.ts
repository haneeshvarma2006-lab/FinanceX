/**
 * The error contract, shared by every module.
 *
 * Finance and trading each grew their own `ServiceError` and `Result`; two
 * shapes meaning the same thing is how a UI ends up with two ways to render a
 * failure and a bug in one of them. There is one shape here, and modules
 * extend it only by adding a `code`.
 *
 * Three rules this encodes:
 *
 * 1. **A failure is a value, not an exception.** Expected failures — not found,
 *    invalid input, a rule violated — are returned. Exceptions are reserved for
 *    genuine bugs, so a `catch` in a route handler means something is wrong
 *    rather than something is normal.
 * 2. **`not_found` covers unauthorised.** An id belonging to someone else reads
 *    as not found; telling a caller that an id exists but is not theirs is
 *    itself a disclosure.
 * 3. **Every user-facing message lives on the error**, so the UI never invents
 *    copy from an error code and cannot leak an internal one.
 */

export type ErrorKind =
  /** No such entity, or it is not this user's. The two are indistinguishable by design. */
  | 'not_found'
  /** Input failed validation. Carries the field so a form can mark it. */
  | 'invalid'
  /** The input was well-formed but the operation is not allowed in this state. */
  | 'conflict'
  /** Authenticated, but not permitted. Rare: prefer not_found for ownership. */
  | 'forbidden'
  /** Too many attempts. */
  | 'rate_limited';

export type AppError = {
  kind: ErrorKind;
  /** Shown to the user verbatim. Never an internal code or a stack. */
  message: string;
  /** Field name for `invalid`, so a form can attach the message to a control. */
  field?: string;
  /** Machine-readable discriminator for callers that need to branch. */
  code?: string;
  /** Seconds, for `rate_limited`. */
  retryAfterSeconds?: number;
};

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: AppError };
export type Result<T> = Ok<T> | Err;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err(error: AppError): Err {
  return { ok: false, error };
}

export function notFound(message = 'That item no longer exists, or is not yours.'): Err {
  return err({ kind: 'not_found', message });
}

export function invalid(field: string, message: string, code?: string): Err {
  return err({ kind: 'invalid', field, message, ...(code ? { code } : {}) });
}

export function conflict(message: string, code?: string): Err {
  return err({ kind: 'conflict', message, ...(code ? { code } : {}) });
}

export function forbidden(message = 'You do not have access to that.'): Err {
  return err({ kind: 'forbidden', message });
}

export function rateLimited(retryAfterSeconds: number): Err {
  return err({
    kind: 'rate_limited',
    message: 'Too many attempts. Please wait a few minutes and try again.',
    retryAfterSeconds,
  });
}

/** Narrow a Result inside a pipeline without unwrapping it by hand. */
export function isOk<T>(result: Result<T>): result is Ok<T> {
  return result.ok;
}

/**
 * The shape a Server Action returns to a form.
 *
 * `fieldErrors` keys are field names, so a form marks the right control; the
 * top-level `message` is for failures that belong to no single field.
 */
export type FormState = {
  message?: string;
  tone?: 'error' | 'success';
  fieldErrors?: Record<string, string>;
};

/** Translate a Result failure into form state. The single mapping, used everywhere. */
export function toFormState(error: AppError): FormState {
  if (error.kind === 'invalid' && error.field) {
    return { fieldErrors: { [error.field]: error.message } };
  }
  return { message: error.message, tone: 'error' };
}

/** Collect the first Zod issue per field, so one control shows one message. */
export function fieldErrorsFrom(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** HTTP status for an error kind, for route handlers. */
export function statusFor(kind: ErrorKind): number {
  switch (kind) {
    case 'not_found':
      return 404;
    case 'invalid':
      return 422;
    case 'conflict':
      return 409;
    case 'forbidden':
      return 403;
    case 'rate_limited':
      return 429;
  }
}
