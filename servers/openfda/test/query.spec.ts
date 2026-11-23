import { None, Option } from "functype"
import { describe, expect, it } from "vitest"

import {
  anyFieldQuery,
  buildDateQuery,
  buildSearchQuery,
  clipFields,
  clipText,
  joinQueries,
} from "../src/handlers/query.js"
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

describe("clipText", () => {
  it("is None for missing or empty text", () => {
    expect(clipText(undefined).isNone()).toBe(true)
    expect(clipText("").isNone()).toBe(true)
  })

  it("cuts text past the limit and says so, and keeps short text whole", () => {
    expect(clipText("abcdef", 3).orThrow()).toEqual({ text: "abc...", truncated: true })
    expect(clipText("abc", 3).orThrow()).toEqual({ text: "abc", truncated: false })
    expect(clipText("x".repeat(201)).orThrow().truncated).toBe(true)
    expect(clipText("x".repeat(200)).orThrow().truncated).toBe(false)
  })

  it("never cuts with an unbounded limit", () => {
    expect(clipText("x".repeat(10_000), Number.POSITIVE_INFINITY).orThrow()).toEqual({
      text: "x".repeat(10_000),
      truncated: false,
    })
  })
})

describe("clipFields", () => {
  it("returns each field's text and names the cut ones", () => {
    const clipped = clipFields({ a: clipText("abcdef", 3), b: clipText("ab", 3), c: clipText(undefined) })
    expect(clipped.text).toEqual({ a: "abc...", b: "ab", c: undefined })
    expect(clipped.truncated).toEqual(["a"])
  })

  it("leaves truncated undefined when nothing was cut", () => {
    expect(clipFields({ a: clipText("ab"), b: clipText(undefined) }).truncated).toBeUndefined()
  })
})

describe("anyFieldQuery", () => {
  it("matches the value on any of the fields, escaped", () => {
    expect(anyFieldQuery(["a", "b"], 'x "y"').orThrow()).toBe('(a:"x \\"y\\"" OR b:"x \\"y\\"")')
  })

  it("is None for a missing or blank value", () => {
    expect(anyFieldQuery(["a", "b"], undefined).isNone()).toBe(true)
    expect(anyFieldQuery(["a", "b"], "  ").isNone()).toBe(true)
  })
})
