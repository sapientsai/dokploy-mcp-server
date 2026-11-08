import { zipSync } from "fflate"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  BulkDataClient,
  bulkDataClient,
  createBulkDataClient,
  parseCSV,
  parseTildeDelimited,
} from "../src/utils/bulk-data-client.js"

describe("BulkDataClient", () => {
  describe("parseTildeDelimited", () => {
    const client = new BulkDataClient()

    it("should parse tilde-delimited text with header row", () => {
      const text = ["Name~Age~City", "Alice~30~Boston", "Bob~25~NYC"].join("\n")

      const result = client.parseTildeDelimited(text)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ Name: "Alice", Age: "30", City: "Boston" })
      expect(result[1]).toEqual({ Name: "Bob", Age: "25", City: "NYC" })
    })

    it("should handle empty input", () => {
      expect(client.parseTildeDelimited("")).toEqual([])
      expect(client.parseTildeDelimited("Header1~Header2")).toEqual([])
    })

    it("should trim whitespace from values", () => {
      const text = "Name~Value\n Alice ~ 42 "
      const result = client.parseTildeDelimited(text)
      expect(result[0]).toEqual({ Name: "Alice", Value: "42" })
    })

    it("should handle missing trailing values", () => {
      const text = "A~B~C\nfoo~bar"
      const result = client.parseTildeDelimited(text)
      expect(result[0]).toEqual({ A: "foo", B: "bar", C: "" })
    })
  })

  describe("parseCSV", () => {
    const client = new BulkDataClient()

    it("should parse simple CSV", () => {
      const text = "Name,Age,City\nAlice,30,Boston\nBob,25,NYC"
      const result = client.parseCSV(text)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ Name: "Alice", Age: "30", City: "Boston" })
    })

    it("should handle quoted fields with commas", () => {
      const text = 'Name,Description\n"Smith, John","A ""quoted"" value"'
      const result = client.parseCSV(text)
      expect(result[0]).toEqual({ Name: "Smith, John", Description: 'A "quoted" value' })
    })

    it("should handle empty input", () => {
      expect(client.parseCSV("")).toEqual([])
    })

    it("should handle empty fields", () => {
      const text = "A,B,C\n,hello,"
      const result = client.parseCSV(text)
      expect(result[0]).toEqual({ A: "", B: "hello", C: "" })
    })
  })
})

type Stub = { status: number; statusText?: string; json?: () => Promise<unknown>; bytes?: Uint8Array }

function stubFetch(stub: Stub | Error): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (stub instanceof Error) throw stub
      return {
        ok: stub.status >= 200 && stub.status < 300,
        status: stub.status,
        statusText: stub.statusText ?? "",
        json: stub.json ?? (async () => ({})),
        arrayBuffer: async () => (stub.bytes ?? new Uint8Array()).buffer,
      }
    }),
  )
}

function leftMessage<T>(result: { fold: <U>(l: (e: Error) => U, r: (v: T) => U) => U }): string {
  return result.fold(
    (error) => error.message,
    () => "expected Left",
  )
}

describe("BulkDataClient fetching", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("parses the Orange Book ZIP and caches it", async () => {
    const text = (s: string): Uint8Array => new TextEncoder().encode(s)
    const zip = zipSync({
      "products.txt": text("Trade_Name~Appl_Type~Appl_No~Product_No\nLIPITOR~N~020702~001"),
      "patent.txt": text("Appl_Type~Appl_No~Product_No~Patent_No\nN~020702~001~5273995"),
      "exclusivity.txt": text("Appl_Type~Appl_No~Product_No~Exclusivity_Code\nN~020702~001~NCE"),
    })
    stubFetch({ status: 200, bytes: zip })
    const client = new BulkDataClient()

    const data = (await client.getOrangeBookData()).orThrow()
    expect(data.products[0]).toMatchObject({ tradeName: "LIPITOR", applNo: "020702", ingredient: "" })
    expect(data.patents[0]?.patentNo).toBe("5273995")
    expect(data.exclusivities[0]?.exclusivityCode).toBe("NCE")

    stubFetch(new Error("should use the cache"))
    expect((await client.getOrangeBookData()).isRight()).toBe(true)
  })

  it("returns Left when the Orange Book download fails", async () => {
    stubFetch({ status: 503, statusText: "Service Unavailable" })
    expect(leftMessage(await new BulkDataClient().getOrangeBookData())).toBe(
      "Failed to download https://www.fda.gov/media/76860/download: 503 Service Unavailable",
    )
  })

  it("returns Left when the Orange Book ZIP is corrupt", async () => {
    stubFetch({ status: 200, bytes: new Uint8Array([1, 2, 3, 4]) })
    expect((await new BulkDataClient().getOrangeBookData()).isLeft()).toBe(true)
  })

  it("returns Left when the Purple Book body is not JSON", async () => {
    stubFetch({
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'")
      },
    })
    expect(leftMessage(await new BulkDataClient().getPurpleBookData())).toBe("Unexpected token '<'")
  })

  it("returns Left when the Purple Book body is not a list of records", async () => {
    for (const body of [null, {}, [null, 5, "x"]]) {
      stubFetch({ status: 200, json: async () => body })
      expect(leftMessage(await new BulkDataClient().getPurpleBookData())).toBe(
        "Unexpected response body from Purple Book API",
      )
    }
  })

  it("maps Purple Book records, keeping numeric ids as text", async () => {
    stubFetch({
      status: 200,
      json: async () => [{ bla_number: 761024, proprietary_name: "AMJEVITA", license_type: "351(k)", strength: null }],
    })
    const [entry] = (await new BulkDataClient().getPurpleBookData()).orThrow()
    expect(entry).toMatchObject({ blaNumber: "761024", proprietaryName: "AMJEVITA", biosimilar: true, strength: "" })
  })
})

describe("createBulkDataClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("gives each client its own cache, and clearCache empties it", async () => {
    const text = (s: string): Uint8Array => new TextEncoder().encode(s)
    stubFetch({ status: 200, bytes: zipSync({ "products.txt": text("Trade_Name\nLIPITOR") }) })
    const first = createBulkDataClient()
    expect((await first.getOrangeBookData()).isRight()).toBe(true)

    stubFetch(new Error("network down"))
    expect((await first.getOrangeBookData()).isRight()).toBe(true)
    expect((await createBulkDataClient().getOrangeBookData()).isLeft()).toBe(true)

    first.clearCache()
    expect((await first.getOrangeBookData()).isLeft()).toBe(true)
  })

  it("does not cache a failure", async () => {
    const client = createBulkDataClient()
    stubFetch({ status: 503, statusText: "Service Unavailable" })
    expect((await client.getPurpleBookData()).isLeft()).toBe(true)
    stubFetch({ status: 200, json: async () => [{ bla_number: "1" }] })
    expect((await client.getPurpleBookData()).isRight()).toBe(true)
  })

  it("exposes the same parsers as module functions", () => {
    expect(parseTildeDelimited("A~B\n1~2")).toEqual(new BulkDataClient().parseTildeDelimited("A~B\n1~2"))
    expect(parseCSV('A,B\n"x, y",2')).toEqual([{ A: "x, y", B: "2" }])
  })
})

describe("bulkDataClient", () => {
  it("is a BulkDataClient instance, as in 2.0.0", () => {
    expect(bulkDataClient).toBeInstanceOf(BulkDataClient)
  })
})
