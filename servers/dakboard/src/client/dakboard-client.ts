import { None, type Option, Some } from "functype"
import type { Either } from "functype/either"
import { Left, Right } from "functype/either"
import { Try } from "functype/try"

import type { ApiKey } from "../brands"
import type { BlockId, DeviceId, LoopId, MetricName, ScreenId } from "../brands"
import type {
  CreateDataPointParams,
  DakboardApiError,
  DakboardBlock,
  DakboardBlockDetail,
  DakboardDataPoint,
  DakboardDevice,
  DakboardLoop,
  DakboardLoopDetail,
  DakboardMetric,
  DakboardMetricDetail,
  DakboardScreen,
  DakboardScreenDetail,
  DeleteDataPointsParams,
  UpdateBlockParams,
  UpdateDeviceParams,
  UpdateScreenParams,
} from "../types"

const BASE_URL = "https://dakboard.com/api/2"

const createDakboardClient = (apiKey: ApiKey) => {
  const request = async <T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Either<DakboardApiError, T>> => {
    const url = `${BASE_URL}${path}?api_key=${apiKey}`

    const result = Try(() => {
      const options: RequestInit = {
        method,
        headers: {} as Record<string, string>,
      }

      if (body && (method === "PUT" || method === "POST")) {
        const headers = options.headers as Record<string, string>
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        options.body = new URLSearchParams(
          Object.entries(body).reduce<Record<string, string>>((acc, [key, value]) => {
            if (value !== undefined && value !== null) {
              if (Array.isArray(value)) {
                value.forEach((item, index) => {
                  acc[`${key}[${index}]`] = String(item)
                })
              } else {
                acc[key] = String(value)
              }
            }
            return acc
          }, {}),
        ).toString()
      }

      if (body && method === "DELETE") {
        const headers = options.headers as Record<string, string>
        headers["Content-Type"] = "application/json"
        options.body = JSON.stringify(body)
      }

      return options
    })

    if (result.isFailure()) {
      return Left<DakboardApiError, T>({
        type: "unknown",
        message: "Failed to build request options",
      })
    }

    const options = result.orThrow()

    // eslint-disable-next-line functype/prefer-either -- boundary between throwing fetch API and Either-returning client
    try {
      const response = await fetch(url, options)

      if (!response.ok) {
        return Left<DakboardApiError, T>({
          type: "api",
          message: `DAKboard API error: ${response.status} ${response.statusText}`,
          status: response.status,
        })
      }

      const text = await response.text()
      if (!text || text.trim() === "") {
        return Right<DakboardApiError, T>({} as T)
      }

      return Try(() => JSON.parse(text) as T).fold(
        () =>
          Left<DakboardApiError, T>({
            type: "parse",
            message: "Failed to parse DAKboard API response",
          }),
        (data) => Right<DakboardApiError, T>(data),
      )
    } catch (error) {
      return Left<DakboardApiError, T>({
        type: "network",
        message: `Network error: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  // Screens
  const listScreens = (): Promise<Either<DakboardApiError, DakboardScreen[]>> => request("GET", "/screens")

  const getScreen = (id: ScreenId): Promise<Either<DakboardApiError, DakboardScreenDetail>> =>
    request("GET", `/screens/${id}`)

  const updateScreen = (
    id: ScreenId,
    params: UpdateScreenParams,
  ): Promise<Either<DakboardApiError, DakboardScreenDetail>> =>
    request("PUT", `/screens/${id}`, params as Record<string, unknown>)

  // Blocks
  const listBlocks = (screenId: ScreenId): Promise<Either<DakboardApiError, DakboardBlock[]>> =>
    request("GET", `/screens/${screenId}/blocks`)

  const getBlock = (screenId: ScreenId, blockId: BlockId): Promise<Either<DakboardApiError, DakboardBlockDetail>> =>
    request("GET", `/screens/${screenId}/blocks/${blockId}`)

  const updateBlock = (
    screenId: ScreenId,
    blockId: BlockId,
    params: UpdateBlockParams,
  ): Promise<Either<DakboardApiError, DakboardBlockDetail>> =>
    request("PUT", `/screens/${screenId}/blocks/${blockId}`, params as Record<string, unknown>)

  // Loops
  const listLoops = (): Promise<Either<DakboardApiError, DakboardLoop[]>> => request("GET", "/loops")

  const getLoop = (id: LoopId): Promise<Either<DakboardApiError, DakboardLoopDetail>> => request("GET", `/loops/${id}`)

  // Devices
  const listDevices = (): Promise<Either<DakboardApiError, DakboardDevice[]>> => request("GET", "/devices")

  const getDevice = (id: DeviceId): Promise<Either<DakboardApiError, DakboardDevice>> =>
    request("GET", `/devices/${id}`)

  const updateDevice = (id: DeviceId, params: UpdateDeviceParams): Promise<Either<DakboardApiError, DakboardDevice>> =>
    request("PUT", `/devices/${id}`, params as Record<string, unknown>)

  // Metrics
  const listMetrics = (): Promise<Either<DakboardApiError, DakboardMetric[]>> => request("GET", "/metrics")

  const getMetric = (name: MetricName): Promise<Either<DakboardApiError, DakboardMetricDetail>> =>
    request("GET", `/metrics/${name}`)

  const createMetricDataPoints = (
    name: MetricName,
    dataPoints: CreateDataPointParams[],
  ): Promise<Either<DakboardApiError, DakboardDataPoint[]>> =>
    request("POST", `/metrics/${name}`, { data_points: dataPoints } as unknown as Record<string, unknown>)

  const deleteMetric = (name: MetricName): Promise<Either<DakboardApiError, unknown>> =>
    request("DELETE", `/metrics/${name}`)

  const deleteMetricDataPoints = (
    name: MetricName,
    params: DeleteDataPointsParams,
  ): Promise<Either<DakboardApiError, unknown>> =>
    request("DELETE", `/metrics/${name}`, params as Record<string, unknown>)

  return Object.freeze({
    listScreens,
    getScreen,
    updateScreen,
    listBlocks,
    getBlock,
    updateBlock,
    listLoops,
    getLoop,
    listDevices,
    getDevice,
    updateDevice,
    listMetrics,
    getMetric,
    createMetricDataPoints,
    deleteMetric,
    deleteMetricDataPoints,
  })
}

export type DakboardClient = ReturnType<typeof createDakboardClient>

const clientRef: { current: Option<DakboardClient> } = { current: None() }

export const initializeDakboardClient = (apiKey: ApiKey): DakboardClient => {
  const c = createDakboardClient(apiKey)
  clientRef.current = Some(c)
  return c
}

export const getDakboardClient = (): Option<DakboardClient> => clientRef.current
