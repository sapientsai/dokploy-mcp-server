import { beforeEach, describe, expect, it, vi } from "vitest"

import { RescueTimeClient } from "../src/client/rescuetime-client"
import { stopDeleted, timerState } from "./fixtures/resource"

const mockFetch = vi.fn()

const ok = (body: unknown) => ({ ok: true, status: 200, statusText: "OK", json: async () => body })

const call = (i = 0): { url: string; init: RequestInit & { headers: Record<string, string> } } => {
  const [url, init] = mockFetch.mock.calls[i] as [string, RequestInit & { headers: Record<string, string> }]
  return { url, init }
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal("fetch", mockFetch)
})

const client = () => new RescueTimeClient({ apiKey: "secret-key", pollDelayMs: 0 })

describe("Resource API requests", () => {
  it("sends the key as a Bearer header and never in the URL", async () => {
    mockFetch.mockResolvedValueOnce(ok([]))
    await client().getFocusState().run()

    const { url, init } = call()
    expect(url).toBe("https://www.rescuetime.com/api/resource/user_global_states")
    expect(url).not.toContain("secret-key")
    expect(init.headers.Authorization).toBe("Bearer secret-key")
    expect(init.headers.Accept).toBe("application/json")
  })

  it("maps HTTP errors to a Left", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Internal Server Error" })
    const result = await client().getProjects().run()
    expect(result.isLeft()).toBe(true)
  })

  it("maps 429 to a rate-limit error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, statusText: "Too Many Requests" })
    const result = await client().getFocusState().run()
    result.fold(
      (e) => expect(e.message).toContain("Rate limit"),
      () => {
        throw new Error("Expected Left")
      },
    )
  })
})

describe("startTimer", () => {
  it("posts JSON for an open-ended timer with blocking off", async () => {
    mockFetch.mockResolvedValueOnce(ok(timerState))
    const result = await client().startTimer({ label_name: "Writing", v2_project_id: 1, task_id: 12 }).run()

    expect(result.isRight()).toBe(true)
    const { url, init } = call()
    expect(url).toBe("https://www.rescuetime.com/api/resource/focus/start_session")
    expect(init.method).toBe("POST")
    expect(init.headers["Content-Type"]).toBe("application/json")
    expect(JSON.parse(String(init.body))).toEqual({
      is_timer: true,
      block_apps_sites: false,
      block_comms: false,
      label_name: "Writing",
      v2_project_id: 1,
      task_id: 12,
    })
  })

  it("omits project fields it was not given", async () => {
    mockFetch.mockResolvedValueOnce(ok(timerState))
    await client().startTimer({}).run()
    expect(JSON.parse(String(call().init.body))).toEqual({
      is_timer: true,
      block_apps_sites: false,
      block_comms: false,
    })
  })
})

describe("stopSession", () => {
  it("posts to cancel_or_stop_session and returns the body", async () => {
    mockFetch.mockResolvedValueOnce(ok(stopDeleted))
    const result = await client().stopSession().run()
    expect(call().url).toBe("https://www.rescuetime.com/api/resource/focus/cancel_or_stop_session")
    expect(result.orThrow().message).toBe("deleted")
  })
})

describe("getProjectTimes", () => {
  it("omits the date for today", async () => {
    mockFetch.mockResolvedValueOnce(ok({ is_complete: true, job_id: null, project_times: [] }))
    await client().getProjectTimes().run()
    expect(call().url).toBe("https://www.rescuetime.com/api/resource/labeled_time_project_times")
  })

  it("polls with the job id until RescueTime reports complete", async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ is_complete: false, job_id: 7, project_times: [] }))
      .mockResolvedValueOnce(ok({ is_complete: false, job_id: 7, project_times: [] }))
      .mockResolvedValueOnce(ok({ is_complete: true, job_id: null, project_times: [] }))

    const result = await client().getProjectTimes("2026-11-06").run()

    expect(result.orThrow().is_complete).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(call(0).url).toContain("date=2026-11-06")
    expect(call(0).url).not.toContain("job_id")
    expect(call(1).url).toContain("job_id=7")
  })

  it("stops polling after the cap and returns the partial result", async () => {
    mockFetch.mockResolvedValue(ok({ is_complete: false, job_id: 7, project_times: [] }))
    const result = await client().getProjectTimes("2026-11-06").run()
    expect(result.orThrow().is_complete).toBe(false)
    expect(mockFetch).toHaveBeenCalledTimes(6)
  })

  it("does not poll when there is no job id", async () => {
    mockFetch.mockResolvedValueOnce(ok({ is_complete: false, job_id: null, project_times: [] }))
    await client().getProjectTimes("2026-11-06").run()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe("getTimeline", () => {
  it("uses the account's day when no date is given", async () => {
    mockFetch.mockResolvedValueOnce(ok({ activities: {}, activity_intervals: [] }))
    await client().getTimeline().run()
    expect(call().url).toBe("https://www.rescuetime.com/api/resource/timeline/activities")
  })

  it("puts the date in the path", async () => {
    mockFetch.mockResolvedValueOnce(ok({ activities: {}, activity_intervals: [] }))
    await client().getTimeline("2026-11-08").run()
    expect(call().url).toBe("https://www.rescuetime.com/api/resource/timeline/activities/2026-11-08")
  })
})
