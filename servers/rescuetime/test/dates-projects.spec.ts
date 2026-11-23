import { Option } from "functype"
import { describe, expect, it } from "vitest"

import { dateRange, localDate, MAX_RANGE_DAYS } from "../src/utils/dates"
import { resolveTimerLink } from "../src/utils/projects"
import { projects } from "./fixtures/resource"

describe("localDate", () => {
  it("uses the local calendar day, not UTC", () => {
    // 23:30 local on Nov 8 is already Nov 9 in UTC for any zone west of UTC.
    expect(localDate(new Date(2026, 10, 8, 23, 30))).toBe("2026-11-08")
  })
})

describe("dateRange", () => {
  it("lists every day inclusive, across a month end", () => {
    expect(dateRange("2026-10-30", "2026-11-02").orThrow()).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ])
  })

  it("returns one day when start equals end", () => {
    expect(dateRange("2026-11-08", "2026-11-08").orThrow()).toEqual(["2026-11-08"])
  })

  it("rejects an end before the start as a validation error", () => {
    dateRange("2026-11-08", "2026-11-01").fold(
      (e) => expect(e.category).toBe("validation"),
      () => {
        throw new Error("Expected Left")
      },
    )
  })

  it(`rejects ranges over ${MAX_RANGE_DAYS} days`, () => {
    expect(dateRange("2026-01-01", "2026-12-31").isLeft()).toBe(true)
    expect(dateRange("2026-10-01", "2026-10-31").isRight()).toBe(true)
  })

  it("rejects malformed and impossible dates", () => {
    expect(dateRange("2026-2-1", "2026-02-03").isLeft()).toBe(true)
    expect(dateRange("2026-02-30", "2026-03-01").isLeft()).toBe(true)
  })
})

describe("resolveTimerLink", () => {
  it("matches a project case-insensitively", () => {
    const link = resolveTimerLink(projects, "client alpha", Option.none()).orThrow()
    expect(link.project.id).toBe(1)
    expect(link.task.isNone()).toBe(true)
  })

  it("accepts a unique partial name", () => {
    expect(resolveTimerLink(projects, "beta", Option.none()).orThrow().project.id).toBe(2)
  })

  it("rejects an ambiguous partial name and lists the choices", () => {
    resolveTimerLink(projects, "client", Option.none()).fold(
      (e) => {
        expect(e.category).toBe("not_found")
        expect(e.suggestions?.[0]).toContain('"Client Alpha", "Client Beta"')
      },
      () => {
        throw new Error("Expected Left")
      },
    )
  })

  it("ignores archived projects", () => {
    expect(resolveTimerLink(projects, "Old Project", Option.none()).isLeft()).toBe(true)
  })

  it("resolves a task and skips the hidden default task", () => {
    const link = resolveTimerLink(projects, "Client Alpha", Option("dev")).orThrow()
    expect(link.task.orThrow().id).toBe(13)
    expect(resolveTimerLink(projects, "Client Alpha", Option("(default)")).isLeft()).toBe(true)
  })
})
