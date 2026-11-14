/**
 * The openFDA tools, registered on a somamcp server.
 *
 * Runtime-agnostic on purpose: it takes the server rather than creating one, and nothing it
 * imports needs Node, so a Cloudflare Worker can serve the same tools the CLI does.
 */

import { Option } from "functype"
import type { SessionAuth, SomaServerInstance } from "somamcp"

import {
  handleSearchDrugPatentExpiry,
  handleSearchOrangeBook,
  handleSearchOrangeBookPatents,
  handleSearchPurpleBook,
} from "./handlers/bulk-data-handlers.js"
import {
  handleSearchDevice510K,
  handleSearchDeviceAdverseEvents,
  handleSearchDeviceClassifications,
  handleSearchDeviceEnforcement,
} from "./handlers/device-handlers.js"
import {
  handleSearchDrugAdverseEvents,
  handleSearchDrugEnforcement,
  handleSearchDrugLabels,
  handleSearchDrugNDC,
  handleSearchDrugsFDA,
  handleSearchDrugShortages,
} from "./handlers/drug-handlers.js"
import {
  searchDevice510KSchema,
  searchDeviceAdverseEventsSchema,
  searchDeviceClassificationsSchema,
  searchDeviceEnforcementSchema,
  searchDrugAdverseEventsSchema,
  searchDrugEnforcementSchema,
  searchDrugLabelsSchema,
  searchDrugNDCSchema,
  searchDrugPatentExpirySchema,
  searchDrugsFDASchema,
  searchDrugShortagesSchema,
  searchOrangeBookPatentsSchema,
  searchOrangeBookSchema,
  searchPurpleBookSchema,
} from "./tools/index.js"
import { fdaAPIClient, type FDAClient } from "./utils/api-client.js"

// Exported here too, so a Worker builds a per-caller client from this entry alone: the `./lib`
// entry also loads the Node-only server.
export { createFDAAPIClient, type FDAClient, type FDAClientOptions, type RateLimitInfo } from "./utils/api-client.js"
import { loggers } from "./utils/logger.js"

export type OpenFDAToolsOptions<T extends SessionAuth = SessionAuth> = {
  /**
   * The openFDA client for one tool call, given that call's session. A hosted server uses it to
   * send each caller's own API key: build a client per call, never one shared and changed, since
   * one Worker serves many callers at once. Defaults to one client that reads OPENFDA_API_KEY.
   */
  client?: (session: T | undefined) => FDAClient
}

/** Registers the 14 openFDA tools on `server`. */
export function registerOpenFDATools<T extends SessionAuth>(
  server: SomaServerInstance<T>,
  options: OpenFDAToolsOptions<T> = {},
): void {
  const clientOf = (session: T | undefined): FDAClient =>
    Option(options.client).fold(
      () => fdaAPIClient,
      (client) => client(session),
    )

  // Register Drug Tools

  server.addTool({
    name: "search_drug_adverse_events",
    description:
      "Search FDA Adverse Event Reporting System (FAERS) for drug safety reports. " +
      "Find adverse events by drug name, reaction type, manufacturer, date range, and seriousness. " +
      "Retrieve a specific report by safetyReportId. " +
      "Returns patient demographics, drug details, and reported reactions.",
    parameters: searchDrugAdverseEventsSchema,
    execute: async (args, context) => {
      loggers.tools("Executing search_drug_adverse_events", args)
      const result = await handleSearchDrugAdverseEvents(args, clientOf(context.session))
      return JSON.stringify(result, null, 2)
    },
  })

  server.addTool({
    name: "search_drug_labels",
    description:
      "Search FDA drug labeling (SPL) information including prescribing information, " +
      "indications, warnings, boxed warnings, dosage, and active ingredients. " +
      "Retrieve a specific label by setId. Filter for drugs with boxed warnings using hasBoxedWarning. " +
      "Request specific sections (e.g., indications_and_usage, adverse_reactions, boxed_warning) to limit response.",
    parameters: searchDrugLabelsSchema,
    execute: async (args, context) => {
      loggers.tools("Executing search_drug_labels", args)
      const result = await handleSearchDrugLabels(args, clientOf(context.session))
      return JSON.stringify(result, null, 2)
    },
  })

  server.addTool({
    name: "search_drug_ndc",
    description:
      "Search the National Drug Code (NDC) Directory for drug product identification. " +
      "Find drugs by NDC, brand name, generic name, labeler, dosage form, or route. " +
      "Returns product details, active ingredients, and packaging information.",
    parameters: searchDrugNDCSchema,
    execute: async (args, context) => {
      loggers.tools("Executing search_drug_ndc", args)
      const result = await handleSearchDrugNDC(args, clientOf(context.session))
      return JSON.stringify(result, null, 2)
    },
  })

  server.addTool({
    name: "search_drug_recalls",
    description:
      "Search FDA drug recall and enforcement reports. " +
      "Find recalls by company, classification (I-III), status, state, and date range. " +
      "Class I is most serious (may cause death), Class III is least serious.",
    parameters: searchDrugEnforcementSchema,
    execute: async (args, context) => {
      loggers.tools("Executing search_drug_recalls", args)
      const result = await handleSearchDrugEnforcement(args, clientOf(context.session))
      return JSON.stringify(result, null, 2)
    },
  })

  server.addTool({
    name: "search_drugs_at_fda",
    description:
      "Search the Drugs@FDA database for approved drug applications. " +
      "Find approved drugs by sponsor, application number, brand name, or marketing status. " +
      "Returns application details, products, and submission history.",
    parameters: searchDrugsFDASchema,
    execute: async (args, context) => {
      loggers.tools("Executing search_drugs_at_fda", args)
      const result = await handleSearchDrugsFDA(args, clientOf(context.session))
      return JSON.stringify(result, null, 2)
    },
  })

  server.addTool({
    name: "search_drug_shortages",
    description:
      "Search the FDA Drug Shortage Database for current and resolved drug shortages. " +
      "Find shortages by generic drug name or status (Current/Resolved). " +
      "Returns shortage details, posting dates, and resolution information.",
    parameters: searchDrugShortagesSchema,
    execute: async (args, context) => {
      loggers.tools("Executing search_drug_shortages", args)
      const result = await handleSearchDrugShortages(args, clientOf(context.session))
      return JSON.stringify(result, null, 2)
    },
  })

  // Register Device Tools

  server.addTool({
    name: "search_device_510k",
    description:
      "Search FDA 510(k) premarket notification database for medical device clearances. " +
      "Find device clearances by device name, applicant, product code, clearance type, or decision date. " +
      "Returns clearance decisions and device classification details.",
    parameters: searchDevice510KSchema,
    execute: async (args, context) => {
      loggers.tools("Executing search_device_510k", args)
      const result = await handleSearchDevice510K(args, clientOf(context.session))
      return JSON.stringify(result, null, 2)
    },
  })

  server.addTool({
    name: "search_device_classifications",
    description:
      "Search FDA medical device classification database. " +
      "Find devices by name, class (1-3), medical specialty, product code, or regulation number. " +
      "Class 1 is lowest risk, Class 3 is highest risk (implants, life-sustaining).",
    parameters: searchDeviceClassificationsSchema,
    execute: async (args, context) => {
      loggers.tools("Executing search_device_classifications", args)
      const result = await handleSearchDeviceClassifications(args, clientOf(context.session))
      return JSON.stringify(result, null, 2)
    },
  })

  server.addTool({
    name: "search_device_adverse_events",
    description:
      "Search FDA Medical Device Report (MDR) database for device adverse events. " +
      "Find adverse events by device name, brand, manufacturer, event type (Injury/Death/Malfunction), and date. " +
      "Retrieve a specific MDR report by reportNumber. " +
      "Returns device details, event descriptions, and patient outcomes.",
    parameters: searchDeviceAdverseEventsSchema,
    execute: async (args, context) => {
      loggers.tools("Executing search_device_adverse_events", args)
      const result = await handleSearchDeviceAdverseEvents(args, clientOf(context.session))
      return JSON.stringify(result, null, 2)
    },
  })

  server.addTool({
    name: "search_device_recalls",
    description:
      "Search FDA medical device recall and enforcement reports. " +
      "Find recalls by company, product description, classification (I-III), status, and date. " +
      "Class I is most serious (may cause death), Class III is least serious.",
    parameters: searchDeviceEnforcementSchema,
    execute: async (args, context) => {
      loggers.tools("Executing search_device_recalls", args)
      const result = await handleSearchDeviceEnforcement(args, clientOf(context.session))
      return JSON.stringify(result, null, 2)
    },
  })

  // Register Bulk Data Tools (Orange Book & Purple Book)

  server.addTool({
    name: "search_fda_orange_book",
    description:
      "Search FDA Orange Book for approved drug products with therapeutic equivalence evaluations. " +
      "Find drugs by trade name, ingredient, applicant, application number, or TE code. " +
      "Returns product details, patent counts, and exclusivity counts. " +
      "Data is downloaded from FDA bulk files and cached for 24 hours.",
    parameters: searchOrangeBookSchema,
    execute: async (args) => {
      loggers.tools("Executing search_fda_orange_book", args)
      const result = await handleSearchOrangeBook(args)
      return JSON.stringify(result, null, 2)
    },
  })

  server.addTool({
    name: "search_fda_orange_book_patents",
    description:
      "Search FDA Orange Book patent data for drug products. " +
      "Find patents by drug name, application number, or patent number. " +
      "Returns patent details including expiry dates, substance/product/use flags, and associated exclusivities.",
    parameters: searchOrangeBookPatentsSchema,
    execute: async (args) => {
      loggers.tools("Executing search_fda_orange_book_patents", args)
      const result = await handleSearchOrangeBookPatents(args)
      return JSON.stringify(result, null, 2)
    },
  })

  server.addTool({
    name: "search_fda_purple_book",
    description:
      "Search FDA Purple Book for licensed biological products. " +
      "Find biologics by product name, applicant, BLA number, license type (351(a)/351(k)), " +
      "biosimilar status, or interchangeability. " +
      "Returns product details, licensing status, and reference product information.",
    parameters: searchPurpleBookSchema,
    execute: async (args) => {
      loggers.tools("Executing search_fda_purple_book", args)
      const result = await handleSearchPurpleBook(args)
      return JSON.stringify(result, null, 2)
    },
  })

  server.addTool({
    name: "search_fda_drug_patent_expiry",
    description:
      "Unified patent expiry and exclusivity view across FDA Orange Book and optionally Purple Book. " +
      "Search by drug name or application number. " +
      "Returns patents sorted by earliest expiry date with associated exclusivity data. " +
      "Set includePurpleBook=true to also include biologics data.",
    parameters: searchDrugPatentExpirySchema,
    execute: async (args) => {
      loggers.tools("Executing search_fda_drug_patent_expiry", args)
      const result = await handleSearchDrugPatentExpiry(args)
      return JSON.stringify(result, null, 2)
    },
  })

  loggers.core("OpenFDA MCP server configured with 14 FDA tools plus SomaMCP's info tool")
}
