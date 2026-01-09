/**
 * OpenFDA MCP Server Library Exports
 * For programmatic use and extension
 */

// Server exports
export { createOpenFDAServer, type ServerOptions } from "./server.js"

// Handler exports
export {
  type Device510KParams,
  type DeviceAdverseEventsParams,
  type DeviceClassificationParams,
  type DeviceEnforcementParams,
  handleSearchDevice510K,
  handleSearchDeviceAdverseEvents,
  handleSearchDeviceClassifications,
  handleSearchDeviceEnforcement,
} from "./handlers/device-handlers.js"
export {
  type DrugAdverseEventsParams,
  type DrugEnforcementParams,
  type DrugLabelsParams,
  type DrugNDCParams,
  type DrugsFDAParams,
  type DrugShortagesParams,
  handleSearchDrugAdverseEvents,
  handleSearchDrugEnforcement,
  handleSearchDrugLabels,
  handleSearchDrugNDC,
  handleSearchDrugsFDA,
  handleSearchDrugShortages,
} from "./handlers/drug-handlers.js"

// Tool schema exports
export { toolSchemas } from "./tools/index.js"

// API client export
export { FDAAPIClient, fdaAPIClient } from "./utils/api-client.js"

// Type exports
export type {
  Device510K,
  DeviceAdverseEvent,
  DeviceClassification,
  DeviceEnforcement,
  DrugAdverseEvent,
  DrugEnforcement,
  DrugLabel,
  DrugNDC,
  DrugsFDA,
  DrugShortage,
  FDAResponse,
  FDAToolResponse,
  OpenFDAFields,
  SearchParams,
} from "./types/fda.js"

// Logger export
export { loggers } from "./utils/logger.js"
