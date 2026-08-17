import { describe, expect, it } from "vitest"

import {
  addDuration,
  between,
  formatInZone,
  offsetInZone,
  parseDuration,
  parseInstant,
  validateTimezone,
} from "../src/clock.js"

const at = (iso: string): Date => new Date(iso)

describe("validateTimezone", () => {
  it("accepts IANA identifiers", () => {
    expect(validateTimezone("America/New_York").isRight()).toBe(true)
    expect(validateTimezone("UTC").isRight()).toBe(true)
  })

  it("rejects unknown zones with an actionable hint", () => {
    const result = validateTimezone("Mars/Olympus_Mons")
    expect(result.isLeft()).toBe(true)
    result.fold(
      (error) => {
        expect(error.message).toContain("Mars/Olympus_Mons")
        expect(error.hint).toContain("America/New_York")
      },
      () => expect.fail("expected a Left"),
    )
  })

  it("rejects a common non-IANA abbreviation", () => {
    // "EST" is a fixed-offset alias, not a zone — it silently ignores DST.
    expect(validateTimezone("Not/AZone").isLeft()).toBe(true)
  })
})

describe("formatInZone", () => {
  it("renders wall-clock time for a zone", () => {
    // 2026-08-17T14:30:00Z is 10:30 in New York (EDT, UTC-4).
    expect(formatInZone(at("2026-08-17T14:30:00Z"), "America/New_York")).toBe("2026-08-17T10:30:00")
    expect(formatInZone(at("2026-08-17T14:30:00Z"), "UTC")).toBe("2026-08-17T14:30:00")
  })

  it("crosses the date line correctly", () => {
    expect(formatInZone(at("2026-08-17T23:30:00Z"), "Asia/Tokyo")).toBe("2026-08-18T08:30:00")
  })

  it("normalizes midnight to hour 00", () => {
    expect(formatInZone(at("2026-08-17T00:00:00Z"), "UTC")).toBe("2026-08-17T00:00:00")
  })
})

describe("offsetInZone", () => {
  it("reports the offset in effect at that instant, not a fixed one", () => {
    // Same zone, opposite sides of the DST boundary.
    expect(offsetInZone(at("2026-08-17T12:00:00Z"), "America/New_York")).toBe("-04:00")
    expect(offsetInZone(at("2026-01-17T12:00:00Z"), "America/New_York")).toBe("-05:00")
  })

  it("handles UTC and positive offsets", () => {
    expect(offsetInZone(at("2026-08-17T12:00:00Z"), "UTC")).toBe("+00:00")
    expect(offsetInZone(at("2026-08-17T12:00:00Z"), "Asia/Tokyo")).toBe("+09:00")
  })

  it("handles half-hour offsets", () => {
    expect(offsetInZone(at("2026-08-17T12:00:00Z"), "Asia/Kolkata")).toBe("+05:30")
  })
})

describe("parseInstant", () => {
  it("accepts ISO-8601 with Z and with an explicit offset", () => {
    expect(parseInstant("2026-08-17T14:30:00Z").isRight()).toBe(true)
    expect(parseInstant("2026-08-17T10:30:00-04:00").isRight()).toBe(true)
  })

  it("rejects garbage", () => {
    expect(parseInstant("not a timestamp").isLeft()).toBe(true)
    expect(parseInstant("").isLeft()).toBe(true)
  })
})

describe("parseDuration", () => {
  it("parses a full duration", () => {
    parseDuration("P1Y2M3DT4H5M6S").fold(
      () => expect.fail("expected a Right"),
      (d) => expect(d).toEqual({ days: 3, hours: 4, minutes: 5, months: 2, seconds: 6, years: 1 }),
    )
  })

  it("folds weeks into days", () => {
    parseDuration("P2W").fold(
      () => expect.fail("expected a Right"),
      (d) => expect(d.days).toBe(14),
    )
  })

  it("distinguishes month-M from minute-M by position", () => {
    const months = parseDuration("P1M")
    const minutes = parseDuration("PT1M")
    months.fold(
      () => expect.fail("expected a Right"),
      (d) => expect([d.months, d.minutes]).toEqual([1, 0]),
    )
    minutes.fold(
      () => expect.fail("expected a Right"),
      (d) => expect([d.months, d.minutes]).toEqual([0, 1]),
    )
  })

  it("supports a negative sign", () => {
    parseDuration("-P1D").fold(
      () => expect.fail("expected a Right"),
      (d) => expect(d.days).toBe(-1),
    )
  })

  it("rejects malformed durations", () => {
    expect(parseDuration("P").isLeft()).toBe(true)
    expect(parseDuration("1D").isLeft()).toBe(true)
    expect(parseDuration("PT").isLeft()).toBe(true)
    expect(parseDuration("").isLeft()).toBe(true)
  })
})

describe("addDuration", () => {
  it("adds exact time units", () => {
    const result = addDuration(at("2026-08-17T12:00:00Z"), {
      days: 0,
      hours: 2,
      minutes: 30,
      months: 0,
      seconds: 0,
      years: 0,
    })
    expect(result.toISOString()).toBe("2026-08-17T14:30:00.000Z")
  })

  it("clamps month arithmetic instead of rolling over", () => {
    // One month after Jan 31 is Feb 28 (2026 is not a leap year) — not Mar 3.
    const result = addDuration(at("2026-01-31T12:00:00Z"), {
      days: 0,
      hours: 0,
      minutes: 0,
      months: 1,
      seconds: 0,
      years: 0,
    })
    expect(result.toISOString()).toBe("2026-02-28T12:00:00.000Z")
  })

  it("lands on Feb 29 in a leap year", () => {
    const result = addDuration(at("2028-01-31T12:00:00Z"), {
      days: 0,
      hours: 0,
      minutes: 0,
      months: 1,
      seconds: 0,
      years: 0,
    })
    expect(result.toISOString()).toBe("2028-02-29T12:00:00.000Z")
  })

  it("subtracts on negative durations", () => {
    const result = addDuration(at("2026-08-17T12:00:00Z"), {
      days: -1,
      hours: 0,
      minutes: 0,
      months: 0,
      seconds: 0,
      years: 0,
    })
    expect(result.toISOString()).toBe("2026-08-16T12:00:00.000Z")
  })

  it("rolls years correctly across a December boundary", () => {
    const result = addDuration(at("2026-12-15T00:00:00Z"), {
      days: 0,
      hours: 0,
      minutes: 0,
      months: 1,
      seconds: 0,
      years: 0,
    })
    expect(result.toISOString()).toBe("2027-01-15T00:00:00.000Z")
  })
})

describe("between", () => {
  it("breaks an interval into whole units", () => {
    const result = between(at("2026-08-17T00:00:00Z"), at("2026-08-18T02:30:15Z"))
    expect(result.days).toBe(1)
    expect(result.hours).toBe(2)
    expect(result.minutes).toBe(30)
    expect(result.seconds).toBe(15)
    expect(result.humanized).toBe("1 day, 2 hours, 30 minutes, 15 seconds")
  })

  it("goes negative when `to` precedes `from`", () => {
    const result = between(at("2026-08-18T00:00:00Z"), at("2026-08-17T00:00:00Z"))
    expect(result.milliseconds).toBe(-86_400_000)
    expect(result.days).toBe(-1)
    expect(result.humanized).toBe("1 day ago")
  })

  it("handles a zero interval", () => {
    const result = between(at("2026-08-17T00:00:00Z"), at("2026-08-17T00:00:00Z"))
    expect(result.milliseconds).toBe(0)
    expect(result.humanized).toBe("0 seconds")
  })

  it("singularizes correctly", () => {
    const result = between(at("2026-08-17T00:00:00Z"), at("2026-08-17T01:01:01Z"))
    expect(result.humanized).toBe("1 hour, 1 minute, 1 second")
  })
})
