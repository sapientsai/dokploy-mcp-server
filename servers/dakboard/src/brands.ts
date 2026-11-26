import { Brand } from "functype/branded"

export type ScreenId = Brand<"ScreenId", string>
export const ScreenId = (value: string): ScreenId => Brand("ScreenId", value)

export type BlockId = Brand<"BlockId", string>
export const BlockId = (value: string): BlockId => Brand("BlockId", value)

export type LoopId = Brand<"LoopId", string>
export const LoopId = (value: string): LoopId => Brand("LoopId", value)

export type DeviceId = Brand<"DeviceId", string>
export const DeviceId = (value: string): DeviceId => Brand("DeviceId", value)

export type MetricName = Brand<"MetricName", string>
export const MetricName = (value: string): MetricName => Brand("MetricName", value)

export type ApiKey = Brand<"ApiKey", string>
export const ApiKey = (value: string): ApiKey => Brand("ApiKey", value)
