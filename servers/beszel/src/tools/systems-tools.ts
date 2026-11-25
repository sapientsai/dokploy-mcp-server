import { type IO, Option } from "functype"
import type { SomaServerInstance } from "somamcp"
import { z } from "zod"

import type { BeszelClient } from "../client/beszel-client"
import { equals } from "../client/filter"
import type { SystemDetailsRecord, SystemRecord, SystemStats, SystemStatsRecord } from "../types"
import { bytes, celsius, connectionType, duration, gigabytes, loadAverage, percent, rate, table } from "../utils/format"
import { listSystems, resolveSystem, systemParam, withClient } from "./shared"

const STATUSES = ["up", "down", "paused", "pending"] as const

/** The first of a count pair such as [updates, security updates]. */
const firstCount = (values: ReadonlyArray<number> | undefined): string =>
  values === undefined || values.length === 0 ? "–" : `${values[0] ?? 0}`

export const formatSystems = (systems: ReadonlyArray<SystemRecord>): string => {
  if (systems.length === 0) return "No systems match."
  const counts = STATUSES.map((s) => [s, systems.filter((x) => x.status === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`)
    .join(", ")
  const rows = systems.map((s) => {
    const info = s.info ?? {}
    const failed = info.sv?.[1]
    return [
      s.name,
      s.id,
      s.status,
      percent(info.cpu),
      percent(info.mp),
      percent(info.dp),
      loadAverage(info.la),
      duration(info.u),
      info.v ?? "–",
      failed === undefined ? "–" : String(failed),
      firstCount(info.pu),
    ]
  })
  return [
    `${systems.length} system${systems.length === 1 ? "" : "s"}: ${counts}.`,
    "",
    table(
      ["Name", "Id", "Status", "CPU", "Memory", "Disk", "Load 1/5/15", "Uptime", "Agent", "Failed services", "Updates"],
      rows,
    ),
  ].join("\n")
}

const line = (label: string, value: string | undefined): Option<string> =>
  value === undefined || value === "" || value === "–" ? Option.none() : Option(`- **${label}:** ${value}`)

export const formatSystem = (
  system: SystemRecord,
  details: Option<SystemDetailsRecord>,
  latest: Option<SystemStatsRecord>,
): string => {
  const info = system.info ?? {}
  const d: Partial<SystemDetailsRecord> = details.getOrElse(() => ({}))
  const stats: SystemStats = latest.map((r) => r.stats).getOrElse(() => ({}))
  const memTotal = stats.mem?.[0] ?? d.memory
  const memUsed = stats.mem?.[1]
  const overview = [
    line("Status", system.status),
    line(
      "Host",
      system.host === undefined
        ? undefined
        : `${system.host}${system.port === undefined || system.port === "" ? "" : `:${system.port}`}`,
    ),
    line("Connection", info.ct === undefined ? undefined : connectionType(info.ct)),
    line("Agent", info.v),
    line("Uptime", info.u === undefined ? undefined : duration(info.u)),
    line("OS", d.os_name),
    line("Kernel", d.kernel ?? info.k),
    line("Hostname", d.hostname ?? info.h),
    line(
      "CPU",
      [
        d.cpu ?? info.m,
        d.cores === undefined ? undefined : `${d.cores} cores`,
        d.threads === undefined ? undefined : `${d.threads} threads`,
      ]
        .filter(Boolean)
        .join(", "),
    ),
    line("Architecture", d.arch),
  ]
  const usage = [
    line("CPU use", percent(info.cpu)),
    line(
      "Memory",
      memUsed !== undefined && memTotal !== undefined
        ? `${bytes(memUsed)} of ${bytes(memTotal)} (${percent(info.mp)})`
        : percent(info.mp),
    ),
    line(
      "Disk",
      stats.du !== undefined && stats.d !== undefined
        ? `${gigabytes(stats.du)} of ${gigabytes(stats.d)} (${percent(info.dp)})`
        : percent(info.dp),
    ),
    line("Load 1/5/15", loadAverage(info.la)),
    line("Network", info.bb === undefined ? undefined : rate(info.bb)),
    line("GPU", info.g === undefined ? undefined : percent(info.g)),
    line("Services", info.sv === undefined ? undefined : `${info.sv[0] ?? 0} tracked, ${info.sv[1] ?? 0} failed`),
    line(
      "Package updates",
      info.pu === undefined
        ? undefined
        : `${info.pu[0] ?? 0}${info.pu.length > 1 ? ` (${info.pu[1] ?? 0} security)` : ""}`,
    ),
  ]
  const filesystems = Object.entries(stats.efs ?? {}).map(
    ([name, fs]) => `- ${fs.n ?? name}: ${gigabytes(fs.du)} of ${gigabytes(fs.d)}`,
  )
  const temperatures = Object.entries(stats.t ?? {})
    .sort(([, a], [, b]) => b - a)
    .map(([sensor, t]) => `- ${sensor}: ${celsius(t)}`)
  const section = (title: string, lines: ReadonlyArray<Option<string> | string>): ReadonlyArray<string> => {
    const present = lines.flatMap((l) =>
      typeof l === "string"
        ? [l]
        : l.fold(
            () => [],
            (v) => [v],
          ),
    )
    return present.length === 0 ? [] : ["", `## ${title}`, ...present]
  }
  return [
    `# ${system.name} (${system.id})`,
    ...section("Overview", overview),
    ...section("Now", usage),
    ...section("Other filesystems", filesystems),
    ...section("Temperatures", temperatures),
  ].join("\n")
}

const latestStats = (client: BeszelClient, systemId: string): IO<never, Error, Option<SystemStatsRecord>> =>
  client
    .list<SystemStatsRecord>("system_stats", {
      filter: `${equals("system", systemId)} && type = "1m"`,
      sort: "-created",
      perPage: 1,
    })
    .map((r) => Option(r.items[0]))

const details = (client: BeszelClient, systemId: string): IO<never, Error, Option<SystemDetailsRecord>> =>
  client
    .list<SystemDetailsRecord>("system_details", { filter: equals("system", systemId), perPage: 1 })
    .map((r) => Option(r.items[0]))

export function registerSystemTools(server: SomaServerInstance): void {
  server.addTool({
    name: "list_systems",
    description:
      "List the machines Beszel monitors, with status (up, down, paused, pending), CPU, memory and disk use, load, uptime, agent version, failed systemd services and pending package updates. Start here: it gives each system's name and id for the other tools.",
    parameters: z.object({
      status: z.enum(STATUSES).optional().describe("Only systems with this status."),
      name: z.string().optional().describe("Only systems whose name contains this text, ignoring case."),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    execute: async (args) =>
      withClient((client) =>
        listSystems(client).map((systems) =>
          formatSystems(
            systems.filter(
              (s) =>
                (args.status === undefined || s.status === args.status) &&
                (args.name === undefined || s.name.toLowerCase().includes(args.name.toLowerCase())),
            ),
          ),
        ),
      ),
  })

  server.addTool({
    name: "get_system",
    description:
      "Everything current about one system: status, OS, kernel, CPU model and cores, memory and disk use, load, network, GPU, other filesystems, temperatures, services and package updates.",
    parameters: z.object({ system: systemParam }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    execute: async (args) =>
      withClient((client) =>
        resolveSystem(client, args.system).flatMap((system) =>
          details(client, system.id)
            .zip(latestStats(client, system.id))
            .map(([d, s]) => formatSystem(system, d, s)),
        ),
      ),
  })
}
