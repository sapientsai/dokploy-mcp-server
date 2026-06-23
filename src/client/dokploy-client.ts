import type { HttpError, HttpQueryParams, Option } from "functype"
import { Http, IO, None, Some } from "functype"

type HttpClient = ReturnType<typeof Http.client>

import type { ApiError } from "./errors"
import { ValidationError } from "./errors"

type GetParams = Record<string, string | number | boolean | undefined>

/**
 * Thin facade over functype's `Http.client`. The two-method surface (get/post)
 * preserves the tool-layer call-sites while delegating fetch, query encoding,
 * JSON parsing, and error tagging to functype's HTTP machinery.
 *
 * Empty 2xx bodies (common on `*.update` / `*.remove` endpoints) are recovered
 * from `DecodeError` to `IO.succeed(undefined as T)` — JSON parsing on `""`
 * fails, but the operation itself succeeded.
 */
export class DokployClient {
  private http: HttpClient

  constructor(baseUrl: string, apiKey: string) {
    // Accept both `https://dokploy.example.com` and `https://dokploy.example.com/api`
    // — the trailing `/api` is the segment all Dokploy tRPC routes live under, and
    // users have historically pasted it either way. Normalize so callers can stay
    // sloppy. Trailing slashes are stripped first.
    const trimmed = baseUrl.replace(/\/+$/, "")
    const apiBase = trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`
    this.http = Http.client({
      baseUrl: apiBase,
      defaultHeaders: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
    })
  }

  get<T>(path: string, params?: GetParams): IO<never, HttpError, T> {
    return this.http
      .get<T>(path, params ? { params: toHttpQueryParams(params) } : undefined)
      .map((r) => r.data)
      .catchTag("DecodeError", (e) => (e.body === "" ? IO.succeed(undefined as T) : IO.fail(e)))
  }

  post<T>(path: string, body?: Record<string, unknown>): IO<never, HttpError, T> {
    return this.http
      .post<T>(path, { body })
      .map((r) => r.data)
      .catchTag("DecodeError", (e) => (e.body === "" ? IO.succeed(undefined as T) : IO.fail(e)))
  }
}

function toHttpQueryParams(params: GetParams): HttpQueryParams {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))
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
  return state.client.orThrow(
    new Error("Dokploy client not initialized. Ensure DOKPLOY_URL and DOKPLOY_API_KEY environment variables are set."),
  )
}

/**
 * Resolve the caller's organizationId by trying `admin.one` first (works for
 * admin tokens) and falling back to the first project's `organizationId`
 * (works for tokens scoped to a single org). Returns `ValidationError` only
 * when both paths legitimately produce no organization to attribute to.
 */
export function resolveOrganizationId(c: DokployClient): IO<never, ApiError, string> {
  return c
    .get<{ organizationId: string }>("admin.one")
    .map((r) => r.organizationId)
    .catchAll(() =>
      c
        .get<Array<{ organizationId: string }>>("project.all")
        .flatMap((projects) =>
          projects.length === 0
            ? IO.fail<ApiError>(
                ValidationError("Cannot resolve organizationId: no projects found and admin.one not accessible"),
              )
            : IO.succeed(projects[0].organizationId),
        ),
    )
}

export function getOrganizationId(): IO<never, ApiError, string> {
  const cached = state.cachedOrganizationId
  if (cached.isSome()) return IO.succeed(cached.value)
  return resolveOrganizationId(getDokployClient()).tap((id) => {
    state.cachedOrganizationId = Some(id)
  })
}
