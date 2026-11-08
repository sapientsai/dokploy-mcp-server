/**
 * FDA API Client
 * HTTP client for interacting with FDA OpenAPI endpoints
 */

import { type Either, Left, Option, Right, Try } from "functype"

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
import { toError } from "./errors.js"
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

type RateLimitInfo = { authenticated: boolean; rateLimit: string }

type ErrorBody = { error?: { message?: string } }

/** The error for a non-OK status other than 404, which means "no results" */
function errorForStatus(status: number, statusText: string, body: unknown): Error {
  if (status === 429) return new Error("Rate limit exceeded. Consider using an API key for higher limits.")
  if (status === 400) {
    const message = Option(body as ErrorBody | null)
      .flatMap((b) => Option(b.error))
      .flatMap((e) => Option(e.message))
      .orElse("Bad request parameters")
    return new Error(`Invalid request: ${message}`)
  }
  return new Error(`FDA API error: ${status} ${statusText}`)
}

export class FDAAPIClient {
  private readonly apiKey: Option<string>
  private readonly baseUrl: string

  constructor() {
    this.apiKey = Option(process.env.OPENFDA_API_KEY).filter((key) => key !== "")
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

    this.apiKey.toArray().forEach((key) => urlParams.set("api_key", key))

    return urlParams
  }

  private redact(url: string): string {
    return this.apiKey.fold(
      () => url,
      (key) => url.replace(key, "[REDACTED]"),
    )
  }

  /**
   * Make a request to an FDA API endpoint
   */
  private async request<T>(endpoint: FDAEndpoint, params: SearchParams): Promise<Either<Error, FDAResponse<T>>> {
    const urlParams = this.buildSearchParams(params)
    const url = `${this.baseUrl}${endpoint}?${urlParams.toString()}`

    loggers.api(`Request: ${this.redact(url)}`)

    const fetched = (await Try.fromPromise(fetch(url))).toEither(toError)
    return fetched.flatMapAsync((response) => this.readResponse<T>(response))
  }

  private async readResponse<T>(response: Response): Promise<Either<Error, FDAResponse<T>>> {
    if (response.status === 404) return Right({ results: [] }) // No results found

    if (!response.ok) {
      const body = (await Try.fromPromise(response.json() as Promise<unknown>)).orElse({})
      return Left(errorForStatus(response.status, response.statusText, body))
    }

    const parsed = (await Try.fromPromise(response.json() as Promise<FDAResponse<T>>)).toEither(toError)
    return parsed.map((data) => {
      loggers.api(`Response: ${data.meta?.results?.total ?? 0} total results`)
      return data
    })
  }

  /**
   * Get rate limit info based on authentication status
   */
  getRateLimitInfo(): RateLimitInfo {
    return this.apiKey.fold(
      (): RateLimitInfo => ({ authenticated: false, rateLimit: "40/minute, 1,000/hour" }),
      (): RateLimitInfo => ({ authenticated: true, rateLimit: "240/minute, 120,000/hour" }),
    )
  }

  // Drug endpoints

  async searchDrugAdverseEvents(params: SearchParams): Promise<Either<Error, FDAResponse<DrugAdverseEvent>>> {
    return this.request<DrugAdverseEvent>("/drug/event.json", params)
  }

  async searchDrugLabels(params: SearchParams): Promise<Either<Error, FDAResponse<DrugLabel>>> {
    return this.request<DrugLabel>("/drug/label.json", params)
  }

  async searchDrugNDC(params: SearchParams): Promise<Either<Error, FDAResponse<DrugNDC>>> {
    return this.request<DrugNDC>("/drug/ndc.json", params)
  }

  async searchDrugEnforcement(params: SearchParams): Promise<Either<Error, FDAResponse<DrugEnforcement>>> {
    return this.request<DrugEnforcement>("/drug/enforcement.json", params)
  }

  async searchDrugsFDA(params: SearchParams): Promise<Either<Error, FDAResponse<DrugsFDA>>> {
    return this.request<DrugsFDA>("/drug/drugsfda.json", params)
  }

  async searchDrugShortages(params: SearchParams): Promise<Either<Error, FDAResponse<DrugShortage>>> {
    return this.request<DrugShortage>("/drug/shortages.json", params)
  }

  // Device endpoints

  async searchDevice510K(params: SearchParams): Promise<Either<Error, FDAResponse<Device510K>>> {
    return this.request<Device510K>("/device/510k.json", params)
  }

  async searchDeviceClassifications(params: SearchParams): Promise<Either<Error, FDAResponse<DeviceClassification>>> {
    return this.request<DeviceClassification>("/device/classification.json", params)
  }

  async searchDeviceAdverseEvents(params: SearchParams): Promise<Either<Error, FDAResponse<DeviceAdverseEvent>>> {
    return this.request<DeviceAdverseEvent>("/device/event.json", params)
  }

  async searchDeviceEnforcement(params: SearchParams): Promise<Either<Error, FDAResponse<DeviceEnforcement>>> {
    return this.request<DeviceEnforcement>("/device/enforcement.json", params)
  }
}

// Singleton instance
export const fdaAPIClient = new FDAAPIClient()
