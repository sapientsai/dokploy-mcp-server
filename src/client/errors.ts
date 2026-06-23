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

export function formatApiError(err: ApiError): string {
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
