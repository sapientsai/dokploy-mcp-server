/**
 * MCP Tool Definitions
 * Zod schemas for all FDA MCP tools
 */

import { z } from "zod"

// Common pagination schema
const paginationSchema = {
  limit: z.number().int().min(1).max(100).optional().describe("Maximum results to return (1-100, default 10)"),
  skip: z.number().int().min(0).optional().describe("Number of results to skip for pagination"),
}

// Date range schema
const dateRangeSchema = {
  dateFrom: z.string().optional().describe("Start date (YYYY-MM-DD or YYYYMMDD format)"),
  dateTo: z.string().optional().describe("End date (YYYY-MM-DD or YYYYMMDD format)"),
}

// Drug Tool Schemas

export const searchDrugAdverseEventsSchema = z.object({
  safetyReportId: z
    .string()
    .optional()
    .describe("Unique safety report ID for retrieving a specific adverse event report"),
  drugName: z.string().optional().describe("Drug or product name to search"),
  reaction: z.string().optional().describe("Adverse reaction to search (e.g., 'headache', 'nausea')"),
  manufacturer: z.string().optional().describe("Drug manufacturer name"),
  serious: z.boolean().optional().describe("Filter for serious adverse events only"),
  ...dateRangeSchema,
  ...paginationSchema,
})

// Available label sections for filtering
export const labelSections = [
  "indications_and_usage",
  "dosage_and_administration",
  "contraindications",
  "warnings",
  "warnings_and_cautions",
  "adverse_reactions",
  "drug_interactions",
  "clinical_pharmacology",
  "mechanism_of_action",
  "pharmacokinetics",
  "overdosage",
  "description",
  "how_supplied",
  "storage_and_handling",
  "boxed_warning",
] as const

export const searchDrugLabelsSchema = z.object({
  setId: z.string().optional().describe("Unique label identifier (set_id) for retrieving a specific drug label"),
  drugName: z.string().optional().describe("Drug brand or generic name"),
  indication: z.string().optional().describe("Medical indication or use case"),
  activeIngredient: z.string().optional().describe("Active ingredient/substance name"),
  route: z.string().optional().describe("Route of administration (e.g., 'oral', 'intravenous')"),
  hasBoxedWarning: z
    .boolean()
    .optional()
    .describe("Filter for drugs with boxed warnings (most serious safety warnings)"),
  sections: z
    .array(z.enum(labelSections))
    .optional()
    .describe("Specific label sections to return (e.g., ['indications_and_usage', 'warnings', 'adverse_reactions'])"),
  ...paginationSchema,
})

export const searchDrugNDCSchema = z.object({
  productNdc: z.string().optional().describe("National Drug Code (NDC)"),
  brandName: z.string().optional().describe("Drug brand name"),
  genericName: z.string().optional().describe("Drug generic name"),
  labelerName: z.string().optional().describe("Drug labeler/manufacturer name"),
  dosageForm: z.string().optional().describe("Dosage form (e.g., 'tablet', 'capsule', 'injection')"),
  route: z.string().optional().describe("Route of administration"),
  ...paginationSchema,
})

export const searchDrugEnforcementSchema = z.object({
  recallingFirm: z.string().optional().describe("Name of the recalling company"),
  classification: z
    .enum(["Class I", "Class II", "Class III"])
    .optional()
    .describe("Recall classification (I=most serious, III=least)"),
  status: z.enum(["Ongoing", "Completed", "Terminated", "Pending"]).optional().describe("Recall status"),
  state: z.string().optional().describe("US state code (e.g., 'CA', 'NY')"),
  ...dateRangeSchema,
  ...paginationSchema,
})

export const searchDrugsFDASchema = z.object({
  sponsorName: z.string().optional().describe("Drug sponsor/company name"),
  applicationNumber: z.string().optional().describe("FDA application number (e.g., 'NDA012345')"),
  brandName: z.string().optional().describe("Drug brand name"),
  marketingStatus: z.string().optional().describe("Marketing status (e.g., 'Prescription', 'OTC')"),
  ...paginationSchema,
})

export const searchDrugShortagesSchema = z.object({
  genericName: z.string().optional().describe("Generic drug name"),
  status: z.enum(["Current", "Resolved"]).optional().describe("Shortage status"),
  ...paginationSchema,
})

// Device Tool Schemas

export const searchDevice510KSchema = z.object({
  deviceName: z.string().optional().describe("Device name to search"),
  applicant: z.string().optional().describe("Applicant/company name"),
  productCode: z.string().optional().describe("FDA product code"),
  clearanceType: z.string().optional().describe("Clearance type (e.g., 'Traditional', 'Special')"),
  decisionDateFrom: z.string().optional().describe("Decision date range start (YYYY-MM-DD)"),
  decisionDateTo: z.string().optional().describe("Decision date range end (YYYY-MM-DD)"),
  ...paginationSchema,
})

export const searchDeviceClassificationsSchema = z.object({
  deviceName: z.string().optional().describe("Device name to search"),
  deviceClass: z.enum(["1", "2", "3"]).optional().describe("Device class (1=lowest risk, 3=highest)"),
  medicalSpecialty: z.string().optional().describe("Medical specialty code"),
  productCode: z.string().optional().describe("FDA product code"),
  regulationNumber: z.string().optional().describe("CFR regulation number"),
  ...paginationSchema,
})

export const searchDeviceAdverseEventsSchema = z.object({
  reportNumber: z
    .string()
    .optional()
    .describe("MDR report number for retrieving a specific device adverse event report"),
  deviceName: z.string().optional().describe("Device generic name"),
  brandName: z.string().optional().describe("Device brand name"),
  manufacturerName: z.string().optional().describe("Device manufacturer name"),
  eventType: z.enum(["Injury", "Malfunction", "Death", "Other"]).optional().describe("Type of adverse event"),
  ...dateRangeSchema,
  ...paginationSchema,
})

export const searchDeviceEnforcementSchema = z.object({
  recallingFirm: z.string().optional().describe("Name of the recalling company"),
  productDescription: z.string().optional().describe("Product description keywords"),
  classification: z
    .enum(["Class I", "Class II", "Class III"])
    .optional()
    .describe("Recall classification (I=most serious)"),
  status: z.enum(["Ongoing", "Completed", "Terminated", "Pending"]).optional().describe("Recall status"),
  ...dateRangeSchema,
  ...paginationSchema,
})

// Export all schemas for use in tool registration
export const toolSchemas = {
  searchDrugAdverseEvents: searchDrugAdverseEventsSchema,
  searchDrugLabels: searchDrugLabelsSchema,
  searchDrugNDC: searchDrugNDCSchema,
  searchDrugEnforcement: searchDrugEnforcementSchema,
  searchDrugsFDA: searchDrugsFDASchema,
  searchDrugShortages: searchDrugShortagesSchema,
  searchDevice510K: searchDevice510KSchema,
  searchDeviceClassifications: searchDeviceClassificationsSchema,
  searchDeviceAdverseEvents: searchDeviceAdverseEventsSchema,
  searchDeviceEnforcement: searchDeviceEnforcementSchema,
}

// Export inferred types
export type SearchDrugAdverseEventsParams = z.infer<typeof searchDrugAdverseEventsSchema>
export type SearchDrugLabelsParams = z.infer<typeof searchDrugLabelsSchema>
export type SearchDrugNDCParams = z.infer<typeof searchDrugNDCSchema>
export type SearchDrugEnforcementParams = z.infer<typeof searchDrugEnforcementSchema>
export type SearchDrugsFDAParams = z.infer<typeof searchDrugsFDASchema>
export type SearchDrugShortagesParams = z.infer<typeof searchDrugShortagesSchema>
export type SearchDevice510KParams = z.infer<typeof searchDevice510KSchema>
export type SearchDeviceClassificationsParams = z.infer<typeof searchDeviceClassificationsSchema>
export type SearchDeviceAdverseEventsParams = z.infer<typeof searchDeviceAdverseEventsSchema>
export type SearchDeviceEnforcementParams = z.infer<typeof searchDeviceEnforcementSchema>
export type LabelSection = (typeof labelSections)[number]
