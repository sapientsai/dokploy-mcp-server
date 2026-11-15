/**
 * Bulk Data Handlers
 * Query handlers for FDA Orange Book and Purple Book data
 */

import { List, Map, Option } from "functype"

import type { FDAToolResponse, OrangeBookExclusivity, OrangeBookPatent, OrangeBookProduct } from "../types/fda.js"
import { bulkDataClient, type OrangeBookData } from "../utils/bulk-data-client.js"
import { failure } from "../utils/errors.js"
import { nonEmpty } from "../utils/fields.js"
import { loggers } from "../utils/logger.js"

// Search filters are built once per request, then run on every row (~49,000 Orange Book products,
// ~22,600 patents). The per-row check is plain string work: building an Option there made a
// filtered search cost ~100 ms. A missing or empty filter matches every row.

/** A check on one text field */
type TextFilter = (value: string) => boolean

const anyText: TextFilter = () => true

/** Contains the filter text, ignoring case */
function containsFilter(filter: string | undefined): TextFilter {
  return nonEmpty(filter).fold(
    () => anyText,
    (f) => {
      const needle = f.toLowerCase()
      return (value) => value.toLowerCase().includes(needle)
    },
  )
}

/** Equals the filter text */
function exactFilter(filter: string | undefined): TextFilter {
  return nonEmpty(filter).fold(
    () => anyText,
    (f) => (value) => value === f,
  )
}

/** Either of two fields contains the filter text, ignoring case */
function eitherContainsFilter(filter: string | undefined): (a: string, b: string) => boolean {
  const contains = containsFilter(filter)
  return (a, b) => contains(a) || contains(b)
}

/** Equals the flag, when one is given */
function flagFilter(flag: boolean | undefined): (value: boolean) => boolean {
  return Option(flag).fold(
    () => () => true,
    (f) => (value) => value === f,
  )
}

/**
 * The Orange Book drug-name filter on a patent: with no name given every
 * patent passes; with one, the patent's product must exist and match it.
 */
function productFilter(
  products: ReadonlyMap<string, OrangeBookProduct>,
  drugName: string | undefined,
): (patent: OrangeBookPatent) => boolean {
  const names = eitherContainsFilter(drugName)
  return nonEmpty(drugName).fold(
    () => () => true,
    () => (patent) => {
      const product = products.get(obJoinKey(patent))
      return product !== undefined && names(product.tradeName, product.ingredient)
    },
  )
}

// Join key for Orange Book records
function obJoinKey(record: { applType: string; applNo: string; productNo: string }): string {
  return `${record.applType}-${record.applNo}-${record.productNo}`
}

// Group items by key in one linear pass (Object.groupBy). List.groupBy is much
// slower on Orange Book-sized inputs.
// Object.entries lists integer-like keys first, in ascending order; obJoinKey
// keys are never integer-like, and these maps are only used for lookups.
function groupEntries<T>(items: readonly T[], keyFn: (item: T) => string): [string, T[]][] {
  return Object.entries(Object.groupBy(items, keyFn)).map(([key, group]): [string, T[]] => [key, group ?? []])
}

// The lookup maps below are native: they are read once per row, and a functype Map
// answers each read with an Option.

// Count items per key
function buildCountMap<T>(items: readonly T[], keyFn: (item: T) => string): ReadonlyMap<string, number> {
  return new globalThis.Map(groupEntries(items, keyFn).map(([key, group]): [string, number] => [key, group.length]))
}

// One item per key (last item wins on duplicate keys)
function buildLookupMap<T>(items: readonly T[], keyFn: (item: T) => string): ReadonlyMap<string, T> {
  return new globalThis.Map(items.map((item): [string, T] => [keyFn(item), item]))
}

// Items grouped by key
function buildGroupMap<T>(items: readonly T[], keyFn: (item: T) => string): ReadonlyMap<string, T[]> {
  return new globalThis.Map(groupEntries(items, keyFn))
}

/**
 * A value built once per loaded Orange Book and reused until the client loads a new one.
 * The client hands out the same data object while its cache is fresh, so that object is the key;
 * a reload brings a new object, and the old tables go with the old data.
 */
function perLoad<T>(build: (data: OrangeBookData) => T): (data: OrangeBookData) => T {
  const built = new WeakMap<OrangeBookData, T>()
  return (data) => {
    const cached = built.get(data)
    if (cached !== undefined) return cached
    const fresh = build(data)
    built.set(data, fresh)
    return fresh
  }
}

const productsByKey = perLoad((data) => buildLookupMap(data.products, obJoinKey))
const exclusivitiesByKey = perLoad((data) => buildGroupMap(data.exclusivities, obJoinKey))
const patentCountsByKey = perLoad((data) => buildCountMap(data.patents, obJoinKey))
const exclusivityCountsByKey = perLoad((data) => buildCountMap(data.exclusivities, obJoinKey))

// Default pagination values
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 100

function applyPagination<T>(items: List<T>, limit?: number, skip?: number): { items: List<T>; total: number } {
  const effectiveSkip = skip ?? 0
  const effectiveLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT)
  return {
    items: items.slice(effectiveSkip, effectiveSkip + effectiveLimit),
    total: items.size,
  }
}

const MONTHS = Map<string, string>([
  ["Jan", "01"],
  ["Feb", "02"],
  ["Mar", "03"],
  ["Apr", "04"],
  ["May", "05"],
  ["Jun", "06"],
  ["Jul", "07"],
  ["Aug", "08"],
  ["Sep", "09"],
  ["Oct", "10"],
  ["Nov", "11"],
  ["Dec", "12"],
])

/** An Orange Book date ("Apr 28, 2037") as a sortable "20370428"; None when missing or unreadable */
function expiryKey(date: string): Option<string> {
  return Option(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(date.trim())).flatMap(([, month, day, year]) =>
    MONTHS.get(month).map((mm) => `${year}${mm}${day.padStart(2, "0")}`),
  )
}

/** Sorts after every real "YYYYMMDD" key ("~" follows every digit), so entries with no readable date go last */
const NO_EXPIRY = "~"

/**
 * Earliest expiry first; entries with no readable expiry date sort last, in their original order.
 * Each date is parsed once: List.sortBy calls its key function on every comparison, and parsing
 * there cost ~0.8 s on Node (~0.5 s in workerd) for the ~22,600 Orange Book patents.
 */
function byExpiry<T extends { patentExpireDate: string }>(entries: List<T>): List<T> {
  return entries
    .map((entry) => ({ entry, key: expiryKey(entry.patentExpireDate).orElse(NO_EXPIRY) }))
    .sortBy((keyed) => keyed.key)
    .map((keyed) => keyed.entry)
}

const ORANGE_BOOK_SOURCE = {
  name: "FDA Orange Book",
  lastUpdated: "Monthly",
  url: "https://www.fda.gov/drugs/drug-approvals-and-databases/approved-drug-products-therapeutic-equivalence-evaluations-orange-book",
}

const PURPLE_BOOK_SOURCE = {
  name: "FDA Purple Book",
  lastUpdated: "Monthly",
  url: "https://purplebooksearch.fda.gov/",
}

// ============================================================
// search_fda_orange_book
// ============================================================

export type OrangeBookSearchParams = {
  drugName?: string
  applicant?: string
  applNo?: string
  teCode?: string
  limit?: number
  skip?: number
}

type FormattedOrangeBookProduct = {
  tradeName: string
  ingredient: string
  applicant: string
  applicantFullName: string
  applType: string
  applNo: string
  productNo: string
  dfRoute: string
  teCode: string
  approvalDate: string
  rld: string
  type: string
  patentCount: number
  exclusivityCount: number
}

export async function handleSearchOrangeBook(
  params: OrangeBookSearchParams,
): Promise<FDAToolResponse<FormattedOrangeBookProduct[]>> {
  loggers.tools("searchOrangeBook", params)

  return (await bulkDataClient.getOrangeBookData()).fold(failure<FormattedOrangeBookProduct[]>, (data) => {
    const patentCounts = patentCountsByKey(data)
    const exclusivityCounts = exclusivityCountsByKey(data)

    const name = eitherContainsFilter(params.drugName)
    const applicant = eitherContainsFilter(params.applicant)
    const applNo = exactFilter(params.applNo)
    const teCode = containsFilter(params.teCode)
    const filtered = List(data.products).filter(
      (p) =>
        name(p.tradeName, p.ingredient) &&
        applicant(p.applicant, p.applicantFullName) &&
        applNo(p.applNo) &&
        teCode(p.teCode),
    )

    const { items, total } = applyPagination(filtered, params.limit, params.skip)

    const formatted = items.map((p): FormattedOrangeBookProduct => {
      const key = obJoinKey(p)
      return {
        tradeName: p.tradeName,
        ingredient: p.ingredient,
        applicant: p.applicant,
        applicantFullName: p.applicantFullName,
        applType: p.applType,
        applNo: p.applNo,
        productNo: p.productNo,
        dfRoute: p.dfRoute,
        teCode: p.teCode,
        approvalDate: p.approvalDate,
        rld: p.rld,
        type: p.type,
        patentCount: patentCounts.get(key) ?? 0,
        exclusivityCount: exclusivityCounts.get(key) ?? 0,
      }
    })

    return {
      success: true,
      data: formatted.toArray(),
      totalResults: total,
      displayedResults: items.size,
      dataSource: ORANGE_BOOK_SOURCE,
    }
  })
}

// ============================================================
// search_fda_orange_book_patents
// ============================================================

export type OrangeBookPatentsParams = {
  drugName?: string
  applNo?: string
  patentNo?: string
  limit?: number
  skip?: number
}

type FormattedOrangeBookPatent = {
  patentNo: string
  patentExpireDate: string
  drugSubstanceFlag: string
  drugProductFlag: string
  patentUseCode: string
  applType: string
  applNo: string
  productNo: string
  tradeName: string
  ingredient: string
  submissionDate: string
  exclusivities: Array<{ code: string; date: string }>
}

export async function handleSearchOrangeBookPatents(
  params: OrangeBookPatentsParams,
): Promise<FDAToolResponse<FormattedOrangeBookPatent[]>> {
  loggers.tools("searchOrangeBookPatents", params)

  return (await bulkDataClient.getOrangeBookData()).fold(failure<FormattedOrangeBookPatent[]>, (data) => {
    const productMap = productsByKey(data)
    const exclusivityMap = exclusivitiesByKey(data)

    const patentNo = exactFilter(params.patentNo)
    const applNo = exactFilter(params.applNo)
    const drug = productFilter(productMap, params.drugName)
    const filtered = List(data.patents).filter((pat) => patentNo(pat.patentNo) && applNo(pat.applNo) && drug(pat))

    const { items, total } = applyPagination(filtered, params.limit, params.skip)

    const formatted = items.map((pat): FormattedOrangeBookPatent => {
      const key = obJoinKey(pat)
      const product = productMap.get(key)
      const excl = exclusivityMap.get(key) ?? []

      return {
        patentNo: pat.patentNo,
        patentExpireDate: pat.patentExpireDate,
        drugSubstanceFlag: pat.drugSubstanceFlag,
        drugProductFlag: pat.drugProductFlag,
        patentUseCode: pat.patentUseCode,
        applType: pat.applType,
        applNo: pat.applNo,
        productNo: pat.productNo,
        tradeName: product?.tradeName ?? "",
        ingredient: product?.ingredient ?? "",
        submissionDate: pat.submissionDate,
        exclusivities: excl.map((e) => ({ code: e.exclusivityCode, date: e.exclusivityDate })),
      }
    })

    return {
      success: true,
      data: formatted.toArray(),
      totalResults: total,
      displayedResults: items.size,
      dataSource: ORANGE_BOOK_SOURCE,
    }
  })
}

// ============================================================
// search_fda_purple_book
// ============================================================

export type PurpleBookSearchParams = {
  productName?: string
  applicant?: string
  blaNumber?: string
  licenseType?: "351(a)" | "351(k)"
  biosimilar?: boolean
  interchangeable?: boolean
  limit?: number
  skip?: number
}

type FormattedPurpleBookEntry = {
  blaNumber: string
  proprietaryName: string
  properName: string
  applicant: string
  blaType: string
  strength: string
  dosageForm: string
  route: string
  status: string
  licensingStatus: string
  biosimilar: boolean
  interchangeable: boolean
  referenceProductBla: string
  referenceProductName: string
  approvalDate: string
}

export async function handleSearchPurpleBook(
  params: PurpleBookSearchParams,
): Promise<FDAToolResponse<FormattedPurpleBookEntry[]>> {
  loggers.tools("searchPurpleBook", params)

  return (await bulkDataClient.getPurpleBookData()).fold(failure<FormattedPurpleBookEntry[]>, (entries) => {
    const name = eitherContainsFilter(params.productName)
    const applicant = containsFilter(params.applicant)
    const blaNumber = exactFilter(params.blaNumber)
    const licenseType = exactFilter(params.licenseType)
    const biosimilar = flagFilter(params.biosimilar)
    const interchangeable = flagFilter(params.interchangeable)
    const filtered = List(entries).filter(
      (e) =>
        name(e.proprietaryName, e.properName) &&
        applicant(e.applicant) &&
        blaNumber(e.blaNumber) &&
        licenseType(e.blaType) &&
        biosimilar(e.biosimilar) &&
        interchangeable(e.interchangeable),
    )

    const { items, total } = applyPagination(filtered, params.limit, params.skip)

    const formatted = items.map((e): FormattedPurpleBookEntry => ({
      blaNumber: e.blaNumber,
      proprietaryName: e.proprietaryName,
      properName: e.properName,
      applicant: e.applicant,
      blaType: e.blaType,
      strength: e.strength,
      dosageForm: e.dosageForm,
      route: e.route,
      status: e.status,
      licensingStatus: e.licensingStatus,
      biosimilar: e.biosimilar,
      interchangeable: e.interchangeable,
      referenceProductBla: e.referenceProductBla,
      referenceProductName: e.referenceProductProprietaryName,
      approvalDate: e.approvalDate,
    }))

    return {
      success: true,
      data: formatted.toArray(),
      totalResults: total,
      displayedResults: items.size,
      dataSource: PURPLE_BOOK_SOURCE,
    }
  })
}

// ============================================================
// search_fda_drug_patent_expiry
// ============================================================

export type DrugPatentExpiryParams = {
  drugName?: string
  applNo?: string
  includeExclusivity?: boolean
  includePurpleBook?: boolean
  limit?: number
  skip?: number
}

type PatentExpiryEntry = {
  source: string
  tradeName: string
  ingredient: string
  applNo: string
  patentNo: string
  patentExpireDate: string
  drugSubstanceFlag: string
  drugProductFlag: string
  patentUseCode: string
  exclusivities: Array<{ code: string; date: string }>
}

export async function handleSearchDrugPatentExpiry(
  params: DrugPatentExpiryParams,
): Promise<FDAToolResponse<PatentExpiryEntry[]>> {
  loggers.tools("searchDrugPatentExpiry", params)

  const includeExclusivity = params.includeExclusivity !== false
  const includePurpleBook = params.includePurpleBook === true

  return (await bulkDataClient.getOrangeBookData()).fold(
    (error) => Promise.resolve(failure<PatentExpiryEntry[]>(error)),
    async (data) => {
      const productMap = productsByKey(data)
      const exclusivityMap = includeExclusivity
        ? exclusivitiesByKey(data)
        : new globalThis.Map<string, OrangeBookExclusivity[]>()

      // Filter patents by drug name / applNo
      const applNo = exactFilter(params.applNo)
      const drug = productFilter(productMap, params.drugName)
      const filteredPatents = List(data.patents).filter((pat) => applNo(pat.applNo) && drug(pat))

      const orangeEntries = filteredPatents.map((pat): PatentExpiryEntry => {
        const key = obJoinKey(pat)
        const product = productMap.get(key)
        const excl = exclusivityMap.get(key) ?? []

        return {
          source: "Orange Book",
          tradeName: product?.tradeName ?? "",
          ingredient: product?.ingredient ?? "",
          applNo: pat.applNo,
          patentNo: pat.patentNo,
          patentExpireDate: pat.patentExpireDate,
          drugSubstanceFlag: pat.drugSubstanceFlag,
          drugProductFlag: pat.drugProductFlag,
          patentUseCode: pat.patentUseCode,
          exclusivities: excl.map((e) => ({ code: e.exclusivityCode, date: e.exclusivityDate })),
        }
      })

      // Optionally add Purple Book entries that match
      const purpleEntries = includePurpleBook
        ? await getPurpleBookPatentEntries(params)
        : List.empty<PatentExpiryEntry>()

      const entries = byExpiry(orangeEntries.concat(purpleEntries))

      const { items, total } = applyPagination(entries, params.limit, params.skip)

      return {
        success: true,
        data: items.toArray(),
        totalResults: total,
        displayedResults: items.size,
        dataSource: ORANGE_BOOK_SOURCE,
      }
    },
  )
}

async function getPurpleBookPatentEntries(params: DrugPatentExpiryParams): Promise<List<PatentExpiryEntry>> {
  return (await bulkDataClient.getPurpleBookData()).fold(
    (error) => {
      loggers.bulk(`Purple Book data unavailable: ${error.message}`)
      return List.empty<PatentExpiryEntry>()
    },
    (purpleEntries) => {
      const name = eitherContainsFilter(params.drugName)
      const blaNumber = exactFilter(params.applNo)
      return List(purpleEntries)
        .filter((e) => name(e.proprietaryName, e.properName) && blaNumber(e.blaNumber))
        .map((pe): PatentExpiryEntry => ({
          source: "Purple Book",
          tradeName: pe.proprietaryName,
          ingredient: pe.properName,
          applNo: pe.blaNumber,
          patentNo: "",
          patentExpireDate: "",
          drugSubstanceFlag: "",
          drugProductFlag: "",
          patentUseCode: "",
          exclusivities: [],
        }))
    },
  )
}
