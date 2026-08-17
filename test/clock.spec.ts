import { describe, expect, it } from "vitest"

import type { Duration } from "../src/clock.js"
import {
  addDuration,
  between,
  civilInZone,
  civilToInstant,
  formatInZone,
  offsetInZone,
  parseDuration,
  parseInstant,
  validateTimezone,
} from "../src/clock.js"

const at = (iso: string): Date => new Date(iso)

/** Parse a duration or fail the test — keeps the DST cases readable. */
const parsed = (iso: string): Duration =>
  parseDuration(iso).fold(
    (e) => {
      throw new Error(e.message)
    },
    (d) => d,
  )

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

describe("DST-aware arithmetic", () => {
  const NY = "America/New_York"

  it("adds a calendar day across US fall-back (25 real hours)", () => {
    // The reported bug: this added exactly 24h and landed on 23:00 the same day.
    const start = at("2026-11-01T00:00:00-04:00")
    const result = addDuration(start, parsed("P1D"), NY)
    expect(formatInZone(result, NY)).toBe("2026-11-02T00:00:00")
    expect(result.getTime() - start.getTime()).toBe(25 * 3_600_000)
  })

  it("adds a calendar day across US spring-forward (23 real hours)", () => {
    // Previously landed on 01:00 the next day.
    const start = at("2026-03-08T00:00:00-05:00")
    const result = addDuration(start, parsed("P1D"), NY)
    expect(formatInZone(result, NY)).toBe("2026-03-09T00:00:00")
    expect(result.getTime() - start.getTime()).toBe(23 * 3_600_000)
  })

  it("keeps PT24H exact across the same boundary", () => {
    // Time units must NOT be calendar-adjusted — 24 hours is 24 hours.
    const start = at("2026-11-01T00:00:00-04:00")
    const result = addDuration(start, parsed("PT24H"), NY)
    expect(result.getTime() - start.getTime()).toBe(24 * 3_600_000)
    expect(formatInZone(result, NY)).toBe("2026-11-01T23:00:00")
  })

  it("is unaffected in a zone without DST", () => {
    const start = at("2026-11-01T00:00:00Z")
    const result = addDuration(start, parsed("P1D"), "UTC")
    expect(result.getTime() - start.getTime()).toBe(24 * 3_600_000)
  })

  it("adds months on the zone's calendar, not UTC's", () => {
    // 19:00 NY on Jan 31 is Feb 1 in UTC — month arithmetic must follow NY.
    const result = addDuration(at("2026-01-31T19:00:00-05:00"), parsed("P1M"), NY)
    expect(formatInZone(result, NY)).toBe("2026-02-28T19:00:00")
  })

  it("round-trips civil time through a zone", () => {
    const civil = { day: 17, hour: 14, minute: 30, month: 8, second: 0, year: 2026 }
    const instant = civilToInstant(civil, NY)
    expect(civilInZone(instant, NY)).toEqual(civil)
  })

  it("resolves an ambiguous wall clock to the earlier occurrence", () => {
    // 01:30 on 2026-11-01 happens twice in New York; take the first (EDT, -04:00).
    const instant = civilToInstant({ day: 1, hour: 1, minute: 30, month: 11, second: 0, year: 2026 }, NY)
    expect(offsetInZone(instant, NY)).toBe("-04:00")
  })
})

describe("naive timestamp parsing", () => {
  it("reads a naive timestamp as wall clock in the supplied zone", () => {
    // Previously resolved against the HOST zone, so this differed between a
    // laptop and the Worker.
    parseInstant("2026-11-01T00:00:00", "America/New_York").fold(
      () => expect.fail("expected a Right"),
      (d) => expect(d.toISOString()).toBe("2026-11-01T04:00:00.000Z"),
    )
  })

  it("defaults a naive timestamp to UTC", () => {
    parseInstant("2026-11-01T00:00:00").fold(
      () => expect.fail("expected a Right"),
      (d) => expect(d.toISOString()).toBe("2026-11-01T00:00:00.000Z"),
    )
  })

  it("ignores the zone when the timestamp carries one", () => {
    parseInstant("2026-11-01T00:00:00Z", "Asia/Tokyo").fold(
      () => expect.fail("expected a Right"),
      (d) => expect(d.toISOString()).toBe("2026-11-01T00:00:00.000Z"),
    )
  })

  it("rejects loose formats instead of guessing", () => {
    // `new Date` accepted these and resolved them against the host zone.
    expect(parseInstant("17 Aug 2026").isLeft()).toBe(true)
    expect(parseInstant("2026/08/17").isLeft()).toBe(true)
    expect(parseInstant("August 17, 2026").isLeft()).toBe(true)
  })

  it("still accepts the documented ISO forms", () => {
    expect(parseInstant("2026-08-17T14:30:00Z").isRight()).toBe(true)
    expect(parseInstant("2026-08-17T10:30:00-04:00").isRight()).toBe(true)
    expect(parseInstant("2026-08-17T14:30").isRight()).toBe(true)
    expect(parseInstant("2026-08-17T14:30:00.123Z").isRight()).toBe(true)
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

  it("signs every component the same way, so they sum correctly", () => {
    // Previously days was negative while hours/minutes/seconds stayed positive,
    // so naively summing the components gave the wrong magnitude.
    const result = between(at("2026-08-17T16:56:30Z"), at("2026-07-02T09:00:00Z"))
    expect(result.milliseconds).toBeLessThan(0)
    for (const component of [result.days, result.hours, result.minutes, result.seconds]) {
      expect(component).toBeLessThanOrEqual(0)
    }

    const summed =
      result.days * 86_400_000 + result.hours * 3_600_000 + result.minutes * 60_000 + result.seconds * 1_000
    expect(summed).toBe(result.milliseconds)
  })

  it("reports direction explicitly", () => {
    expect(between(at("2026-08-17T00:00:00Z"), at("2026-08-18T00:00:00Z")).direction).toBe("future")
    expect(between(at("2026-08-18T00:00:00Z"), at("2026-08-17T00:00:00Z")).direction).toBe("past")
    expect(between(at("2026-08-17T00:00:00Z"), at("2026-08-17T00:00:00Z")).direction).toBe("same")
  })

  it("sums correctly for forward intervals too", () => {
    const result = between(at("2026-07-02T09:00:00Z"), at("2026-08-17T16:56:30Z"))
    const summed =
      result.days * 86_400_000 + result.hours * 3_600_000 + result.minutes * 60_000 + result.seconds * 1_000
    expect(summed).toBe(result.milliseconds)
  })
})
