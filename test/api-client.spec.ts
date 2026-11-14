import { afterEach, describe, expect, it, vi } from "vitest"

import { createFDAAPIClient, FDAAPIClient, fdaAPIClient } from "../src/utils/api-client.js"
import { loggers } from "../src/utils/logger.js"

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
  vi.restoreAllMocks()
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

  it("returns Left when a 200 body is JSON but not an object", async () => {
    stubFetch({ status: 200, body: null })
    expect(errorMessage(await new FDAAPIClient().searchDrugNDC({}))).toBe("Unexpected response body from FDA API")
  })

  it("logs the request URL unchanged when no API key is set", async () => {
    vi.stubEnv("OPENFDA_API_KEY", "")
    stubFetch({ status: 200, body: { results: [] } })
    const logged = vi.spyOn(loggers, "api").mockImplementation(() => undefined)
    await new FDAAPIClient().searchDrugNDC({ limit: 1 })
    expect(logged.mock.calls[0]?.[0]).toBe("Request: https://api.fda.gov/drug/ndc.json?limit=1")
  })

  it("redacts the API key in the logged URL", async () => {
    vi.stubEnv("OPENFDA_API_KEY", "secret-key")
    stubFetch({ status: 200, body: { results: [] } })
    const logged = vi.spyOn(loggers, "api").mockImplementation(() => undefined)
    await new FDAAPIClient().searchDrugNDC({ limit: 1 })
    expect(logged.mock.calls[0]?.[0]).toBe("Request: https://api.fda.gov/drug/ndc.json?limit=1&api_key=%5BREDACTED%5D")
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
    expect(client.getRateLimitInfo()).toEqual({
      authenticated: false,
      rateLimit: "240/minute and 1,000/day, per IP address",
    })
  })
})

describe("createFDAAPIClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("reads the API key when the client is created", () => {
    vi.stubEnv("OPENFDA_API_KEY", "first")
    const withKey = createFDAAPIClient()
    vi.stubEnv("OPENFDA_API_KEY", "")
    const withoutKey = createFDAAPIClient()
    expect(withKey.getRateLimitInfo().authenticated).toBe(true)
    expect(withoutKey.getRateLimitInfo().authenticated).toBe(false)
  })

  it("behaves like the FDAAPIClient class", async () => {
    stubFetch({ status: 429, body: {} })
    expect(errorMessage(await createFDAAPIClient().searchDrugNDC({}))).toBe(
      errorMessage(await new FDAAPIClient().searchDrugNDC({})),
    )
  })
})

describe("fdaAPIClient", () => {
  it("is an FDAAPIClient instance, as in 2.0.0", () => {
    expect(fdaAPIClient).toBeInstanceOf(FDAAPIClient)
  })
})

describe("request URL encoding", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("sends spaces in the search as +, so openFDA reads AND and TO as operators", async () => {
    vi.stubEnv("OPENFDA_API_KEY", "")
    const fetchMock = stubFetch({ status: 200, body: { results: [] } })
    await createFDAAPIClient().searchDrugAdverseEvents({
      search: 'patient.drug.medicinalproduct:"aspirin" AND receivedate:[20240101 TO *]',
      limit: 1,
    })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toBe(
      "https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct%3A%22aspirin%22+AND+receivedate%3A%5B20240101+TO+*%5D&limit=1",
    )
    expect(url).not.toContain("%2B")
  })
})

describe("createFDAAPIClient with an explicit key", () => {
  it("sends the key it is given, whatever OPENFDA_API_KEY holds", async () => {
    vi.stubEnv("OPENFDA_API_KEY", "from-env")
    const fetchMock = stubFetch({ status: 200, body: { results: [] } })
    await createFDAAPIClient({ apiKey: "callers-key" }).searchDrugNDC({})
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("api_key=callers-key")
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("from-env")
  })

  it("sends no key when given none, even with OPENFDA_API_KEY set", async () => {
    vi.stubEnv("OPENFDA_API_KEY", "from-env")
    const fetchMock = stubFetch({ status: 200, body: { results: [] } })
    const client = createFDAAPIClient({ apiKey: undefined })
    await client.searchDrugNDC({})
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("api_key")
    expect(client.getRateLimitInfo().authenticated).toBe(false)
  })

  it("reports openFDA's published limits for a key", () => {
    expect(createFDAAPIClient({ apiKey: "k" }).getRateLimitInfo()).toEqual({
      authenticated: true,
      rateLimit: "240/minute and 120,000/day, per key",
    })
  })
})

describe("logging a request", () => {
  it("never logs a key whose characters URL encoding changes", async () => {
    stubFetch({ status: 200, body: { results: [] } })
    const logged = vi.spyOn(loggers, "api").mockImplementation(() => undefined)
    await createFDAAPIClient({ apiKey: "ab+c/d=e" }).searchDrugNDC({ limit: 1 })
    const line = String(logged.mock.calls[0]?.[0])
    expect(line).toContain("api_key=%5BREDACTED%5D")
    expect(line).not.toContain("ab%2Bc")
    expect(line).not.toContain("ab+c")
  })
})
