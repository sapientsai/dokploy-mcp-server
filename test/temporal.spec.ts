// Regression suite for temporal-mcp-server.
//
// Locks the v0.2.0 behavior: zoned civil arithmetic, signed intervals, strict
// parsing, and the two DST disambiguation choices. Everything below the wiring
// import is data.
//
// The seam is test/helpers/mcp.ts, which registers the real tools against a stub
// server, validates arguments through each tool's own schema, and rejects on an
// `isError` result — the same contract somamcp/edge presents on the wire.

import { describe, expect, it } from "vitest"

import { callTool, expectToolError } from "./helpers/mcp.js"

type AddDurationResult = {
  readonly duration: string
  readonly from: string
  readonly fromLocal: string
  readonly local: string
  readonly offset: string
  readonly result: string
  readonly timezone: string
}

type TimeBetweenResult = {
  readonly days: number
  readonly direction: string
  readonly from: string
  readonly hours: number
  readonly humanized: string
  readonly milliseconds: number
  readonly minutes: number
  readonly seconds: number
  readonly to: string
}

type ConvertTimezoneResult = {
  readonly input: string
  readonly iso: string
  readonly offset: string
  readonly rendered: string
  readonly sourceTimezone: string
  readonly targetTimezone: string
}

type CurrentTimeResult = {
  readonly epochMs: number
  readonly iso: string
  readonly local: string
  readonly offset: string
  readonly timezone: string
}

const elapsedHours = (from: string, to: string): number => (Date.parse(to) - Date.parse(from)) / 3_600_000

const summedMillis = (r: TimeBetweenResult): number =>
  r.days * 86_400_000 + r.hours * 3_600_000 + r.minutes * 60_000 + r.seconds * 1_000

// ---------------------------------------------------------------------------
// add_duration
// ---------------------------------------------------------------------------

type AddCase = {
  readonly expect: Partial<AddDurationResult>
  readonly expectElapsedHours?: number
  readonly input: {
    readonly duration: string
    readonly isoTimestamp: string
    readonly timezone?: string
  }
  readonly name: string
}

const addDurationCases: readonly AddCase[] = [
  // -- naive input is interpreted in the supplied zone, not as UTC ----------
  {
    expect: {
      from: "2026-11-01T04:00:00.000Z",
      fromLocal: "2026-11-01T00:00:00",
      local: "2026-11-01T03:00:00",
      offset: "-05:00",
      result: "2026-11-01T08:00:00.000Z",
      timezone: "America/New_York",
    },
    // PT is exact elapsed time: 4 real hours across the fallback, so the wall
    // clock advances only 3.
    expectElapsedHours: 4,
    input: { duration: "PT4H", isoTimestamp: "2026-11-01T00:00:00", timezone: "America/New_York" },
    name: "naive timestamp resolves in the supplied zone",
  },

  // -- P units are calendar units in the zone ------------------------------
  {
    expect: {
      from: "2026-11-01T04:00:00.000Z",
      local: "2026-11-02T00:00:00",
      offset: "-05:00",
      result: "2026-11-02T05:00:00.000Z",
    },
    expectElapsedHours: 25,
    input: { duration: "P1D", isoTimestamp: "2026-11-01T00:00:00-04:00", timezone: "America/New_York" },
    name: "P1D across DST fallback keeps wall clock and spends 25 hours",
  },
  {
    expect: {
      from: "2026-03-08T05:00:00.000Z",
      local: "2026-03-09T00:00:00",
      offset: "-04:00",
      result: "2026-03-09T04:00:00.000Z",
    },
    expectElapsedHours: 23,
    input: { duration: "P1D", isoTimestamp: "2026-03-08T00:00:00-05:00", timezone: "America/New_York" },
    name: "P1D across DST spring-forward keeps wall clock and spends 23 hours",
  },

  // -- disambiguation: these two pin "compatible" semantics -----------------
  // If the underlying date handling is ever swapped, these are the cases that
  // will silently change. That is the whole reason they are here.
  {
    expect: {
      from: "2026-03-07T07:30:00.000Z",
      local: "2026-03-08T03:30:00",
      offset: "-04:00",
      result: "2026-03-08T07:30:00.000Z",
    },
    expectElapsedHours: 24,
    // Target local 2026-03-08T02:30 does not exist (02:00 -> 03:00 EST).
    input: { duration: "P1D", isoTimestamp: "2026-03-07T02:30:00", timezone: "America/New_York" },
    name: "nonexistent local time resolves forward past the gap",
  },
  {
    expect: {
      from: "2026-10-31T05:30:00.000Z",
      local: "2026-11-01T01:30:00",
      offset: "-04:00",
      result: "2026-11-01T05:30:00.000Z",
    },
    expectElapsedHours: 24,
    // Target local 2026-11-01T01:30 occurs twice. Expect the EDT instance.
    input: { duration: "P1D", isoTimestamp: "2026-10-31T01:30:00", timezone: "America/New_York" },
    name: "ambiguous local time resolves to the earlier (pre-transition) offset",
  },

  // -- sub-hour and southern-hemisphere DST --------------------------------
  // Lord Howe shifts by 30 minutes, not an hour; Chatham runs +12:45/+13:45.
  // Both are where zone handling tends to break, and neither is expressible if
  // offsets are assumed to be whole hours.
  {
    expect: { fromLocal: "2026-04-04T12:00:00", local: "2026-04-05T12:00:00", offset: "+10:30" },
    expectElapsedHours: 24.5,
    input: { duration: "P1D", isoTimestamp: "2026-04-04T12:00:00", timezone: "Australia/Lord_Howe" },
    name: "Lord Howe P1D across its 30-minute fallback spends 24.5 hours",
  },
  {
    expect: { fromLocal: "2026-10-03T12:00:00", local: "2026-10-04T12:00:00", offset: "+11:00" },
    expectElapsedHours: 23.5,
    input: { duration: "P1D", isoTimestamp: "2026-10-03T12:00:00", timezone: "Australia/Lord_Howe" },
    name: "Lord Howe P1D across its 30-minute spring-forward spends 23.5 hours",
  },
  {
    expect: { fromLocal: "2026-04-04T12:00:00", local: "2026-04-05T12:00:00", offset: "+12:45" },
    expectElapsedHours: 25,
    input: { duration: "P1D", isoTimestamp: "2026-04-04T12:00:00", timezone: "Pacific/Chatham" },
    name: "Chatham P1D across fallback keeps the :45 offset",
  },
  {
    expect: { fromLocal: "2026-09-26T12:00:00", local: "2026-09-27T12:00:00", offset: "+13:45" },
    expectElapsedHours: 23,
    input: { duration: "P1D", isoTimestamp: "2026-09-26T12:00:00", timezone: "Pacific/Chatham" },
    name: "Chatham P1D across spring-forward keeps the :45 offset",
  },

  // -- calendar clamping ---------------------------------------------------
  {
    expect: {
      local: "2028-02-29T12:00:00",
      offset: "+00:00",
      result: "2028-02-29T12:00:00.000Z",
      timezone: "UTC",
    },
    input: { duration: "P1M", isoTimestamp: "2028-01-31T12:00:00Z" },
    name: "P1M off Jan 31 clamps to end of February in a leap year",
  },
  {
    expect: { result: "2026-02-28T12:00:00.000Z" },
    input: { duration: "P1M", isoTimestamp: "2026-01-31T12:00:00Z" },
    name: "P1M off Jan 31 clamps to Feb 28 in a common year",
  },

  // -- negative compound duration ------------------------------------------
  {
    expect: {
      fromLocal: "2026-08-17T17:56:30", // BST
      local: "2025-06-14T13:51:24",
      offset: "+01:00",
      result: "2025-06-14T12:51:24.000Z",
    },
    input: { duration: "-P1Y2M3DT4H5M6S", isoTimestamp: "2026-08-17T16:56:30Z", timezone: "Europe/London" },
    name: "negative compound duration subtracts and renders in target zone",
  },
]

describe("add_duration", () => {
  it.each(addDurationCases)("$name", async ({ expect: want, expectElapsedHours, input }) => {
    const got = await callTool<AddDurationResult>("add_duration", input)
    expect(got).toMatchObject(want)
    if (expectElapsedHours !== undefined) {
      expect(elapsedHours(got.from, got.result)).toBe(expectElapsedHours)
    }
  })

  it("echoes fromLocal so the naive-input interpretation is auditable", async () => {
    const got = await callTool<AddDurationResult>("add_duration", {
      duration: "PT0S",
      isoTimestamp: "2026-06-15T09:00:00",
      timezone: "America/New_York",
    })
    expect(got.fromLocal).toBe("2026-06-15T09:00:00")
  })

  it("rejects non-ISO durations", async () => {
    await expectToolError(
      callTool("add_duration", { duration: "2 weeks", isoTimestamp: "2026-08-17T00:00:00Z" }),
      /Invalid ISO-8601 duration/,
    )
  })

  it("rejects non-ISO timestamps", async () => {
    await expectToolError(
      callTool("add_duration", { duration: "P1D", isoTimestamp: "17 Aug 2026" }),
      /Invalid ISO-8601 timestamp/,
    )
  })

  it("rejects unknown timezones", async () => {
    await expectToolError(
      callTool("add_duration", {
        duration: "P1D",
        isoTimestamp: "2026-08-17T00:00:00Z",
        timezone: "America/Concord",
      }),
      /Unknown timezone/,
    )
  })
})

// ---------------------------------------------------------------------------
// time_between
// ---------------------------------------------------------------------------

describe("time_between", () => {
  it("signs every component for a backward interval", async () => {
    const got = await callTool<TimeBetweenResult>("time_between", {
      from: "2026-08-17T16:56:30Z",
      to: "2026-07-02T09:00:00Z",
    })

    expect(got).toMatchObject({
      days: -46,
      direction: "past",
      hours: -7,
      humanized: "46 days, 7 hours, 56 minutes, 30 seconds ago",
      milliseconds: -4_002_990_000,
      minutes: -56,
      seconds: -30,
    })

    // Guard the bug this replaced: naive component summing must agree with the
    // signed millisecond total.
    expect(summedMillis(got)).toBe(got.milliseconds)
  })

  it("agrees with the millisecond total for a forward interval", async () => {
    const got = await callTool<TimeBetweenResult>("time_between", {
      from: "2026-07-02T09:00:00Z",
      to: "2026-08-17T16:56:30Z",
    })

    expect(got).toMatchObject({
      days: 46,
      direction: "future",
      hours: 7,
      humanized: "46 days, 7 hours, 56 minutes, 30 seconds",
      milliseconds: 4_002_990_000,
      minutes: 56,
      seconds: 30,
    })
    expect(summedMillis(got)).toBe(got.milliseconds)
  })

  it("reports a zero-length interval as same", async () => {
    const got = await callTool<TimeBetweenResult>("time_between", {
      from: "2026-08-17T16:56:30Z",
      to: "2026-08-17T16:56:30Z",
    })

    expect(got).toMatchObject({
      days: 0,
      direction: "same",
      hours: 0,
      humanized: "0 seconds",
      milliseconds: 0,
      minutes: 0,
      seconds: 0,
    })
  })

  it("measures real elapsed time across a DST boundary", async () => {
    // 25 hours of wall clock between the same local times, because the day the
    // interval spans is 25 hours long in New York.
    const got = await callTool<TimeBetweenResult>("time_between", {
      from: "2026-11-01T00:00:00",
      timezone: "America/New_York",
      to: "2026-11-02T00:00:00",
    })
    expect(got.milliseconds).toBe(25 * 3_600_000)
  })

  it("rejects non-ISO timestamps", async () => {
    await expectToolError(
      callTool("time_between", { from: "17 Aug 2026", to: "2026-08-18T00:00:00Z" }),
      /Invalid ISO-8601 timestamp/,
    )
  })
})

// ---------------------------------------------------------------------------
// convert_timezone
// ---------------------------------------------------------------------------

describe("convert_timezone", () => {
  it("handles sub-hour offsets", async () => {
    const got = await callTool<ConvertTimezoneResult>("convert_timezone", {
      isoTimestamp: "2026-08-17T16:56:30Z",
      targetTimezone: "Asia/Kathmandu",
    })

    expect(got).toMatchObject({
      iso: "2026-08-17T16:56:30.000Z",
      offset: "+05:45",
      rendered: "2026-08-17T22:41:30",
      sourceTimezone: "UTC",
      targetTimezone: "Asia/Kathmandu",
    })
  })

  it("ignores sourceTimezone when the input carries an offset", async () => {
    const got = await callTool<ConvertTimezoneResult>("convert_timezone", {
      isoTimestamp: "2026-08-17T12:56:30-04:00",
      sourceTimezone: "Asia/Tokyo",
      targetTimezone: "UTC",
    })
    // The explicit -04:00 wins; Asia/Tokyo must not shift the instant.
    expect(got.iso).toBe("2026-08-17T16:56:30.000Z")
    expect(got.rendered).toBe("2026-08-17T16:56:30")
  })

  it("applies sourceTimezone to a naive input", async () => {
    const got = await callTool<ConvertTimezoneResult>("convert_timezone", {
      isoTimestamp: "2026-08-17T12:56:30",
      sourceTimezone: "America/New_York",
      targetTimezone: "UTC",
    })
    expect(got.iso).toBe("2026-08-17T16:56:30.000Z")
  })

  it("rejects unknown timezones", async () => {
    await expectToolError(
      callTool("convert_timezone", {
        isoTimestamp: "2026-08-17T16:56:30Z",
        targetTimezone: "America/Concord",
      }),
      /Unknown timezone/,
    )
  })
})

// ---------------------------------------------------------------------------
// get_current_time
// ---------------------------------------------------------------------------

describe("get_current_time", () => {
  it("returns a self-consistent instant", async () => {
    const before = Date.now()
    const got = await callTool<CurrentTimeResult>("get_current_time", { timezone: "America/New_York" })
    const after = Date.now()

    expect(got.epochMs).toBeGreaterThanOrEqual(before)
    expect(got.epochMs).toBeLessThanOrEqual(after)
    expect(Date.parse(got.iso)).toBe(got.epochMs)
    expect(got.timezone).toBe("America/New_York")

    // `local` is truncated to the second (never rounded), so reconstructing it
    // with the offset floors to the second rather than landing on epochMs.
    expect(Date.parse(`${got.local}${got.offset}`)).toBe(Math.floor(got.epochMs / 1000) * 1000)
  })

  it("truncates sub-second precision rather than rounding it", async () => {
    // Rendering .999 as the next second would make `local` disagree with `iso`.
    const got = await callTool<CurrentTimeResult>("get_current_time", { timezone: "UTC" })
    expect(got.local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
    expect(Date.parse(`${got.local}Z`)).toBeLessThanOrEqual(got.epochMs)
    expect(got.epochMs - Date.parse(`${got.local}Z`)).toBeLessThan(1000)
  })

  it("defaults to UTC", async () => {
    const got = await callTool<CurrentTimeResult>("get_current_time", {})
    expect(got.timezone).toBe("UTC")
    expect(got.offset).toBe("+00:00")
  })

  it("rejects unknown timezones", async () => {
    await expectToolError(callTool("get_current_time", { timezone: "America/Concord" }), /Unknown timezone/)
  })
})
