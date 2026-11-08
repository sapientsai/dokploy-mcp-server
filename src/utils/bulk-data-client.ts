/**
 * Bulk Data Client
 * Downloads and parses FDA Orange Book and Purple Book data files
 */

import { unzipSync } from "fflate"
import { type Either, Left, List, Map, None, Option, Ref, Right, Some, Try } from "functype"

import type { OrangeBookExclusivity, OrangeBookPatent, OrangeBookProduct, PurpleBookEntry } from "../types/fda.js"
import { toError } from "./errors.js"
import { textField } from "./fields.js"
import { loggers } from "./logger.js"

const ORANGE_BOOK_ZIP_URL = "https://www.fda.gov/media/76860/download"
/** Lists FDA's monthly Purple Book CSV files; the old JSON API (api/v1/fdaproducts) is gone */
const PURPLE_BOOK_DOWNLOADS_URL = "https://purplebooksearch.fda.gov/downloads"
const PURPLE_BOOK_CSV_LINK =
  /https:\/\/www\.accessdata\.fda\.gov\/drugsatfda_docs\/PurpleBook\/(\d{4})\/purplebook-search-([A-Za-z]+)-data-download\.csv/g
/** How many of the newest monthly files to try: a month can be listed before its file is up */
const PURPLE_BOOK_CANDIDATES = 2

const ORANGE_BOOK_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const PURPLE_BOOK_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

type CacheEntry<T> = {
  data: T
  fetchedAt: number
  ttlMs: number
}

export type OrangeBookData = {
  products: OrangeBookProduct[]
  patents: OrangeBookPatent[]
  exclusivities: OrangeBookExclusivity[]
}

/** A parsed row: column name to cell text */
export type Row = Readonly<Record<string, string>>

/** The cached data, if it has not expired */
function fresh<T>(cache: Option<CacheEntry<T>>): Option<T> {
  return cache.filter((entry) => Date.now() - entry.fetchedAt < entry.ttlMs).map((entry) => entry.data)
}

function cacheEntry<T>(data: T, ttlMs: number): Option<CacheEntry<T>> {
  return Some({ data, fetchedAt: Date.now(), ttlMs })
}

/** Fetch a URL, turning a network failure or a non-OK status into Left */
async function fetchOk(url: string, describeFailure: (response: Response) => string): Promise<Either<Error, Response>> {
  const fetched = (await Try.fromPromise(fetch(url))).toEither(toError)
  return fetched.flatMap((response) => (response.ok ? Right(response) : Left(new Error(describeFailure(response)))))
}

function toOrangeBookProduct(r: Row): OrangeBookProduct {
  return {
    ingredient: textField(r, "Ingredient", "ingredient"),
    dfRoute: textField(r, "DF;Route", "df;route", "DF_Route"),
    tradeName: textField(r, "Trade_Name", "trade_name"),
    applicant: textField(r, "Applicant", "applicant"),
    applType: textField(r, "Appl_Type", "appl_type"),
    applNo: textField(r, "Appl_No", "appl_no"),
    productNo: textField(r, "Product_No", "product_no"),
    teCode: textField(r, "TE_Code", "te_code"),
    approvalDate: textField(r, "Approval_Date", "approval_date"),
    rld: textField(r, "RLD", "rld"),
    rs: textField(r, "RS", "rs"),
    type: textField(r, "Type", "type"),
    applicantFullName: textField(r, "Applicant_Full_Name", "applicant_full_name"),
  }
}

function toOrangeBookPatent(r: Row): OrangeBookPatent {
  return {
    applType: textField(r, "Appl_Type", "appl_type"),
    applNo: textField(r, "Appl_No", "appl_no"),
    productNo: textField(r, "Product_No", "product_no"),
    patentNo: textField(r, "Patent_No", "patent_no"),
    patentExpireDate: textField(r, "Patent_Expire_Date_Text", "patent_expire_date_text"),
    drugSubstanceFlag: textField(r, "Drug_Substance_Flag", "drug_substance_flag"),
    drugProductFlag: textField(r, "Drug_Product_Flag", "drug_product_flag"),
    patentUseCode: textField(r, "Patent_Use_Code", "patent_use_code"),
    delistFlag: textField(r, "Delist_Flag", "delist_flag"),
    submissionDate: textField(r, "Submission_Date", "submission_date"),
  }
}

function toOrangeBookExclusivity(r: Row): OrangeBookExclusivity {
  return {
    applType: textField(r, "Appl_Type", "appl_type"),
    applNo: textField(r, "Appl_No", "appl_no"),
    productNo: textField(r, "Product_No", "product_no"),
    exclusivityCode: textField(r, "Exclusivity_Code", "exclusivity_code"),
    exclusivityDate: textField(r, "Exclusivity_Date", "exclusivity_date"),
  }
}

/** A Purple Book cell: the first of the keys with a value, trimmed; "N/A" counts as empty */
function cell(r: Row, ...keys: readonly string[]): string {
  return List(keys)
    .map((key) => textField(r, key).trim())
    .map((value) => (value.toUpperCase() === "N/A" ? "" : value))
    .find((value) => value !== "")
    .orElse("")
}

function toPurpleBookEntry(r: Row): PurpleBookEntry {
  // "351(a)", "351(k) Biosimilar" or "351(k) Interchangeable"; older files call the column "BLA Type"
  const licenseType = cell(r, "License Type", "BLA Type")
  const blaType = Option(/^351\([ak]\)/.exec(licenseType))
    .map(([base]) => base)
    .orElse(licenseType)
  return {
    blaNumber: cell(r, "BLA Number"),
    proprietaryName: cell(r, "Proprietary Name"),
    properName: cell(r, "Proper Name"),
    applicant: cell(r, "Applicant"),
    blaType,
    strength: cell(r, "Strength"),
    dosageForm: cell(r, "Dosage Form"),
    route: cell(r, "Route of Administration"),
    productPresentation: cell(r, "Product Presentation"),
    status: cell(r, "Marketing Status"),
    licensingStatus: cell(r, "Licensure"),
    referenceProductBla: cell(r, "Ref. Product Proper Name"),
    referenceProductProprietaryName: cell(r, "Ref. Product Proprietary Name"),
    biosimilar: blaType === "351(k)",
    interchangeable: /interchangeable/i.test(licenseType) || cell(r, "Inter. Approval Date") !== "",
    approvalDate: cell(r, "Approval Date", "Date of First Licensure"),
  }
}

/** Split delimited text into rows keyed by the header line; [] without a header and one row */
function parseRows(text: string, splitLine: (line: string) => string[]): Row[] {
  const lines = List(text.split("\n")).filter((line) => line.trim() !== "")
  return lines.headOption
    .filter(() => lines.size >= 2)
    .fold(
      (): Row[] => [],
      (headerLine) => {
        const headers = splitLine(headerLine).map((h) => h.trim())
        return lines
          .drop(1)
          .map((line): Row => {
            const values = splitLine(line)
            return Object.fromEntries(headers.map((h, j) => [h, Option(values[j]).orElse("").trim()]))
          })
          .toArray()
      },
    )
}

type CsvState = {
  readonly records: readonly (readonly string[])[]
  readonly fields: readonly string[]
  readonly field: string
  readonly inQuotes: boolean
  /** Inside quotes, the last character was a quote: either the closing quote or half of "" */
  readonly quoteSeen: boolean
}

function csvStep(state: CsvState, char: string): CsvState {
  if (state.inQuotes && state.quoteSeen) {
    if (char === '"') return { ...state, field: `${state.field}"`, quoteSeen: false } // "" is a literal quote
    return csvStep({ ...state, inQuotes: false, quoteSeen: false }, char) // the quote closed the field
  }
  if (state.inQuotes) {
    if (char === '"') return { ...state, quoteSeen: true }
    return { ...state, field: state.field + char } // includes line breaks
  }
  if (char === '"') return { ...state, inQuotes: true }
  if (char === ",") return { ...state, fields: [...state.fields, state.field], field: "" }
  if (char === "\r") return state
  if (char === "\n")
    return { ...state, records: [...state.records, [...state.fields, state.field]], fields: [], field: "" }
  return { ...state, field: state.field + char }
}

/**
 * Split CSV text into records of raw cells. A quoted field may hold commas,
 * line breaks and doubled quotes; CRLF and a leading byte-order mark are fine.
 * Blank lines are dropped.
 */
export function csvRecords(text: string): string[][] {
  const initial: CsvState = { records: [], fields: [], field: "", inQuotes: false, quoteSeen: false }
  const end = Array.from(text.replace(/^\uFEFF/, "")).reduce(csvStep, initial)
  const last = end.fields.length > 0 || end.field !== "" ? [[...end.fields, end.field]] : []
  return [...end.records, ...last]
    .filter((record) => record.length > 1 || (record[0] ?? "").trim() !== "")
    .map((record) => [...record])
}

/** Rows keyed by a header record, with header names and cells trimmed */
function rowsUnder(header: readonly string[], records: readonly (readonly string[])[]): Row[] {
  const names = header.map((h) => h.trim())
  return records.map((values): Row => Object.fromEntries(names.map((h, j) => [h, Option(values[j]).orElse("").trim()])))
}

/** Parse tilde-delimited text (the Orange Book file format) */
export const parseTildeDelimited = (text: string): Row[] => parseRows(text, (line) => line.split("~"))

/** Parse CSV text, honouring quoted fields and doubled quotes */
export const parseCSV = (text: string): Row[] => {
  const [header, ...rest] = csvRecords(text)
  return Option(header).fold(
    (): Row[] => [],
    (h) => rowsUnder(h, rest),
  )
}

function parseOrangeBookFiles(files: Record<string, Uint8Array>): OrangeBookData {
  const decoder = new TextDecoder("utf-8")

  const fileEntries = List(Object.entries(files)).map(([filename, content]) => ({
    name: filename.toLowerCase(),
    text: decoder.decode(content),
  }))

  const rowsOf = (namePart: string): Row[] =>
    fileEntries
      .find((f) => f.name.includes(namePart))
      .map((f) => parseTildeDelimited(f.text))
      .orElse([])

  const products = rowsOf("products").map(toOrangeBookProduct)
  loggers.bulk(`Parsed ${products.length} Orange Book products`)

  const patents = rowsOf("patent").map(toOrangeBookPatent)
  loggers.bulk(`Parsed ${patents.length} Orange Book patents`)

  const exclusivities = rowsOf("exclusivity").map(toOrangeBookExclusivity)
  loggers.bulk(`Parsed ${exclusivities.length} Orange Book exclusivities`)

  return { products, patents, exclusivities }
}

async function downloadBinary(url: string): Promise<Either<Error, Uint8Array>> {
  loggers.bulk(`Downloading: ${url}`)
  const response = await fetchOk(url, (r) => `Failed to download ${url}: ${r.status} ${r.statusText}`)
  return response.flatMapAsync(async (r) =>
    (await Try.fromPromise(r.arrayBuffer())).toEither(toError).map((buffer) => new Uint8Array(buffer)),
  )
}

async function loadOrangeBook(): Promise<Either<Error, OrangeBookData>> {
  loggers.bulk("Downloading Orange Book ZIP...")
  const zipData = await downloadBinary(ORANGE_BOOK_ZIP_URL)

  return zipData.flatMap((zip) => Try(() => unzipSync(zip)).toEither(toError)).map(parseOrangeBookFiles)
}

const MONTH_NUMBERS = Map<string, number>(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((name, i): [string, number] => [name, i + 1]),
)

/** The monthly CSV links on the downloads page, newest first */
export function purpleBookCsvLinks(html: string): string[] {
  const links = List(Array.from(html.matchAll(PURPLE_BOOK_CSV_LINK))).flatMap(([url, year, month]) =>
    MONTH_NUMBERS.get(month.toLowerCase())
      .map((m) => ({ url, order: Number(year) * 100 + m }))
      .toList(),
  )
  return Array.from(new globalThis.Map(links.toArray().map((l) => [l.url, l])).values())
    .sort((a, b) => b.order - a.order)
    .map((l) => l.url)
}

/** The full product list: the rows under the last "BLA Number" header (the file opens with this month's changes) */
function purpleBookEntries(text: string): Either<Error, PurpleBookEntry[]> {
  const records = csvRecords(text)
  const headerAt = records.findLastIndex((record) => record.some((c) => c.trim() === "BLA Number"))
  const entriesUnder = (header: readonly string[]): PurpleBookEntry[] =>
    rowsUnder(header, records.slice(headerAt + 1))
      .map(toPurpleBookEntry)
      .filter((entry) => entry.blaNumber !== "")
  return Option(records[headerAt])
    .toEither(new Error("Purple Book file has no BLA Number header row"))
    .map(entriesUnder)
}

async function downloadText(url: string): Promise<Either<Error, string>> {
  loggers.bulk(`Downloading: ${url}`)
  const response = await fetchOk(url, (r) => `Failed to download ${url}: ${r.status} ${r.statusText}`)
  return response.flatMapAsync(async (r) => (await Try.fromPromise(r.text())).toEither(toError))
}

async function loadPurpleBook(): Promise<Either<Error, PurpleBookEntry[]>> {
  loggers.bulk("Finding the latest Purple Book CSV...")
  const page = await fetchOk(
    PURPLE_BOOK_DOWNLOADS_URL,
    (r) => `Failed to load the Purple Book downloads page: ${r.status} ${r.statusText}`,
  )
  const html = await page.flatMapAsync(async (r) => (await Try.fromPromise(r.text())).toEither(toError))

  return html.flatMapAsync((pageHtml) =>
    purpleBookCsvLinks(pageHtml)
      .slice(0, PURPLE_BOOK_CANDIDATES)
      .reduce<Promise<Either<Error, PurpleBookEntry[]>>>(
        async (previous, url) =>
          (await previous).fold(
            async () => (await downloadText(url)).flatMap(purpleBookEntries),
            (entries) => Promise.resolve(Right<Error, PurpleBookEntry[]>(entries)),
          ),
        Promise.resolve(Left(new Error(`No Purple Book CSV download found at ${PURPLE_BOOK_DOWNLOADS_URL}`))),
      )
      .then((loaded) =>
        loaded.map((entries) => {
          loggers.bulk(`Parsed ${entries.length} Purple Book entries`)
          return entries
        }),
      ),
  )
}

/** Serve from the cache while fresh; otherwise load, and cache only a success */
async function cached<T>(
  cache: Ref<Option<CacheEntry<T>>>,
  ttlMs: number,
  label: string,
  load: () => Promise<Either<Error, T>>,
): Promise<Either<Error, T>> {
  return fresh(cache.get()).fold(
    async () => {
      const loaded = await load()
      loaded.forEach((data) => cache.set(cacheEntry(data, ttlMs)))
      return loaded
    },
    (data) => {
      loggers.bulk(`Using cached ${label} data`)
      return Promise.resolve(Right<Error, T>(data))
    },
  )
}

/** A client for the FDA bulk files. Orange Book and Purple Book data are cached per client. */
export type BulkClient = {
  downloadBinary: (url: string) => Promise<Either<Error, Uint8Array>>
  parseTildeDelimited: (text: string) => Row[]
  parseCSV: (text: string) => Row[]
  getOrangeBookData: () => Promise<Either<Error, OrangeBookData>>
  getPurpleBookData: () => Promise<Either<Error, PurpleBookEntry[]>>
  clearCache: () => void
}

/** Create a bulk data client with its own empty cache */
export function createBulkDataClient(): BulkClient {
  const orangeBookCache = Ref<Option<CacheEntry<OrangeBookData>>>(None())
  const purpleBookCache = Ref<Option<CacheEntry<PurpleBookEntry[]>>>(None())

  return {
    downloadBinary,
    parseTildeDelimited,
    parseCSV,
    getOrangeBookData: () => cached(orangeBookCache, ORANGE_BOOK_TTL_MS, "Orange Book", loadOrangeBook),
    getPurpleBookData: () => cached(purpleBookCache, PURPLE_BOOK_TTL_MS, "Purple Book", loadPurpleBook),
    clearCache: () => {
      orangeBookCache.set(None())
      purpleBookCache.set(None())
    },
  }
}

/**
 * Class form of {@link createBulkDataClient}. It delegates to the factory, so
 * both behave the same; prefer the factory in new code.
 */
export class BulkDataClient implements BulkClient {
  private readonly client: BulkClient = createBulkDataClient()

  downloadBinary(url: string): Promise<Either<Error, Uint8Array>> {
    return this.client.downloadBinary(url)
  }

  parseTildeDelimited(text: string): Row[] {
    return this.client.parseTildeDelimited(text)
  }

  parseCSV(text: string): Row[] {
    return this.client.parseCSV(text)
  }

  getOrangeBookData(): Promise<Either<Error, OrangeBookData>> {
    return this.client.getOrangeBookData()
  }

  getPurpleBookData(): Promise<Either<Error, PurpleBookEntry[]>> {
    return this.client.getPurpleBookData()
  }

  clearCache(): void {
    this.client.clearCache()
  }
}

/** The shared client the tool handlers use */
export const bulkDataClient: BulkDataClient = new BulkDataClient()
