import type { HttpError } from "functype"

export type ValidationError = { _tag: "ValidationError"; message: string }
export const ValidationError = (message: string): ValidationError => ({ _tag: "ValidationError", message })

/**
 * Domain error union for the Dokploy client. Wraps functype's `HttpError`
 * tagged ADT (NetworkError | HttpStatusError | DecodeError) and adds a
 * `ValidationError` variant for synchronous arg-validation failures in
 * tool programs. Recovery and classification happen via `.catchTag(...)`
 * on the IO chain; final rendering to the SomaMCP boundary uses
 * `formatApiError`.
 */
export type ApiError = HttpError | ValidationError

/**
 * Renders any failure reaching the SomaMCP boundary.
 *
 * Takes `unknown`, not `ApiError`, deliberately. The IO error channel is typed
 * `ApiError`, but a defect thrown inside `IO.map` — a TypeError from formatting
 * an unexpected response shape, say — lands in the same Left with no `_tag`.
 * When the signature claimed `ApiError`, the switch fell through and returned
 * `undefined`, so the boundary threw `new Error(undefined)`: an empty message
 * with nothing to diagnose from. Widening the type is what makes the guard
 * below type-check honestly rather than read as dead code.
 */
export function formatApiError(raw: unknown): string {
  if (raw == null || typeof (raw as { _tag?: unknown })._tag !== "string") {
    const detail = raw instanceof Error ? `${raw.name}: ${raw.message}` : String(raw)
    return `Unexpected internal error while handling the Dokploy response: ${detail}`
  }
  const err = raw as ApiError
  switch (err._tag) {
    case "NetworkError":
      return `Network error on ${err.method} ${err.url}: ${
        err.cause instanceof Error ? err.cause.message : String(err.cause)
      }`
    case "HttpStatusError":
      return `Dokploy API error (${err.status} ${err.statusText}) on ${err.method} ${err.url}: ${err.body}`
    case "DecodeError":
      return `Failed to decode response from ${err.method} ${err.url}: ${
        err.cause instanceof Error ? err.cause.message : String(err.cause)
      }`
    case "ValidationError":
      return err.message
  }
}
