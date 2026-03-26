export type ApiError = {
  readonly _kind: "ApiError"
  readonly message: string
  readonly status: number
}

export type ConfigError = {
  readonly _kind: "ConfigError"
  readonly message: string
}

export type RateLimitError = {
  readonly _kind: "RateLimitError"
  readonly message: string
  readonly retryAfter?: number
}

export type AppError = ApiError | ConfigError | RateLimitError

export const apiError = (message: string, status: number): ApiError => ({
  _kind: "ApiError",
  message,
  status,
})

export const configError = (message: string): ConfigError => ({
  _kind: "ConfigError",
  message,
})

export const rateLimitError = (message: string, retryAfter?: number): RateLimitError => ({
  _kind: "RateLimitError",
  message,
  retryAfter,
})

export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)))
