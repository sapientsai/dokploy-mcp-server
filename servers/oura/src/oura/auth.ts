import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

import { Either, Left, Right, tryCatchAsync } from "functype"

import type { AuthConfig, OAuthAuth } from "../config"
import type { OuraError } from "./client"

/** A persisted set of Oura OAuth tokens. `expiresAt` is epoch milliseconds. */
export type TokenSet = {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: number
}

/** Produces a valid bearer token, hiding whether it came from a PAT or a refreshed OAuth token. */
export type TokenProvider = {
  /** A valid bearer token, refreshing if the cached one is missing or within the expiry margin. */
  readonly getToken: () => Promise<Either<OuraError, string>>
  /** Drop the cached access token so the next {@link getToken} forces a refresh (call after a 401). */
  readonly invalidate: () => void
}

export type AuthDeps = {
  readonly fetchFn?: typeof fetch
  /** Injectable clock (epoch ms) so expiry logic is deterministic in tests. */
  readonly now?: () => number
  /** Read the token store; resolve to `undefined` when it does not exist. */
  readonly readStore?: (path: string) => Promise<string | undefined>
  /** Persist the token store. Must create parent dirs and write restrictively (0600). */
  readonly writeStore?: (path: string, contents: string) => Promise<void>
}

/** Refresh a few seconds early so an in-flight request never rides an about-to-expire token. */
const REFRESH_MARGIN_MS = 60_000
/** Oura access tokens are short-lived; assume 24h when the response omits `expires_in`. */
const DEFAULT_EXPIRES_IN_SEC = 86_400

const errMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const safeBody = async (res: Response): Promise<unknown> => {
  try {
    return await res.json()
  } catch {
    try {
      return await res.text()
    } catch {
      return undefined
    }
  }
}

const defaultReadStore = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, "utf8")
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw e
  }
}

const defaultWriteStore = async (path: string, contents: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents, { mode: 0o600 })
}

const parseStore = (raw: string): TokenSet | undefined => {
  try {
    const parsed = JSON.parse(raw) as Partial<TokenSet>
    if (
      typeof parsed.accessToken === "string" &&
      typeof parsed.refreshToken === "string" &&
      typeof parsed.expiresAt === "number"
    ) {
      return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken, expiresAt: parsed.expiresAt }
    }
  } catch {
    // Corrupt store: treat as absent and re-seed from the env refresh token.
  }
  return undefined
}

type OuraTokenResponse = {
  readonly access_token?: unknown
  readonly refresh_token?: unknown
  readonly expires_in?: unknown
}

const httpErrorMessage = (context: "refresh" | "exchange", status: number): string =>
  context === "refresh"
    ? `Oura token refresh failed (HTTP ${status}). The refresh token may be expired or already used ` +
      `(Oura refresh tokens are single-use). Re-run \`oura-ring-mcp-server login\` to re-authorize.`
    : `Oura authorization-code exchange failed (HTTP ${status}). The code may be expired or the ` +
      `redirect URI may not match the one registered for this app.`

/**
 * POST to Oura's token endpoint and parse the response into a {@link TokenSet}. Shared by the
 * refresh-token and authorization-code grants. Oura rotates refresh tokens (each is single-use),
 * so the returned `refreshToken` is always the NEW one and must be persisted.
 */
const postToken = async (
  auth: OAuthAuth,
  grant: Record<string, string>,
  context: "refresh" | "exchange",
  deps: AuthDeps,
): Promise<Either<OuraError, TokenSet>> => {
  const doFetch = deps.fetchFn ?? fetch
  const now = deps.now ?? Date.now

  const body = new URLSearchParams({ ...grant, client_id: auth.clientId, client_secret: auth.clientSecret })

  const fetched = await tryCatchAsync<OuraError, Response>(
    () =>
      doFetch(auth.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body,
      }),
    (e) => ({ kind: "network", message: `Oura token request failed: ${errMessage(e)}` }),
  )
  if (fetched.isLeft()) return Left<OuraError, TokenSet>(fetched.value)

  const res = fetched.value
  if (!res.ok) {
    const detail = await safeBody(res)
    return Left<OuraError, TokenSet>({
      kind: "auth",
      status: res.status,
      message: httpErrorMessage(context, res.status),
      detail,
    })
  }

  const parsed = await tryCatchAsync<OuraError, OuraTokenResponse>(
    () => res.json() as Promise<OuraTokenResponse>,
    (e) => ({ kind: "parse", message: `Failed to parse Oura token response as JSON: ${errMessage(e)}` }),
  )
  if (parsed.isLeft()) return Left<OuraError, TokenSet>(parsed.value)

  const json = parsed.value
  if (typeof json.access_token !== "string" || typeof json.refresh_token !== "string") {
    return Left<OuraError, TokenSet>({
      kind: "auth",
      message: "Oura token response was missing access_token or refresh_token.",
    })
  }
  const expiresInSec = typeof json.expires_in === "number" ? json.expires_in : DEFAULT_EXPIRES_IN_SEC
  return Right<OuraError, TokenSet>({
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: now() + expiresInSec * 1000,
  })
}

const refreshTokens = (auth: OAuthAuth, refreshToken: string, deps: AuthDeps): Promise<Either<OuraError, TokenSet>> =>
  postToken(auth, { grant_type: "refresh_token", refresh_token: refreshToken }, "refresh", deps)

/**
 * Exchange an authorization code (from the `login` browser flow) for the initial {@link TokenSet}.
 * `redirectUri` must exactly match the one used to obtain the code and registered with Oura.
 */
export const exchangeAuthCode = (
  auth: OAuthAuth,
  code: string,
  redirectUri: string,
  deps: AuthDeps = {},
): Promise<Either<OuraError, TokenSet>> =>
  postToken(auth, { grant_type: "authorization_code", code, redirect_uri: redirectUri }, "exchange", deps)

/** Persist a {@link TokenSet} to the store (creates parent dirs, writes 0600). Used by `login`. */
export const writeTokenStore = (path: string, tokens: TokenSet, deps: AuthDeps = {}): Promise<void> =>
  (deps.writeStore ?? defaultWriteStore)(path, JSON.stringify(tokens))

/**
 * OAuth token provider. Loads the token store lazily, refreshes when the access token is missing
 * or near expiry, and persists the rotated refresh token BEFORE returning the access token so a
 * crash can never strand us with a spent refresh token. Refreshes are single-flight: concurrent
 * callers share one in-flight refresh, so the single-use refresh token is never double-spent.
 */
export const createOAuthTokenProvider = (auth: OAuthAuth, deps: AuthDeps = {}): TokenProvider => {
  const now = deps.now ?? Date.now
  const readStore = deps.readStore ?? defaultReadStore
  const writeStore = deps.writeStore ?? defaultWriteStore

  let cached: TokenSet | undefined
  let inflight: Promise<Either<OuraError, string>> | undefined

  // Load the store only while we have no token set in memory. This means a `login` that happens
  // AFTER the server started (store empty at boot) is picked up on the next call — no restart. Once
  // we hold a token set, we keep it and let expiry drive refreshes rather than re-reading each call.
  const ensureLoaded = async (): Promise<void> => {
    if (cached) return
    const raw = await tryCatchAsync<OuraError, string | undefined>(
      () => readStore(auth.tokenStorePath),
      (e) => ({ kind: "auth", message: `Failed to read token store ${auth.tokenStorePath}: ${errMessage(e)}` }),
    )
    // A read failure is non-fatal: leave `cached` unset so doRefresh reports the login prompt.
    if (raw.isRight() && raw.value) cached = parseStore(raw.value)
  }

  const doRefresh = async (): Promise<Either<OuraError, string>> => {
    const refreshToken = cached?.refreshToken
    if (!refreshToken) {
      return Left<OuraError, string>({
        kind: "auth",
        message:
          `No stored Oura tokens at ${auth.tokenStorePath}. Run \`oura-ring-mcp-server login\` once ` +
          `to authorize and create the token store.`,
      })
    }
    const refreshed = await refreshTokens(auth, refreshToken, deps)
    if (refreshed.isLeft()) return Left<OuraError, string>(refreshed.value)

    const tokens = refreshed.value
    const persisted = await tryCatchAsync<OuraError, void>(
      () => writeStore(auth.tokenStorePath, JSON.stringify(tokens)),
      (e) => ({ kind: "auth", message: `Failed to persist token store ${auth.tokenStorePath}: ${errMessage(e)}` }),
    )
    if (persisted.isLeft()) return Left<OuraError, string>(persisted.value)

    cached = tokens
    return Right<OuraError, string>(tokens.accessToken)
  }

  const run = async (): Promise<Either<OuraError, string>> => {
    await ensureLoaded()
    if (cached && cached.expiresAt - now() > REFRESH_MARGIN_MS) {
      return Right<OuraError, string>(cached.accessToken)
    }
    return doRefresh()
  }

  const getToken = (): Promise<Either<OuraError, string>> => {
    if (inflight) return inflight
    inflight = run().finally(() => {
      inflight = undefined
    })
    return inflight
  }

  const invalidate = (): void => {
    if (cached) cached = { ...cached, expiresAt: 0 }
  }

  return { getToken, invalidate }
}

/** Static provider for a personal access token: always returns the key, never refreshes. */
export const createStaticTokenProvider = (apiKey: string): TokenProvider => ({
  getToken: () => Promise.resolve(Right<OuraError, string>(apiKey)),
  invalidate: () => {},
})

/** Build the right {@link TokenProvider} for the resolved {@link AuthConfig}. */
export const createTokenProvider = (auth: AuthConfig, deps: AuthDeps = {}): TokenProvider =>
  auth.mode === "pat" ? createStaticTokenProvider(auth.apiKey) : createOAuthTokenProvider(auth, deps)
