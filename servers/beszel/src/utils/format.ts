import { Option } from "functype"

/** Beszel divides by 1024 and labels the result MB and GB, so this does the same. */
const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const

export const bytes = (n: number | undefined): string => {
  if (n === undefined || !Number.isFinite(n)) return "–"
  const exponent = n <= 0 ? 0 : Math.min(Math.floor(Math.log(n) / Math.log(1024)), UNITS.length - 1)
  const value = n / 1024 ** exponent
  return `${value >= 100 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${UNITS[exponent] ?? "B"}`
}

export const rate = (bytesPerSecond: number | undefined): string =>
  bytesPerSecond === undefined ? "–" : `${bytes(bytesPerSecond)}/s`

export const gigabytes = (gb: number | undefined): string => (gb === undefined ? "–" : bytes(gb * 1024 ** 3))

export const megabytes = (mb: number | undefined): string => (mb === undefined ? "–" : bytes(mb * 1024 ** 2))

export const percent = (n: number | undefined): string =>
  n === undefined || !Number.isFinite(n) ? "–" : `${n.toFixed(1)}%`

export const number = (n: number | undefined, digits = 2): string =>
  n === undefined || !Number.isFinite(n) ? "–" : n.toFixed(digits)

export const celsius = (n: number | undefined): string =>
  n === undefined || !Number.isFinite(n) ? "–" : `${n.toFixed(0)}°C`

export const duration = (seconds: number | undefined): string => {
  if (seconds === undefined || !Number.isFinite(seconds)) return "–"
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export const loadAverage = (la: ReadonlyArray<number> | undefined): string =>
  la === undefined || la.length === 0 ? "–" : la.map((n) => n.toFixed(2)).join(" / ")

/** Make text safe in a Markdown table cell: pipes would split the row, and newlines would end it. */
export const cell = (text: string | undefined): string =>
  (text ?? "")
    .replaceAll(/\\+(?=\|)/g, (run) => run + run)
    .replaceAll("|", "\\|")
    .replaceAll(/\r\n|\r|\n/g, " ")

export const table = (headers: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<string>>): string =>
  [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n")

const CONTAINER_HEALTH = ["none", "starting", "healthy", "unhealthy"] as const
const SERVICE_STATE = ["active", "inactive", "failed", "activating", "deactivating", "reloading"] as const
const SERVICE_SUB_STATE = ["dead", "running", "exited", "failed", "unknown"] as const
const CONNECTION = ["–", "SSH", "WebSocket"] as const

const named = (names: ReadonlyArray<string>, value: number | undefined): string =>
  Option(value === undefined ? undefined : names[value]).getOrElse(() =>
    value === undefined ? "–" : `unknown (${value})`,
  )

export const containerHealth = (value: number | undefined): string => named(CONTAINER_HEALTH, value)
export const serviceState = (value: number | undefined): string => named(SERVICE_STATE, value)
export const serviceSubState = (value: number | undefined): string => named(SERVICE_SUB_STATE, value)
export const connectionType = (value: number | undefined): string => named(CONNECTION, value)

/** The health codes `list_containers` filters on. */
export const CONTAINER_HEALTH_NAMES = CONTAINER_HEALTH
