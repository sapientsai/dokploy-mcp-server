/**
 * Bulk Data Handlers
 * Query handlers for FDA Orange Book and Purple Book data
 */

import { List, Map, Option } from "functype"

import type { FDAToolResponse, OrangeBookExclusivity, OrangeBookProduct } from "../types/fda.js"
import { bulkDataClient } from "../utils/bulk-data-client.js"
import { failure } from "../utils/errors.js"
import { loggers } from "../utils/logger.js"

/** The filter value, if one was given (an empty string means no filter) */
const given = (filter: string | undefined): Option<string> => Option(filter).filter((f) => f !== "")

/** True when no filter is given, or the value contains it, ignoring case */
function matchesFilter(value: string, filter: string | undefined): boolean {
  return given(filter).fold(
    () => true,
    (f) => value.toLowerCase().includes(f.toLowerCase()),
  )
}

/** True when no filter is given, or the value equals it */
function matchesExact(value: string, filter: string | undefined): boolean {
  return given(filter).fold(
    () => true,
    (f) => value === f,
  )
}

/** True when no filter is given, or either value contains it */
function matchesEither(a: string, b: string, filter: string | undefined): boolean {
  return matchesFilter(a, filter) || matchesFilter(b, filter)
}

/** True when no flag is given, or the value equals it */
function matchesFlag(value: boolean, flag: boolean | undefined): boolean {
  return Option(flag).fold(
    () => true,
    (f) => value === f,
  )
}

/**
 * The Orange Book drug-name filter on a patent: with no name given every
 * patent passes; with one, the patent's product must exist and match it.
 */
function productMatches(product: Option<OrangeBookProduct>, drugName: string | undefined): boolean {
  return given(drugName).fold(
    () => true,
    (name) => product.exists((p) => matchesEither(p.tradeName, p.ingredient, name)),
  )
}

// Join key for Orange Book records
function obJoinKey(record: { applType: string; applNo: string; productNo: string }): string {
  return `${record.applType}-${record.applNo}-${record.productNo}`
}

// Group items by key in one linear pass (Object.groupBy). List.groupBy is much
// slower on Orange Book-sized inputs, and these maps are rebuilt per query.
// Object.entries lists integer-like keys first, in ascending order; obJoinKey
// keys are never integer-like, and these maps are only used for lookups.
function groupEntries<T>(items: readonly T[], keyFn: (item: T) => string): [string, T[]][] {
  return Object.entries(Object.groupBy(items, keyFn)).map(([key, group]): [string, T[]] => [key, group ?? []])
}

// Build a counting map from an array using a key function
function buildCountMap<T>(items: readonly T[], keyFn: (item: T) => string): Map<string, number> {
  return Map(groupEntries(items, keyFn).map(([key, group]): [string, number] => [key, group.length]))
}

// Build a lookup map from an array using a key function (last item wins on duplicate keys)
function buildLookupMap<T>(items: readonly T[], keyFn: (item: T) => string): Map<string, T> {
  return Map(items.map((item): [string, T] => [keyFn(item), item]))
}

// Build a grouped map from an array using a key function
function buildGroupMap<T>(items: readonly T[], keyFn: (item: T) => string): Map<string, T[]> {
  return Map(groupEntries(items, keyFn))
}

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

/** Patents with no expiry date sort last; the rest compare as text */
function compareExpiry(a: string, b: string): number {
  if (a === "" && b === "") return 0
  if (a === "") return 1
  if (b === "") return -1
  return a.localeCompare(b)
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

  return (await bulkDataClient.getOrangeBookData()).fold(
    failure<FormattedOrangeBookProduct[]>,
    ({ products, patents, exclusivities }) => {
      const patentCounts = buildCountMap(patents, obJoinKey)
      const exclusivityCounts = buildCountMap(exclusivities, obJoinKey)

      const filtered = List(products).filter(
        (p) =>
          matchesEither(p.tradeName, p.ingredient, params.drugName) &&
          matchesEither(p.applicant, p.applicantFullName, params.applicant) &&
          matchesExact(p.applNo, params.applNo) &&
          matchesFilter(p.teCode, params.teCode),
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
          patentCount: patentCounts.getOrElse(key, 0),
          exclusivityCount: exclusivityCounts.getOrElse(key, 0),
        }
      })

      return {
        success: true,
        data: formatted.toArray(),
        totalResults: total,
        displayedResults: items.size,
        dataSource: ORANGE_BOOK_SOURCE,
      }
    },
  )
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

  return (await bulkDataClient.getOrangeBookData()).fold(
    failure<FormattedOrangeBookPatent[]>,
    ({ products, patents, exclusivities }) => {
      const productMap = buildLookupMap(products, obJoinKey)
      const exclusivityMap = buildGroupMap(exclusivities, obJoinKey)

      const filtered = List(patents).filter(
        (pat) =>
          matchesExact(pat.patentNo, params.patentNo) &&
          matchesExact(pat.applNo, params.applNo) &&
          productMatches(productMap.get(obJoinKey(pat)), params.drugName),
      )

      const { items, total } = applyPagination(filtered, params.limit, params.skip)

      const formatted = items.map((pat): FormattedOrangeBookPatent => {
        const key = obJoinKey(pat)
        const product = productMap.get(key)
        const excl = exclusivityMap.getOrElse(key, [])

        return {
          patentNo: pat.patentNo,
          patentExpireDate: pat.patentExpireDate,
          drugSubstanceFlag: pat.drugSubstanceFlag,
          drugProductFlag: pat.drugProductFlag,
          patentUseCode: pat.patentUseCode,
          applType: pat.applType,
          applNo: pat.applNo,
          productNo: pat.productNo,
          tradeName: product.map((p) => p.tradeName).orElse(""),
          ingredient: product.map((p) => p.ingredient).orElse(""),
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
    },
  )
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
    const filtered = List(entries).filter(
      (e) =>
        matchesEither(e.proprietaryName, e.properName, params.productName) &&
        matchesFilter(e.applicant, params.applicant) &&
        matchesExact(e.blaNumber, params.blaNumber) &&
        matchesExact(e.blaType, params.licenseType) &&
        matchesFlag(e.biosimilar, params.biosimilar) &&
        matchesFlag(e.interchangeable, params.interchangeable),
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
    async ({ products, patents, exclusivities }) => {
      const productMap = buildLookupMap(products, obJoinKey)
      const exclusivityMap = includeExclusivity
        ? buildGroupMap(exclusivities, obJoinKey)
        : Map.empty<string, OrangeBookExclusivity[]>()

      // Filter patents by drug name / applNo
      const filteredPatents = List(patents).filter(
        (pat) =>
          matchesExact(pat.applNo, params.applNo) && productMatches(productMap.get(obJoinKey(pat)), params.drugName),
      )

      const orangeEntries = filteredPatents.map((pat): PatentExpiryEntry => {
        const key = obJoinKey(pat)
        const product = productMap.get(key)
        const excl = exclusivityMap.getOrElse(key, [])

        return {
          source: "Orange Book",
          tradeName: product.map((p) => p.tradeName).orElse(""),
          ingredient: product.map((p) => p.ingredient).orElse(""),
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

      const entries = orangeEntries.concat(purpleEntries).sortBy((e) => e.patentExpireDate, compareExpiry)

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
    (purpleEntries) =>
      List(purpleEntries)
        .filter(
          (e) =>
            matchesEither(e.proprietaryName, e.properName, params.drugName) && matchesExact(e.blaNumber, params.applNo),
        )
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
        })),
  )
}
