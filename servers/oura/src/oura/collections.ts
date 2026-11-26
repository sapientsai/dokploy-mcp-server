/**
 * Descriptor table for every Oura API v2 `usercollection` endpoint.
 *
 * Source of truth: https://cloud.ouraring.com/v2/static/json/openapi-1.35.json
 * (parsed at build time; keep in sync when Oura publishes a newer spec version).
 *
 * The shape of each collection drives request building and parameter validation:
 *
 * - `daily`     -> list endpoint keyed by calendar day (`start_date`/`end_date`),
 *                  paginated via `next_token`, with a `/{document_id}` detail route.
 * - `datetime`  -> list endpoint keyed by instant (`start_datetime`/`end_datetime`),
 *                  supports `latest`, has NO detail route.
 * - `listOnly`  -> paginated list with no date filter, with a detail route.
 * - `singleton` -> a single document, no parameters, no detail route.
 */
export type CollectionKind = "daily" | "datetime" | "listOnly" | "singleton"

export type CollectionDescriptor = {
  /** Path segment after `usercollection/`, and the tool's `collection` enum value. */
  readonly name: string
  readonly kind: CollectionKind
  /** Whether `usercollection/<name>/{document_id}` exists. */
  readonly byId: boolean
  /** Whether the endpoint accepts `latest=true` (datetime collections only). */
  readonly latest: boolean
  /** One-line description surfaced to the LLM in the tool schema. */
  readonly description: string
}

const daily = (name: string, description: string): CollectionDescriptor => ({
  name,
  kind: "daily",
  byId: true,
  latest: false,
  description,
})

const datetime = (name: string, description: string): CollectionDescriptor => ({
  name,
  kind: "datetime",
  byId: false,
  latest: true,
  description,
})

export const COLLECTIONS: readonly CollectionDescriptor[] = [
  // Daily summaries (start_date / end_date)
  daily("daily_activity", "Daily activity summary: steps, calories, activity score."),
  daily("daily_sleep", "Daily sleep summary and sleep score."),
  daily("daily_readiness", "Daily readiness summary and readiness score."),
  daily("daily_spo2", "Daily average blood oxygen (SpO2) percentage."),
  daily("daily_stress", "Daily stress and recovery high/normal durations."),
  daily("daily_resilience", "Daily resilience level derived from recovery metrics."),
  daily("daily_cardiovascular_age", "Daily cardiovascular age estimate."),
  daily("vO2_max", "VO2 max (cardiorespiratory fitness) estimates."),
  // Detail collections (start_date / end_date, document-level records)
  daily("sleep", "Detailed per-period sleep sessions (stages, HRV, heart rate)."),
  daily("sleep_time", "Recommended/ideal bedtime windows."),
  daily("session", "Guided/unguided moment sessions (meditation, breathing, rest)."),
  daily("workout", "Recorded workouts with intensity, calories, and duration."),
  daily("tag", "Legacy user-entered tags."),
  daily("enhanced_tag", "Enhanced user-entered tags (current tag model)."),
  daily("rest_mode_period", "Rest mode periods (recovery/illness) the user enabled."),
  // Datetime collections (start_datetime / end_datetime)
  datetime("heartrate", "Time-series heart rate samples."),
  datetime("ring_battery_level", "Time-series ring battery level samples."),
  // List-only (no date filter) with a detail route
  {
    name: "ring_configuration",
    kind: "listOnly",
    byId: true,
    latest: false,
    description: "Ring hardware configuration records (size, color, firmware, design).",
  },
  // Singleton
  {
    name: "personal_info",
    kind: "singleton",
    byId: false,
    latest: false,
    description: "The user's personal info: age, weight, height, biological sex, email.",
  },
] as const

export const COLLECTION_NAMES = COLLECTIONS.map((c) => c.name) as [string, ...string[]]

const BY_NAME: ReadonlyMap<string, CollectionDescriptor> = new Map(COLLECTIONS.map((c) => [c.name, c]))

export const getCollection = (name: string): CollectionDescriptor | undefined => BY_NAME.get(name)
