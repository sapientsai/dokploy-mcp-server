import { afterEach, describe, expect, it, vi } from "vitest"

import { FDAAPIClient } from "../src/utils/api-client.js"

type StubResponse = { status: number; statusText?: string; body?: unknown }

function stubFetch(response: StubResponse | Error): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response
    const { status, statusText = "", body } = response
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      json: async () => {
        if (body === undefined) throw new SyntaxError("Unexpected end of JSON input")
        return body
      },
    }
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function errorMessage(result: Awaited<ReturnType<FDAAPIClient["searchDrugNDC"]>>): string {
  return result.fold(
    (error) => error.message,
    () => "expected Left",
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("FDAAPIClient", () => {
  it("returns Right with the parsed body on 200", async () => {
    stubFetch({ status: 200, body: { meta: { results: { total: 1 } }, results: [{ product_ndc: "1" }] } })
    const result = await new FDAAPIClient().searchDrugNDC({ limit: 1 })
    expect(result.isRight()).toBe(true)
    expect(result.orThrow().results).toEqual([{ product_ndc: "1" }])
  })

  it("treats 404 as no results, not an error", async () => {
    stubFetch({ status: 404, statusText: "Not Found", body: { error: { message: "No matches found!" } } })
    const result = await new FDAAPIClient().searchDrugNDC({})
    expect(result.orThrow()).toEqual({ results: [] })
  })

  it("maps 429 to a rate limit error", async () => {
    stubFetch({ status: 429, statusText: "Too Many Requests", body: {} })
    expect(errorMessage(await new FDAAPIClient().searchDrugNDC({}))).toBe(
      "Rate limit exceeded. Consider using an API key for higher limits.",
    )
  })

  it("maps 400 to the API's error message", async () => {
    stubFetch({ status: 400, statusText: "Bad Request", body: { error: { message: "Invalid search syntax" } } })
    expect(errorMessage(await new FDAAPIClient().searchDrugNDC({}))).toBe("Invalid request: Invalid search syntax")
  })

  it("maps 400 without a readable body to a fallback message", async () => {
    stubFetch({ status: 400, statusText: "Bad Request" })
    expect(errorMessage(await new FDAAPIClient().searchDrugNDC({}))).toBe("Invalid request: Bad request parameters")
  })

  it("maps other statuses to a generic API error", async () => {
    stubFetch({ status: 500, statusText: "Internal Server Error", body: {} })
    expect(errorMessage(await new FDAAPIClient().searchDrugNDC({}))).toBe("FDA API error: 500 Internal Server Error")
  })

  it("returns Left when the network call fails", async () => {
    stubFetch(new TypeError("fetch failed"))
    expect(errorMessage(await new FDAAPIClient().searchDrugNDC({}))).toBe("fetch failed")
  })

  it("returns Left when a 200 body is not JSON", async () => {
    stubFetch({ status: 200 })
    expect(errorMessage(await new FDAAPIClient().searchDrugNDC({}))).toBe("Unexpected end of JSON input")
  })

  it("sends the API key when one is set", async () => {
    vi.stubEnv("OPENFDA_API_KEY", "secret-key")
    const fetchMock = stubFetch({ status: 200, body: { results: [] } })
    const client = new FDAAPIClient()
    await client.searchDrugNDC({})
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("api_key=secret-key")
    expect(client.getRateLimitInfo().authenticated).toBe(true)
  })

  it("treats an empty API key as no key", async () => {
    vi.stubEnv("OPENFDA_API_KEY", "")
    const fetchMock = stubFetch({ status: 200, body: { results: [] } })
    const client = new FDAAPIClient()
    await client.searchDrugNDC({})
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("api_key")
    expect(client.getRateLimitInfo()).toEqual({ authenticated: false, rateLimit: "40/minute, 1,000/hour" })
  })
})
