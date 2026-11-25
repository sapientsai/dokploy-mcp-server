import { describe, expect, it } from "vitest"

import { and, equals, pocketbaseDate, quote } from "../src/client/filter"
import { readConfig } from "../src/config"
import { bytes, cell, containerHealth, duration, rate, serviceState } from "../src/utils/format"
import { intervalFor, startOf } from "../src/utils/ranges"
import { pairSum, present, summarize } from "../src/utils/stats"

describe("filters", () => {
  it("escapes quotes and backslashes, so a value can't end its string", () => {
    expect(quote('a"b')).toBe('"a\\"b"')
    expect(quote("a\\")).toBe('"a\\\\"')
    expect(quote('x" || id != "')).toBe('"x\\" || id != \\""')
  })

  it("keeps && inside the quoted value", () => {
    expect(equals("name", "a && b")).toBe('name = "a && b"')
  })

  it("joins the clauses that aren't empty", () => {
    expect(and("a = 1", "", "b = 2")).toBe("(a = 1) && (b = 2)")
    expect(and("", "")).toBe("")
  })

  it("writes dates in PocketBase's layout, which sorts correctly as text", () => {
    expect(pocketbaseDate(new Date("2026-11-25T10:00:00Z"))).toBe("2026-11-25 10:00:00.000Z")
    expect("2026-11-25 10:00:00.000Z" >= pocketbaseDate(new Date("2026-11-25T09:59:00Z"))).toBe(true)
  })
})

describe("ranges", () => {
  it("picks the interval Beszel keeps", () => {
    expect(["1h", "12h", "24h", "7d", "30d"].map((r) => intervalFor(r as "1h"))).toEqual([
      "1m",
      "10m",
      "20m",
      "120m",
      "480m",
    ])
  })

  it("starts the range that far back", () => {
    expect(startOf("24h", Date.UTC(2026, 10, 25, 12)).toISOString()).toBe("2026-11-24T12:00:00.000Z")
  })
})

describe("summaries", () => {
  it("skips missing points and keeps the last as latest", () => {
    const s = summarize([present(10), present(undefined), present(30), present(20)]).getOrElse(() => {
      throw new Error("expected a summary")
    })
    expect(s).toEqual({ min: 10, avg: 20, max: 30, latest: 20, count: 3 })
  })

  it("is empty with no points", () => {
    expect(summarize([present(undefined), present(Number.NaN)]).isNone()).toBe(true)
  })

  it("adds a pair only when both parts are there", () => {
    expect(pairSum([1, 2]).getOrElse(() => 0)).toBe(3)
    expect(pairSum([1]).isNone()).toBe(true)
  })
})

describe("formatting", () => {
  it("uses 1024-based units, as Beszel does", () => {
    expect(bytes(1536)).toBe("1.5 KB")
    expect(bytes(5 * 1024 ** 3)).toBe("5.0 GB")
    expect(bytes(0)).toBe("0 B")
    expect(rate(2048)).toBe("2.0 KB/s")
  })

  it("names health and service states, and says so for a code it doesn't know", () => {
    expect(containerHealth(3)).toBe("unhealthy")
    expect(serviceState(2)).toBe("failed")
    expect(serviceState(9)).toBe("unknown (9)")
  })

  it("writes durations", () => {
    expect(duration(3 * 86_400 + 4 * 3600)).toBe("3d 4h")
    expect(duration(90 * 60)).toBe("1h 30m")
  })

  it("keeps pipes and newlines from breaking a table row", () => {
    expect(cell("a|b\nc")).toBe("a\\|b c")
  })
})

describe("readConfig", () => {
  const read = (env: Record<string, string>) =>
    readConfig(env).fold(
      (problem) => ({ problem }),
      (config) => ({ config }),
    )

  it("takes a URL and a password sign-in", () => {
    expect(
      read({ BESZEL_URL: "https://beszel.example.com/", BESZEL_EMAIL: "a@example.com", BESZEL_PASSWORD: "p" }),
    ).toEqual({
      config: {
        baseUrl: "https://beszel.example.com",
        auth: { kind: "password", email: "a@example.com", password: "p" },
      },
    })
  })

  it("prefers a token when both are set", () => {
    expect(
      read({ BESZEL_URL: "https://beszel.example.com", BESZEL_TOKEN: "t", BESZEL_EMAIL: "a", BESZEL_PASSWORD: "p" }),
    ).toEqual({
      config: { baseUrl: "https://beszel.example.com", auth: { kind: "token", token: "t" } },
    })
  })

  it.each([
    [{}, /BESZEL_URL is required/],
    [{ BESZEL_URL: "beszel.example.com", BESZEL_TOKEN: "t" }, /not a URL/],
    [{ BESZEL_URL: "ftp://beszel.example.com", BESZEL_TOKEN: "t" }, /http:\/\/ or https:\/\//],
    [{ BESZEL_URL: "https://beszel.example.com" }, /BESZEL_EMAIL and BESZEL_PASSWORD, or BESZEL_TOKEN/],
    [{ BESZEL_URL: "https://beszel.example.com", BESZEL_EMAIL: "a" }, /BESZEL_PASSWORD is required/],
  ])("says what's missing (%o)", (env, message) => {
    expect(JSON.stringify(read(env))).toMatch(message)
  })
})
