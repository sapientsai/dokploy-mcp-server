/**
 * Helper types for extracting request body and query parameter types
 * from the generated OpenAPI types.
 *
 * Usage:
 *   import type { RequestBody, QueryParams } from "./generated/helpers"
 *
 *   type AppUpdate = RequestBody<"application-update">
 *   type AppOneParams = QueryParams<"application-one">
 */

import type { operations } from "./dokploy-api"

/** Extract the JSON request body type for an operation */
export type RequestBody<T extends keyof operations> = operations[T] extends {
  requestBody: { content: { "application/json": infer B } }
}
  ? B
  : never

/** Extract the query parameters for an operation */
export type QueryParams<T extends keyof operations> = operations[T] extends { parameters: { query: infer Q } }
  ? Q
  : never
