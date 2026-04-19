export type ApiError =
  | { _tag: "NetworkError"; method: string; path: string; cause: unknown }
  | { _tag: "HttpError"; method: string; path: string; status: number; statusText: string; body: string }
  | { _tag: "JsonParseError"; method: string; path: string; body: string; cause: unknown }
  | { _tag: "NotInitialized" }

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
