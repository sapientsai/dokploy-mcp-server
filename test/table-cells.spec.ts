import { Option } from "functype"
import { describe, expect, it } from "vitest"

import type { AnalyticDataResponse, TimelineResponse } from "../src/types"
import { formatActivityData, tableCell } from "../src/utils/formatters"
import { formatProjectTime, formatRecentActivity } from "../src/utils/resource-formatters"
import { projectEntry } from "./fixtures/resource"

// A Microsoft Teams window title has this shape: segments joined by pipes. All names here are made up.
const TEAMS_TITLE = "Teams - Chat | Example Person | example.org | someone@example.org | Microsoft Teams"

/**
 * Cells in a Markdown table row, the way GFM reads it: a pipe is escaped only when an odd number of
 * backslashes sits right before it, since each pair is one literal backslash.
 */
const cellCount = (row: string): number =>
  [...row].reduce(
    (acc, ch) =>
      ch === "\\"
        ? { ...acc, run: acc.run + 1 }
        : { pipes: acc.pipes + (ch === "|" && acc.run % 2 === 0 ? 1 : 0), run: 0 },
    { pipes: 0, run: 0 },
  ).pipes - 1

const tableRows = (markdown: string): readonly string[] => markdown.split("\n").filter((l) => l.startsWith("| "))

describe("tableCell", () => {
  it("escapes every pipe", () => {
    expect(tableCell("a | b | c")).toBe("a \\| b \\| c")
  })

  it("flattens line breaks into spaces", () => {
    expect(tableCell("one\ntwo\r\nthree\rfour")).toBe("one two three four")
  })

  it("keeps the pipe escaped after two or three backslashes too", () => {
    for (const run of ["\\\\", "\\\\\\"]) {
      expect(cellCount(`| ${tableCell(`a${run}|b`)} | x |`)).toBe(2)
    }
    expect(tableCell("a\\\\|b")).toBe("a\\\\\\\\\\|b")
  })

  it("doubles a backslash that sits right before a pipe, so the pipe stays escaped", () => {
    expect(tableCell("a\\|b")).toBe("a\\\\\\|b")
    expect(cellCount(`| ${tableCell("a\\|b")} | x |`)).toBe(2)
  })

  it("leaves other backslashes alone", () => {
    expect(tableCell("C:\\Users\\me")).toBe("C:\\Users\\me")
  })

  it("leaves plain text alone", () => {
    expect(tableCell("VS Code")).toBe("VS Code")
  })
})

describe("tables keep their columns when names contain pipes", () => {
  it("get_activity_data", () => {
    const response: AnalyticDataResponse = {
      notes: "",
      row_headers: [
        "Rank",
        "Time Spent (seconds)",
        "Number of People",
        "Activity",
        "Document",
        "Category",
        "Productivity",
      ],
      rows: [[1, 600, 1, "ms-teams", TEAMS_TITLE, "General", 0]],
    }
    const rows = tableRows(formatActivityData(response, { restrict_kind: "document" }))
    expect(rows.map(cellCount)).toEqual([7, 7, 7])
    expect(rows[2]).toContain("Teams - Chat \\| Example Person")
  })

  it("get_project_time", () => {
    const entry = projectEntry({ name: "Client | Phase 2", project: { id: 9, name: "Client | Phase 2" } })
    const rows = tableRows(
      formatProjectTime(
        [{ date: "2026-11-06", response: { is_complete: true, job_id: null, project_times: [entry] } }],
        "2026-11-06",
        Option.none(),
      ),
    )
    expect(rows.map(cellCount)).toEqual([2, 2, 2])
  })

  it("get_recent_activity", () => {
    const timeline: TimelineResponse = {
      activities: {
        "2026-11-09 11:20:00 -0500": {
          display_name: TEAMS_TITLE,
          category: "General",
          duration: 60,
          continuation: false,
        },
        "2026-11-09 11:25:00 -0500": {
          display_name: TEAMS_TITLE,
          category: "General",
          continuation: true,
          guess: true,
          was_empty: false,
          masked_bucket: { display_name: "Other", category: "General", duration: 90 },
        },
        "2026-11-09 11:30:00 -0500": {
          display_name: "A | B",
          category: "Odd | Category",
          duration: 38,
          continuation: true,
        },
      },
      activity_intervals: [],
    }
    const rows = tableRows(formatRecentActivity(timeline, 288, "today"))
    expect(rows.map(cellCount)).toEqual([4, 4, 4, 4, 4])
    expect(rows).toContain("| 11:30 | A \\| B (continued) | Odd \\| Category | 38s |")
  })
})
