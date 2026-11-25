import { beforeEach, describe, expect, it, vi } from "vitest"

import { BeszelClient, tokenExpiry } from "../src/client/beszel-client"
import { jwt, page, systems } from "./fixtures/hub"

const BASE = "https://beszel.example.com"
const NOW = 1_800_000_000_000

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal("fetch", mockFetch)
})

const reply = (status: number, body: unknown) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
    text: async () => JSON.stringify(body),
  })

const passwordClient = (now = () => NOW) =>
  new BeszelClient({ baseUrl: BASE, auth: { kind: "password", email: "ro@example.com", password: "pw" } }, now)

const calls = () => mockFetch.mock.calls.map(([url, init]) => ({ url: String(url), init: (init ?? {}) as RequestInit }))
const authHeader = (i: number) => (calls()[i]?.init.headers as Record<string, string> | undefined)?.Authorization

const failureOf = async (io: { run: () => Promise<{ fold: (l: (e: Error) => string, r: () => string) => string }> }) =>
  (await io.run()).fold(
    (e) => e.message,
    () => "no failure",
  )

describe("tokenExpiry", () => {
  it("reads exp from a JWT, in milliseconds", () => {
    expect(tokenExpiry(jwt(1_800_000_100)).getOrElse(() => 0)).toBe(1_800_000_100_000)
  })

  it("is empty for something that isn't a JWT", () => {
    expect(tokenExpiry("not-a-token").isNone()).toBe(true)
  })
})

describe("sign-in", () => {
  it("signs in on the first call and sends the token on the records request", async () => {
    const token = jwt(NOW / 1000 + 3600)
    mockFetch
      .mockImplementationOnce(() => reply(200, { token }))
      .mockImplementationOnce(() => reply(200, page(systems)))

    const result = await passwordClient().list("systems").runOrThrow()

    expect(result.items).toHaveLength(2)
    expect(calls()[0]?.url).toBe(`${BASE}/api/collections/users/auth-with-password`)
    expect(JSON.parse(String(calls()[0]?.init.body))).toEqual({ identity: "ro@example.com", password: "pw" })
    expect(authHeader(1)).toBe(token)
  })

  it("reuses the token while it's good", async () => {
    mockFetch
      .mockImplementationOnce(() => reply(200, { token: jwt(NOW / 1000 + 3600) }))
      .mockImplementation(() => reply(200, page([])))
    const client = passwordClient()

    await client.list("systems").runOrThrow()
    await client.list("alerts").runOrThrow()

    expect(calls().filter((c) => c.url.includes("auth-with-password"))).toHaveLength(1)
  })

  it("signs in again a minute before the token lapses", async () => {
    let now = NOW
    mockFetch.mockImplementation((url: string) =>
      url.includes("auth-with-password") ? reply(200, { token: jwt(NOW / 1000 + 120) }) : reply(200, page([])),
    )
    const client = passwordClient(() => now)

    await client.list("systems").runOrThrow()
    now = NOW + 61_000
    await client.list("systems").runOrThrow()

    expect(calls().filter((c) => c.url.includes("auth-with-password"))).toHaveLength(2)
  })

  it("shares one sign-in between calls made at once", async () => {
    mockFetch.mockImplementation((url: string) =>
      url.includes("auth-with-password") ? reply(200, { token: jwt(NOW / 1000 + 3600) }) : reply(200, page([])),
    )
    const client = passwordClient()

    await Promise.all([client.list("systems").runOrThrow(), client.list("alerts").runOrThrow()])

    expect(calls().filter((c) => c.url.includes("auth-with-password"))).toHaveLength(1)
  })

  it("signs in once more and retries when the hub refuses the token", async () => {
    mockFetch
      .mockImplementationOnce(() => reply(200, { token: "first" }))
      .mockImplementationOnce(() => reply(401, { message: "unknown authorization token" }))
      .mockImplementationOnce(() => reply(200, { token: "second" }))
      .mockImplementationOnce(() => reply(200, page(systems)))

    const result = await passwordClient().list("systems").runOrThrow()

    expect(result.items).toHaveLength(2)
    expect(authHeader(3)).toBe("second")
  })

  it("gives up after a second 401", async () => {
    mockFetch.mockImplementation((url: string) =>
      url.includes("auth-with-password") ? reply(200, { token: "t" }) : reply(401, {}),
    )

    expect(await failureOf(passwordClient().list("systems"))).toMatch(/no longer accepts/)
    expect(calls()).toHaveLength(4)
  })

  it.each([
    [400, { message: "Failed to authenticate." }, /wrong email or password/],
    [401, { mfaId: "abc" }, /multi-factor/],
    [
      403,
      { message: "The request doesn't satisfy the collection requirements to authenticate." },
      /doesn.t allow password sign-in/,
    ],
    [429, {}, /rate-limiting/],
  ])("explains a sign-in answered %i", async (status, body, message) => {
    mockFetch.mockImplementationOnce(() => reply(status, body))

    expect(await failureOf(passwordClient().list("systems"))).toMatch(message)
  })

  it("keeps a fresh token that a call running alongside already got", async () => {
    const tokens = ["t1", "t2", "t3"]
    const pendingSecond = { resolve: (_: unknown) => {} }
    let alertsCalls = 0
    mockFetch.mockImplementation((url: string, init: RequestInit) => {
      if (url.includes("auth-with-password")) return reply(200, { token: tokens.shift() })
      const token = (init.headers as Record<string, string>).Authorization
      if (url.includes("/alerts/")) alertsCalls += 1
      if (url.includes("/alerts/") && alertsCalls === 1) {
        // The second call's refusal of t1 arrives only after the first call has signed in again.
        return new Promise((resolve) => {
          pendingSecond.resolve = resolve
        }).then(() => reply(401, {}))
      }
      return token === "t1" ? reply(401, {}) : reply(200, page([]))
    })
    const client = passwordClient()

    const second = client.list("alerts").runOrThrow()
    const first = client.list("systems").runOrThrow()
    await vi.waitFor(() => expect(alertsCalls).toBe(1))
    await first
    pendingSecond.resolve(undefined)
    await second

    expect(calls().filter((c) => c.url.includes("auth-with-password"))).toHaveLength(2)
  })
})

describe("secrets in errors", () => {
  const PASSWORD = "s3cret-password-value"
  const TOKEN = "tok3n-secret-value"
  const secretClient = (kind: "password" | "token") =>
    new BeszelClient(
      {
        baseUrl: BASE,
        auth: kind === "password" ? { kind, email: "ro@example.com", password: PASSWORD } : { kind, token: TOKEN },
      },
      () => NOW,
    )

  it.each([
    ["password", 400, {}],
    ["password", 401, { mfaId: "x" }],
    ["password", 403, { message: "refused" }],
    ["password", 429, {}],
    ["password", 500, { message: "boom" }],
    ["token", 401, {}],
    ["token", 403, {}],
    ["token", 400, { message: "bad filter" }],
  ] as const)("never names the %s on HTTP %i", async (kind, status, body) => {
    mockFetch.mockImplementation(() => reply(status, body))
    const message = await failureOf(secretClient(kind).list("systems"))
    expect(message).not.toContain(PASSWORD)
    expect(message).not.toContain(TOKEN)
  })
})

describe("BESZEL_TOKEN", () => {
  const tokenClient = () => new BeszelClient({ baseUrl: BASE, auth: { kind: "token", token: "minted" } }, () => NOW)

  it("sends the configured token without signing in", async () => {
    mockFetch.mockImplementationOnce(() => reply(200, page(systems)))

    await tokenClient().list("systems").runOrThrow()

    expect(calls()).toHaveLength(1)
    expect(authHeader(0)).toBe("minted")
  })

  it("says to mint a new one on a 401, without retrying", async () => {
    mockFetch.mockImplementation(() => reply(401, {}))

    expect(await failureOf(tokenClient().list("systems"))).toMatch(/no longer accepts/)
    expect(calls()).toHaveLength(1)
  })
})

describe("records requests", () => {
  const tokenClient = () => new BeszelClient({ baseUrl: BASE, auth: { kind: "token", token: "t" } }, () => NOW)

  it("encodes the query", async () => {
    mockFetch.mockImplementationOnce(() => reply(200, page([])))

    await tokenClient().list("systems", { filter: 'name = "a b"', sort: "-created", perPage: 5 }).runOrThrow()

    const url = new URL(calls()[0]?.url ?? "")
    expect(url.pathname).toBe("/api/collections/systems/records")
    expect(url.searchParams.get("filter")).toBe('name = "a b"')
    expect(url.searchParams.get("sort")).toBe("-created")
    expect(url.searchParams.get("perPage")).toBe("5")
  })

  it("reads every page", async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({ id: `r${i}` }))
    mockFetch
      .mockImplementationOnce(() => reply(200, { ...page(full), totalPages: 2 }))
      .mockImplementationOnce(() => reply(200, { ...page([{ id: "last" }]), page: 2, totalPages: 2 }))

    const all = await tokenClient().listAll("system_stats").runOrThrow()

    expect(all).toHaveLength(501)
    expect(new URL(calls()[1]?.url ?? "").searchParams.get("page")).toBe("2")
  })

  it("refuses to return part of a list past the cap", async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({ id: `r${i}` }))
    mockFetch.mockImplementation(() => reply(200, { ...page(full), totalPages: 3 }))

    expect(await failureOf(tokenClient().listAll("containers", {}, 600))).toMatch(/More than 600 containers records/)
  })

  it.each([
    [403, /only superusers list systems/],
    [404, /no systems collection/],
    [429, /rate-limiting/],
    [400, /HTTP 400 for systems: invalid filter/],
  ])("explains HTTP %i", async (status, message) => {
    mockFetch.mockImplementationOnce(() => reply(status, { message: "invalid filter" }))

    expect(await failureOf(tokenClient().list("systems"))).toMatch(message)
  })

  it("names the hub when it can't be reached", async () => {
    mockFetch.mockImplementationOnce(() => Promise.reject(new Error("ECONNREFUSED")))

    expect(await failureOf(tokenClient().list("systems"))).toMatch(
      /Couldn't reach the Beszel hub at https:\/\/beszel.example.com: ECONNREFUSED/,
    )
  })
})
