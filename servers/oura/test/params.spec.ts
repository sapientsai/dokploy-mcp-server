import { describe, expect, it } from "vitest"

import { COLLECTIONS } from "../src/oura/collections"
import { ouraDataParams } from "../src/oura/params"

const ok = (input: unknown) => ouraDataParams.safeParse(input).success
const firstError = (input: unknown) => {
  const parsed = ouraDataParams.safeParse(input)
  return parsed.success ? undefined : parsed.error.issues[0]?.message
}

describe("ouraDataParams", () => {
  it("rejects an unknown collection", () => {
    expect(ok({ collection: "not_a_collection" })).toBe(false)
  })

  it("accepts every known collection with no extra params where legal", () => {
    // personal_info + singletons/list-only accept a bare call; daily/datetime default their range.
    for (const c of COLLECTIONS) {
      expect(ok({ collection: c.name })).toBe(true)
    }
  })

  describe("singleton (personal_info)", () => {
    it("accepts a bare call", () => {
      expect(ok({ collection: "personal_info" })).toBe(true)
    })
    it("rejects any parameter", () => {
      expect(ok({ collection: "personal_info", start_date: "2026-06-01" })).toBe(false)
      expect(ok({ collection: "personal_info", document_id: "x" })).toBe(false)
      expect(ok({ collection: "personal_info", next_token: "x" })).toBe(false)
    })
  })

  describe("daily collections", () => {
    it("accepts start_date/end_date", () => {
      expect(ok({ collection: "daily_sleep", start_date: "2026-06-01", end_date: "2026-06-07" })).toBe(true)
    })
    it("rejects datetime params", () => {
      expect(ok({ collection: "daily_sleep", start_datetime: "2026-06-01T00:00:00Z" })).toBe(false)
    })
    it("rejects a malformed date", () => {
      expect(ok({ collection: "daily_sleep", start_date: "June 1 2026" })).toBe(false)
    })
    it("rejects latest", () => {
      expect(ok({ collection: "daily_sleep", latest: true })).toBe(false)
    })
    it("supports fetching by document_id", () => {
      expect(ok({ collection: "daily_sleep", document_id: "abc123" })).toBe(true)
    })
  })

  describe("datetime collections", () => {
    it("accepts start_datetime/end_datetime", () => {
      expect(
        ok({
          collection: "heartrate",
          start_datetime: "2026-06-01T00:00:00+00:00",
          end_datetime: "2026-06-02T00:00:00+00:00",
        }),
      ).toBe(true)
    })
    it("accepts latest", () => {
      expect(ok({ collection: "heartrate", latest: true })).toBe(true)
    })
    it("rejects calendar-date params", () => {
      expect(ok({ collection: "heartrate", start_date: "2026-06-01" })).toBe(false)
    })
    it("rejects document_id (no by-id route)", () => {
      const msg = firstError({ collection: "heartrate", document_id: "x" })
      expect(msg).toContain("does not support fetching a single document")
    })
  })

  describe("list-only (ring_configuration)", () => {
    it("accepts next_token", () => {
      expect(ok({ collection: "ring_configuration", next_token: "cursor" })).toBe(true)
    })
    it("accepts document_id", () => {
      expect(ok({ collection: "ring_configuration", document_id: "ring1" })).toBe(true)
    })
    it("rejects date filters", () => {
      expect(ok({ collection: "ring_configuration", start_date: "2026-06-01" })).toBe(false)
    })
  })

  describe("by-id lookups", () => {
    it("rejects combining document_id with list params", () => {
      expect(ok({ collection: "daily_sleep", document_id: "x", start_date: "2026-06-01" })).toBe(false)
      expect(ok({ collection: "daily_sleep", document_id: "x", next_token: "y" })).toBe(false)
    })
  })
})
