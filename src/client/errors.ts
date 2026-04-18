import type { IO as IOType } from "functype"
import { IO } from "functype"

export type ApiError =
  | { _tag: "NetworkError"; method: string; path: string; cause: unknown }
  | { _tag: "HttpError"; method: string; path: string; status: number; statusText: string; body: string }
  | { _tag: "JsonParseError"; method: string; path: string; body: string; cause: unknown }
  | { _tag: "NotInitialized" }

/**
 * Temporary shim: widens `IO.succeed(v)` (typed `IO<never, never, A>`) into the
 * ApiError-channel shape tool programs compose against (`IO<never, ApiError, A>`).
 *
 * Background: functype's `IO<R, E, A>` is invariant in all three params
 * (confirmed in functype@0.60.0 src/io/IO.ts). The correct root-cause fix is
 * the deferred ZIO-style variance work: mark E and A as `out` (and R as `in`).
 * Once that lands, `never` → `ApiError` widens automatically by subtyping and
 * this helper can be deleted — every call site becomes plain `IO.succeed(v)`.
 *
 * Do NOT promote this into functype as `widenError`/`succeed<A, E = never>`;
 * those are band-aids that add permanent API surface for a problem variance
 * eliminates entirely. See functype CLAUDE.md: "IO<R, E, A> (still invariant;
 * ZIO-style <in R, out E, out A> deferred)".
 */
export function apiSucceed<A>(value: A): IOType<never, ApiError, A> {
  return IO.succeed(value) as unknown as IOType<never, ApiError, A>
}

export const NetworkError = (method: string, path: string, cause: unknown): ApiError => ({
  _tag: "NetworkError",
  method,
  path,
  cause,
})

export const HttpError = (
  method: string,
  path: string,
  status: number,
  statusText: string,
  body: string,
): ApiError => ({
  _tag: "HttpError",
  method,
  path,
  status,
  statusText,
  body,
})

export const JsonParseError = (method: string, path: string, body: string, cause: unknown): ApiError => ({
  _tag: "JsonParseError",
  method,
  path,
  body,
  cause,
})

export const NotInitialized: ApiError = { _tag: "NotInitialized" }

export function formatApiError(err: ApiError): string {
  switch (err._tag) {
    case "NetworkError":
      return `Network error on ${err.method} /${err.path}: ${err.cause instanceof Error ? err.cause.message : String(err.cause)}`
    case "HttpError":
      return `Dokploy API error (${err.status} ${err.statusText}) on ${err.method} /${err.path}: ${err.body}`
    case "JsonParseError":
      return `Failed to parse JSON from ${err.method} /${err.path}: ${err.cause instanceof Error ? err.cause.message : String(err.cause)}`
    case "NotInitialized":
      return "Dokploy client not initialized. Ensure DOKPLOY_URL and DOKPLOY_API_KEY environment variables are set."
  }
}
