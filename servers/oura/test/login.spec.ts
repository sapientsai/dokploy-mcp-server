import { describe, expect, it } from "vitest"

import type { OAuthAuth } from "../src/config"
import { buildAuthorizeUrl } from "../src/login"

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

describe("buildAuthorizeUrl", () => {
  it("builds an authorization-code URL with client, redirect, scope and state", () => {
    const url = new URL(buildAuthorizeUrl(auth, "state-123"))
    expect(url.origin + url.pathname).toBe("https://cloud.ouraring.com/oauth/authorize")
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("client_id")).toBe("cid")
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:8080/callback")
    expect(url.searchParams.get("scope")).toBe("daily heartrate personal")
    expect(url.searchParams.get("state")).toBe("state-123")
  })
})
