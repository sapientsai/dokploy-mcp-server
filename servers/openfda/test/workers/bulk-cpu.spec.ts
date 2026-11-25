// CPU budget for the bulk files inside workerd. Cloudflare stops a Worker that runs out of CPU
// and answers 200 with an empty body, so a slow parse looks like silence, not an error. These
// files are sized like FDA's real ones; on 2.2.0 the Orange Book load took ~10 s here and over
// 30 s of CPU on Cloudflare, because a functype List was built for every field of every row.
import { strToU8, zipSync } from "fflate"
import { Miniflare } from "miniflare"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { bundleWorker } from "./bundle.js"

const rows = (n: number, row: (i: number) => string): string => Array.from({ length: n }, (_, i) => row(i)).join("\n")

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const PRODUCTS = `Ingredient~DF;Route~Trade_Name~Applicant~Strength~Appl_Type~Appl_No~Product_No~TE_Code~Approval_Date~RLD~RS~Type~Applicant_Full_Name\n${rows(
  50_000,
  (i) =>
    `INGREDIENT ${i}~TABLET;ORAL~${i === 7 ? "LIPITOR" : `TRADE ${i}`}~APPLICANT~10MG~N~${String(i).padStart(6, "0")}~001~AB~Apr 12, 2023~No~Yes~RX~APPLICANT FULL NAME ${i}`,
)}`
const PATENTS = `Appl_Type~Appl_No~Product_No~Patent_No~Patent_Expire_Date_Text~Drug_Substance_Flag~Drug_Product_Flag~Patent_Use_Code~Delist_Flag~Submission_Date\n${rows(
  23_000,
  // Dates in scrambled order, so sorting by expiry does real work (equal or sorted dates sort in one pass)
  (i) =>
    `N~${String(i).padStart(6, "0")}~001~${7_000_000 + i}~${MONTH_NAMES[(i * 7) % 12]} ${1 + ((i * 13) % 28)}, ${2026 + ((i * 31) % 20)}~Y~~U-141~~Jan 1, 2020`,
)}`
const EXCLUSIVITY = `Appl_Type~Appl_No~Product_No~Exclusivity_Code~Exclusivity_Date\n${rows(
  2_500,
  (i) => `N~${String(i).padStart(6, "0")}~001~RTO~Jul 13, 2030`,
)}`

const ORANGE_BOOK_ZIP = zipSync({
  "exclusivity.txt": strToU8(EXCLUSIVITY),
  "patent.txt": strToU8(PATENTS),
  "products.txt": strToU8(PRODUCTS),
})

const PURPLE_BOOK_CSV_URL =
  "https://www.accessdata.fda.gov/drugsatfda_docs/PurpleBook/2026/purplebook-search-October-data-download.csv"

// FDA's monthly file: a title block, then the rows under the last "BLA Number" header (~500 KB)
const PURPLE_BOOK_CSV =
  `Purple Book Monthly Historical Data Changes Report,,,\n,,,\n` +
  `N/R/U,Applicant,BLA Number,Proprietary Name,Proper Name,License Type,Strength,Dosage Form,Route of Administration,Product Presentation,Marketing Status,Licensure,Approval Date,Inter. Approval Date,Ref. Product Proper Name,Ref. Product Proprietary Name\n${rows(
    2_500,
    (i) =>
      `U,"Applicant ${i}, Inc.",${761_000 + i},${i === 7 ? "Humira" : `Product ${i}`},adalimumab-${i},351(k) Interchangeable,40MG/0.4ML,Injection,Subcutaneous,"Pre-Filled Syringe, ""Pen"" kit",Rx,Licensed,"August 6, 2024","October 22, 2026",adalimumab,Humira${",".repeat(
        60,
      )}`,
  )}\n`

const upstream = (url: string): Response => {
  if (url.includes("/media/76860/")) return new Response(ORANGE_BOOK_ZIP)
  if (url.endsWith("/downloads")) return new Response(`<a href="${PURPLE_BOOK_CSV_URL}">October 2026</a>`)
  if (url === PURPLE_BOOK_CSV_URL) return new Response(PURPLE_BOOK_CSV)
  return new Response("not found", { status: 404 })
}

let mf: Miniflare

beforeAll(async () => {
  mf = new Miniflare({
    compatibilityDate: "2026-07-01",
    compatibilityFlags: [],
    modules: true,
    outboundService: (request) => upstream(request.url),
    script: await bundleWorker(),
  })
  await mf.ready
}, 120_000)

afterAll(async () => {
  await mf?.dispose()
})

/** Call a tool in a fresh request and time it from outside; time does not move inside a Worker */
const timedCall = async (name: string, args: Record<string, unknown>) => {
  const started = performance.now()
  const response = await mf.dispatchFetch("http://worker/mcp", {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/call", params: { arguments: args, name } }),
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
    method: "POST",
  })
  const text = await response.text()
  const ms = performance.now() - started
  const data = text.split("\n").find((line) => line.startsWith("data: "))
  const reply = JSON.parse(data === undefined ? text : data.slice("data: ".length)) as {
    result?: { content?: Array<{ text: string }> }
  }
  return {
    ms,
    payload: JSON.parse(reply.result?.content?.[0]?.text ?? "{}") as {
      success?: boolean
      data?: unknown
      totalResults?: number
    },
  }
}

describe("bulk file loads in workerd", () => {
  // Budgets sit well above what each call takes on a dev machine and below the old timings: the
  // load ~5x under 2.2.0 (~10 s), the expiry sort ~1.9x under 2.2.1 (~560 ms here). The filtered
  // patent search has the thinnest margin: 45 ms is ~4x its ~11 ms now but only ~1.4x under the
  // ~65 ms it took when each row's filter built Options, so it catches a full regression, not a
  // partial one. It can't be loosened past ~65 ms without letting that regression through, so it
  // takes the fastest of ten calls instead: a slow moment on a shared runner only adds time.
  it("load and search a full-size Orange Book within 2 s", async () => {
    const { ms, payload } = await timedCall("search_fda_orange_book", { drugName: "lipitor", limit: 1 })
    expect(payload.success).toBe(true)
    expect(payload.totalResults).toBe(1)
    expect(JSON.stringify(payload.data)).toContain("LIPITOR")
    expect(ms).toBeLessThan(2_000)
  }, 60_000)

  it("sort every Orange Book patent by expiry within 300 ms, once loaded", async () => {
    await timedCall("search_fda_drug_patent_expiry", { includeExclusivity: false, limit: 1 })
    // Fastest of three, so one slow moment on a shared runner doesn't fail the build
    const calls = [
      await timedCall("search_fda_drug_patent_expiry", { limit: 3 }),
      await timedCall("search_fda_drug_patent_expiry", { limit: 3 }),
      await timedCall("search_fda_drug_patent_expiry", { limit: 3 }),
    ]
    const { payload } = calls[0]!
    expect(payload.success).toBe(true)
    expect(payload.totalResults).toBe(23_000)
    // Every 420th row is dated Jan 1, 2026, the earliest; a stable sort keeps the first three in file order
    expect((payload.data as Array<{ patentNo: string }>).map((e) => e.patentNo)).toEqual([
      "7000000",
      "7000420",
      "7000840",
    ])
    const samples = calls.map((c) => c.ms.toFixed(1)).join(", ")
    expect(Math.min(...calls.map((c) => c.ms)), `fastest of: ${samples} ms`).toBeLessThan(300)
  }, 60_000)

  it("filter a loaded Orange Book's patents by drug name within 45 ms", async () => {
    await timedCall("search_fda_orange_book_patents", { drugName: "lipitor" })
    // Fastest of ten, one after another (~11 ms each). Each call checks every patent's product
    // against the name.
    const calls = await Array.from({ length: 10 }).reduce<Promise<Array<Awaited<ReturnType<typeof timedCall>>>>>(
      async (done, _) => [...(await done), await timedCall("search_fda_orange_book_patents", { drugName: "lipitor" })],
      Promise.resolve([]),
    )
    const { payload } = calls[0]!
    expect(payload.success).toBe(true)
    // Only product 7 is LIPITOR, and only its patent (7000007) shares its application number
    expect(payload.totalResults).toBe(1)
    expect((payload.data as Array<{ patentNo: string }>).map((e) => e.patentNo)).toEqual(["7000007"])
    const samples = calls.map((c) => c.ms.toFixed(1)).join(", ")
    expect(Math.min(...calls.map((c) => c.ms)), `fastest of: ${samples} ms`).toBeLessThan(45)
  }, 60_000)

  it("load and search a full-size Purple Book within 1 s", async () => {
    const { ms, payload } = await timedCall("search_fda_purple_book", { productName: "humira" })
    expect(payload.success).toBe(true)
    // Every fixture row names Humira as its reference product; only one is named Humira
    expect(payload.totalResults).toBe(1)
    expect(JSON.stringify(payload.data)).toContain('"proprietaryName":"Humira"')
    expect(ms).toBeLessThan(1_000)
  }, 60_000)
})
