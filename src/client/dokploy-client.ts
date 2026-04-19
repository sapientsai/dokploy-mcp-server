import type { Option } from "functype"
import { IO, None, Some } from "functype"

import type { ApiError } from "./errors"
import { formatApiError, HttpError, JsonParseError, NetworkError, NotInitialized } from "./errors"

type RequestOptions = {
  method: "GET" | "POST"
  params?: Record<string, string | number | boolean | undefined>
  body?: Record<string, unknown>
}

export class DokployClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "")
    this.apiKey = apiKey
  }

  getIO<T>(path: string, params?: Record<string, string | number | boolean | undefined>): IO<never, ApiError, T> {
    return this.requestIO<T>(path, { method: "GET", params })
  }

  postIO<T>(path: string, body?: Record<string, unknown>): IO<never, ApiError, T> {
    return this.requestIO<T>(path, { method: "POST", body })
  }

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return runOrThrow(this.getIO<T>(path, params))
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return runOrThrow(this.postIO<T>(path, body))
  }

  private requestIO<T>(path: string, options: RequestOptions): IO<never, ApiError, T> {
    const { baseUrl, apiKey } = this
    return IO.tryPromise({
      try: async () => {
        const url = new URL(`/api/${path}`, baseUrl)

        if (options.params) {
          Object.entries(options.params)
            .filter(([, value]) => value !== undefined)
            .forEach(([key, value]) => url.searchParams.set(key, String(value)))
        }

        const headers: Record<string, string> = {
          "x-api-key": apiKey,
          Accept: "application/json",
        }

        const init: RequestInit = { method: options.method, headers }
        if (options.body) {
          headers["Content-Type"] = "application/json"
          init.body = JSON.stringify(options.body)
        }

        // Sentinel throw in the .catch — caught by TaggedError handler below, then mapped to ApiError via outer `catch`.
        const response = await fetch(url.toString(), init).catch((cause: unknown) => {
          // eslint-disable-next-line functype/prefer-either -- tagged sentinel: recovered by outer IO.tryPromise catch.
          throw new TaggedError(NetworkError(options.method, path, cause))
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error")
          // eslint-disable-next-line functype/prefer-either -- see comment above
          throw new TaggedError(HttpError(options.method, path, response.status, response.statusText, errorText))
        }

        const text = await response.text()
        if (!text) {
          return undefined as T
        }

        try {
          return JSON.parse(text) as T
        } catch (cause) {
          throw new TaggedError(JsonParseError(options.method, path, text, cause))
        }
      },
      catch: (e): ApiError => {
        if (e instanceof TaggedError) return e.tag
        return NetworkError(options.method, path, e)
      },
    })
  }
}

/**
 * Internal marker so `catch` in `IO.tryPromise` can recover the originating
 * `ApiError` tag without losing it to a generic Error wrapping.
 */
class TaggedError extends Error {
  constructor(public readonly tag: ApiError) {
    super(formatApiError(tag))
  }
}

/**
 * Boundary adapter: IO<never, ApiError, T> → Promise<T> (throwing on Left).
 * SomaMCP's telemetry pipeline classifies thrown Errors; this is the agreed
 * IO-to-SomaMCP handoff point.
 */
async function runOrThrow<T>(io: IO<never, ApiError, T>): Promise<T> {
  const either = await io.run()
  if (either.isRight()) return either.value
  // eslint-disable-next-line functype/prefer-either -- by design: this is the single IO→Promise boundary.
  throw new Error(formatApiError(either.value))
}

// Module-level singleton state. Wrapped in a const-bound record because this
// file is the ownership boundary for the client/orgId caches; fields are
// reassigned only through `initializeDokployClient` and `getOrganizationId`.
const state: { client: Option<DokployClient>; cachedOrganizationId: Option<string> } = {
  client: None(),
  cachedOrganizationId: None(),
}

export function initializeDokployClient(baseUrl: string, apiKey: string): DokployClient {
  const instance = new DokployClient(baseUrl, apiKey)
  state.client = Some(instance)
  state.cachedOrganizationId = None()
  return instance
}

export function getDokployClient(): DokployClient {
  // Option.orThrow raises when None; uninitialized-singleton is a programmer error, not a recoverable domain failure.
  return state.client.orThrow(new Error(formatApiError(NotInitialized)))
}

export async function getOrganizationId(): Promise<string> {
  const cached = state.cachedOrganizationId
  if (cached.isSome()) return cached.value
  const c = getDokployClient()
  const id = await resolveOrganizationId(c)
  state.cachedOrganizationId = Some(id)
  return id
}

async function resolveOrganizationId(c: DokployClient): Promise<string> {
  const adminEither = await c.getIO<{ organizationId: string }>("admin.one").run()
  if (adminEither.isRight()) return adminEither.value.organizationId

  const projects = await c.get<Array<{ organizationId: string }>>("project.all")
  if (projects.length === 0) {
    // eslint-disable-next-line functype/prefer-either -- bootstrap failure surfaced as plain Error for SomaMCP classification.
    throw new Error("Cannot resolve organizationId: no projects found and admin.one not accessible")
  }
  return projects[0].organizationId
}
