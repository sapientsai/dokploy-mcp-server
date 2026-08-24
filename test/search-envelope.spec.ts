/**
 * Regression tests for the v1.9.0 field reports.
 *
 * 1. `*.search` returns `{ items, total }`, not a bare array. Handing the
 *    envelope to a list formatter threw inside IO.map.
 * 2. That thrown defect reached formatApiError with no `_tag`, the switch fell
 *    through to `undefined`, and the boundary threw `new Error(undefined)` —
 *    an empty message with nothing to diagnose from.
 */
import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { formatApiError } from "../src/client/errors"
import { registerApplicationTools } from "../src/tools/application-tools"
import { registerComposeTools } from "../src/tools/compose-tools"
import { registerDatabaseTools } from "../src/tools/database-tools"
import { unwrapSearch, withSearchTotal } from "../src/tools/tool-utils"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

const appTool = captureTool<Record<string, unknown>>(registerApplicationTools)
const composeTool = captureTool<Record<string, unknown>>(registerComposeTools)
const dbTool = captureTool<Record<string, unknown>>(registerDatabaseTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("unwrapSearch", () => {
  it("unwraps the { items, total } envelope Dokploy actually returns", () => {
    expect(unwrapSearch({ items: [{ a: 1 }], total: 7 })).toEqual({ items: [{ a: 1 }], total: 7 })
  })

  it("still accepts a bare array, in case the API shape changes back", () => {
    expect(unwrapSearch([{ a: 1 }])).toEqual({ items: [{ a: 1 }], total: 1 })
  })

  it("falls back to total = items.length when total is absent or not a number", () => {
    expect(unwrapSearch({ items: [1, 2] })).toEqual({ items: [1, 2], total: 2 })
    expect(unwrapSearch({ items: [1, 2], total: "many" })).toEqual({ items: [1, 2], total: 2 })
  })

  it("degrades to empty rather than throwing on junk", () => {
    for (const junk of [null, undefined, 42, "nope", {}, { items: "nope" }]) {
      expect(unwrapSearch(junk)).toEqual({ items: [], total: 0 })
    }
  })
})

describe("withSearchTotal", () => {
  it("stays quiet when the page holds every match", () => {
    expect(withSearchTotal("body", [1, 2], 2)).toBe("body")
  })

  it("flags a truncated page so the caller knows to paginate", () => {
    expect(withSearchTotal("body", [1, 2], 9)).toContain("showing 2 of 9 matches")
  })
})

describe("search actions survive the paginated envelope", () => {
  it("dokploy_application search renders results instead of throwing", async () => {
    getMock.mockReturnValueOnce(
      IO.succeed({ items: [{ name: "web", applicationId: "a1", applicationStatus: "done" }], total: 1 }),
    )
    const out = (await appTool.execute({ action: "search", name: "web" })) as string
    expect(getMock).toHaveBeenCalledWith("application.search", { name: "web" })
    expect(out).toContain("web")
  })

  it("dokploy_application search reports an empty envelope as no results", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ items: [], total: 0 }))
    expect(await appTool.execute({ action: "search", q: "nothing" })).toBe("No applications found.")
  })

  it("dokploy_application search surfaces a truncated page", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ items: [{ name: "web", applicationId: "a1" }], total: 40 }))
    const out = (await appTool.execute({ action: "search", q: "w", limit: 1 })) as string
    expect(out).toContain("showing 1 of 40 matches")
  })

  it("dokploy_compose search renders results instead of throwing", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ items: [{ name: "stack", composeId: "c1" }], total: 1 }))
    const out = (await composeTool.execute({ action: "search", name: "stack" })) as string
    expect(getMock).toHaveBeenCalledWith("compose.search", { name: "stack" })
    expect(out).toContain("stack")
  })

  it("dokploy_database search renders results instead of throwing", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ items: [{ name: "pg", postgresId: "p1" }], total: 1 }))
    const out = (await dbTool.execute({ action: "search", dbType: "postgres", name: "pg" })) as string
    expect(getMock).toHaveBeenCalledWith("postgres.search", { name: "pg" })
    expect(out).toContain("pg")
  })
})

describe("formatApiError never yields an empty message", () => {
  it("describes a thrown defect instead of returning undefined", () => {
    const defect = new TypeError("apps.map is not a function")
    const msg = formatApiError(defect as never)
    expect(msg).toContain("TypeError")
    expect(msg).toContain("apps.map is not a function")
    expect(new Error(msg).message).not.toBe("")
  })

  it("handles null, undefined and non-Error throws", () => {
    for (const junk of [null, undefined, "boom", 42]) {
      const msg = formatApiError(junk as never)
      expect(msg.length).toBeGreaterThan(0)
      expect(new Error(msg).message).not.toBe("")
    }
  })

  it("still formats real tagged API errors unchanged", () => {
    const tagged = {
      _tag: "HttpStatusError" as const,
      status: 404,
      statusText: "Not Found",
      method: "GET",
      url: "/application.one",
      body: "missing",
    }
    expect(formatApiError(tagged as never)).toBe("Dokploy API error (404 Not Found) on GET /application.one: missing")
  })
})
