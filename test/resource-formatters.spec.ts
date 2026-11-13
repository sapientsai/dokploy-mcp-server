import { Option } from "functype"
import { describe, expect, it } from "vitest"

import {
  formatFocusState,
  formatProjectTime,
  formatRecentActivity,
  formatStopResult,
  formatTimerStarted,
} from "../src/utils/resource-formatters"
import {
  linkedTimerState,
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
    expect(formatFocusState([], 0, Option.none<string>())).toContain("Nothing is active")
  })

  it("shows a timer's label, elapsed time and blocking", () => {
    const result = formatFocusState([timerState], timerState.start_time_epoch + 120, Option.none<string>())
    expect(result).toContain("### Timer: Shape test")
    expect(result).toContain("(2m ago)")
    expect(result).toContain("unless stopped")
    expect(result).toContain("apps and sites off")
  })

  it("names the project a timer is linked to", () => {
    expect(formatFocusState([linkedTimerState], linkedTimerState.start_time_epoch, Option.none<string>())).toContain(
      "- **Project:** Client Alpha",
    )
  })

  it("has no project line for an unlinked timer", () => {
    expect(formatFocusState([timerState], timerState.start_time_epoch, Option.none<string>())).not.toContain("Project")
  })

  it("prints times in the account's time zone", () => {
    // Asia/Tokyo is neither Eastern nor UTC, so this can't pass by accident on a dev machine or in CI.
    const result = formatFocusState([timerState], timerState.start_time_epoch, Option("Asia/Tokyo"))
    expect(result).toContain("- **Started:** 2026-11-09 09:58 GMT+9")
    expect(result).toContain("- **Expires:** 2026-11-09 10:03 GMT+9 unless stopped")
  })

  it("falls back to labeled UTC without a time zone", () => {
    expect(formatFocusState([timerState], timerState.start_time_epoch, Option.none())).toContain(
      "- **Started:** 2026-11-09 00:58 UTC",
    )
  })

  it("shows a session's time left", () => {
    const result = formatFocusState([sessionState], sessionState.start_time_epoch + 600, Option.none<string>())
    expect(result).toContain("### Focus session: Deep work")
    expect(result).toContain("(50m left)")
    expect(result).toContain("apps and sites on")
  })
})

describe("formatTimerStarted", () => {
  it("names the project and task", () => {
    const result = formatTimerStarted(
      timerState,
      { projectName: "Client Alpha", taskName: "Development" },
      Option.none<string>(),
    )
    expect(result).toContain("for project **Client Alpha** / task **Development**")
    expect(result).toContain('with label "Shape test"')
    expect(result).toContain("stop_timer")
  })

  it("works without a project", () => {
    expect(formatTimerStarted(timerState, {}, Option.none<string>())).toMatch(/^Timer started with label/)
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
    expect(
      formatProjectTime([{ date: "2026-11-05", response: complete([]) }], "2026-11-05", Option.none<string>()),
    ).toContain("No project time logged")
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
      Option.none<string>(),
    )
    expect(result).toContain("## Project Time (2026-11-06 to 2026-11-07)")
    expect(result).toContain("**Total:** 35m across 2 entries")
    expect(result).toContain("| Client Alpha | 20m |")
    expect(result).toContain("| Client Alpha / Development | 15m |")
    expect(result).toContain("05:45–06:05 **Client Alpha** 20m *(draft)*")
    expect(result).toContain("1 of 2 entries are drafts")
    expect(result).not.toContain("### 2026-11-07")
  })

  it("handles an entry a timer logged, whose provenance is an object", () => {
    const fromTimer = projectEntry({
      start_time: "2026-11-12T06:00:00.000-08:00",
      end_time: "2026-11-12T06:15:00.000-08:00",
      duration: 900,
      extra: { draft: false, comment: "Writing", provenance: { focus_session: { duration: 389 } } },
    })
    const result = formatProjectTime(
      [{ date: "2026-11-12", response: complete([fromTimer]) }],
      "2026-11-12",
      Option.none<string>(),
    )
    expect(result).toContain("06:00–06:15 **Client Alpha** 15m")
    expect(result).not.toContain("draft")
    expect(result).not.toContain("[object Object]")
  })

  it("converts RescueTime's Pacific-offset times to the account's time zone", () => {
    // The live 2026-11-12 test entry: RescueTime sent 06:00-08:00, which is 09:00 in New York.
    const entry = projectEntry({
      date: "2026-11-12",
      start_time: "2026-11-12T06:00:00.000-08:00",
      end_time: "2026-11-12T06:15:00.000-08:00",
      duration: 900,
      extra: { draft: false },
    })
    const days = [{ date: "2026-11-12", response: complete([entry]) }]
    const result = formatProjectTime(days, "2026-11-12", Option("America/New_York"))
    expect(result).toContain("- 09:00–09:15 **Client Alpha** 15m")
    expect(result).toContain("*Times are in the account's time zone, America/New_York.*")
    expect(formatProjectTime(days, "2026-11-12", Option("Asia/Tokyo"))).toContain("- 23:00–23:15 **Client Alpha** 15m")
  })

  it("says the times are RescueTime's own when the zone is unknown", () => {
    const result = formatProjectTime(
      [{ date: "2026-11-06", response: complete([projectEntry()]) }],
      "2026-11-06",
      Option.none(),
    )
    expect(result).toContain("- 05:45–06:05 **Client Alpha** 20m")
    expect(result).toContain(
      "*Times are as RescueTime sent them (UTC-08:00); the account's time zone was unavailable.*",
    )
  })

  it("notes days RescueTime had not finished", () => {
    const result = formatProjectTime(
      [{ date: "2026-11-06", response: { is_complete: false, job_id: 7, project_times: [] } }],
      "2026-11-06",
      Option.none<string>(),
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
