import { Left, Right } from "functype"
import { afterEach, describe, expect, it, vi } from "vitest"

import { handleSearchDevice510K } from "../src/handlers/device-handlers.js"
import { handleSearchDrugNDC } from "../src/handlers/drug-handlers.js"
import { fdaAPIClient } from "../src/utils/api-client.js"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("API-backed handlers", () => {
  it("formats a successful response", async () => {
    vi.spyOn(fdaAPIClient, "searchDrugNDC").mockResolvedValue(
      Right({
        meta: { results: { skip: 0, limit: 1, total: 7 } },
        results: [{ product_ndc: "0071-0155", brand_name: "Lipitor", route: ["ORAL"] }],
      }),
    )

    const result = await handleSearchDrugNDC({ brandName: "Lipitor", limit: 1 })

    expect(result.success).toBe(true)
    expect(result.totalResults).toBe(7)
    expect(result.displayedResults).toBe(1)
    expect(result.data?.[0]).toMatchObject({ productNdc: "0071-0155", brandName: "Lipitor", route: ["ORAL"] })
    expect(result.searchParams).toEqual({ search: 'brand_name:"Lipitor"', limit: 1, skip: undefined })
    expect(result.apiUsage).toEqual(fdaAPIClient.getRateLimitInfo())
  })

  it("turns a client error into a failure response", async () => {
    vi.spyOn(fdaAPIClient, "searchDrugNDC").mockResolvedValue(
      Left(new Error("Rate limit exceeded. Consider using an API key for higher limits.")),
    )

    const result = await handleSearchDrugNDC({ brandName: "Lipitor" })

    expect(result).toEqual({
      success: false,
      error: "Rate limit exceeded. Consider using an API key for higher limits.",
    })
  })

  it("does the same for device handlers", async () => {
    vi.spyOn(fdaAPIClient, "searchDevice510K").mockResolvedValue(Left(new Error("fetch failed")))

    const result = await handleSearchDevice510K({ deviceName: "pacemaker" })

    expect(result).toEqual({ success: false, error: "fetch failed" })
  })
})
