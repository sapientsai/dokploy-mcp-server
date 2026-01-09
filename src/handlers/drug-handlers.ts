/**
 * Drug Handlers
 * Query handlers for FDA drug-related endpoints
 */

import type {
  DrugAdverseEvent,
  DrugEnforcement,
  DrugLabel,
  DrugNDC,
  DrugsFDA,
  DrugShortage,
  FDAToolResponse,
  SearchParams,
} from "../types/fda.js"
import { fdaAPIClient } from "../utils/api-client.js"
import { loggers } from "../utils/logger.js"

// Helper to build date range query
function buildDateQuery(field: string, dateFrom?: string, dateTo?: string): string | undefined {
  if (!dateFrom && !dateTo) return undefined

  // FDA date format is YYYYMMDD
  const from = dateFrom?.replace(/-/g, "") ?? "*"
  const to = dateTo?.replace(/-/g, "") ?? "*"

  return `${field}:[${from}+TO+${to}]`
}

// Helper to escape special characters in search terms
function escapeSearchTerm(term: string): string {
  // Escape special characters that have meaning in FDA's search syntax
  return term.replace(/[+\-&|!(){}[\]^"~*?:\\]/g, "\\$&").replace(/\s+/g, "+")
}

// Helper to build a search query from multiple terms
function buildSearchQuery(terms: Array<{ field: string; value?: string }>): string {
  const validTerms = terms.filter((t) => t.value !== undefined && t.value.trim() !== "")
  if (validTerms.length === 0) return ""

  return validTerms.map((t) => `${t.field}:"${escapeSearchTerm(t.value!)}"`).join("+AND+")
}

// Format truncated text
function truncateText(text: string | undefined, maxLength = 200): string | undefined {
  if (!text) return undefined
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text
}

// Drug Adverse Events Handler
export type DrugAdverseEventsParams = {
  drugName?: string
  reaction?: string
  manufacturer?: string
  serious?: boolean
  dateFrom?: string
  dateTo?: string
  limit?: number
  skip?: number
}

type FormattedDrugAdverseEvent = {
  reportId: string | undefined
  receiveDate: string | undefined
  serious: boolean
  drugs: Array<{
    name: string | undefined
    indication: string | undefined
    route: string | undefined
  }>
  reactions: Array<{
    reaction: string | undefined
    outcome: string | undefined
  }>
  patient: {
    age: string | undefined
    sex: string | undefined
    weight: string | undefined
  }
}

function formatDrugAdverseEvent(event: DrugAdverseEvent): FormattedDrugAdverseEvent {
  return {
    reportId: event.safetyreportid,
    receiveDate: event.receivedate,
    serious: event.serious === "1",
    drugs:
      event.patient?.drug?.slice(0, 3).map((d) => ({
        name: d.medicinalproduct ?? d.activesubstance?.activesubstancename,
        indication: d.drugindication,
        route: d.drugadministrationroute,
      })) ?? [],
    reactions:
      event.patient?.reaction?.slice(0, 3).map((r) => ({
        reaction: r.reactionmeddrapt,
        outcome: r.reactionoutcome,
      })) ?? [],
    patient: {
      age: event.patient?.patientonsetage
        ? `${event.patient.patientonsetage} ${event.patient.patientonsetageunit ?? ""}`
        : undefined,
      sex: event.patient?.patientsex === "1" ? "Male" : event.patient?.patientsex === "2" ? "Female" : undefined,
      weight: event.patient?.patientweight ? `${event.patient.patientweight} kg` : undefined,
    },
  }
}

export async function handleSearchDrugAdverseEvents(
  params: DrugAdverseEventsParams,
): Promise<FDAToolResponse<FormattedDrugAdverseEvent[]>> {
  loggers.tools("searchDrugAdverseEvents", params)

  try {
    const searchTerms: Array<{ field: string; value?: string }> = [
      { field: "patient.drug.medicinalproduct", value: params.drugName },
      { field: "patient.reaction.reactionmeddrapt", value: params.reaction },
      { field: "patient.drug.openfda.manufacturer_name", value: params.manufacturer },
    ]

    if (params.serious !== undefined) {
      searchTerms.push({ field: "serious", value: params.serious ? "1" : "2" })
    }

    const searchQuery = buildSearchQuery(searchTerms)
    const dateQuery = buildDateQuery("receivedate", params.dateFrom, params.dateTo)
    const fullQuery = [searchQuery, dateQuery].filter(Boolean).join("+AND+")

    const searchParams: SearchParams = {
      search: fullQuery || undefined,
      limit: params.limit,
      skip: params.skip,
    }

    const response = await fdaAPIClient.searchDrugAdverseEvents(searchParams)
    const results = response.results ?? []

    return {
      success: true,
      data: results.map(formatDrugAdverseEvent),
      totalResults: response.meta?.results?.total,
      displayedResults: results.length,
      searchParams,
      apiUsage: fdaAPIClient.getRateLimitInfo(),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// Drug Labels Handler
export type DrugLabelsParams = {
  drugName?: string
  indication?: string
  activeIngredient?: string
  route?: string
  limit?: number
  skip?: number
}

type FormattedDrugLabel = {
  brandName: string | undefined
  genericName: string | undefined
  manufacturer: string | undefined
  activeIngredients: string[]
  indications: string | undefined
  warnings: string | undefined
  dosageAndAdministration: string | undefined
  route: string[]
}

function formatDrugLabel(label: DrugLabel): FormattedDrugLabel {
  return {
    brandName: label.openfda?.brand_name?.[0],
    genericName: label.openfda?.generic_name?.[0],
    manufacturer: label.openfda?.manufacturer_name?.[0],
    activeIngredients: label.openfda?.substance_name?.slice(0, 5) ?? [],
    indications: truncateText(label.indications_and_usage?.[0]),
    warnings: truncateText(label.warnings?.[0]),
    dosageAndAdministration: truncateText(label.dosage_and_administration?.[0]),
    route: label.openfda?.route?.slice(0, 3) ?? [],
  }
}

export async function handleSearchDrugLabels(params: DrugLabelsParams): Promise<FDAToolResponse<FormattedDrugLabel[]>> {
  loggers.tools("searchDrugLabels", params)

  try {
    const searchTerms: Array<{ field: string; value?: string }> = [
      { field: "openfda.brand_name", value: params.drugName },
      { field: "indications_and_usage", value: params.indication },
      { field: "openfda.substance_name", value: params.activeIngredient },
      { field: "openfda.route", value: params.route },
    ]

    const searchQuery = buildSearchQuery(searchTerms)

    const searchParams: SearchParams = {
      search: searchQuery || undefined,
      limit: params.limit,
      skip: params.skip,
    }

    const response = await fdaAPIClient.searchDrugLabels(searchParams)
    const results = response.results ?? []

    return {
      success: true,
      data: results.map(formatDrugLabel),
      totalResults: response.meta?.results?.total,
      displayedResults: results.length,
      searchParams,
      apiUsage: fdaAPIClient.getRateLimitInfo(),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// Drug NDC Handler
export type DrugNDCParams = {
  productNdc?: string
  brandName?: string
  genericName?: string
  labelerName?: string
  dosageForm?: string
  route?: string
  limit?: number
  skip?: number
}

type FormattedDrugNDC = {
  productNdc: string | undefined
  brandName: string | undefined
  genericName: string | undefined
  labelerName: string | undefined
  dosageForm: string | undefined
  route: string[]
  activeIngredients: Array<{ name: string | undefined; strength: string | undefined }>
  marketingStartDate: string | undefined
  productType: string | undefined
}

function formatDrugNDC(ndc: DrugNDC): FormattedDrugNDC {
  return {
    productNdc: ndc.product_ndc,
    brandName: ndc.brand_name,
    genericName: ndc.generic_name,
    labelerName: ndc.labeler_name,
    dosageForm: ndc.dosage_form,
    route: ndc.route ?? [],
    activeIngredients:
      ndc.active_ingredients?.slice(0, 3).map((ai) => ({
        name: ai.name,
        strength: ai.strength,
      })) ?? [],
    marketingStartDate: ndc.marketing_start_date,
    productType: ndc.product_type,
  }
}

export async function handleSearchDrugNDC(params: DrugNDCParams): Promise<FDAToolResponse<FormattedDrugNDC[]>> {
  loggers.tools("searchDrugNDC", params)

  try {
    const searchTerms: Array<{ field: string; value?: string }> = [
      { field: "product_ndc", value: params.productNdc },
      { field: "brand_name", value: params.brandName },
      { field: "generic_name", value: params.genericName },
      { field: "labeler_name", value: params.labelerName },
      { field: "dosage_form", value: params.dosageForm },
      { field: "route", value: params.route },
    ]

    const searchQuery = buildSearchQuery(searchTerms)

    const searchParams: SearchParams = {
      search: searchQuery || undefined,
      limit: params.limit,
      skip: params.skip,
    }

    const response = await fdaAPIClient.searchDrugNDC(searchParams)
    const results = response.results ?? []

    return {
      success: true,
      data: results.map(formatDrugNDC),
      totalResults: response.meta?.results?.total,
      displayedResults: results.length,
      searchParams,
      apiUsage: fdaAPIClient.getRateLimitInfo(),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// Drug Enforcement (Recalls) Handler
export type DrugEnforcementParams = {
  recallingFirm?: string
  classification?: "Class I" | "Class II" | "Class III"
  status?: "Ongoing" | "Completed" | "Terminated" | "Pending"
  state?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
  skip?: number
}

type FormattedDrugEnforcement = {
  recallNumber: string | undefined
  recallingFirm: string | undefined
  classification: string | undefined
  status: string | undefined
  productDescription: string | undefined
  reasonForRecall: string | undefined
  recallInitiationDate: string | undefined
  distributionPattern: string | undefined
  city: string | undefined
  state: string | undefined
}

function formatDrugEnforcement(recall: DrugEnforcement): FormattedDrugEnforcement {
  return {
    recallNumber: recall.recall_number,
    recallingFirm: recall.recalling_firm,
    classification: recall.classification,
    status: recall.status,
    productDescription: truncateText(recall.product_description),
    reasonForRecall: truncateText(recall.reason_for_recall),
    recallInitiationDate: recall.recall_initiation_date,
    distributionPattern: truncateText(recall.distribution_pattern),
    city: recall.city,
    state: recall.state,
  }
}

export async function handleSearchDrugEnforcement(
  params: DrugEnforcementParams,
): Promise<FDAToolResponse<FormattedDrugEnforcement[]>> {
  loggers.tools("searchDrugEnforcement", params)

  try {
    const searchTerms: Array<{ field: string; value?: string }> = [
      { field: "recalling_firm", value: params.recallingFirm },
      { field: "classification", value: params.classification },
      { field: "status", value: params.status },
      { field: "state", value: params.state },
    ]

    const searchQuery = buildSearchQuery(searchTerms)
    const dateQuery = buildDateQuery("recall_initiation_date", params.dateFrom, params.dateTo)
    const fullQuery = [searchQuery, dateQuery].filter(Boolean).join("+AND+")

    const searchParams: SearchParams = {
      search: fullQuery || undefined,
      limit: params.limit,
      skip: params.skip,
    }

    const response = await fdaAPIClient.searchDrugEnforcement(searchParams)
    const results = response.results ?? []

    return {
      success: true,
      data: results.map(formatDrugEnforcement),
      totalResults: response.meta?.results?.total,
      displayedResults: results.length,
      searchParams,
      apiUsage: fdaAPIClient.getRateLimitInfo(),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// Drugs@FDA Handler
export type DrugsFDAParams = {
  sponsorName?: string
  applicationNumber?: string
  brandName?: string
  marketingStatus?: string
  limit?: number
  skip?: number
}

type FormattedDrugsFDA = {
  applicationNumber: string | undefined
  sponsorName: string | undefined
  products: Array<{
    brandName: string | undefined
    dosageForm: string | undefined
    route: string | undefined
    marketingStatus: string | undefined
    activeIngredients: Array<{ name: string | undefined; strength: string | undefined }>
  }>
  latestSubmission:
    | {
        type: string | undefined
        status: string | undefined
        statusDate: string | undefined
      }
    | undefined
}

function formatDrugsFDA(drug: DrugsFDA): FormattedDrugsFDA {
  const latestSubmission = drug.submissions?.[0]

  return {
    applicationNumber: drug.application_number,
    sponsorName: drug.sponsor_name,
    products:
      drug.products?.slice(0, 3).map((p) => ({
        brandName: p.brand_name,
        dosageForm: p.dosage_form,
        route: p.route,
        marketingStatus: p.marketing_status,
        activeIngredients:
          p.active_ingredients?.slice(0, 3).map((ai) => ({
            name: ai.name,
            strength: ai.strength,
          })) ?? [],
      })) ?? [],
    latestSubmission: latestSubmission
      ? {
          type: latestSubmission.submission_type,
          status: latestSubmission.submission_status,
          statusDate: latestSubmission.submission_status_date,
        }
      : undefined,
  }
}

export async function handleSearchDrugsFDA(params: DrugsFDAParams): Promise<FDAToolResponse<FormattedDrugsFDA[]>> {
  loggers.tools("searchDrugsFDA", params)

  try {
    const searchTerms: Array<{ field: string; value?: string }> = [
      { field: "sponsor_name", value: params.sponsorName },
      { field: "application_number", value: params.applicationNumber },
      { field: "products.brand_name", value: params.brandName },
      { field: "products.marketing_status", value: params.marketingStatus },
    ]

    const searchQuery = buildSearchQuery(searchTerms)

    const searchParams: SearchParams = {
      search: searchQuery || undefined,
      limit: params.limit,
      skip: params.skip,
    }

    const response = await fdaAPIClient.searchDrugsFDA(searchParams)
    const results = response.results ?? []

    return {
      success: true,
      data: results.map(formatDrugsFDA),
      totalResults: response.meta?.results?.total,
      displayedResults: results.length,
      searchParams,
      apiUsage: fdaAPIClient.getRateLimitInfo(),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// Drug Shortages Handler
export type DrugShortagesParams = {
  genericName?: string
  status?: "Current" | "Resolved"
  limit?: number
  skip?: number
}

type FormattedDrugShortage = {
  genericName: string | undefined
  proprietaryName: string | undefined
  status: string | undefined
  description: string | undefined
  initialPostingDate: string | undefined
  resolvedShortageDate: string | undefined
}

function formatDrugShortage(shortage: DrugShortage): FormattedDrugShortage {
  return {
    genericName: shortage.generic_name,
    proprietaryName: shortage.proprietary_name,
    status: shortage.status,
    description: truncateText(shortage.description),
    initialPostingDate: shortage.initial_posting_date,
    resolvedShortageDate: shortage.resolved_shortage_date,
  }
}

export async function handleSearchDrugShortages(
  params: DrugShortagesParams,
): Promise<FDAToolResponse<FormattedDrugShortage[]>> {
  loggers.tools("searchDrugShortages", params)

  try {
    const searchTerms: Array<{ field: string; value?: string }> = [
      { field: "generic_name", value: params.genericName },
      { field: "status", value: params.status },
    ]

    const searchQuery = buildSearchQuery(searchTerms)

    const searchParams: SearchParams = {
      search: searchQuery || undefined,
      limit: params.limit,
      skip: params.skip,
    }

    const response = await fdaAPIClient.searchDrugShortages(searchParams)
    const results = response.results ?? []

    return {
      success: true,
      data: results.map(formatDrugShortage),
      totalResults: response.meta?.results?.total,
      displayedResults: results.length,
      searchParams,
      apiUsage: fdaAPIClient.getRateLimitInfo(),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
