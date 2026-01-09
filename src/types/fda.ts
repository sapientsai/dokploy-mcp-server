/**
 * FDA API Types
 * Type definitions for FDA OpenAPI responses
 */

// Generic FDA API Response wrapper
export type FDAResponse<T> = {
  meta?: {
    disclaimer?: string
    terms?: string
    license?: string
    last_updated?: string
    results?: {
      skip: number
      limit: number
      total: number
    }
  }
  results?: T[]
  error?: {
    code: string
    message: string
  }
}

// Common OpenFDA fields that appear across many endpoints
export type OpenFDAFields = {
  application_number?: string[]
  brand_name?: string[]
  generic_name?: string[]
  manufacturer_name?: string[]
  product_ndc?: string[]
  product_type?: string[]
  route?: string[]
  substance_name?: string[]
  rxcui?: string[]
  spl_id?: string[]
  spl_set_id?: string[]
  pharm_class_epc?: string[]
  pharm_class_cs?: string[]
  pharm_class_pe?: string[]
  pharm_class_moa?: string[]
  nui?: string[]
  unii?: string[]
}

// Drug Adverse Event (FAERS)
export type DrugAdverseEvent = {
  safetyreportid?: string
  safetyreportversion?: string
  receivedate?: string
  receivedateformat?: string
  receiptdate?: string
  receiptdateformat?: string
  serious?: string
  seriousnesscongenitalanomali?: string
  seriousnessdeath?: string
  seriousnessdisabling?: string
  seriousnesshospitalization?: string
  seriousnesslifethreatening?: string
  seriousnessother?: string
  transmissiondate?: string
  transmissiondateformat?: string
  duplicate?: string
  companynumb?: string
  occurcountry?: string
  primarysourcecountry?: string
  primarysource?: {
    qualification?: string
    reportercountry?: string
  }
  reporttype?: string
  sender?: {
    sendertype?: string
    senderorganization?: string
  }
  receiver?: {
    receivertype?: string
    receiverorganization?: string
  }
  patient?: {
    patientonsetage?: string
    patientonsetageunit?: string
    patientsex?: string
    patientweight?: string
    patientdeath?: {
      patientdeathdate?: string
      patientdeathdateformat?: string
    }
    drug?: Array<{
      actiondrug?: string
      activesubstance?: {
        activesubstancename?: string
      }
      drugadditional?: string
      drugadministrationroute?: string
      drugauthorizationnumb?: string
      drugbatchnumb?: string
      drugcharacterization?: string
      drugcumulativedosagenumb?: string
      drugcumulativedosageunit?: string
      drugdosageform?: string
      drugdosagetext?: string
      drugenddate?: string
      drugenddateformat?: string
      drugindication?: string
      drugintervaldosagedefinition?: string
      drugintervaldosageunitnumb?: string
      drugrecurreadministration?: string
      drugseparatedosagenumb?: string
      drugstartdate?: string
      drugstartdateformat?: string
      drugstructuredosagenumb?: string
      drugstructuredosageunit?: string
      drugtreatmentduration?: string
      drugtreatmentdurationunit?: string
      medicinalproduct?: string
      openfda?: OpenFDAFields
    }>
    reaction?: Array<{
      reactionmeddrapt?: string
      reactionmeddraversionpt?: string
      reactionoutcome?: string
    }>
  }
}

// Drug Label (SPL)
export type DrugLabel = {
  effective_time?: string
  id?: string
  set_id?: string
  version?: string
  spl_product_data_elements?: string[]
  active_ingredient?: string[]
  inactive_ingredient?: string[]
  purpose?: string[]
  indications_and_usage?: string[]
  warnings?: string[]
  boxed_warning?: string[]
  do_not_use?: string[]
  ask_doctor?: string[]
  ask_doctor_or_pharmacist?: string[]
  stop_use?: string[]
  pregnancy_or_breast_feeding?: string[]
  keep_out_of_reach_of_children?: string[]
  dosage_and_administration?: string[]
  storage_and_handling?: string[]
  questions?: string[]
  package_label_principal_display_panel?: string[]
  description?: string[]
  clinical_pharmacology?: string[]
  mechanism_of_action?: string[]
  pharmacodynamics?: string[]
  pharmacokinetics?: string[]
  contraindications?: string[]
  warnings_and_cautions?: string[]
  adverse_reactions?: string[]
  drug_interactions?: string[]
  use_in_specific_populations?: string[]
  overdosage?: string[]
  how_supplied?: string[]
  information_for_patients?: string[]
  clinical_studies?: string[]
  openfda?: OpenFDAFields
}

// NDC Directory
export type DrugNDC = {
  product_id?: string
  product_ndc?: string
  spl_id?: string
  product_type?: string
  finished?: string
  brand_name?: string
  brand_name_base?: string
  brand_name_suffix?: string
  generic_name?: string
  dosage_form?: string
  route?: string[]
  marketing_start_date?: string
  marketing_end_date?: string
  marketing_category?: string
  application_number?: string
  labeler_name?: string
  active_ingredients?: Array<{
    name?: string
    strength?: string
  }>
  packaging?: Array<{
    package_ndc?: string
    description?: string
    marketing_start_date?: string
    marketing_end_date?: string
    sample?: string
  }>
  pharm_class?: string[]
  openfda?: OpenFDAFields
}

// Drug Enforcement (Recalls)
export type DrugEnforcement = {
  classification?: string
  center_classification_date?: string
  report_date?: string
  postal_code?: string
  termination_date?: string
  recall_initiation_date?: string
  recall_number?: string
  city?: string
  more_code_info?: string
  event_id?: string
  distribution_pattern?: string
  recalling_firm?: string
  voluntary_mandated?: string
  state?: string
  reason_for_recall?: string
  initial_firm_notification?: string
  status?: string
  product_type?: string
  country?: string
  product_description?: string
  code_info?: string
  address_1?: string
  address_2?: string
  product_quantity?: string
  openfda?: OpenFDAFields
}

// Drug Shortage
export type DrugShortage = {
  generic_name?: string
  proprietary_name?: string
  status?: string
  description?: string
  presentation?: string
  resolved_shortage_date?: string
  initial_posting_date?: string
}

// Drugs@FDA
export type DrugsFDA = {
  application_number?: string
  sponsor_name?: string
  products?: Array<{
    product_number?: string
    reference_drug?: string
    brand_name?: string
    active_ingredients?: Array<{
      name?: string
      strength?: string
    }>
    reference_standard?: string
    dosage_form?: string
    route?: string
    marketing_status?: string
  }>
  submissions?: Array<{
    submission_type?: string
    submission_number?: string
    submission_status?: string
    submission_status_date?: string
    review_priority?: string
    submission_class_code?: string
    submission_class_code_description?: string
    application_docs?: Array<{
      id?: string
      url?: string
      date?: string
      type?: string
    }>
  }>
  openfda?: OpenFDAFields
}

// Device 510(k)
export type Device510K = {
  k_number?: string
  applicant?: string
  contact?: string
  address_1?: string
  address_2?: string
  city?: string
  state?: string
  zip_code?: string
  country_code?: string
  postal_code?: string
  date_received?: string
  decision_date?: string
  decision_code?: string
  decision_description?: string
  product_code?: string
  statement_or_summary?: string
  clearance_type?: string
  third_party_flag?: string
  expedited_review_flag?: string
  device_name?: string
  openfda?: {
    device_name?: string
    device_class?: string
    medical_specialty_description?: string
    regulation_number?: string
    fei_number?: string[]
  }
}

// Device Classification
export type DeviceClassification = {
  device_name?: string
  device_class?: string
  definition?: string
  gmp_exempt_flag?: string
  implant_flag?: string
  life_sustain_support_flag?: string
  medical_specialty?: string
  medical_specialty_description?: string
  product_code?: string
  regulation_number?: string
  review_code?: string
  review_panel?: string
  submission_type_id?: string
  third_party_flag?: string
  unclassified_reason?: string
  openfda?: {
    fei_number?: string[]
    k_number?: string[]
    pma_number?: string[]
    registration_number?: string[]
  }
}

// Device Adverse Event (MDR)
export type DeviceAdverseEvent = {
  adverse_event_flag?: string
  product_problem_flag?: string
  date_of_event?: string
  date_report?: string
  date_received?: string
  date_facility_aware?: string
  report_number?: string
  report_source_code?: string
  health_professional?: string
  reporter_occupation_code?: string
  initial_report_to_fda?: string
  reprocessed_and_reused_flag?: string
  manufacturer_name?: string
  manufacturer_address_1?: string
  manufacturer_city?: string
  manufacturer_state?: string
  manufacturer_zip_code?: string
  manufacturer_country?: string
  event_type?: string
  type_of_report?: string[]
  device?: Array<{
    brand_name?: string
    generic_name?: string
    manufacturer_d_name?: string
    manufacturer_d_address_1?: string
    manufacturer_d_city?: string
    manufacturer_d_state?: string
    manufacturer_d_zip_code?: string
    manufacturer_d_country?: string
    device_operator?: string
    model_number?: string
    catalog_number?: string
    lot_number?: string
    other_id_number?: string
    device_availability?: string
    device_evaluated_by_manufacturer?: string
    device_report_product_code?: string
    openfda?: {
      device_name?: string
      device_class?: string
      medical_specialty_description?: string
      regulation_number?: string
    }
  }>
  patient?: Array<{
    patient_sequence_number?: string
    date_received?: string
    sequence_number_treatment?: string
    sequence_number_outcome?: string[]
  }>
  mdr_text?: Array<{
    mdr_text_key?: string
    text_type_code?: string
    patient_sequence_number?: string
    text?: string
  }>
}

// Device Enforcement (Recalls)
export type DeviceEnforcement = {
  classification?: string
  center_classification_date?: string
  report_date?: string
  postal_code?: string
  termination_date?: string
  recall_initiation_date?: string
  recall_number?: string
  city?: string
  event_id?: string
  distribution_pattern?: string
  recalling_firm?: string
  voluntary_mandated?: string
  state?: string
  reason_for_recall?: string
  initial_firm_notification?: string
  status?: string
  product_type?: string
  country?: string
  product_description?: string
  code_info?: string
  product_quantity?: string
  openfda?: {
    device_name?: string
    device_class?: string
    medical_specialty_description?: string
    regulation_number?: string
    k_number?: string[]
    pma_number?: string[]
    fei_number?: string[]
    registration_number?: string[]
  }
}

// Search parameters for API calls
export type SearchParams = {
  search?: string
  count?: string
  limit?: number
  skip?: number
}

// Tool response wrapper
export type FDAToolResponse<T> = {
  success: boolean
  data?: T
  error?: string
  searchParams?: SearchParams
  totalResults?: number
  displayedResults?: number
  apiUsage?: {
    authenticated: boolean
    rateLimit: string
  }
}
