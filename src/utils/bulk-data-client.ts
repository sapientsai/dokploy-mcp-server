/**
 * Bulk Data Client
 * Downloads and parses FDA Orange Book and Purple Book data files
 */

import { unzipSync } from "fflate"
import { type Either, Left, List, None, Option, Ref, Right, Some, Try } from "functype"

import type { OrangeBookExclusivity, OrangeBookPatent, OrangeBookProduct, PurpleBookEntry } from "../types/fda.js"
import { toError } from "./errors.js"
import { isRecord, textField } from "./fields.js"
import { loggers } from "./logger.js"

const ORANGE_BOOK_ZIP_URL = "https://www.fda.gov/media/76860/download"
const PURPLE_BOOK_API_URL = "https://purplebooksearch.fda.gov/api/v1/fdaproducts"
const PURPLE_BOOK_API_TOKEN = "18dd75c5-23c2-4318-970b-ca97c34470cb"

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

type ApiRecord = Readonly<Record<string, unknown>>

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

function toPurpleBookEntry(r: ApiRecord): PurpleBookEntry {
  const licenseType = textField(r, "license_type")
  return {
    blaNumber: textField(r, "bla_number"),
    proprietaryName: textField(r, "proprietary_name"),
    properName: textField(r, "proper_name"),
    applicant: textField(r, "applicant"),
    blaType: licenseType,
    strength: textField(r, "strength"),
    dosageForm: textField(r, "dosage_form"),
    route: textField(r, "route_of_administration"),
    productPresentation: textField(r, "product_presentation"),
    status: textField(r, "status"),
    licensingStatus: textField(r, "licensure"),
    referenceProductBla: textField(r, "ref_product_proper_name").trim(),
    referenceProductProprietaryName: textField(r, "ref_prod_proprietary_name"),
    biosimilar: licenseType === "351(k)",
    interchangeable: textField(r, "interchangeable_approval_date").trim() !== "",
    approvalDate: textField(r, "approval_date", "date_of_first_licensure"),
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
          .slice(1, lines.size)
          .map((line): Row => {
            const values = splitLine(line)
            return Object.fromEntries(headers.map((h, j) => [h, Option(values[j]).orElse("").trim()]))
          })
          .toArray()
      },
    )
}

function parseCSVLine(line: string): string[] {
  type ParseState = { readonly fields: readonly string[]; readonly current: string; readonly inQuotes: boolean }

  const initial: ParseState = { fields: [], current: "", inQuotes: false }

  const final = Array.from(line).reduce<ParseState>((state, char, i) => {
    if (state.inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          return state // skip — next iteration handles the escaped quote
        }
        if (i > 0 && line[i - 1] === '"') {
          return { ...state, current: `${state.current}"` } // second char of escaped quote
        }
        return { ...state, inQuotes: false }
      }
      return { ...state, current: state.current + char }
    }
    if (char === '"') return { ...state, inQuotes: true }
    if (char === ",") return { fields: [...state.fields, state.current.trim()], current: "", inQuotes: false }
    return { ...state, current: state.current + char }
  }, initial)

  return [...final.fields, final.current.trim()]
}

/** Parse tilde-delimited text (the Orange Book file format) */
export const parseTildeDelimited = (text: string): Row[] => parseRows(text, (line) => line.split("~"))

/** Parse CSV text, honouring quoted fields and doubled quotes */
export const parseCSV = (text: string): Row[] => parseRows(text, parseCSVLine)

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

async function loadPurpleBook(): Promise<Either<Error, PurpleBookEntry[]>> {
  loggers.bulk("Fetching Purple Book data from API...")

  const url = `${PURPLE_BOOK_API_URL}?token=${PURPLE_BOOK_API_TOKEN}`
  const response = await fetchOk(url, (r) => `Failed to fetch Purple Book data: ${r.status} ${r.statusText}`)
  const records = await response.flatMapAsync(async (r) =>
    (await Try.fromPromise(r.json() as Promise<unknown>))
      .toEither(toError)
      .flatMap((body) =>
        Array.isArray(body) && body.every(isRecord)
          ? Right<Error, ApiRecord[]>(body)
          : Left<Error, ApiRecord[]>(new Error("Unexpected response body from Purple Book API")),
      ),
  )

  return records.map((raw) => {
    loggers.bulk(`Received ${raw.length} Purple Book entries from API`)
    return raw.map(toPurpleBookEntry)
  })
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
