/**
 * Drug Handlers
 * Query handlers for FDA drug-related endpoints
 */

import { Map, None, Option, Some } from "functype"

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
import { fdaAPIClient, type FDAClient } from "../utils/api-client.js"
import { mapFirst, nonEmpty, takeFirst } from "../utils/fields.js"
import { loggers } from "../utils/logger.js"
import {
  buildDateQuery,
  buildSearchQuery,
  escapeSearchTerm,
  joinQueries,
  type SearchTerm,
  toSearchResponse,
  truncateText,
} from "./query.js"

// Drug Adverse Events Handler
export type DrugAdverseEventsParams = {
  safetyReportId?: string
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

/** FAERS patientsex codes */
const PATIENT_SEX = Map<string, string>([
  ["1", "Male"],
  ["2", "Female"],
])

function formatDrugAdverseEvent(event: DrugAdverseEvent): FormattedDrugAdverseEvent {
  return {
    reportId: event.safetyreportid,
    receiveDate: event.receivedate,
    serious: event.serious === "1",
    drugs: mapFirst(event.patient?.drug, 3, (d) => ({
      name: d.medicinalproduct ?? d.activesubstance?.activesubstancename,
      indication: d.drugindication,
      route: d.drugadministrationroute,
    })),
    reactions: mapFirst(event.patient?.reaction, 3, (r) => ({
      reaction: r.reactionmeddrapt,
      outcome: r.reactionoutcome,
    })),
    patient: {
      age: nonEmpty(event.patient?.patientonsetage)
        .map((age) => `${age} ${Option(event.patient?.patientonsetageunit).orElse("")}`)
        .orUndefined(),
      sex: Option(event.patient?.patientsex)
        .flatMap((code) => PATIENT_SEX.get(code))
        .orUndefined(),
      weight: nonEmpty(event.patient?.patientweight)
        .map((weight) => `${weight} kg`)
        .orUndefined(),
    },
  }
}

export async function handleSearchDrugAdverseEvents(
  params: DrugAdverseEventsParams,
  client: FDAClient = fdaAPIClient,
): Promise<FDAToolResponse<FormattedDrugAdverseEvent[]>> {
  loggers.tools("searchDrugAdverseEvents", params)

  // If safetyReportId is provided, do a direct lookup
  if (params.safetyReportId) {
    const searchParams: SearchParams = {
      search: `safetyreportid:"${escapeSearchTerm(params.safetyReportId)}"`,
      limit: 1,
    }

    return toSearchResponse(
      await client.searchDrugAdverseEvents(searchParams),
      searchParams,
      formatDrugAdverseEvent,
      client,
    )
  }

  const searchTerms: SearchTerm[] = [
    { field: "patient.drug.medicinalproduct", value: params.drugName },
    { field: "patient.reaction.reactionmeddrapt", value: params.reaction },
    { field: "patient.drug.openfda.manufacturer_name", value: params.manufacturer },
    ...Option(params.serious)
      .map((serious): SearchTerm => ({ field: "serious", value: serious ? "1" : "2" }))
      .toArray(),
  ]

  const searchQuery = buildSearchQuery(searchTerms)
  const dateQuery = buildDateQuery("receivedate", params.dateFrom, params.dateTo)
  const fullQuery = joinQueries(searchQuery, dateQuery)

  const searchParams: SearchParams = {
    search: fullQuery || undefined,
    limit: params.limit,
    skip: params.skip,
  }

  return toSearchResponse(
    await client.searchDrugAdverseEvents(searchParams),
    searchParams,
    formatDrugAdverseEvent,
    client,
  )
}

// Drug Labels Handler
export type DrugLabelsParams = {
  setId?: string
  drugName?: string
  indication?: string
  activeIngredient?: string
  route?: string
  hasBoxedWarning?: boolean
  sections?: string[]
  limit?: number
  skip?: number
}

type FormattedDrugLabel = {
  setId: string | undefined
  brandName: string | undefined
  genericName: string | undefined
  manufacturer: string | undefined
  activeIngredients: string[]
  boxedWarning: string | undefined
  indications: string | undefined
  warnings: string | undefined
  contraindications: string | undefined
  adverseReactions: string | undefined
  drugInteractions: string | undefined
  dosageAndAdministration: string | undefined
  clinicalPharmacology: string | undefined
  mechanismOfAction: string | undefined
  pharmacokinetics: string | undefined
  overdosage: string | undefined
  description: string | undefined
  howSupplied: string | undefined
  storageAndHandling: string | undefined
  route: string[]
}

/** The DrugLabel fields that hold section text */
type LabelSection = {
  [K in keyof DrugLabel]-?: NonNullable<DrugLabel[K]> extends string[] ? K : never
}[keyof DrugLabel]

function formatDrugLabel(label: DrugLabel, sections?: string[]): FormattedDrugLabel {
  // A section is included when no filter is given, or the filter names it
  const section = (name: LabelSection, maxLength?: number): Option<string> =>
    Option(label[name])
      .filter(() => Option(sections).every((wanted) => wanted.includes(name)))
      .flatMap((values) => truncateText(values[0], maxLength))

  return {
    setId: label.set_id,
    brandName: label.openfda?.brand_name?.[0],
    genericName: label.openfda?.generic_name?.[0],
    manufacturer: label.openfda?.manufacturer_name?.[0],
    activeIngredients: takeFirst(label.openfda?.substance_name, 5),
    boxedWarning: section("boxed_warning", 500).orUndefined(),
    indications: section("indications_and_usage").orUndefined(),
    warnings: section("warnings").orUndefined(),
    contraindications: section("contraindications").orUndefined(),
    adverseReactions: section("adverse_reactions").orUndefined(),
    drugInteractions: section("drug_interactions").orUndefined(),
    dosageAndAdministration: section("dosage_and_administration").orUndefined(),
    clinicalPharmacology: section("clinical_pharmacology").orUndefined(),
    mechanismOfAction: section("mechanism_of_action").orUndefined(),
    pharmacokinetics: section("pharmacokinetics").orUndefined(),
    overdosage: section("overdosage").orUndefined(),
    description: section("description").orUndefined(),
    howSupplied: section("how_supplied").orUndefined(),
    storageAndHandling: section("storage_and_handling").orUndefined(),
    route: takeFirst(label.openfda?.route, 3),
  }
}

export async function handleSearchDrugLabels(
  params: DrugLabelsParams,
  client: FDAClient = fdaAPIClient,
): Promise<FDAToolResponse<FormattedDrugLabel[]>> {
  loggers.tools("searchDrugLabels", params)

  // If setId is provided, do a direct lookup
  if (params.setId) {
    const searchParams: SearchParams = {
      search: `set_id:"${escapeSearchTerm(params.setId)}"`,
      limit: 1,
    }

    return toSearchResponse(
      await client.searchDrugLabels(searchParams),
      searchParams,
      (label) => formatDrugLabel(label, params.sections),
      client,
    )
  }

  const searchTerms: SearchTerm[] = [
    { field: "openfda.brand_name", value: params.drugName },
    { field: "indications_and_usage", value: params.indication },
    { field: "openfda.substance_name", value: params.activeIngredient },
    { field: "openfda.route", value: params.route },
  ]

  const searchQuery = buildSearchQuery(searchTerms)

  // Build boxed warning existence query
  const boxedWarningQuery = params.hasBoxedWarning ? Some("_exists_:boxed_warning") : None<string>()

  const fullQuery = joinQueries(searchQuery, boxedWarningQuery)

  const searchParams: SearchParams = {
    search: fullQuery || undefined,
    limit: params.limit,
    skip: params.skip,
  }

  return toSearchResponse(
    await client.searchDrugLabels(searchParams),
    searchParams,
    (label) => formatDrugLabel(label, params.sections),
    client,
  )
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
    activeIngredients: mapFirst(ndc.active_ingredients, 3, (ai) => ({
      name: ai.name,
      strength: ai.strength,
    })),
    marketingStartDate: ndc.marketing_start_date,
    productType: ndc.product_type,
  }
}

export async function handleSearchDrugNDC(
  params: DrugNDCParams,
  client: FDAClient = fdaAPIClient,
): Promise<FDAToolResponse<FormattedDrugNDC[]>> {
  loggers.tools("searchDrugNDC", params)

  const searchTerms: SearchTerm[] = [
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

  return toSearchResponse(await client.searchDrugNDC(searchParams), searchParams, formatDrugNDC, client)
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
    productDescription: truncateText(recall.product_description).orUndefined(),
    reasonForRecall: truncateText(recall.reason_for_recall).orUndefined(),
    recallInitiationDate: recall.recall_initiation_date,
    distributionPattern: truncateText(recall.distribution_pattern).orUndefined(),
    city: recall.city,
    state: recall.state,
  }
}

export async function handleSearchDrugEnforcement(
  params: DrugEnforcementParams,
  client: FDAClient = fdaAPIClient,
): Promise<FDAToolResponse<FormattedDrugEnforcement[]>> {
  loggers.tools("searchDrugEnforcement", params)

  const searchTerms: SearchTerm[] = [
    { field: "recalling_firm", value: params.recallingFirm },
    { field: "classification", value: params.classification },
    { field: "status", value: params.status },
    { field: "state", value: params.state },
  ]

  const searchQuery = buildSearchQuery(searchTerms)
  const dateQuery = buildDateQuery("recall_initiation_date", params.dateFrom, params.dateTo)
  const fullQuery = joinQueries(searchQuery, dateQuery)

  const searchParams: SearchParams = {
    search: fullQuery || undefined,
    limit: params.limit,
    skip: params.skip,
  }

  return toSearchResponse(await client.searchDrugEnforcement(searchParams), searchParams, formatDrugEnforcement, client)
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
  return {
    applicationNumber: drug.application_number,
    sponsorName: drug.sponsor_name,
    products: mapFirst(drug.products, 3, (p) => ({
      brandName: p.brand_name,
      dosageForm: p.dosage_form,
      route: p.route,
      marketingStatus: p.marketing_status,
      activeIngredients: mapFirst(p.active_ingredients, 3, (ai) => ({
        name: ai.name,
        strength: ai.strength,
      })),
    })),
    latestSubmission: Option(drug.submissions?.[0])
      .map((latest) => ({
        type: latest.submission_type,
        status: latest.submission_status,
        statusDate: latest.submission_status_date,
      }))
      .orUndefined(),
  }
}

export async function handleSearchDrugsFDA(
  params: DrugsFDAParams,
  client: FDAClient = fdaAPIClient,
): Promise<FDAToolResponse<FormattedDrugsFDA[]>> {
  loggers.tools("searchDrugsFDA", params)

  const searchTerms: SearchTerm[] = [
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

  return toSearchResponse(await client.searchDrugsFDA(searchParams), searchParams, formatDrugsFDA, client)
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
    description: truncateText(shortage.description).orUndefined(),
    initialPostingDate: shortage.initial_posting_date,
    resolvedShortageDate: shortage.resolved_shortage_date,
  }
}

export async function handleSearchDrugShortages(
  params: DrugShortagesParams,
  client: FDAClient = fdaAPIClient,
): Promise<FDAToolResponse<FormattedDrugShortage[]>> {
  loggers.tools("searchDrugShortages", params)

  const searchTerms: SearchTerm[] = [
    { field: "generic_name", value: params.genericName },
    { field: "status", value: params.status },
  ]

  const searchQuery = buildSearchQuery(searchTerms)

  const searchParams: SearchParams = {
    search: searchQuery || undefined,
    limit: params.limit,
    skip: params.skip,
  }

  return toSearchResponse(await client.searchDrugShortages(searchParams), searchParams, formatDrugShortage, client)
}
