import { describe, expect, it } from "vitest"

import type { AnalyticDataResponse, DailySummary, FocusSessionEvent, Highlight } from "../src/types"
import {
  formatActivityData,
  formatDailySummary,
  formatDuration,
  formatFocusSessions,
  formatHighlights,
  formatProductivityScore,
  productivityLabel,
} from "../src/utils/formatters"

describe("formatDuration", () => {
  it("should format hours and minutes", () => {
    expect(formatDuration(3661)).toBe("1h 1m")
  })

  it("should format minutes only", () => {
    expect(formatDuration(300)).toBe("5m")
  })

  it("should format seconds only", () => {
    expect(formatDuration(45)).toBe("45s")
  })

  it("should handle zero", () => {
    expect(formatDuration(0)).toBe("0s")
  })

  it("should handle large values", () => {
    expect(formatDuration(36000)).toBe("10h 0m")
  })
})

describe("productivityLabel", () => {
  it("should map all productivity levels", () => {
    expect(productivityLabel(2)).toBe("Very Productive")
    expect(productivityLabel(1)).toBe("Productive")
    expect(productivityLabel(0)).toBe("Neutral")
    expect(productivityLabel(-1)).toBe("Distracting")
    expect(productivityLabel(-2)).toBe("Very Distracting")
  })

  it("should return Unknown for invalid levels", () => {
    expect(productivityLabel(5)).toBe("Unknown")
  })
})

describe("formatActivityData", () => {
  it("should format data as markdown table", () => {
    const response: AnalyticDataResponse = {
      notes: "",
      row_headers: ["Rank", "Time Spent (seconds)", "Activity", "Category"],
      rows: [
        [1, 3600, "VS Code", "Software Development"],
        [2, 1800, "Chrome", "Reference & Learning"],
      ],
    }

    const result = formatActivityData(response, { restrict_kind: "activity" })

    expect(result).toContain("## Activity Data")
    expect(result).toContain("| Rank | Time Spent (seconds) | Activity | Category |")
    expect(result).toContain("1h 0m")
    expect(result).toContain("30m")
    expect(result).toContain("**Total time tracked:** 1h 30m")
    expect(result).toContain("2 entries")
  })

  it("should handle empty data", () => {
    const response: AnalyticDataResponse = {
      notes: "",
      row_headers: [],
      rows: [],
    }

    const result = formatActivityData(response, {})

    expect(result).toContain("No activity data found")
  })
})

describe("formatDailySummary", () => {
  it("should format summaries with productivity breakdown", () => {
    const summaries: readonly DailySummary[] = [
      {
        id: 1,
        date: "2024-01-15",
        productivity_pulse: 75,
        very_productive_percentage: 40,
        productive_percentage: 20,
        neutral_percentage: 15,
        distracting_percentage: 15,
        very_distracting_percentage: 10,
        all_productive_percentage: 60,
        all_distracting_percentage: 25,
        uncategorized_percentage: 0,
        business_percentage: 10,
        communication_and_scheduling_percentage: 15,
        social_networking_percentage: 5,
        design_and_composition_percentage: 0,
        entertainment_percentage: 5,
        news_percentage: 5,
        software_development_percentage: 45,
        reference_and_learning_percentage: 10,
        shopping_percentage: 0,
        utilities_percentage: 5,
        total_hours: 8.5,
        very_productive_hours: 3.4,
        productive_hours: 1.7,
        neutral_hours: 1.275,
        distracting_hours: 1.275,
        very_distracting_hours: 0.85,
        all_productive_hours: 5.1,
        all_distracting_hours: 2.125,
        uncategorized_hours: 0,
        total_duration_formatted: "8h 30m",
        very_productive_duration_formatted: "3h 24m",
        productive_duration_formatted: "1h 42m",
        neutral_duration_formatted: "1h 16m",
        distracting_duration_formatted: "1h 16m",
        very_distracting_duration_formatted: "51m",
      },
    ]

    const result = formatDailySummary(summaries)

    expect(result).toContain("## Daily Productivity Summary")
    expect(result).toContain("### 2024-01-15")
    expect(result).toContain("**Productivity Pulse:** 75/100")
    expect(result).toContain("Very Productive")
  })

  it("should handle empty summaries", () => {
    const result = formatDailySummary([])
    expect(result).toContain("No daily summaries available")
  })
})

describe("formatProductivityScore", () => {
  it("should format single day with category breakdown", () => {
    const summary = {
      id: 1,
      date: "2024-01-15",
      productivity_pulse: 82,
      all_productive_percentage: 65,
      all_productive_hours: 5.5,
      all_distracting_percentage: 20,
      all_distracting_hours: 1.7,
      neutral_percentage: 10,
      neutral_hours: 0.85,
      uncategorized_percentage: 5,
      uncategorized_hours: 0.4,
      software_development_percentage: 50,
      business_percentage: 15,
      communication_and_scheduling_percentage: 10,
      reference_and_learning_percentage: 8,
      design_and_composition_percentage: 2,
      utilities_percentage: 5,
      news_percentage: 3,
      social_networking_percentage: 4,
      entertainment_percentage: 2,
      shopping_percentage: 1,
      total_duration_formatted: "8h 30m",
    } as DailySummary

    const result = formatProductivityScore(summary)

    expect(result).toContain("## Productivity Score for 2024-01-15")
    expect(result).toContain("### Pulse: 82/100")
    expect(result).toContain("**Software Development:** 50.0%")
  })
})

describe("formatHighlights", () => {
  it("should format highlights as list", () => {
    const highlights: readonly Highlight[] = [
      {
        id: 1,
        date: "2024-01-15",
        description: "Shipped feature X",
        source: "mcp-server",
        created_at: "2024-01-15T10:00:00Z",
      },
      { id: 2, date: "2024-01-14", description: "Fixed critical bug", source: "", created_at: "2024-01-14T15:00:00Z" },
    ]

    const result = formatHighlights(highlights)

    expect(result).toContain("## Highlights")
    expect(result).toContain("**2024-01-15**: Shipped feature X")
    expect(result).toContain("*(source: mcp-server)*")
    expect(result).toContain("**2024-01-14**: Fixed critical bug")
  })

  it("should handle empty highlights", () => {
    const result = formatHighlights([])
    expect(result).toContain("No highlights found")
  })
})

describe("formatFocusSessions", () => {
  it("should format started and ended sessions", () => {
    const started: readonly FocusSessionEvent[] = [{ id: 1, duration: 25, created_at: "2024-01-15T09:00:00Z" }]
    const ended: readonly FocusSessionEvent[] = [{ id: 1, duration: 25, created_at: "2024-01-15T09:25:00Z" }]

    const result = formatFocusSessions(started, ended)

    expect(result).toContain("## Focus Sessions")
    expect(result).toContain("### Started")
    expect(result).toContain("### Ended")
    expect(result).toContain("Duration: 25 minutes")
  })

  it("should handle no sessions", () => {
    const result = formatFocusSessions([], [])
    expect(result).toContain("No recent focus sessions found")
  })
})
