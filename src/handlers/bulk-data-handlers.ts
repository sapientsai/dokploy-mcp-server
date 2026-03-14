/**
 * Bulk Data Handlers
 * Query handlers for FDA Orange Book and Purple Book data
 */

import type { FDAToolResponse, OrangeBookExclusivity, OrangeBookPatent, OrangeBookProduct } from "../types/fda.js"
import { bulkDataClient } from "../utils/bulk-data-client.js"
import { loggers } from "../utils/logger.js"

// Helper for case-insensitive substring matching
function matchesFilter(value: string, filter: string | undefined): boolean {
  if (!filter) return true
  return value.toLowerCase().includes(filter.toLowerCase())
}

// Join key for Orange Book records
function obJoinKey(record: { applType: string; applNo: string; productNo: string }): string {
  return `${record.applType}-${record.applNo}-${record.productNo}`
}

// Default pagination values
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 100

function applyPagination<T>(items: T[], limit?: number, skip?: number): { items: T[]; total: number } {
  const total = items.length
  const effectiveSkip = skip ?? 0
  const effectiveLimit = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT)
  return {
    items: items.slice(effectiveSkip, effectiveSkip + effectiveLimit),
    total,
  }
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

  try {
    const { products, patents, exclusivities } = await bulkDataClient.getOrangeBookData()

    // Build patent/exclusivity count maps
    const patentCounts = new Map<string, number>()
    for (const p of patents) {
      const key = obJoinKey(p)
      patentCounts.set(key, (patentCounts.get(key) ?? 0) + 1)
    }

    const exclusivityCounts = new Map<string, number>()
    for (const e of exclusivities) {
      const key = obJoinKey(e)
      exclusivityCounts.set(key, (exclusivityCounts.get(key) ?? 0) + 1)
    }

    // Filter products
    const filtered = products.filter((p) => {
      if (!matchesFilter(p.tradeName, params.drugName) && !matchesFilter(p.ingredient, params.drugName)) return false
      if (!matchesFilter(p.applicant, params.applicant) && !matchesFilter(p.applicantFullName, params.applicant))
        return false
      if (params.applNo && p.applNo !== params.applNo) return false
      if (!matchesFilter(p.teCode, params.teCode)) return false
      return true
    })

    const { items, total } = applyPagination(filtered, params.limit, params.skip)

    const formatted: FormattedOrangeBookProduct[] = items.map((p) => {
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
      data: formatted,
      totalResults: total,
      displayedResults: items.length,
      dataSource: ORANGE_BOOK_SOURCE,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
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

  try {
    const { products, patents, exclusivities } = await bulkDataClient.getOrangeBookData()

    // Build product lookup by join key
    const productMap = new Map<string, OrangeBookProduct>()
    for (const p of products) {
      productMap.set(obJoinKey(p), p)
    }

    // Build exclusivity lookup by join key
    const exclusivityMap = new Map<string, OrangeBookExclusivity[]>()
    for (const e of exclusivities) {
      const key = obJoinKey(e)
      const existing = exclusivityMap.get(key) ?? []
      existing.push(e)
      exclusivityMap.set(key, existing)
    }

    // Filter patents
    const filtered = patents.filter((pat) => {
      if (params.patentNo && pat.patentNo !== params.patentNo) return false
      if (params.applNo && pat.applNo !== params.applNo) return false

      if (params.drugName) {
        const product = productMap.get(obJoinKey(pat))
        if (!product) return false
        if (!matchesFilter(product.tradeName, params.drugName) && !matchesFilter(product.ingredient, params.drugName))
          return false
      }

      return true
    })

    const { items, total } = applyPagination(filtered, params.limit, params.skip)

    const formatted: FormattedOrangeBookPatent[] = items.map((pat) => {
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
      data: formatted,
      totalResults: total,
      displayedResults: items.length,
      dataSource: ORANGE_BOOK_SOURCE,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
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

  try {
    const entries = await bulkDataClient.getPurpleBookData()

    const filtered = entries.filter((e) => {
      if (!matchesFilter(e.proprietaryName, params.productName) && !matchesFilter(e.properName, params.productName))
        return false
      if (!matchesFilter(e.applicant, params.applicant)) return false
      if (params.blaNumber && e.blaNumber !== params.blaNumber) return false
      if (params.licenseType && e.blaType !== params.licenseType) return false
      if (params.biosimilar !== undefined && e.biosimilar !== params.biosimilar) return false
      if (params.interchangeable !== undefined && e.interchangeable !== params.interchangeable) return false
      return true
    })

    const { items, total } = applyPagination(filtered, params.limit, params.skip)

    const formatted: FormattedPurpleBookEntry[] = items.map((e) => ({
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
      data: formatted,
      totalResults: total,
      displayedResults: items.length,
      dataSource: PURPLE_BOOK_SOURCE,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
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

  try {
    const includeExclusivity = params.includeExclusivity !== false
    const includePurpleBook = params.includePurpleBook === true

    const { products, patents, exclusivities } = await bulkDataClient.getOrangeBookData()

    // Build product lookup
    const productMap = new Map<string, OrangeBookProduct>()
    for (const p of products) {
      productMap.set(obJoinKey(p), p)
    }

    // Build exclusivity lookup
    const exclusivityMap = new Map<string, OrangeBookExclusivity[]>()
    if (includeExclusivity) {
      for (const e of exclusivities) {
        const key = obJoinKey(e)
        const existing = exclusivityMap.get(key) ?? []
        existing.push(e)
        exclusivityMap.set(key, existing)
      }
    }

    // Filter patents by drug name / applNo
    const filteredPatents = patents.filter((pat) => {
      if (params.applNo && pat.applNo !== params.applNo) return false
      if (params.drugName) {
        const product = productMap.get(obJoinKey(pat))
        if (!product) return false
        if (!matchesFilter(product.tradeName, params.drugName) && !matchesFilter(product.ingredient, params.drugName))
          return false
      }
      return true
    })

    const entries: PatentExpiryEntry[] = filteredPatents.map((pat) => {
      const key = obJoinKey(pat)
      const product = productMap.get(key)
      const excl = includeExclusivity ? (exclusivityMap.get(key) ?? []) : []

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
    if (includePurpleBook) {
      try {
        const purpleEntries = await bulkDataClient.getPurpleBookData()
        const filteredPurple = purpleEntries.filter((e) => {
          if (params.drugName) {
            if (!matchesFilter(e.proprietaryName, params.drugName) && !matchesFilter(e.properName, params.drugName))
              return false
          }
          if (params.applNo && e.blaNumber !== params.applNo) return false
          return true
        })

        for (const pe of filteredPurple) {
          entries.push({
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
          })
        }
      } catch (error) {
        loggers.bulk(`Purple Book data unavailable: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // Sort by earliest expiry date (non-empty dates first)
    entries.sort((a, b) => {
      if (!a.patentExpireDate && !b.patentExpireDate) return 0
      if (!a.patentExpireDate) return 1
      if (!b.patentExpireDate) return -1
      return a.patentExpireDate.localeCompare(b.patentExpireDate)
    })

    const { items, total } = applyPagination(entries, params.limit, params.skip)

    return {
      success: true,
      data: items,
      totalResults: total,
      displayedResults: items.length,
      dataSource: ORANGE_BOOK_SOURCE,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
