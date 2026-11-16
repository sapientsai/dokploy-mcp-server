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
  anyFieldQuery,
  buildDateQuery,
  buildSearchQuery,
  clipFields,
  type ClippedText,
  clipText,
  escapeSearchTerm,
  joinQueries,
  type SearchTerm,
  toSearchResponse,
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
  /** How many drugs and reactions the report lists; `drugs` and `reactions` may show fewer */
  drugCount: number
  reactionCount: number
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

/** FAERS patientonsetageunit codes */
const AGE_UNITS = Map<string, string>([
  ["800", "decade"],
  ["801", "year"],
  ["802", "month"],
  ["803", "week"],
  ["804", "day"],
  ["805", "hour"],
])

/** FAERS reactionoutcome codes */
const REACTION_OUTCOMES = Map<string, string>([
  ["1", "Recovered/resolved"],
  ["2", "Recovering/resolving"],
  ["3", "Not recovered/not resolved"],
  ["4", "Recovered/resolved with sequelae (consequent health issues)"],
  ["5", "Fatal"],
  ["6", "Unknown"],
])

/** "63 years" from FAERS's "63" and unit code "801"; an unknown unit code is kept, so it isn't lost */
function formatAge(age: string | undefined, unitCode: string | undefined): Option<string> {
  return nonEmpty(age).map((value) =>
    nonEmpty(unitCode).fold(
      () => value,
      (code) =>
        AGE_UNITS.get(code).fold(
          () => `${value} (age unit code ${code})`,
          (unit) => `${value} ${unit}${value === "1" ? "" : "s"}`,
        ),
    ),
  )
}

/** How many drugs and reactions a formatted report shows, besides the ones that match the search */
const LIST_PREVIEW = 3

/** At most this many later matches are added, for reports that list one drug many times */
const MAX_MATCHES = 10

/**
 * The first few items, plus later items that match the search (up to MAX_MATCHES), in the
 * report's own order. Reports often list more drugs than the preview, so a search for one drug
 * must not drop it.
 */
function previewWithMatches<T>(items: readonly T[] | undefined, matches: (item: T) => boolean): T[] {
  if (!Array.isArray(items)) return []
  const laterMatches = items
    .map((item, i) => (i >= LIST_PREVIEW && matches(item) ? i : -1))
    .filter((i) => i >= 0)
    .slice(0, MAX_MATCHES)
  return items.filter((_, i) => i < LIST_PREVIEW || laterMatches.includes(i))
}

/**
 * Text as openFDA compares it: lowercase words, with any run of punctuation or spaces between
 * them read as one space. So "co-codamol" matches "CO CODAMOL", and "lipitor 10" matches
 * "ATORVASTATIN CALCIUM (LIPITOR) 10 MG".
 */
function searchWords(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

/** Whether any of the values contains the search's words, as openFDA matched them; false for all without a search */
function containsSearch(search: string | undefined): (values: readonly string[]) => boolean {
  return nonEmpty(search)
    .map(searchWords)
    .filter((words) => words !== "")
    .fold(
      () => () => false,
      (needle) => (values) => values.some((v) => ` ${searchWords(v)} `.includes(` ${needle} `)),
    )
}

function formatDrugAdverseEvent(
  params: DrugAdverseEventsParams,
): (event: DrugAdverseEvent) => FormattedDrugAdverseEvent {
  const drugMatches = containsSearch(params.drugName)
  const reactionMatches = containsSearch(params.reaction)

  return (event) => ({
    reportId: event.safetyreportid,
    receiveDate: event.receivedate,
    serious: event.serious === "1",
    drugCount: Array.isArray(event.patient?.drug) ? event.patient.drug.length : 0,
    reactionCount: Array.isArray(event.patient?.reaction) ? event.patient.reaction.length : 0,
    drugs: previewWithMatches(event.patient?.drug, (d) =>
      drugMatches([d.medicinalproduct, d.activesubstance?.activesubstancename].filter((v) => v !== undefined)),
    ).map((d) => ({
      name: d.medicinalproduct ?? d.activesubstance?.activesubstancename,
      indication: d.drugindication,
      route: d.drugadministrationroute,
    })),
    reactions: previewWithMatches(event.patient?.reaction, (r) =>
      reactionMatches([r.reactionmeddrapt].filter((v) => v !== undefined)),
    ).map((r) => ({
      reaction: r.reactionmeddrapt,
      outcome: nonEmpty(r.reactionoutcome)
        .map((code) => REACTION_OUTCOMES.get(code).orElse(code))
        .orUndefined(),
    })),
    patient: {
      age: formatAge(event.patient?.patientonsetage, event.patient?.patientonsetageunit).orUndefined(),
      sex: Option(event.patient?.patientsex)
        .flatMap((code) => PATIENT_SEX.get(code))
        .orUndefined(),
      weight: nonEmpty(event.patient?.patientweight)
        .map((weight) => `${weight} kg`)
        .orUndefined(),
    },
  })
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
      formatDrugAdverseEvent(params),
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
    formatDrugAdverseEvent(params),
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
  fullText?: boolean
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
  /** The sections cut short (boxed warning at 500 characters, others at 200); absent when none were */
  truncated: LabelField[] | undefined
}

/** The label fields that hold section text */
type LabelField =
  | "boxedWarning"
  | "indications"
  | "warnings"
  | "contraindications"
  | "adverseReactions"
  | "drugInteractions"
  | "dosageAndAdministration"
  | "clinicalPharmacology"
  | "mechanismOfAction"
  | "pharmacokinetics"
  | "overdosage"
  | "description"
  | "howSupplied"
  | "storageAndHandling"

/** The DrugLabel fields that hold section text */
type LabelSection = {
  [K in keyof DrugLabel]-?: NonNullable<DrugLabel[K]> extends string[] ? K : never
}[keyof DrugLabel]

function formatDrugLabel(params: DrugLabelsParams): (label: DrugLabel) => FormattedDrugLabel {
  // With fullText, sections come back whole; otherwise they are cut, and `truncated` says which
  const limit = (maxLength: number): number => (params.fullText === true ? Number.POSITIVE_INFINITY : maxLength)

  return (label) => {
    // A section is included when no filter is given, or the filter names it
    const section = (name: LabelSection, maxLength = 200): Option<ClippedText> =>
      Option(label[name])
        .filter(() => Option(params.sections).every((wanted) => wanted.includes(name)))
        .flatMap((values) => clipText(values[0], limit(maxLength)))

    const clipped = clipFields<LabelField>({
      boxedWarning: section("boxed_warning", 500),
      indications: section("indications_and_usage"),
      warnings: section("warnings"),
      contraindications: section("contraindications"),
      adverseReactions: section("adverse_reactions"),
      drugInteractions: section("drug_interactions"),
      dosageAndAdministration: section("dosage_and_administration"),
      clinicalPharmacology: section("clinical_pharmacology"),
      mechanismOfAction: section("mechanism_of_action"),
      pharmacokinetics: section("pharmacokinetics"),
      overdosage: section("overdosage"),
      description: section("description"),
      howSupplied: section("how_supplied"),
      storageAndHandling: section("storage_and_handling"),
    })

    return {
      setId: label.set_id,
      brandName: label.openfda?.brand_name?.[0],
      genericName: label.openfda?.generic_name?.[0],
      manufacturer: label.openfda?.manufacturer_name?.[0],
      activeIngredients: takeFirst(label.openfda?.substance_name, 5),
      ...clipped.text,
      route: takeFirst(label.openfda?.route, 3),
      truncated: clipped.truncated,
    }
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

    return toSearchResponse(await client.searchDrugLabels(searchParams), searchParams, formatDrugLabel(params), client)
  }

  const searchTerms: SearchTerm[] = [
    { field: "indications_and_usage", value: params.indication },
    { field: "openfda.substance_name", value: params.activeIngredient },
    { field: "openfda.route", value: params.route },
  ]

  const searchQuery = buildSearchQuery(searchTerms)

  // Build boxed warning existence query
  const boxedWarningQuery = params.hasBoxedWarning ? Some("_exists_:boxed_warning") : None<string>()

  // A drug name matches the brand or the generic name: a generic name alone misses a drug that
  // is sold mainly under its brand
  const drugNameQuery = anyFieldQuery(["openfda.brand_name", "openfda.generic_name"], params.drugName)

  const fullQuery = joinQueries(searchQuery, drugNameQuery, boxedWarningQuery)

  const searchParams: SearchParams = {
    search: fullQuery || undefined,
    limit: params.limit,
    skip: params.skip,
  }

  return toSearchResponse(await client.searchDrugLabels(searchParams), searchParams, formatDrugLabel(params), client)
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
  /** The fields cut at 200 characters; absent when none were */
  truncated: Array<"productDescription" | "reasonForRecall" | "distributionPattern"> | undefined
}

function formatDrugEnforcement(recall: DrugEnforcement): FormattedDrugEnforcement {
  const clipped = clipFields({
    productDescription: clipText(recall.product_description),
    reasonForRecall: clipText(recall.reason_for_recall),
    distributionPattern: clipText(recall.distribution_pattern),
  })
  return {
    recallNumber: recall.recall_number,
    recallingFirm: recall.recalling_firm,
    classification: recall.classification,
    status: recall.status,
    productDescription: clipped.text.productDescription,
    reasonForRecall: clipped.text.reasonForRecall,
    recallInitiationDate: recall.recall_initiation_date,
    distributionPattern: clipped.text.distributionPattern,
    city: recall.city,
    state: recall.state,
    truncated: clipped.truncated,
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
  /** The fields cut at 200 characters; absent when none were */
  truncated: Array<"description"> | undefined
}

function formatDrugShortage(shortage: DrugShortage): FormattedDrugShortage {
  const clipped = clipFields({ description: clipText(shortage.description) })
  return {
    genericName: shortage.generic_name,
    proprietaryName: shortage.proprietary_name,
    status: shortage.status,
    description: clipped.text.description,
    initialPostingDate: shortage.initial_posting_date,
    resolvedShortageDate: shortage.resolved_shortage_date,
    truncated: clipped.truncated,
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
