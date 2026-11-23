import { UserError } from "somamcp"
import { describe, expect, it } from "vitest"

import { toUserError } from "../src/errors"

describe("toUserError", () => {
  it("wraps a plain Error as a UserError with the same message", () => {
    const result = toUserError(new Error("RescueTime API error: HTTP 400 Bad Request"))
    expect(result).toBeInstanceOf(UserError)
    expect(result.message).toBe("RescueTime API error: HTTP 400 Bad Request")
    expect(result.category).toBeUndefined()
  })

  it("passes a UserError through unchanged, keeping its category", () => {
    const original = new UserError("No productivity data found", { category: "not_found" })
    expect(toUserError(original)).toBe(original)
  })
})
