import type { StatsInterval } from "../types"

export const RANGES = ["1h", "12h", "24h", "7d", "30d"] as const
export type Range = (typeof RANGES)[number]

const HOUR_MS = 3_600_000

/** The interval Beszel keeps for each range, so a range reads at most about a hundred records. */
const RANGE_SPEC: Readonly<Record<Range, { readonly interval: StatsInterval; readonly ms: number }>> = {
  "1h": { interval: "1m", ms: HOUR_MS },
  "12h": { interval: "10m", ms: 12 * HOUR_MS },
  "24h": { interval: "20m", ms: 24 * HOUR_MS },
  "7d": { interval: "120m", ms: 7 * 24 * HOUR_MS },
  "30d": { interval: "480m", ms: 30 * 24 * HOUR_MS },
}

export const intervalFor = (range: Range): StatsInterval => RANGE_SPEC[range].interval

export const startOf = (range: Range, now: number): Date => new Date(now - RANGE_SPEC[range].ms)
