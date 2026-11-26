import { describe, expect, it, vi } from "vitest"

import type { OAuthAuth } from "../src/config"
import { type AuthDeps, createOAuthTokenProvider, createStaticTokenProvider, exchangeAuthCode } from "../src/oura/auth"

const auth: OAuthAuth = {
  mode: "oauth",
  clientId: "cid",
  clientSecret: "secret",
  tokenUrl: "https://api.ouraring.com/oauth/token",
  authorizeUrl: "https://cloud.ouraring.com/oauth/authorize",
  redirectUri: "http://localhost:8080/callback",
  scopes: "daily heartrate personal",
  tokenStorePath: "/tmp/oura-tokens.json",
}

const tokenResponse = (over: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ access_token: "access-1", refresh_token: "refresh-2", expires_in: 3600, ...over }), {
    status: 200,
  })

/** In-memory token store so tests never touch the filesystem. */
const memStore = (initial?: string) => {
  let contents = initial
  return {
    readStore: vi.fn(async () => contents),
    writeStore: vi.fn(async (_path: string, next: string) => {
      contents = next
    }),
    get contents() {
      return contents
    },
  }
}

/** A store seeded with a refresh token that is already past expiry (forces a refresh). */
const expiredStore = (refreshToken = "stored-refresh") =>
  memStore(JSON.stringify({ accessToken: "old", refreshToken, expiresAt: 0 }))

const deps = (over: Partial<AuthDeps> = {}): AuthDeps => ({ now: () => 1_000_000, ...over })

describe("createStaticTokenProvider", () => {
  it("returns the PAT and never fails", async () => {
    const result = await createStaticTokenProvider("pat-123").getToken()
    expect(result.isRight()).toBe(true)
    if (result.isRight()) expect(result.value).toBe("pat-123")
  })
})

describe("createOAuthTokenProvider", () => {
  it("errors telling the user to run login when the token store is empty", async () => {
    const store = memStore()
    const fetchFn = vi.fn()
    const provider = createOAuthTokenProvider(auth, deps({ fetchFn, ...store }))

    const result = await provider.getToken()

    expect(fetchFn).not.toHaveBeenCalled()
    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value.kind).toBe("auth")
      expect(result.value.message).toContain("login")
    }
  })

  it("re-reads the store on a later call when it was empty at startup (post-boot login)", async () => {
    let contents: string | undefined
    const readStore = vi.fn(async () => contents)
    const writeStore = vi.fn(async (_p: string, next: string) => {
      contents = next
    })
    const fetchFn = vi.fn().mockResolvedValue(tokenResponse())
    const provider = createOAuthTokenProvider(auth, deps({ readStore, writeStore, fetchFn }))

    // Server started with no store → first call errors (asks the user to log in).
    const first = await provider.getToken()
    expect(first.isLeft()).toBe(true)

    // `login` runs out of band and writes a valid token store.
    contents = JSON.stringify({ accessToken: "logged-in", refreshToken: "r", expiresAt: 5_000_000 })

    // Next call must pick it up without a restart — and without needing a refresh.
    const second = await provider.getToken()
    expect(second.isRight()).toBe(true)
    if (second.isRight()) expect(second.value).toBe("logged-in")
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("refreshes using the stored refresh token when the access token is expired", async () => {
    const store = expiredStore()
    const fetchFn = vi.fn().mockResolvedValue(tokenResponse())
    const provider = createOAuthTokenProvider(auth, deps({ fetchFn, ...store }))

    const result = await provider.getToken()

    expect(result.isRight()).toBe(true)
    if (result.isRight()) expect(result.value).toBe("access-1")

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe(auth.tokenUrl)
    const body = new URLSearchParams(init.body as string)
    expect(body.get("grant_type")).toBe("refresh_token")
    expect(body.get("refresh_token")).toBe("stored-refresh")
    expect(body.get("client_id")).toBe("cid")
    expect(body.get("client_secret")).toBe("secret")
  })

  it("persists the ROTATED refresh token before returning (single-use safety)", async () => {
    const store = expiredStore()
    const fetchFn = vi.fn().mockResolvedValue(tokenResponse())
    const provider = createOAuthTokenProvider(auth, deps({ fetchFn, ...store }))

    await provider.getToken()

    expect(store.writeStore).toHaveBeenCalledTimes(1)
    const persisted = JSON.parse(store.contents ?? "{}")
    expect(persisted.refreshToken).toBe("refresh-2")
    expect(persisted.accessToken).toBe("access-1")
    expect(persisted.expiresAt).toBe(1_000_000 + 3600 * 1000)
  })

  it("serves a cached access token without refreshing when it is well within expiry", async () => {
    const store = memStore(JSON.stringify({ accessToken: "cached", refreshToken: "r", expiresAt: 5_000_000 }))
    const fetchFn = vi.fn()
    const provider = createOAuthTokenProvider(auth, deps({ fetchFn, ...store }))

    const result = await provider.getToken()

    expect(fetchFn).not.toHaveBeenCalled()
    if (result.isRight()) expect(result.value).toBe("cached")
  })

  it("refreshes when the cached token is within the expiry margin", async () => {
    const store = memStore(JSON.stringify({ accessToken: "cached", refreshToken: "r", expiresAt: 1_000_000 + 30_000 }))
    const fetchFn = vi.fn().mockResolvedValue(tokenResponse())
    const provider = createOAuthTokenProvider(auth, deps({ fetchFn, ...store }))

    await provider.getToken()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("is single-flight: concurrent getToken calls trigger only one refresh", async () => {
    const store = expiredStore()
    const fetchFn = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(tokenResponse()), 5)))
    const provider = createOAuthTokenProvider(auth, deps({ fetchFn, ...store }))

    const [a, b, c] = await Promise.all([provider.getToken(), provider.getToken(), provider.getToken()])

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(a.isRight() && b.isRight() && c.isRight()).toBe(true)
  })

  it("invalidate() forces the next getToken to refresh", async () => {
    const store = memStore(JSON.stringify({ accessToken: "cached", refreshToken: "r", expiresAt: 5_000_000 }))
    const fetchFn = vi.fn().mockResolvedValue(tokenResponse())
    const provider = createOAuthTokenProvider(auth, deps({ fetchFn, ...store }))

    await provider.getToken() // cached, no fetch
    provider.invalidate()
    await provider.getToken() // forced refresh
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("returns an auth error (and does not persist) when the refresh endpoint rejects", async () => {
    const store = expiredStore()
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }))
    const provider = createOAuthTokenProvider(auth, deps({ fetchFn, ...store }))

    const result = await provider.getToken()

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value.kind).toBe("auth")
      expect(result.value.message).toContain("single-use")
    }
    expect(store.writeStore).not.toHaveBeenCalled()
  })
})

describe("exchangeAuthCode", () => {
  it("exchanges an authorization code for a token set with the right grant params", async () => {
    const fetchFn = vi.fn().mockResolvedValue(tokenResponse())

    const result = await exchangeAuthCode(auth, "the-code", auth.redirectUri, { fetchFn, now: () => 1_000_000 })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.accessToken).toBe("access-1")
      expect(result.value.refreshToken).toBe("refresh-2")
      expect(result.value.expiresAt).toBe(1_000_000 + 3600 * 1000)
    }
    const body = new URLSearchParams(fetchFn.mock.calls[0][1].body as string)
    expect(body.get("grant_type")).toBe("authorization_code")
    expect(body.get("code")).toBe("the-code")
    expect(body.get("redirect_uri")).toBe(auth.redirectUri)
    expect(body.get("client_id")).toBe("cid")
    expect(body.get("client_secret")).toBe("secret")
  })

  it("surfaces an exchange failure with a redirect-URI hint", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 400 }))

    const result = await exchangeAuthCode(auth, "bad", auth.redirectUri, { fetchFn })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value.kind).toBe("auth")
      expect(result.value.message).toContain("redirect URI")
    }
  })
})
