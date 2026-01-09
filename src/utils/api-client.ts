/**
 * FDA API Client
 * HTTP client for interacting with FDA OpenAPI endpoints
 */

import type {
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
  SearchParams,
} from "../types/fda.js"
import { loggers } from "./logger.js"

const FDA_BASE_URL = "https://api.fda.gov"
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 100

type FDAEndpoint =
  | "/drug/event.json"
  | "/drug/label.json"
  | "/drug/ndc.json"
  | "/drug/enforcement.json"
  | "/drug/drugsfda.json"
  | "/drug/shortages.json"
  | "/device/510k.json"
  | "/device/classification.json"
  | "/device/event.json"
  | "/device/enforcement.json"

export class FDAAPIClient {
  private apiKey: string | undefined
  private baseUrl: string

  constructor() {
    this.apiKey = process.env.OPENFDA_API_KEY
    this.baseUrl = FDA_BASE_URL
  }

  /**
   * Build URL search parameters for the FDA API
   */
  private buildSearchParams(params: SearchParams): URLSearchParams {
    const urlParams = new URLSearchParams()

    if (params.search) {
      urlParams.set("search", params.search)
    }

    if (params.count) {
      urlParams.set("count", params.count)
    }

    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
    urlParams.set("limit", String(limit))

    if (params.skip !== undefined && params.skip > 0) {
      urlParams.set("skip", String(params.skip))
    }

    if (this.apiKey) {
      urlParams.set("api_key", this.apiKey)
    }

    return urlParams
  }

  /**
   * Make a request to an FDA API endpoint
   */
  private async request<T>(endpoint: FDAEndpoint, params: SearchParams): Promise<FDAResponse<T>> {
    const urlParams = this.buildSearchParams(params)
    const url = `${this.baseUrl}${endpoint}?${urlParams.toString()}`

    loggers.api(`Request: ${url.replace(this.apiKey ?? "", "[REDACTED]")}`)

    try {
      const response = await fetch(url)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))

        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Consider using an API key for higher limits.")
        }
        if (response.status === 404) {
          return { results: [] } // No results found
        }
        if (response.status === 400) {
          throw new Error(
            `Invalid request: ${(errorData as { error?: { message?: string } }).error?.message ?? "Bad request parameters"}`,
          )
        }

        throw new Error(`FDA API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as FDAResponse<T>
      loggers.api(`Response: ${data.meta?.results?.total ?? 0} total results`)
      return data
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`Failed to fetch from FDA API: ${String(error)}`)
    }
  }

  /**
   * Get rate limit info based on authentication status
   */
  getRateLimitInfo(): { authenticated: boolean; rateLimit: string } {
    return {
      authenticated: !!this.apiKey,
      rateLimit: this.apiKey ? "240/minute, 120,000/hour" : "40/minute, 1,000/hour",
    }
  }

  // Drug endpoints

  async searchDrugAdverseEvents(params: SearchParams): Promise<FDAResponse<DrugAdverseEvent>> {
    return this.request<DrugAdverseEvent>("/drug/event.json", params)
  }

  async searchDrugLabels(params: SearchParams): Promise<FDAResponse<DrugLabel>> {
    return this.request<DrugLabel>("/drug/label.json", params)
  }

  async searchDrugNDC(params: SearchParams): Promise<FDAResponse<DrugNDC>> {
    return this.request<DrugNDC>("/drug/ndc.json", params)
  }

  async searchDrugEnforcement(params: SearchParams): Promise<FDAResponse<DrugEnforcement>> {
    return this.request<DrugEnforcement>("/drug/enforcement.json", params)
  }

  async searchDrugsFDA(params: SearchParams): Promise<FDAResponse<DrugsFDA>> {
    return this.request<DrugsFDA>("/drug/drugsfda.json", params)
  }

  async searchDrugShortages(params: SearchParams): Promise<FDAResponse<DrugShortage>> {
    return this.request<DrugShortage>("/drug/shortages.json", params)
  }

  // Device endpoints

  async searchDevice510K(params: SearchParams): Promise<FDAResponse<Device510K>> {
    return this.request<Device510K>("/device/510k.json", params)
  }

  async searchDeviceClassifications(params: SearchParams): Promise<FDAResponse<DeviceClassification>> {
    return this.request<DeviceClassification>("/device/classification.json", params)
  }

  async searchDeviceAdverseEvents(params: SearchParams): Promise<FDAResponse<DeviceAdverseEvent>> {
    return this.request<DeviceAdverseEvent>("/device/event.json", params)
  }

  async searchDeviceEnforcement(params: SearchParams): Promise<FDAResponse<DeviceEnforcement>> {
    return this.request<DeviceEnforcement>("/device/enforcement.json", params)
  }
}

// Singleton instance
export const fdaAPIClient = new FDAAPIClient()
