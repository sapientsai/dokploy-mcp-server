import { None, Option } from "functype"
import { describe, expect, it } from "vitest"

import { buildDateQuery, buildSearchQuery, joinQueries, truncateText } from "../src/handlers/query.js"
import { textField } from "../src/utils/fields.js"

describe("textField", () => {
  it("returns the first key that holds a string", () => {
    expect(textField({ Trade_Name: "LIPITOR", trade_name: "other" }, "Trade_Name", "trade_name")).toBe("LIPITOR")
    expect(textField({ trade_name: "lipitor" }, "Trade_Name", "trade_name")).toBe("lipitor")
  })

  it("keeps an empty string rather than falling through, like ??", () => {
    expect(textField({ A: "", a: "fallback" }, "A", "a")).toBe("")
  })

  it("skips null, missing and non-text values", () => {
    expect(textField({ A: null, a: "x" }, "A", "a")).toBe("x")
    expect(textField({ A: { nested: true }, a: "y" }, "A", "a")).toBe("y")
    expect(textField({}, "A", "a")).toBe("")
  })

  it("keeps a number as text, since JSON APIs may send ids as numbers", () => {
    expect(textField({ bla_number: 125057 }, "bla_number")).toBe("125057")
  })
})

describe("buildDateQuery", () => {
  it("is None without either bound", () => {
    expect(buildDateQuery("receivedate").isNone()).toBe(true)
  })

  it("fills an open bound with *", () => {
    expect(buildDateQuery("receivedate", "2024-01-01").orElse("")).toBe("receivedate:[20240101 TO *]")
    expect(buildDateQuery("receivedate", undefined, "2024-12-31").orElse("")).toBe("receivedate:[* TO 20241231]")
  })
})

describe("joinQueries", () => {
  it("joins the non-empty parts with AND", () => {
    expect(joinQueries("a:1", Option("b:2"), None())).toBe("a:1 AND b:2")
    expect(joinQueries("", Option("b:2"))).toBe("b:2")
    expect(joinQueries("", None())).toBe("")
  })
})

describe("buildSearchQuery", () => {
  it("skips blank values and escapes the rest", () => {
    expect(
      buildSearchQuery([
        { field: "brand_name", value: "Tylenol  PM" },
        { field: "route", value: "  " },
        { field: "x", value: undefined },
      ]),
    ).toBe('brand_name:"Tylenol PM"')
  })

  it("joins several terms with AND", () => {
    expect(
      buildSearchQuery([
        { field: "a", value: "x" },
        { field: "b", value: "y" },
      ]),
    ).toBe('a:"x" AND b:"y"')
  })
})

describe("truncateText", () => {
  it("is None for missing or empty text", () => {
    expect(truncateText(undefined).isNone()).toBe(true)
    expect(truncateText("").isNone()).toBe(true)
  })

  it("truncates past the limit and keeps short text", () => {
    expect(truncateText("abcdef", 3).orElse("")).toBe("abc...")
    expect(truncateText("abc", 3).orElse("")).toBe("abc")
  })
})
