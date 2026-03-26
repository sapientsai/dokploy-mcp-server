// === Client Config ===

export type RescueTimeClientConfig = {
  readonly apiKey: string
  readonly baseUrl?: string
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
  readonly duration: number
  readonly created_at: string
}

// === Offline Time ===

export type OfflineTimeParams = {
  readonly start_time: string
  readonly end_time?: string
  readonly duration?: number
  readonly activity_name: string
  readonly activity_details?: string
}
