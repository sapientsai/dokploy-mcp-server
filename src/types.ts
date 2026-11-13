// === Client Config ===

export type RescueTimeClientConfig = {
  readonly apiKey: string
  readonly baseUrl?: string
  /** Wait between polls of an in-flight project-time job. Defaults to 1000 ms. */
  readonly pollDelayMs?: number
}

// === Analytic Data API ===

export type AnalyticPerspective = "rank" | "interval" | "member"

export type AnalyticResolution = "month" | "week" | "day" | "hour" | "minute"

export type RestrictKind = "category" | "activity" | "productivity" | "document" | "efficiency" | "overview"

export type AnalyticDataParams = {
  readonly perspective?: AnalyticPerspective
  readonly resolution_time?: AnalyticResolution
  readonly restrict_begin?: string
  readonly restrict_end?: string
  readonly restrict_kind?: RestrictKind
  readonly restrict_thing?: string
  readonly restrict_thingy?: string
  readonly restrict_source_type?: "computers" | "mobile" | "offline"
}

export type AnalyticDataResponse = {
  readonly notes: string
  readonly row_headers: readonly string[]
  readonly rows: ReadonlyArray<ReadonlyArray<string | number>>
}

// === Daily Summary ===

export type DailySummary = {
  readonly id: number
  readonly date: string
  readonly productivity_pulse: number
  readonly very_productive_percentage: number
  readonly productive_percentage: number
  readonly neutral_percentage: number
  readonly distracting_percentage: number
  readonly very_distracting_percentage: number
  readonly all_productive_percentage: number
  readonly all_distracting_percentage: number
  readonly uncategorized_percentage: number
  readonly business_percentage: number
  readonly communication_and_scheduling_percentage: number
  readonly social_networking_percentage: number
  readonly design_and_composition_percentage: number
  readonly entertainment_percentage: number
  readonly news_percentage: number
  readonly software_development_percentage: number
  readonly reference_and_learning_percentage: number
  readonly shopping_percentage: number
  readonly utilities_percentage: number
  readonly total_hours: number
  readonly very_productive_hours: number
  readonly productive_hours: number
  readonly neutral_hours: number
  readonly distracting_hours: number
  readonly very_distracting_hours: number
  readonly all_productive_hours: number
  readonly all_distracting_hours: number
  readonly uncategorized_hours: number
  readonly total_duration_formatted: string
  readonly very_productive_duration_formatted: string
  readonly productive_duration_formatted: string
  readonly neutral_duration_formatted: string
  readonly distracting_duration_formatted: string
  readonly very_distracting_duration_formatted: string
}

// === Highlights ===

export type Highlight = {
  readonly id: number
  readonly date: string
  readonly description: string
  readonly source: string
  readonly created_at: string
}

export type PostHighlightParams = {
  readonly highlight_date?: string
  readonly description: string
  readonly source?: string
}

// === Focus Sessions ===

export type FocusSessionEvent = {
  readonly id: number
  readonly duration?: number
  readonly created_at: string
}

// === Offline Time ===

export type OfflineTimeParams = {
  readonly start_time: string
  readonly end_time: string
  readonly activity_name: string
  readonly activity_details?: string
}

/* eslint-disable functype/prefer-option -- wire types: RescueTime's JSON sends null, which Option would misdescribe */

// === Resource API: Focus State ===
// Shapes observed live on 2026-11-08 (user_global_states, focus/start_session, focus/cancel_or_stop_session).

export type GlobalStateDetails = {
  readonly is_timer?: boolean
  readonly in_zone?: boolean
  readonly start_time?: string
  readonly label_name?: string
  readonly block_apps_sites?: boolean
  readonly block_comms?: boolean
  readonly strict_focus?: boolean
  /** Set when the timer was started for a project. Observed live 2026-11-12. */
  readonly project?: { readonly id: number; readonly name: string } | null
}

export type GlobalState = {
  readonly id: number
  readonly state: GlobalStateDetails
  readonly state_type: number
  readonly start_time_epoch: number
  readonly expiration_epoch: number
  readonly label_name?: string
  readonly is_timer?: boolean
}

export type StartTimerParams = {
  readonly label_name?: string
  readonly v2_project_id?: number
  readonly task_id?: number
}

export type StoppedFocusSession = {
  readonly name: string
  readonly start_time: string
  readonly duration: number
}

export type StopSessionResponse = {
  readonly message: "deleted" | "updated" | "none"
  readonly focus_session?: StoppedFocusSession
  readonly project_time?: ProjectTimeEntry
}

// === Resource API: Projects and Project Time ===

export type Task = {
  readonly id: number
  readonly name: string
  readonly hidden: boolean
  readonly archived_at: string | null
}

export type Project = {
  readonly id: number
  readonly name: string
  readonly archived_at: string | null
  readonly tasks: readonly Task[]
}

export type ProjectTimeEntry = {
  readonly name: string
  readonly date: string
  readonly start_time: string
  readonly end_time: string
  /** Seconds. */
  readonly duration: number
  readonly extra?: {
    readonly draft?: boolean
    readonly comment?: string
    /** A label such as "open_ai" for suggested drafts, or the focus session a timer logged. */
    readonly provenance?: string | Readonly<Record<string, unknown>>
  }
  readonly project: { readonly id: number; readonly name: string } | null
  readonly task: { readonly id: number; readonly name: string; readonly hidden: boolean } | null
  readonly client: { readonly name: string } | null
}

export type ProjectTimesResponse = {
  readonly is_complete: boolean
  readonly job_id: number | null
  readonly project_times: readonly ProjectTimeEntry[]
}

export type ProjectTimeDay = {
  readonly date: string
  readonly response: ProjectTimesResponse
}

// === Resource API: Timeline ===

/**
 * One 5-minute bucket. Observed live (2026-11-07 and 2026-11-08) in three shapes:
 * - tracked: a name and a `duration`;
 * - untracked: an empty object `{}`, nothing recorded in the window;
 * - guessed: `guess: true` and no `duration`. RescueTime carried the previous activity forward across the window.
 *   With `was_empty: true` nothing was recorded there; with `was_empty: false` RescueTime recorded another
 *   activity and moved it into `masked_bucket`.
 */
export type TimelineActivity = {
  readonly display_name?: string | null
  readonly category?: string | null
  /** Seconds spent on this activity within its 5-minute bucket. Absent on untracked and guessed buckets. */
  readonly duration?: number
  readonly continuation?: boolean
  readonly guess?: boolean
  readonly was_empty?: boolean
  readonly continued_for?: number
  readonly time_span?: string
  readonly masked_bucket?: TimelineActivity | null
}

export type TimelineResponse = {
  /** Keyed by bucket start, e.g. "2026-11-08 09:10:00 -0500". */
  readonly activities: Readonly<Record<string, TimelineActivity>> | readonly TimelineActivity[]
  readonly activity_intervals: readonly string[]
}

// === Resource API: Account ===

/** The one field read from GET /api/resource/users. The record also holds email and address; leave them untyped. */
export type UserRecord = {
  readonly time_zone?: string | null
}

/* eslint-enable functype/prefer-option */
