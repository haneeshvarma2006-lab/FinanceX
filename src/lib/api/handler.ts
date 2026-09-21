import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/bearer';
import { statusFor, type AppError, type Result } from '@/lib/result';
import type { User } from '@/modules/identity/schema';

/**
 * The API's one response shape and one place that authenticates.
 *
 * Every endpoint is a thin transport over a `service.ts` function that already
 * exists and is already tested. Nothing in this layer re-implements a business
 * rule — if a handler ever needs to decide something, that decision belongs in
 * the service where the web client gets it too.
 */

/** Bounded so a malformed or hostile body cannot be read into memory wholesale. */
export const MAX_BODY_BYTES = 128 * 1024;

export type ApiError = {
  error: {
    kind: AppError['kind'];
    message: string;
    field?: string;
    code?: string;
  };
};

export function errorResponse(error: AppError, headers?: HeadersInit): NextResponse<ApiError> {
  return NextResponse.json<ApiError>(
    {
      error: {
        kind: error.kind,
        message: error.message,
        ...(error.field ? { field: error.field } : {}),
        ...(error.code ? { code: error.code } : {}),
      },
    },
    {
      status: statusFor(error.kind),
      headers: {
        // Financial data must never sit in a shared or disk cache.
        'Cache-Control': 'no-store',
        ...(error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : {}),
        ...headers,
      },
    },
  );
}

export function jsonResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * bigint is not JSON-serialisable, and coercing it to a number would silently
 * round money past 2^53. Every monetary value crosses the wire as a decimal
 * string, and the client parses it back into its own exact representation.
 */
export function serialise<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  );
}

type Handler<T> = (context: {
  user: User;
  request: Request;
  params: Record<string, string>;
}) => Promise<Result<T>>;

/**
 * Wrap a handler with authentication, error mapping and serialisation.
 *
 * An unauthenticated request never reaches the handler, so an endpoint cannot
 * forget to check — the same reasoning as the authenticated layout on the web.
 */
export function authenticated<T>(handler: Handler<T>) {
  return async function route(
    request: Request,
    context: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> {
    const auth = await authenticateRequest(request);

    if (!auth) {
      return errorResponse(
        { kind: 'forbidden', message: 'Sign in to continue.' },
        { 'WWW-Authenticate': 'Bearer' },
      );
    }

    const params = await context.params;

    try {
      const result = await handler({ user: auth.user, request, params });
      if (!result.ok) return errorResponse(result.error);
      return jsonResponse(serialise(result.value));
    } catch {
      /**
       * An exception here is a bug, not an expected failure — expected
       * failures are returned as `Result`. The client is told nothing about
       * it: an internal message or stack would be an information leak.
       */
      return errorResponse({
        kind: 'conflict',
        message: 'Something went wrong handling that request.',
        code: 'internal_error',
      });
    }
  };
}

/** Parse and validate a JSON body, with a size bound applied first. */
export async function readBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<Result<z.infer<S>>> {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    return {
      ok: false,
      error: { kind: 'invalid', message: 'That request body is too large.' },
    };
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return {
        ok: false,
        error: { kind: 'invalid', message: 'That request body is too large.' },
      };
    }
    raw = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: { kind: 'invalid', message: 'Expected a JSON body.' } };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: {
        kind: 'invalid',
        message: issue?.message ?? 'That request is not valid.',
        ...(issue?.path[0] ? { field: String(issue.path[0]) } : {}),
      },
    };
  }

  return { ok: true, value: parsed.data };
}
