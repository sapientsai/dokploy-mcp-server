/**
 * Device Handlers
 * Query handlers for FDA device-related endpoints
 */

import type {
  Device510K,
  DeviceAdverseEvent,
  DeviceClassification,
  DeviceEnforcement,
  FDAToolResponse,
  SearchParams,
} from "../types/fda.js"
import { fdaAPIClient, type FDAClient } from "../utils/api-client.js"
import { mapFirst } from "../utils/fields.js"
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

// Device 510(k) Handler
export type Device510KParams = {
  deviceName?: string
  applicant?: string
  productCode?: string
  clearanceType?: string
  decisionDateFrom?: string
  decisionDateTo?: string
  limit?: number
  skip?: number
}

type FormattedDevice510K = {
  kNumber: string | undefined
  deviceName: string | undefined
  applicant: string | undefined
  productCode: string | undefined
  clearanceType: string | undefined
  decisionCode: string | undefined
  decisionDescription: string | undefined
  decisionDate: string | undefined
  dateReceived: string | undefined
  city: string | undefined
  state: string | undefined
  country: string | undefined
}

function formatDevice510K(device: Device510K): FormattedDevice510K {
  return {
    kNumber: device.k_number,
    deviceName: device.device_name ?? device.openfda?.device_name,
    applicant: device.applicant,
    productCode: device.product_code,
    clearanceType: device.clearance_type,
    decisionCode: device.decision_code,
    decisionDescription: device.decision_description,
    decisionDate: device.decision_date,
    dateReceived: device.date_received,
    city: device.city,
    state: device.state,
    country: device.country_code,
  }
}

export async function handleSearchDevice510K(
  params: Device510KParams,
  client: FDAClient = fdaAPIClient,
): Promise<FDAToolResponse<FormattedDevice510K[]>> {
  loggers.tools("searchDevice510K", params)

  const searchTerms: SearchTerm[] = [
    { field: "device_name", value: params.deviceName },
    { field: "applicant", value: params.applicant },
    { field: "product_code", value: params.productCode },
    { field: "clearance_type", value: params.clearanceType },
  ]

  const searchQuery = buildSearchQuery(searchTerms)
  const dateQuery = buildDateQuery("decision_date", params.decisionDateFrom, params.decisionDateTo)
  const fullQuery = joinQueries(searchQuery, dateQuery)

  const searchParams: SearchParams = {
    search: fullQuery || undefined,
    limit: params.limit,
    skip: params.skip,
  }

  return toSearchResponse(await client.searchDevice510K(searchParams), searchParams, formatDevice510K, client)
}

// Device Classification Handler
export type DeviceClassificationParams = {
  deviceName?: string
  deviceClass?: "1" | "2" | "3"
  medicalSpecialty?: string
  productCode?: string
  regulationNumber?: string
  limit?: number
  skip?: number
}

type FormattedDeviceClassification = {
  deviceName: string | undefined
  deviceClass: string | undefined
  definition: string | undefined
  medicalSpecialty: string | undefined
  medicalSpecialtyDescription: string | undefined
  productCode: string | undefined
  regulationNumber: string | undefined
  gmpExempt: boolean
  implant: boolean
  lifeSustaining: boolean
}

function formatDeviceClassification(classification: DeviceClassification): FormattedDeviceClassification {
  return {
    deviceName: classification.device_name,
    deviceClass: classification.device_class,
    definition: truncateText(classification.definition).orUndefined(),
    medicalSpecialty: classification.medical_specialty,
    medicalSpecialtyDescription: classification.medical_specialty_description,
    productCode: classification.product_code,
    regulationNumber: classification.regulation_number,
    gmpExempt: classification.gmp_exempt_flag === "Y",
    implant: classification.implant_flag === "Y",
    lifeSustaining: classification.life_sustain_support_flag === "Y",
  }
}

export async function handleSearchDeviceClassifications(
  params: DeviceClassificationParams,
  client: FDAClient = fdaAPIClient,
): Promise<FDAToolResponse<FormattedDeviceClassification[]>> {
  loggers.tools("searchDeviceClassifications", params)

  const searchTerms: SearchTerm[] = [
    { field: "device_name", value: params.deviceName },
    { field: "device_class", value: params.deviceClass },
    { field: "medical_specialty", value: params.medicalSpecialty },
    { field: "product_code", value: params.productCode },
    { field: "regulation_number", value: params.regulationNumber },
  ]

  const searchQuery = buildSearchQuery(searchTerms)

  const searchParams: SearchParams = {
    search: searchQuery || undefined,
    limit: params.limit,
    skip: params.skip,
  }

  return toSearchResponse(
    await client.searchDeviceClassifications(searchParams),
    searchParams,
    formatDeviceClassification,
    client,
  )
}

// Device Adverse Events (MDR) Handler
export type DeviceAdverseEventsParams = {
  reportNumber?: string
  deviceName?: string
  brandName?: string
  manufacturerName?: string
  eventType?: "Injury" | "Malfunction" | "Death" | "Other"
  dateFrom?: string
  dateTo?: string
  limit?: number
  skip?: number
}

type FormattedDeviceAdverseEvent = {
  reportNumber: string | undefined
  dateOfEvent: string | undefined
  dateReceived: string | undefined
  eventType: string | undefined
  adverseEventFlag: boolean
  productProblemFlag: boolean
  devices: Array<{
    brandName: string | undefined
    genericName: string | undefined
    manufacturerName: string | undefined
    modelNumber: string | undefined
    productCode: string | undefined
    deviceClass: string | undefined
  }>
  mdrText: Array<{
    textType: string | undefined
    text: string | undefined
  }>
}

function formatDeviceAdverseEvent(event: DeviceAdverseEvent): FormattedDeviceAdverseEvent {
  return {
    reportNumber: event.report_number,
    dateOfEvent: event.date_of_event,
    dateReceived: event.date_received,
    eventType: event.event_type,
    adverseEventFlag: event.adverse_event_flag === "Y",
    productProblemFlag: event.product_problem_flag === "Y",
    devices: mapFirst(event.device, 3, (d) => ({
      brandName: d.brand_name,
      genericName: d.generic_name,
      manufacturerName: d.manufacturer_d_name,
      modelNumber: d.model_number,
      productCode: d.device_report_product_code,
      deviceClass: d.openfda?.device_class,
    })),
    mdrText: mapFirst(event.mdr_text, 2, (t) => ({
      textType: t.text_type_code,
      text: truncateText(t.text, 300).orUndefined(),
    })),
  }
}

export async function handleSearchDeviceAdverseEvents(
  params: DeviceAdverseEventsParams,
  client: FDAClient = fdaAPIClient,
): Promise<FDAToolResponse<FormattedDeviceAdverseEvent[]>> {
  loggers.tools("searchDeviceAdverseEvents", params)

  // If reportNumber is provided, do a direct lookup
  if (params.reportNumber) {
    const searchParams: SearchParams = {
      search: `report_number:"${escapeSearchTerm(params.reportNumber)}"`,
      limit: 1,
    }

    return toSearchResponse(
      await client.searchDeviceAdverseEvents(searchParams),
      searchParams,
      formatDeviceAdverseEvent,
      client,
    )
  }

  const searchTerms: SearchTerm[] = [
    { field: "device.generic_name", value: params.deviceName },
    { field: "device.brand_name", value: params.brandName },
    { field: "device.manufacturer_d_name", value: params.manufacturerName },
    { field: "event_type", value: params.eventType },
  ]

  const searchQuery = buildSearchQuery(searchTerms)
  const dateQuery = buildDateQuery("date_received", params.dateFrom, params.dateTo)
  const fullQuery = joinQueries(searchQuery, dateQuery)

  const searchParams: SearchParams = {
    search: fullQuery || undefined,
    limit: params.limit,
    skip: params.skip,
  }

  return toSearchResponse(
    await client.searchDeviceAdverseEvents(searchParams),
    searchParams,
    formatDeviceAdverseEvent,
    client,
  )
}

// Device Enforcement (Recalls) Handler
export type DeviceEnforcementParams = {
  recallingFirm?: string
  productDescription?: string
  classification?: "Class I" | "Class II" | "Class III"
  status?: "Ongoing" | "Completed" | "Terminated" | "Pending"
  dateFrom?: string
  dateTo?: string
  limit?: number
  skip?: number
}

type FormattedDeviceEnforcement = {
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
  deviceName: string | undefined
  deviceClass: string | undefined
}

function formatDeviceEnforcement(recall: DeviceEnforcement): FormattedDeviceEnforcement {
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
    deviceName: recall.openfda?.device_name,
    deviceClass: recall.openfda?.device_class,
  }
}

export async function handleSearchDeviceEnforcement(
  params: DeviceEnforcementParams,
  client: FDAClient = fdaAPIClient,
): Promise<FDAToolResponse<FormattedDeviceEnforcement[]>> {
  loggers.tools("searchDeviceEnforcement", params)

  const searchTerms: SearchTerm[] = [
    { field: "recalling_firm", value: params.recallingFirm },
    { field: "product_description", value: params.productDescription },
    { field: "classification", value: params.classification },
    { field: "status", value: params.status },
  ]

  const searchQuery = buildSearchQuery(searchTerms)
  const dateQuery = buildDateQuery("recall_initiation_date", params.dateFrom, params.dateTo)
  const fullQuery = joinQueries(searchQuery, dateQuery)

  const searchParams: SearchParams = {
    search: fullQuery || undefined,
    limit: params.limit,
    skip: params.skip,
  }

  return toSearchResponse(
    await client.searchDeviceEnforcement(searchParams),
    searchParams,
    formatDeviceEnforcement,
    client,
  )
}
