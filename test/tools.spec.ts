import type { SomaServerInstance } from "somamcp"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { initializeClient } from "../src/client/rescuetime-client"
import { registerAnalyticsTools, registerFocusTools, registerTimesheetTools } from "../src/tools"
import { projectEntry, projects, timerState } from "./fixtures/resource"

// Runs each tool's execute against a fetch stub, the way SomaMCP calls it after validating arguments.

type Execute = (args: Record<string, unknown>) => Promise<unknown>
type ToolDef = { readonly name: string; readonly execute: Execute }
type Route = { readonly status?: number; readonly body: unknown }

const tools = new Map<string, Execute>()
const server = {
  addTool: (tool: ToolDef) => {
    tools.set(tool.name, tool.execute)
  },
} as unknown as SomaServerInstance
registerAnalyticsTools(server)
registerFocusTools(server)
registerTimesheetTools(server)

const run = (name: string, args: Record<string, unknown> = {}): Promise<unknown> => {
  const execute = tools.get(name)
  if (!execute) throw new Error(`no tool ${name}`)
  return execute(args)
}

const mockFetch = vi.fn()
const calls = (): readonly { readonly url: string; readonly init: RequestInit }[] =>
  mockFetch.mock.calls.map(([url, init]) => ({ url: String(url), init: (init ?? {}) as RequestInit }))
const paths = (): readonly string[] => calls().map((c) => new URL(c.url).pathname)

/** Answer each request by the first route whose key is contained in its URL. */
function routes(table: Readonly<Record<string, Route>>): void {
  mockFetch.mockImplementation((url: string) => {
    const match = Object.entries(table).find(([key]) => url.includes(key))
    if (!match) return Promise.reject(new Error(`unexpected request ${url}`))
    const { status = 200, body } = match[1]
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      json: async () => body,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    })
  })
}

const TOKYO = { "/api/resource/users": { body: [{ time_zone: "Asia/Tokyo" }] } }

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal("fetch", mockFetch)
  initializeClient({ apiKey: "test-key", pollDelayMs: 0 })
})

describe("start_timer", () => {
  it("rejects a task without a project before any request", async () => {
    routes({})
    await expect(run("start_timer", { task: "Development" })).rejects.toMatchObject({
      category: "validation",
      message: expect.stringContaining("task needs project"),
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("refuses while something runs, and never sends start_session", async () => {
    routes({ "/user_global_states": { body: [timerState] } })
    await expect(run("start_timer", { label: "Writing" })).rejects.toThrow(
      'Cannot start a timer: a timer ("Shape test") is already running.',
    )
    expect(paths()).toEqual(["/api/resource/user_global_states"])
  })

  it("links a named project by id and reports the start in the account's zone", async () => {
    routes({
      "/user_global_states": { body: [] },
      "/v2_projects": { body: projects },
      "/focus/start_session": { body: timerState },
      ...TOKYO,
    })
    const result = await run("start_timer", { project: "alpha", task: "dev", label: "Writing" })

    expect(paths()).toEqual([
      "/api/resource/user_global_states",
      "/api/resource/v2_projects",
      "/api/resource/focus/start_session",
      "/api/resource/users",
    ])
    const start = calls()[2]!
    expect(start.init.method).toBe("POST")
    expect(JSON.parse(String(start.init.body))).toMatchObject({ is_timer: true, v2_project_id: 1, task_id: 13 })
    expect(result).toContain("for project **Client Alpha** / task **Development**")
    expect(result).toContain("at 2026-11-09 09:58 GMT+9")
  })

  it("rejects an unknown project before starting anything", async () => {
    routes({ "/user_global_states": { body: [] }, "/v2_projects": { body: projects } })
    await expect(run("start_timer", { project: "nope" })).rejects.toMatchObject({ category: "not_found" })
    expect(paths()).not.toContain("/api/resource/focus/start_session")
  })
})

describe("get_project_time", () => {
  it("fetches each day once, in order, and prints times in the account's zone", async () => {
    routes({
      "date=2026-11-06": { body: { is_complete: true, job_id: null, project_times: [projectEntry()] } },
      "date=2026-11-07": { body: { is_complete: true, job_id: null, project_times: [] } },
      ...TOKYO,
    })
    const result = await run("get_project_time", { start_date: "2026-11-06", end_date: "2026-11-07" })

    const days = calls()
      .map((c) => new URL(c.url).searchParams.get("date"))
      .filter((d) => d !== null)
    expect(days).toEqual(["2026-11-06", "2026-11-07"])
    expect(result).toContain("- 22:45–23:05 **Client Alpha** 20m")
    expect(result).toContain("Asia/Tokyo")
  })

  it("rejects an over-long range before any request", async () => {
    routes({})
    await expect(run("get_project_time", { start_date: "2026-01-01", end_date: "2026-12-31" })).rejects.toMatchObject({
      category: "validation",
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("still answers when the time zone lookup fails", async () => {
    routes({
      "/labeled_time_project_times": { body: { is_complete: true, job_id: null, project_times: [projectEntry()] } },
      "/api/resource/users": { status: 500, body: "" },
    })
    const result = await run("get_project_time")
    expect(result).toContain("- 05:45–06:05 **Client Alpha** 20m")
    expect(result).toContain("the account's time zone was unavailable")
  })
})

describe("account time zone", () => {
  it("is fetched once and reused across tool calls", async () => {
    routes({ "/user_global_states": { body: [timerState] }, ...TOKYO })
    expect(await run("get_focus_state")).toContain("2026-11-09 09:58 GMT+9")
    await run("get_focus_state")
    expect(paths().filter((p) => p === "/api/resource/users")).toHaveLength(1)
  })

  it("reads a bare user object as well as an array", async () => {
    routes({
      "/user_global_states": { body: [timerState] },
      "/api/resource/users": { body: { time_zone: "Asia/Tokyo" } },
    })
    expect(await run("get_focus_state")).toContain("GMT+9")
  })

  it("converts today's project time when no dates are given", async () => {
    routes({
      "/labeled_time_project_times": { body: { is_complete: true, job_id: null, project_times: [projectEntry()] } },
      ...TOKYO,
    })
    expect(await run("get_project_time")).toContain("- 22:45–23:05 **Client Alpha** 20m")
  })

  it("ignores a zone name the runtime can't use", async () => {
    routes({
      "/user_global_states": { body: [timerState] },
      "/api/resource/users": { body: [{ time_zone: "Not/AZone" }] },
    })
    expect(await run("get_focus_state")).toContain("2026-11-09 00:58 UTC")
  })
})

describe("get_productivity_score", () => {
  it("explains an empty summary feed instead of printing a blank date", async () => {
    routes({ "/anapi/daily_summary_feed": { body: [] } })
    await expect(run("get_productivity_score")).rejects.toMatchObject({
      category: "not_found",
      message: "RescueTime has no daily summaries yet. A day's summary appears after midnight.",
    })
  })
})

describe("bad API key", () => {
  it("reports the Analytic API's 400 'key not found' as an auth error", async () => {
    routes({
      "/anapi/daily_summary_feed": { status: 400, body: { error: "# key not found", messages: "key not found" } },
    })
    await expect(run("get_daily_summary")).rejects.toMatchObject({
      category: "auth",
      message: "RescueTime rejected the API key (HTTP 400: key not found).",
    })
  })

  it("keeps a malformed-query 400 as an ordinary error with RescueTime's reason", async () => {
    routes({
      "/anapi/data": {
        status: 400,
        body: { error: "# query error", messages: "Error: Likely a badly formatted or missing parameter" },
      },
    })
    const error = await run("get_activity_data", {
      perspective: "rank",
      resolution: "day",
      restrict_kind: "activity",
    }).catch((e: unknown) => e as { readonly category?: string; readonly message: string })
    // No category means SomaMCP reports it as "execution"; the point is that it isn't blamed on the key.
    expect(error.category).toBeUndefined()
    expect(error.message).toContain("HTTP 400")
    expect(error.message).toContain("Likely a badly formatted or missing parameter")
  })

  it("reports the Resource API's 401 as an auth error", async () => {
    routes({ "/user_global_states": { status: 401, body: { success: false, message: "" } } })
    await expect(run("get_focus_state")).rejects.toMatchObject({ category: "auth" })
  })

  it("doesn't blame the key for a 403, which means a valid key without permission", async () => {
    routes({ "/user_global_states": { status: 403, body: { success: false, message: "" } } })
    await expect(run("get_focus_state")).rejects.toMatchObject({
      message: expect.stringContaining("the key is valid but lacks permission"),
      suggestions: [],
    })
  })

  it("shows the Resource API's own reason for other errors", async () => {
    routes({ "/user_global_states": { status: 404, body: { status: 404, error: "Not Found" } } })
    await expect(run("get_focus_state")).rejects.toThrow("RescueTime API error: HTTP 404 404: Not Found")
  })

  it("tells the caller to wait on a rate limit", async () => {
    routes({ "/user_global_states": { status: 429, body: "" } })
    await expect(run("get_focus_state")).rejects.toMatchObject({
      message: expect.stringContaining("Rate limit exceeded"),
      suggestions: ["Wait a minute, then try again."],
    })
  })
})
