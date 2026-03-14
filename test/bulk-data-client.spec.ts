import { describe, expect, it } from "vitest"

import { BulkDataClient } from "../src/utils/bulk-data-client.js"

describe("BulkDataClient", () => {
  describe("parseTildeDelimited", () => {
    const client = new BulkDataClient()

    it("should parse tilde-delimited text with header row", () => {
      const text = ["Name~Age~City", "Alice~30~Boston", "Bob~25~NYC"].join("\n")

      const result = client.parseTildeDelimited(text)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ Name: "Alice", Age: "30", City: "Boston" })
      expect(result[1]).toEqual({ Name: "Bob", Age: "25", City: "NYC" })
    })

    it("should handle empty input", () => {
      expect(client.parseTildeDelimited("")).toEqual([])
      expect(client.parseTildeDelimited("Header1~Header2")).toEqual([])
    })

    it("should trim whitespace from values", () => {
      const text = "Name~Value\n Alice ~ 42 "
      const result = client.parseTildeDelimited(text)
      expect(result[0]).toEqual({ Name: "Alice", Value: "42" })
    })

    it("should handle missing trailing values", () => {
      const text = "A~B~C\nfoo~bar"
      const result = client.parseTildeDelimited(text)
      expect(result[0]).toEqual({ A: "foo", B: "bar", C: "" })
    })
  })

  describe("parseCSV", () => {
    const client = new BulkDataClient()

    it("should parse simple CSV", () => {
      const text = "Name,Age,City\nAlice,30,Boston\nBob,25,NYC"
      const result = client.parseCSV(text)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ Name: "Alice", Age: "30", City: "Boston" })
    })

    it("should handle quoted fields with commas", () => {
      const text = 'Name,Description\n"Smith, John","A ""quoted"" value"'
      const result = client.parseCSV(text)
      expect(result[0]).toEqual({ Name: "Smith, John", Description: 'A "quoted" value' })
    })

    it("should handle empty input", () => {
      expect(client.parseCSV("")).toEqual([])
    })

    it("should handle empty fields", () => {
      const text = "A,B,C\n,hello,"
      const result = client.parseCSV(text)
      expect(result[0]).toEqual({ A: "", B: "hello", C: "" })
    })
  })
})
