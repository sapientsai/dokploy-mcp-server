// CPU budget for the bulk files inside workerd. Cloudflare stops a Worker that runs out of CPU
// and answers 200 with an empty body, so a slow parse looks like silence, not an error. These
// files are sized like FDA's real ones; on 2.2.0 the Orange Book load took ~10 s here and over
// 30 s of CPU on Cloudflare, because a functype List was built for every field of every row.
import { strToU8, zipSync } from "fflate"
import { Miniflare } from "miniflare"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { bundleWorker } from "./bundle.js"

const rows = (n: number, row: (i: number) => string): string => Array.from({ length: n }, (_, i) => row(i)).join("\n")

const PRODUCTS = `Ingredient~DF;Route~Trade_Name~Applicant~Strength~Appl_Type~Appl_No~Product_No~TE_Code~Approval_Date~RLD~RS~Type~Applicant_Full_Name\n${rows(
  50_000,
  (i) =>
    `INGREDIENT ${i}~TABLET;ORAL~${i === 7 ? "LIPITOR" : `TRADE ${i}`}~APPLICANT~10MG~N~${String(i).padStart(6, "0")}~001~AB~Apr 12, 2023~No~Yes~RX~APPLICANT FULL NAME ${i}`,
)}`
const PATENTS = `Appl_Type~Appl_No~Product_No~Patent_No~Patent_Expire_Date_Text~Drug_Substance_Flag~Drug_Product_Flag~Patent_Use_Code~Delist_Flag~Submission_Date\n${rows(
  23_000,
  (i) => `N~${String(i).padStart(6, "0")}~001~${7_000_000 + i}~Aug 24, 2030~Y~~U-141~~Jan 1, 2020`,
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
  return { ms, payload: JSON.parse(reply.result?.content?.[0]?.text ?? "{}") as { success?: boolean; data?: unknown } }
}

describe("bulk file loads in workerd", () => {
  // Budgets are ~8x what the loads take on a dev machine, and well under the 2.2.0 timings.
  it("load and search a full-size Orange Book within 2 s", async () => {
    const { ms, payload } = await timedCall("search_fda_orange_book", { drugName: "lipitor", limit: 1 })
    expect(payload.success).toBe(true)
    expect(JSON.stringify(payload.data)).toContain("LIPITOR")
    expect(ms).toBeLessThan(2_000)
  }, 60_000)

  it("load and search a full-size Purple Book within 1 s", async () => {
    const { ms, payload } = await timedCall("search_fda_purple_book", { productName: "humira" })
    expect(payload.success).toBe(true)
    expect(JSON.stringify(payload.data)).toContain("Humira")
    expect(ms).toBeLessThan(1_000)
  }, 60_000)
})
