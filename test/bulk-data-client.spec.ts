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

    it("keeps a line break inside a quoted field, and handles CRLF and a byte-order mark", () => {
      const text = '\uFEFFName,Strength\r\nPegintron,"\r\n120MCG/0.5ML"\r\nOther,"a ""b"", c"\r\n'
      expect(client.parseCSV(text)).toEqual([
        { Name: "Pegintron", Strength: "120MCG/0.5ML" },
        { Name: "Other", Strength: 'a "b", c' },
      ])
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
    routeFetch({ [DOWNLOADS]: page([OCT_2026]), [OCT_2026]: csv(PURPLE_CSV) })
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

const DOWNLOADS = "https://purplebooksearch.fda.gov/downloads"
const BASE = "https://www.accessdata.fda.gov/drugsatfda_docs/PurpleBook"
const OCT_2026 = `${BASE}/2026/purplebook-search-October-data-download.csv`
const SEP_2026 = `${BASE}/2026/purplebook-search-September-data-download.csv`
const JAN_2026 = `${BASE}/2026/purplebook-search-january-data-download.csv`
const DEC_2025 = `${BASE}/2025/purplebook-search-december-data-download.csv`

const HEADER =
  "N/R/U,Applicant,BLA Number,Proprietary Name,Proper Name,License Type,Strength,Dosage Form,Route of Administration,Product Presentation,Marketing Status,Licensure,Approval Date,Inter. Approval Date,Ref. Product Proper Name,Ref. Product Proprietary Name,Date of First Licensure"

// The layout of FDA's monthly file: a title, this month's changes, then the full list
const PURPLE_CSV = [
  "\uFEFFPurple Book Monthly Historical Data Changes Report - October 2026,,,,",
  ",,,,",
  "Newly Approved Products (N)  / Products Added in Current Release (R) / Updated Products (U),,,,",
  HEADER,
  'N,Changed Only,999999,CHANGED,changed-only,351(a),1MG,Injection,Intravenous,Vial,Rx,Licensed,"October 1, 2026",,,,',
  ",,,,",
  HEADER,
  ',AbbVie Inc.,125057,Humira,adalimumab,351(a),"40MG/0.8ML",Injection ,Subcutaneous,Pre-Filled Syringe,Rx,Licensed,"December 31, 2002",,N/A,N/A,',
  ',"Amgen, Inc.",761024,AMJEVITA,adalimumab-atto,351(k) Interchangeable,"40MG/0.8ML",Injection,Subcutaneous,Autoinjector,Rx,Licensed,"September 23, 2016","August 20, 2024",adalimumab,Humira,',
  ',Sandoz Inc.,761071,HYRIMOZ,adalimumab-adaz,351(k) Biosimilar,"\n40MG/0.4ML",Injection,Subcutaneous,Autoinjector,Disc*,Voluntarily Revoked,,,adalimumab,Humira,"October 30, 2018"',
  "",
].join("\r\n")

type Route = { status: number; statusText?: string; text: string }

const page = (links: readonly string[]): Route => ({
  status: 200,
  text: `<html><body>${links.map((l) => `<a href="${l}">CSV</a> <a href="${l.replace(/\.csv$/, ".xlsx")}">Excel</a>`).join("\n")}</body></html>`,
})
const csv = (text: string): Route => ({ status: 200, text })
const missing: Route = { status: 404, statusText: "Not Found", text: "<html>404</html>" }

/** Stub fetch by URL; any URL without a route is a 404 */
function routeFetch(routes: Readonly<Record<string, Route>>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const route = routes[String(input)] ?? missing
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      statusText: route.statusText ?? "",
      text: async () => route.text,
      json: async () => JSON.parse(route.text) as unknown,
    }
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("Purple Book from FDA's monthly CSV", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("reads the full product list, skipping the changes section", async () => {
    routeFetch({ [DOWNLOADS]: page([OCT_2026]), [OCT_2026]: csv(PURPLE_CSV) })
    const entries = (await createBulkDataClient().getPurpleBookData()).orThrow()

    expect(entries.map((e) => e.blaNumber)).toEqual(["125057", "761024", "761071"])
    expect(entries[0]).toMatchObject({
      proprietaryName: "Humira",
      properName: "adalimumab",
      applicant: "AbbVie Inc.",
      blaType: "351(a)",
      strength: "40MG/0.8ML",
      dosageForm: "Injection",
      route: "Subcutaneous",
      productPresentation: "Pre-Filled Syringe",
      status: "Rx",
      licensingStatus: "Licensed",
      biosimilar: false,
      interchangeable: false,
      referenceProductBla: "",
      referenceProductProprietaryName: "",
      approvalDate: "December 31, 2002",
    })
  })

  it("maps the license type to 351(a)/351(k) with the biosimilar and interchangeable flags", async () => {
    routeFetch({ [DOWNLOADS]: page([OCT_2026]), [OCT_2026]: csv(PURPLE_CSV) })
    const [, amjevita, hyrimoz] = (await createBulkDataClient().getPurpleBookData()).orThrow()

    expect(amjevita).toMatchObject({
      applicant: "Amgen, Inc.",
      blaType: "351(k)",
      biosimilar: true,
      interchangeable: true,
      referenceProductBla: "adalimumab",
      referenceProductProprietaryName: "Humira",
    })
    expect(hyrimoz).toMatchObject({
      blaType: "351(k)",
      biosimilar: true,
      interchangeable: false,
      strength: "40MG/0.4ML",
      status: "Disc*",
      licensingStatus: "Voluntarily Revoked",
      approvalDate: "October 30, 2018",
    })
  })

  it("reads the older BLA Type column name", async () => {
    const older = PURPLE_CSV.replaceAll("License Type", "BLA Type")
    routeFetch({ [DOWNLOADS]: page([OCT_2026]), [OCT_2026]: csv(older) })
    const entries = (await createBulkDataClient().getPurpleBookData()).orThrow()
    expect(entries.map((e) => e.blaType)).toEqual(["351(a)", "351(k)", "351(k)"])
  })

  it("picks the newest month listed, whatever the capitalisation and order", async () => {
    const fetchMock = routeFetch({
      [DOWNLOADS]: page([DEC_2025, JAN_2026, OCT_2026, SEP_2026]),
      [OCT_2026]: csv(PURPLE_CSV),
    })
    expect((await createBulkDataClient().getPurpleBookData()).isRight()).toBe(true)
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([DOWNLOADS, OCT_2026])
  })

  it("falls back to the previous month when the newest file is not up yet", async () => {
    const fetchMock = routeFetch({ [DOWNLOADS]: page([SEP_2026, OCT_2026]), [SEP_2026]: csv(PURPLE_CSV) })
    expect((await createBulkDataClient().getPurpleBookData()).isRight()).toBe(true)
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([DOWNLOADS, OCT_2026, SEP_2026])
  })

  it("returns Left when the downloads page fails", async () => {
    routeFetch({ [DOWNLOADS]: { status: 503, statusText: "Service Unavailable", text: "" } })
    expect(leftMessage(await createBulkDataClient().getPurpleBookData())).toBe(
      "Failed to load the Purple Book downloads page: 503 Service Unavailable",
    )
  })

  it("returns Left when the downloads page lists no CSV", async () => {
    routeFetch({ [DOWNLOADS]: page([]) })
    expect(leftMessage(await createBulkDataClient().getPurpleBookData())).toBe(
      "No Purple Book CSV download found at https://purplebooksearch.fda.gov/downloads",
    )
  })

  it("returns Left when neither of the newest files downloads", async () => {
    routeFetch({ [DOWNLOADS]: page([SEP_2026, OCT_2026]) })
    expect(leftMessage(await createBulkDataClient().getPurpleBookData())).toBe(
      `Failed to download ${SEP_2026}: 404 Not Found`,
    )
  })

  it("returns Left when the file has no header row", async () => {
    routeFetch({ [DOWNLOADS]: page([OCT_2026]), [OCT_2026]: csv("Not,the,Purple Book\r\n1,2,3\r\n") })
    expect(leftMessage(await createBulkDataClient().getPurpleBookData())).toBe(
      "Purple Book file has no BLA Number header row",
    )
  })
})
