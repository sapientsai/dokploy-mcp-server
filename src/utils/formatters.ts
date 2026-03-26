import { Option, Try } from "functype"

import type { AnalyticDataParams, AnalyticDataResponse, DailySummary, FocusSessionEvent, Highlight } from "../types"

const PRODUCTIVITY_LABELS: Record<number, string> = {
  2: "Very Productive",
  1: "Productive",
  0: "Neutral",
  "-1": "Distracting",
  "-2": "Very Distracting",
}

export function formatDuration(seconds: number): string {
  return Try(() => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) return `${hours}h ${minutes}m`
    if (minutes > 0) return `${minutes}m`
    return `${seconds}s`
  }).orElse(`${seconds}s`)
}

export function productivityLabel(level: number): string {
  return Option(PRODUCTIVITY_LABELS[level]).orElse("Unknown")
}

export function formatActivityData(response: AnalyticDataResponse, params: AnalyticDataParams): string {
  const kind = params.restrict_kind ?? "activity"
  const perspective = params.perspective ?? "rank"

  if (response.rows.length === 0) {
    return [
      `## Activity Data (${kind}, ${perspective})`,
      "",
      "No activity data found for the specified parameters.",
    ].join("\n")
  }

  const headers = response.row_headers
  const timeColIndex = headers.findIndex((h) => h.toLowerCase().includes("time spent"))

  const dataRows = response.rows.map((row) => {
    const formatted = row.map((cell, i) => {
      if (i === timeColIndex && typeof cell === "number") return formatDuration(cell)
      if (typeof cell === "number" && headers[i]?.toLowerCase().includes("productivity")) return productivityLabel(cell)
      return String(cell)
    })
    return `| ${formatted.join(" | ")} |`
  })

  const totalLine =
    timeColIndex >= 0
      ? [
          "",
          `**Total time tracked:** ${formatDuration(
            response.rows.reduce((sum, row) => {
              const val = row[timeColIndex]
              return sum + (typeof val === "number" ? val : 0)
            }, 0),
          )}`,
        ]
      : []

  return [
    `## Activity Data (${kind}, ${perspective})`,
    "",
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...dataRows,
    ...totalLine,
    "",
    `*${response.rows.length} entries*`,
  ].join("\n")
}

function formatDayEntry(day: DailySummary): string {
  return [
    `### ${day.date}`,
    "",
    `**Productivity Pulse:** ${day.productivity_pulse}/100`,
    `**Total Time:** ${day.total_duration_formatted}`,
    "",
    "| Category | Percentage | Hours |",
    "| --- | --- | --- |",
    `| Very Productive | ${day.very_productive_percentage.toFixed(1)}% | ${day.very_productive_hours.toFixed(1)}h |`,
    `| Productive | ${day.productive_percentage.toFixed(1)}% | ${day.productive_hours.toFixed(1)}h |`,
    `| Neutral | ${day.neutral_percentage.toFixed(1)}% | ${day.neutral_hours.toFixed(1)}h |`,
    `| Distracting | ${day.distracting_percentage.toFixed(1)}% | ${day.distracting_hours.toFixed(1)}h |`,
    `| Very Distracting | ${day.very_distracting_percentage.toFixed(1)}% | ${day.very_distracting_hours.toFixed(1)}h |`,
    "",
  ].join("\n")
}

export function formatDailySummary(summaries: readonly DailySummary[]): string {
  if (summaries.length === 0) {
    return ["## Daily Productivity Summary", "", "No daily summaries available."].join("\n")
  }

  return ["## Daily Productivity Summary", "", ...summaries.map(formatDayEntry)].join("\n")
}

export function formatProductivityScore(summary: DailySummary): string {
  return [
    `## Productivity Score for ${summary.date}`,
    "",
    `### Pulse: ${summary.productivity_pulse}/100`,
    "",
    `**Total Time:** ${summary.total_duration_formatted}`,
    "",
    "### Productivity Breakdown",
    "",
    `- **All Productive:** ${summary.all_productive_percentage.toFixed(1)}% (${summary.all_productive_hours.toFixed(1)}h)`,
    `- **All Distracting:** ${summary.all_distracting_percentage.toFixed(1)}% (${summary.all_distracting_hours.toFixed(1)}h)`,
    `- **Neutral:** ${summary.neutral_percentage.toFixed(1)}% (${summary.neutral_hours.toFixed(1)}h)`,
    `- **Uncategorized:** ${summary.uncategorized_percentage.toFixed(1)}% (${summary.uncategorized_hours.toFixed(1)}h)`,
    "",
    "### Category Breakdown",
    "",
    `- **Software Development:** ${summary.software_development_percentage.toFixed(1)}%`,
    `- **Business:** ${summary.business_percentage.toFixed(1)}%`,
    `- **Communication:** ${summary.communication_and_scheduling_percentage.toFixed(1)}%`,
    `- **Reference & Learning:** ${summary.reference_and_learning_percentage.toFixed(1)}%`,
    `- **Design & Composition:** ${summary.design_and_composition_percentage.toFixed(1)}%`,
    `- **Utilities:** ${summary.utilities_percentage.toFixed(1)}%`,
    `- **News:** ${summary.news_percentage.toFixed(1)}%`,
    `- **Social Networking:** ${summary.social_networking_percentage.toFixed(1)}%`,
    `- **Entertainment:** ${summary.entertainment_percentage.toFixed(1)}%`,
    `- **Shopping:** ${summary.shopping_percentage.toFixed(1)}%`,
  ].join("\n")
}

function formatHighlightEntry(h: Highlight): string {
  const sourceLine = h.source ? `\n  *(source: ${h.source})*` : ""
  return `- **${h.date}**: ${h.description}${sourceLine}`
}

export function formatHighlights(highlights: readonly Highlight[]): string {
  if (highlights.length === 0) {
    return ["## Highlights", "", "No highlights found."].join("\n")
  }

  return ["## Highlights", "", ...highlights.map(formatHighlightEntry)].join("\n")
}

function formatSessionEntry(s: FocusSessionEvent): string {
  return `- **${s.created_at}** — Duration: ${s.duration} minutes`
}

export function formatFocusSessions(
  started: readonly FocusSessionEvent[],
  ended: readonly FocusSessionEvent[],
): string {
  if (started.length === 0 && ended.length === 0) {
    return ["## Focus Sessions", "", "No recent focus sessions found."].join("\n")
  }

  const startedSection = started.length > 0 ? ["### Started", "", ...started.map(formatSessionEntry), ""] : []

  const endedSection = ended.length > 0 ? ["### Ended", "", ...ended.map(formatSessionEntry)] : []

  return ["## Focus Sessions", "", ...startedSection, ...endedSection].join("\n")
}
