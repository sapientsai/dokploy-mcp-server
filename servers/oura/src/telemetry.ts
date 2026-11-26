import {
  createCompositeTelemetry,
  createConsoleTelemetry,
  createJsonFileTelemetry,
  NoopTelemetry,
  type TelemetryCollector,
} from "somamcp"

import type { OuraConfig } from "./config"

/**
 * Assemble a telemetry collector from env.
 *
 * Defaults to no-op: under the default `stdio` transport, stdout is the JSON-RPC
 * channel, so console telemetry would corrupt the protocol. Console output is only
 * enabled under `httpStream`. File telemetry (NDJSON) is opt-in via `OURA_TELEMETRY_FILE`
 * and is safe under any transport.
 */
export const buildTelemetry = (config: OuraConfig, env: NodeJS.ProcessEnv): TelemetryCollector => {
  const collectors: TelemetryCollector[] = []

  const file = env.OURA_TELEMETRY_FILE?.trim()
  if (file) collectors.push(createJsonFileTelemetry({ filePath: file }))

  if (config.transportType === "httpStream" && env.OURA_TELEMETRY_CONSOLE?.trim().toLowerCase() !== "false") {
    collectors.push(createConsoleTelemetry("oura"))
  }

  return collectors.length ? createCompositeTelemetry(collectors) : NoopTelemetry
}
