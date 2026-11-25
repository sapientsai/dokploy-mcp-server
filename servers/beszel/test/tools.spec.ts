import type { SomaServerInstance } from "somamcp"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { initializeClient } from "../src/client/beszel-client"
import {
  registerAlertTools,
  registerContainerTools,
  registerDiskTools,
  registerServiceTools,
  registerStatsTools,
  registerSystemTools,
} from "../src/tools"
import {
  alertHistory,
  alerts,
  containers,
  containerSeries,
  details,
  latestStats,
  oldAgentStats,
  page,
  services,
  smartDevices,
  statsSeries,
  systems,
} from "./fixtures/hub"

// Runs each tool's execute against a fetch stub, the way SomaMCP calls it after validating arguments.

type Execute = (args: Record<string, unknown>) => Promise<unknown>
type ToolDef = { readonly name: string; readonly execute: Execute }

const NOW = Date.UTC(2026, 10, 25, 12)

const tools = new Map<string, Execute>()
const server = {
  addTool: (tool: ToolDef) => {
    tools.set(tool.name, tool.execute)
  },
} as unknown as SomaServerInstance
registerSystemTools(server)
registerStatsTools(server, () => NOW)
registerContainerTools(server)
registerServiceTools(server)
registerDiskTools(server)
registerAlertTools(server)

const run = (name: string, args: Record<string, unknown> = {}): Promise<string> => {
  const execute = tools.get(name)
  if (!execute) throw new Error(`no tool ${name}`)
  return execute(args) as Promise<string>
}

const mockFetch = vi.fn()
const requests = (): ReadonlyArray<URL> => mockFetch.mock.calls.map(([url]) => new URL(String(url)))
const requestFor = (collection: string): URL | undefined =>
  requests().find((u) => u.pathname === `/api/collections/${collection}/records`)

/** Answers each collection's records request from a table, and anything else with 404. */
function hub(collections: Readonly<Record<string, ReadonlyArray<unknown>>>): void {
  mockFetch.mockImplementation((url: string) => {
    const match = /\/api\/collections\/([a-z_]+)\/records/.exec(new URL(url).pathname)
    const items = match?.[1] === undefined ? undefined : collections[match[1]]
    const status = items === undefined ? 404 : 200
    return Promise.resolve({
      ok: status === 200,
      status,
      statusText: String(status),
      json: async () => page(items ?? []),
      text: async () => JSON.stringify(page(items ?? [])),
    })
  })
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal("fetch", mockFetch)
  initializeClient({ baseUrl: "https://beszel.example.com", auth: { kind: "token", token: "t" } }, () => NOW)
})

describe("list_systems", () => {
  it("lists each system with its status and use", async () => {
    hub({ systems })
    const text = await run("list_systems")
    expect(text).toContain("2 systems: 1 up, 1 down.")
    expect(text).toContain(
      "| alpha | sysalpha0000001 | up | 12.5% | 41.2% | 63.0% | 0.42 / 0.37 / 0.30 | 3d 4h | 0.21.2 | 1 | 7 |",
    )
  })

  it("filters by status and by name", async () => {
    hub({ systems })
    expect(await run("list_systems", { status: "down" })).toContain("1 system: 1 down.")
    expect(await run("list_systems", { name: "ALP" })).toContain("| alpha |")
    expect(await run("list_systems", { name: "zulu" })).toBe("No systems match.")
  })
})

describe("get_system", () => {
  it("joins the summary, the details and the latest stats", async () => {
    hub({ systems, system_details: [details], system_stats: [latestStats] })
    const text = await run("get_system", { system: "Alpha" })
    expect(text).toContain("# alpha (sysalpha0000001)")
    expect(text).toContain("- **OS:** Debian GNU/Linux 13")
    expect(text).toContain("- **CPU:** Example CPU 8000, 8 cores, 16 threads")
    expect(text).toContain("- **Connection:** WebSocket")
    expect(text).toContain("- **Memory:** 13.0 GB of 32.0 GB (41.2%)")
    expect(text).toContain("- **Disk:** 315 GB of 500 GB (63.0%)")
    expect(text).toContain("- **Package updates:** 7 (2 security)")
    expect(text).toContain("- Data: 1.5 TB of 2.0 TB")
    expect(text).toContain("- cpu_package: 54°C")
  })

  it("asks for the latest 1m record of that system", async () => {
    hub({ systems, system_details: [details], system_stats: [latestStats] })
    await run("get_system", { system: "sysalpha0000001" })
    const stats = requestFor("system_stats")
    expect(stats?.searchParams.get("filter")).toBe('system = "sysalpha0000001" && type = "1m"')
    expect(stats?.searchParams.get("sort")).toBe("-created")
    expect(stats?.searchParams.get("perPage")).toBe("1")
  })

  it("names the systems it can see when one isn't found", async () => {
    hub({ systems })
    await expect(run("get_system", { system: "zulu" })).rejects.toMatchObject({
      message: expect.stringContaining('No system "zulu"'),
    })
  })

  it("refuses a name two systems share", async () => {
    hub({ systems: [...systems, { ...systems[0], id: "sysalpha0000009" }] })
    await expect(run("get_system", { system: "alpha" })).rejects.toThrow(/2 systems are named "alpha"/)
  })
})

describe("get_system_stats", () => {
  it("summarizes the range", async () => {
    hub({ systems, system_stats: statsSeries })
    const text = await run("get_system_stats", { system: "alpha", range: "24h" })
    expect(text).toContain("alpha, last 24h: 3 20m records")
    expect(text).toContain("| CPU | 10.0% | 20.0% | 30.0% | 20.0% |")
    expect(text).toContain("| Memory used | 10.0 GB | 11.0 GB | 12.0 GB | 12.0 GB |")
    expect(text).toContain("| Network received | 2.9 KB/s | 5.9 KB/s | 8.8 KB/s | 8.8 KB/s |")
    expect(text).toContain("| Temp cpu_package | 50°C | 51°C | 52°C | 52°C |")
  })

  it("filters on the system, the interval and a start date PocketBase compares correctly", async () => {
    hub({ systems, system_stats: statsSeries })
    await run("get_system_stats", { system: "alpha", range: "7d" })
    expect(requestFor("system_stats")?.searchParams.get("filter")).toBe(
      '(system = "sysalpha0000001") && (type = "120m") && (created >= "2026-11-18 12:00:00.000Z")',
    )
  })

  it("reads memory in GB from older agents", async () => {
    hub({ systems, system_stats: [oldAgentStats] })
    expect(await run("get_system_stats", { system: "alpha", range: "1h" })).toContain(
      "| Memory used | 9.5 GB | 9.5 GB | 9.5 GB | 9.5 GB |",
    )
  })

  it("says so when there's nothing in the range", async () => {
    hub({ systems, system_stats: [] })
    expect(await run("get_system_stats", { system: "bravo", range: "1h" })).toMatch(/No 1m stats for bravo/)
  })
})

describe("containers", () => {
  it("lists containers across systems, with health", async () => {
    hub({ systems, containers })
    const text = await run("list_containers")
    expect(text).toContain("2 containers, 1 unhealthy.")
    expect(text).toContain("| web | alpha | Up 3 days | healthy | 1.5% | 256 MB | 4.0 KB/s | example/web:1.2 | yes |")
  })

  it("filters by health", async () => {
    hub({ systems, containers })
    const text = await run("list_containers", { health: "unhealthy" })
    expect(text).toContain("| db |")
    expect(text).not.toContain("| web |")
  })

  it("asks only for one system's containers when given one", async () => {
    hub({ systems, containers })
    await run("list_containers", { system: "alpha" })
    expect(requestFor("containers")?.searchParams.get("filter")).toBe('system = "sysalpha0000001"')
  })

  it("summarizes one container over a range", async () => {
    hub({ systems, container_stats: containerSeries })
    const text = await run("get_container_stats", { system: "alpha", container: "web", range: "24h" })
    expect(text).toContain("web on alpha, last 24h: 2 20m records")
    expect(text).toContain("| CPU | 1.0% | 2.0% | 3.0% | 3.0% |")
    expect(text).toContain("| Memory | 200 MB | 250 MB | 300 MB | 300 MB |")
  })

  it("lists the containers it has stats for when the name is wrong", async () => {
    hub({ systems, container_stats: containerSeries })
    await expect(
      run("get_container_stats", { system: "alpha", container: "cache", range: "24h" }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('No stats for a container named "cache"'),
    })
  })
})

describe("list_systemd_services", () => {
  it("lists services and counts the failed ones", async () => {
    hub({ systems, systemd_services: services })
    const text = await run("list_systemd_services", { system: "alpha", failed_only: false })
    expect(text).toContain("alpha: 2 services tracked, 1 failed.")
    expect(text).toContain("| nginx.service | active | running | 0.2% |")
  })

  it("shows only failed services when asked", async () => {
    hub({ systems, systemd_services: services })
    const text = await run("list_systemd_services", { system: "alpha", failed_only: true })
    expect(text).toContain("| backup.service | failed | failed |")
    expect(text).not.toContain("nginx")
  })
})

describe("list_smart_devices", () => {
  it("lists disks and flags the ones not passing", async () => {
    hub({ systems, smart_devices: smartDevices })
    const text = await run("list_smart_devices")
    expect(text).toContain("2 disks, 1 not reporting PASSED.")
    expect(text).toContain("| nvme0 | alpha | Example NVMe 2TB | nvme | 1.8 TB | PASSED | 41°C | 12000 | 80 |")
  })
})

describe("alerts", () => {
  it("lists alert rules with their thresholds", async () => {
    hub({ systems, alerts })
    const text = await run("list_alerts", { triggered_only: false })
    expect(text).toContain("3 alerts, 1 triggered now.")
    expect(text).toContain("| alpha | CPU | 80% | 10 min | ok |")
    expect(text).toContain("| bravo | Status | system down | 5 min | **triggered** |")
    expect(text).toContain("| alpha | Temperature | 85°C | 1 min | ok |")
  })

  it("shows only triggered alerts when asked", async () => {
    hub({ systems, alerts })
    const text = await run("list_alerts", { triggered_only: true })
    expect(text).toContain("1 alert, 1 triggered now.")
  })

  it("lists history newest first, with what's still active", async () => {
    hub({ systems, alerts_history: alertHistory })
    const text = await run("get_alert_history", { active_only: false, limit: 100 })
    expect(text).toContain("2 alert events, 1 still active.")
    expect(text).toContain("| 2026-11-25 09:00:00.000Z | bravo | Status | 0 | **active** |")
    expect(requestFor("alerts_history")?.searchParams.get("sort")).toBe("-created")
  })

  it("builds the history filter from the arguments", async () => {
    hub({ systems, alerts_history: alertHistory })
    await run("get_alert_history", { system: "bravo", since: "2026-11-01", active_only: true, limit: 10 })
    const request = requestFor("alerts_history")
    expect(request?.searchParams.get("filter")).toBe(
      '(system = "sysbravo0000002") && (created >= "2026-11-01 00:00:00.000Z") && (resolved = "")',
    )
    expect(request?.searchParams.get("perPage")).toBe("10")
  })

  it("refuses a since that isn't a date", async () => {
    hub({ systems, alerts_history: alertHistory })
    await expect(run("get_alert_history", { since: "last week", active_only: false, limit: 10 })).rejects.toThrow(
      /since is not a date/,
    )
  })
})
