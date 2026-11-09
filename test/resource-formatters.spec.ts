import { describe, expect, it } from "vitest"

import {
  formatFocusState,
  formatProjectTime,
  formatRecentActivity,
  formatStopResult,
  formatTimerStarted,
} from "../src/utils/resource-formatters"
import {
  projectEntry,
  sessionState,
  stopDeleted,
  stopNone,
  timeline,
  timelineWithGaps,
  timerState,
} from "./fixtures/resource"

describe("formatFocusState", () => {
  it("says nothing is active for an empty state list", () => {
    expect(formatFocusState([], 0)).toContain("Nothing is active")
  })

  it("shows a timer's label, elapsed time and blocking", () => {
    const result = formatFocusState([timerState], timerState.start_time_epoch + 120)
    expect(result).toContain("### Timer: Shape test")
    expect(result).toContain("(2m ago)")
    expect(result).toContain("unless stopped")
    expect(result).toContain("apps and sites off")
  })

  it("shows a session's time left", () => {
    const result = formatFocusState([sessionState], sessionState.start_time_epoch + 600)
    expect(result).toContain("### Focus session: Deep work")
    expect(result).toContain("(50m left)")
    expect(result).toContain("apps and sites on")
  })
})

describe("formatTimerStarted", () => {
  it("names the project and task", () => {
    const result = formatTimerStarted(timerState, { projectName: "Client Alpha", taskName: "Development" })
    expect(result).toContain("for project **Client Alpha** / task **Development**")
    expect(result).toContain('with label "Shape test"')
    expect(result).toContain("stop_timer")
  })

  it("works without a project", () => {
    expect(formatTimerStarted(timerState, {})).toMatch(/^Timer started with label/)
  })
})

describe("formatStopResult", () => {
  it("reports nothing running", () => {
    expect(formatStopResult(stopNone)).toContain("Nothing was active")
  })

  it("explains a cancelled session", () => {
    const result = formatStopResult(stopDeleted)
    expect(result).toContain('Cancelled "Shape test"')
    expect(result).toContain("discarded its record")
  })

  it("reports a kept session and logged project time", () => {
    const result = formatStopResult({
      message: "updated",
      focus_session: { name: "Writing", start_time: "2026-11-08T09:00:00-05:00", duration: 1800 },
      project_time: projectEntry({ duration: 1800 }),
    })
    expect(result).toContain('Stopped "Writing" after 30m and kept its record')
    expect(result).toContain("Logged 30m to Client Alpha")
  })
})

describe("formatProjectTime", () => {
  const complete = (entries: ReturnType<typeof projectEntry>[]) => ({
    is_complete: true,
    job_id: null,
    project_times: entries,
  })

  it("reports an empty range", () => {
    expect(formatProjectTime([{ date: "2026-11-05", response: complete([]) }], "2026-11-05")).toContain(
      "No project time logged",
    )
  })

  it("totals by project and task, hides the hidden default task, and flags drafts", () => {
    const result = formatProjectTime(
      [
        {
          date: "2026-11-06",
          response: complete([
            projectEntry(),
            projectEntry({
              start_time: "2026-11-06T08:00:00.000-08:00",
              end_time: "2026-11-06T08:15:00.000-08:00",
              duration: 900,
              extra: { draft: false },
              task: { id: 13, name: "Development", hidden: false },
            }),
          ]),
        },
        { date: "2026-11-07", response: complete([]) },
      ],
      "2026-11-06 to 2026-11-07",
    )
    expect(result).toContain("## Project Time (2026-11-06 to 2026-11-07)")
    expect(result).toContain("**Total:** 35m across 2 entries")
    expect(result).toContain("| Client Alpha | 20m |")
    expect(result).toContain("| Client Alpha / Development | 15m |")
    expect(result).toContain("05:45–06:05 **Client Alpha** 20m *(draft)*")
    expect(result).toContain("1 of 2 entries are drafts")
    expect(result).not.toContain("### 2026-11-07")
  })

  it("notes days RescueTime had not finished", () => {
    const result = formatProjectTime(
      [{ date: "2026-11-06", response: { is_complete: false, job_id: 7, project_times: [] } }],
      "2026-11-06",
    )
    expect(result).toContain("still computing 2026-11-06")
  })
})

describe("formatRecentActivity", () => {
  it("lists windows newest first, capped at the limit", () => {
    const result = formatRecentActivity(timeline, 2, "today")
    const rows = result.split("\n").filter((l) => l.startsWith("| 09:"))
    expect(rows).toEqual([
      "| 09:20 | Slack | Communication | 4m |",
      "| 09:15 | VS Code (continued) | Software Development | 3m |",
    ])
    expect(result).toContain("latest 2 of 3 windows")
  })

  it("renders a full day with untracked and guessed windows without any undefined", () => {
    const result = formatRecentActivity(timelineWithGaps, 288, "2026-11-08")
    expect(result).not.toContain("undefined")
    expect(result).not.toContain("null")
    expect(result).toContain("latest 5 of 5 windows with activity")
  })

  it("leaves out untracked windows", () => {
    const rows = formatRecentActivity(timelineWithGaps, 288, "2026-11-08")
      .split("\n")
      .filter((l) => l.startsWith("| 09:"))
    expect(rows.map((r) => r.slice(2, 7))).toEqual(["09:35", "09:25", "09:20", "09:15", "09:00"])
  })

  it("tells the two kinds of guessed window apart and gives neither a time", () => {
    const result = formatRecentActivity(timelineWithGaps, 288, "2026-11-08")
    expect(result).toContain("| 09:20 | VS Code (guessed over other activity) | Software Development | — |")
    expect(result).toContain("| 09:15 | VS Code (guessed, nothing tracked) | Software Development | — |")
    expect(result).toContain("*Over other activity* means it recorded a different activity there")
    expect(result).not.toContain("measured nothing")
  })

  it("keeps the hidden activity out of the output", () => {
    const result = formatRecentActivity(timelineWithGaps, 288, "2026-11-08")
    expect(result).not.toContain("Example Chat")
    expect(result).not.toContain("2m 16s")
  })

  it("shows a dash for a null category", () => {
    expect(formatRecentActivity(timelineWithGaps, 288, "2026-11-08")).toContain("| 09:35 | Unsorted App | — | 40s |")
  })

  it("omits the guess note when no guessed window is shown", () => {
    expect(formatRecentActivity(timelineWithGaps, 1, "2026-11-08")).not.toContain("*Guessed*")
  })

  it("treats a day of only untracked windows as no activity", () => {
    const empty = {
      activities: { "2026-11-08 09:00:00 -0500": {}, "2026-11-08 09:05:00 -0500": {} },
      activity_intervals: [],
    }
    expect(formatRecentActivity(empty, 24, "today")).toContain("No activity tracked")
  })

  it("handles a day with no activity", () => {
    expect(formatRecentActivity({ activities: {}, activity_intervals: [] }, 24, "today")).toContain(
      "No activity tracked",
    )
    expect(formatRecentActivity({ activities: [], activity_intervals: [] }, 24, "today")).toContain(
      "No activity tracked",
    )
  })
})
