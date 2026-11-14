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
import { isRecord } from "./fields.js"
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

export type RateLimitInfo = { authenticated: boolean; rateLimit: string }

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

/** A client for the openFDA API. Every search resolves to Either; none throws. */
export type FDAClient = {
  searchDrugAdverseEvents: (params: SearchParams) => Promise<Either<Error, FDAResponse<DrugAdverseEvent>>>
  searchDrugLabels: (params: SearchParams) => Promise<Either<Error, FDAResponse<DrugLabel>>>
  searchDrugNDC: (params: SearchParams) => Promise<Either<Error, FDAResponse<DrugNDC>>>
  searchDrugEnforcement: (params: SearchParams) => Promise<Either<Error, FDAResponse<DrugEnforcement>>>
  searchDrugsFDA: (params: SearchParams) => Promise<Either<Error, FDAResponse<DrugsFDA>>>
  searchDrugShortages: (params: SearchParams) => Promise<Either<Error, FDAResponse<DrugShortage>>>
  searchDevice510K: (params: SearchParams) => Promise<Either<Error, FDAResponse<Device510K>>>
  searchDeviceClassifications: (params: SearchParams) => Promise<Either<Error, FDAResponse<DeviceClassification>>>
  searchDeviceAdverseEvents: (params: SearchParams) => Promise<Either<Error, FDAResponse<DeviceAdverseEvent>>>
  searchDeviceEnforcement: (params: SearchParams) => Promise<Either<Error, FDAResponse<DeviceEnforcement>>>
  getRateLimitInfo: () => RateLimitInfo
}

/** The query string for an openFDA request */
function buildSearchParams(params: SearchParams, apiKey: Option<string>): URLSearchParams {
  const urlParams = new URLSearchParams()

  Option(params.search)
    .filter((search) => search !== "")
    .forEach((search) => urlParams.set("search", search))

  Option(params.count)
    .filter((count) => count !== "")
    .forEach((count) => urlParams.set("count", count))

  urlParams.set("limit", String(Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT)))

  Option(params.skip)
    .filter((skip) => skip > 0)
    .forEach((skip) => urlParams.set("skip", String(skip)))

  apiKey.forEach((key) => urlParams.set("api_key", key))

  return urlParams
}

/**
 * The request URL with any key replaced, for logs. It replaces the `api_key` parameter rather than
 * searching for the key's text, which URL encoding changes (`+` becomes `%2B`).
 */
const redact = (url: string, apiKey: Option<string>): string =>
  apiKey.fold(
    () => url,
    () => {
      const redacted = new URL(url)
      redacted.searchParams.set("api_key", "[REDACTED]")
      return redacted.toString()
    },
  )

async function readResponse<T>(response: Response): Promise<Either<Error, FDAResponse<T>>> {
  if (response.status === 404) {
    await Try.fromPromise(response.body?.cancel() ?? Promise.resolve()) // release the connection
    return Right({ results: [] }) // No results found
  }

  if (!response.ok) {
    const body = (await Try.fromPromise(response.json() as Promise<unknown>)).orElse({})
    return Left(errorForStatus(response.status, response.statusText, body))
  }

  const parsed = (await Try.fromPromise(response.json() as Promise<unknown>))
    .toEither(toError)
    .flatMap((body) =>
      isRecord(body)
        ? Right<Error, FDAResponse<T>>(body as FDAResponse<T>)
        : Left<Error, FDAResponse<T>>(new Error("Unexpected response body from FDA API")),
    )
  return parsed.map((data) => {
    loggers.api(`Response: ${data.meta?.results?.total ?? 0} total results`)
    return data
  })
}

/** Where an openFDA client gets its API key. */
export type FDAClientOptions = {
  /** The key to send. Undefined or empty sends none. */
  apiKey?: string
}

type ProcessLike = { process?: { env?: Partial<Record<string, string>> } }

/** OPENFDA_API_KEY on Node; nothing on a runtime with no `process`, such as Workers. */
const keyFromEnv = (): FDAClientOptions => ({
  apiKey: Option((globalThis as ProcessLike).process)
    .flatMap((p) => Option(p.env))
    .flatMap((env) => Option(env.OPENFDA_API_KEY))
    .orUndefined(),
})

/**
 * Create an openFDA client. With no options it reads OPENFDA_API_KEY when called. Pass
 * `{ apiKey }` to choose the key instead, such as a caller's own on a hosted server. An empty
 * key counts as none.
 */
export function createFDAAPIClient(options: FDAClientOptions = keyFromEnv()): FDAClient {
  const apiKey = Option(options.apiKey).filter((key) => key !== "")

  const request = async <T>(endpoint: FDAEndpoint, params: SearchParams): Promise<Either<Error, FDAResponse<T>>> => {
    const url = `${FDA_BASE_URL}${endpoint}?${buildSearchParams(params, apiKey).toString()}`
    loggers.api(`Request: ${redact(url, apiKey)}`)

    const fetched = (await Try.fromPromise(fetch(url))).toEither(toError)
    return fetched.flatMapAsync((response) => readResponse<T>(response))
  }

  return {
    searchDrugAdverseEvents: (params) => request<DrugAdverseEvent>("/drug/event.json", params),
    searchDrugLabels: (params) => request<DrugLabel>("/drug/label.json", params),
    searchDrugNDC: (params) => request<DrugNDC>("/drug/ndc.json", params),
    searchDrugEnforcement: (params) => request<DrugEnforcement>("/drug/enforcement.json", params),
    searchDrugsFDA: (params) => request<DrugsFDA>("/drug/drugsfda.json", params),
    searchDrugShortages: (params) => request<DrugShortage>("/drug/shortages.json", params),
    searchDevice510K: (params) => request<Device510K>("/device/510k.json", params),
    searchDeviceClassifications: (params) => request<DeviceClassification>("/device/classification.json", params),
    searchDeviceAdverseEvents: (params) => request<DeviceAdverseEvent>("/device/event.json", params),
    searchDeviceEnforcement: (params) => request<DeviceEnforcement>("/device/enforcement.json", params),
    getRateLimitInfo: () =>
      apiKey.fold(
        // openFDA's published limits: https://open.fda.gov/apis/authentication/
        (): RateLimitInfo => ({ authenticated: false, rateLimit: "240/minute and 1,000/day, per IP address" }),
        (): RateLimitInfo => ({ authenticated: true, rateLimit: "240/minute and 120,000/day, per key" }),
      ),
  }
}

/**
 * Class form of {@link createFDAAPIClient}. It delegates to the factory, so
 * both behave the same; prefer the factory in new code.
 */
export class FDAAPIClient implements FDAClient {
  private readonly client: FDAClient = createFDAAPIClient()

  searchDrugAdverseEvents(params: SearchParams): Promise<Either<Error, FDAResponse<DrugAdverseEvent>>> {
    return this.client.searchDrugAdverseEvents(params)
  }

  searchDrugLabels(params: SearchParams): Promise<Either<Error, FDAResponse<DrugLabel>>> {
    return this.client.searchDrugLabels(params)
  }

  searchDrugNDC(params: SearchParams): Promise<Either<Error, FDAResponse<DrugNDC>>> {
    return this.client.searchDrugNDC(params)
  }

  searchDrugEnforcement(params: SearchParams): Promise<Either<Error, FDAResponse<DrugEnforcement>>> {
    return this.client.searchDrugEnforcement(params)
  }

  searchDrugsFDA(params: SearchParams): Promise<Either<Error, FDAResponse<DrugsFDA>>> {
    return this.client.searchDrugsFDA(params)
  }

  searchDrugShortages(params: SearchParams): Promise<Either<Error, FDAResponse<DrugShortage>>> {
    return this.client.searchDrugShortages(params)
  }

  searchDevice510K(params: SearchParams): Promise<Either<Error, FDAResponse<Device510K>>> {
    return this.client.searchDevice510K(params)
  }

  searchDeviceClassifications(params: SearchParams): Promise<Either<Error, FDAResponse<DeviceClassification>>> {
    return this.client.searchDeviceClassifications(params)
  }

  searchDeviceAdverseEvents(params: SearchParams): Promise<Either<Error, FDAResponse<DeviceAdverseEvent>>> {
    return this.client.searchDeviceAdverseEvents(params)
  }

  searchDeviceEnforcement(params: SearchParams): Promise<Either<Error, FDAResponse<DeviceEnforcement>>> {
    return this.client.searchDeviceEnforcement(params)
  }

  getRateLimitInfo(): RateLimitInfo {
    return this.client.getRateLimitInfo()
  }
}

/** The shared client the tool handlers use */
export const fdaAPIClient: FDAAPIClient = new FDAAPIClient()
