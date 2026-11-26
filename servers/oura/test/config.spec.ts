import { describe, expect, it } from "vitest"

import { parseConfig } from "../src/config"

const base = { OURA_API_KEY: "test-token" } satisfies NodeJS.ProcessEnv

describe("parseConfig", () => {
  it("fails when OURA_API_KEY is missing", () => {
    const result = parseConfig({})
    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) expect(result.value).toContain("OURA_API_KEY")
  })

  it("fails when OURA_API_KEY is blank", () => {
    expect(parseConfig({ OURA_API_KEY: "   " }).isLeft()).toBe(true)
  })

  it("returns prod defaults with PAT auth for a valid key", () => {
    const result = parseConfig({ ...base })
    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.auth).toEqual({ mode: "pat", apiKey: "test-token" })
      expect(result.value.apiBase).toBe("https://api.ouraring.com/v2/usercollection")
      expect(result.value.sandbox).toBe(false)
      expect(result.value.transportType).toBe("stdio")
      expect(result.value.port).toBe(3000)
      expect(result.value.host).toBe("0.0.0.0")
    }
  })

  const oauthEnv = {
    OURA_CLIENT_ID: "cid",
    OURA_CLIENT_SECRET: "secret",
  } satisfies NodeJS.ProcessEnv

  it("resolves OAuth auth from the client-id/secret pair with sensible defaults", () => {
    const result = parseConfig({ ...oauthEnv, HOME: "/home/u" })
    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.auth).toEqual({
        mode: "oauth",
        clientId: "cid",
        clientSecret: "secret",
        tokenUrl: "https://api.ouraring.com/oauth/token",
        authorizeUrl: "https://cloud.ouraring.com/oauth/authorize",
        redirectUri: "http://localhost:8080/callback",
        scopes: "email personal daily heartrate tag workout session spo2 ring_configuration stress heart_health",
        tokenStorePath: "/home/u/.config/oura-ring-mcp/tokens.json",
      })
    }
  })

  it("prefers OAuth over a PAT when both are configured", () => {
    const result = parseConfig({ ...base, ...oauthEnv, HOME: "/home/u" })
    expect(result.isRight()).toBe(true)
    if (result.isRight()) expect(result.value.auth.mode).toBe("oauth")
  })

  it("honors redirect/scope/store overrides", () => {
    const result = parseConfig({
      ...oauthEnv,
      OURA_TOKEN_STORE: "/tmp/t.json",
      OURA_REDIRECT_URI: "http://localhost:9999/cb",
      OURA_SCOPES: "daily",
    })
    if (result.isRight() && result.value.auth.mode === "oauth") {
      expect(result.value.auth.tokenStorePath).toBe("/tmp/t.json")
      expect(result.value.auth.redirectUri).toBe("http://localhost:9999/cb")
      expect(result.value.auth.scopes).toBe("daily")
    }
    const xdg = parseConfig({ ...oauthEnv, XDG_CONFIG_HOME: "/xdg" })
    if (xdg.isRight() && xdg.value.auth.mode === "oauth") {
      expect(xdg.value.auth.tokenStorePath).toBe("/xdg/oura-ring-mcp/tokens.json")
    }
  })

  it("fails when only one of the OAuth pair is set", () => {
    const result = parseConfig({ OURA_CLIENT_ID: "cid" })
    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) expect(result.value).toContain("OURA_CLIENT_SECRET")
  })

  it("fails with a message naming both auth options when nothing is set", () => {
    const result = parseConfig({})
    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value).toContain("OURA_API_KEY")
      expect(result.value).toContain("OURA_CLIENT_ID")
    }
  })

  it("switches to the sandbox base when OURA_SANDBOX is truthy", () => {
    const result = parseConfig({ ...base, OURA_SANDBOX: "true" })
    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.sandbox).toBe(true)
      expect(result.value.apiBase).toBe("https://api.ouraring.com/v2/sandbox/usercollection")
    }
  })

  it("accepts httpStream with explicit port/host", () => {
    const result = parseConfig({ ...base, TRANSPORT_TYPE: "httpStream", PORT: "8080", HOST: "127.0.0.1" })
    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.transportType).toBe("httpStream")
      expect(result.value.port).toBe(8080)
      expect(result.value.host).toBe("127.0.0.1")
    }
  })

  it("rejects an unknown transport type", () => {
    const result = parseConfig({ ...base, TRANSPORT_TYPE: "grpc" })
    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) expect(result.value).toContain("TRANSPORT_TYPE")
  })

  it.each(["0", "70000", "abc", "-1"])("rejects invalid PORT %s", (port) => {
    const result = parseConfig({ ...base, PORT: port })
    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) expect(result.value).toContain("PORT")
  })
})
