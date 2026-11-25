import { Either, IO, Option } from "functype"
import type { SomaServerInstance } from "somamcp"
import { UserError } from "somamcp"
import { z } from "zod"

import type { BeszelClient } from "../client/beszel-client"
import { and, equals, pocketbaseDate, quote } from "../client/filter"
import type { ContainerStat, ContainerStatsRecord, SystemRecord, SystemStats, SystemStatsRecord } from "../types"
import { bytes, celsius, gigabytes, megabytes, number, percent, rate, table } from "../utils/format"
import type { Range } from "../utils/ranges"
import { intervalFor, startOf } from "../utils/ranges"
import type { Summary } from "../utils/stats"
import { distinctSorted, pairSum, present, summarize, summarizeWithPeaks } from "../utils/stats"
import { rangeParam, resolveSystem, systemParam, withClient } from "./shared"

const MB = 1024 ** 2
const GB = 1024 ** 3

const rangeFilter = (systemId: string, range: Range, now: number): string =>
  and(
    equals("system", systemId),
    `type = ${quote(intervalFor(range))}`,
    `created >= ${quote(pocketbaseDate(startOf(range, now)))}`,
  )

/** Used memory in bytes: the byte array newer agents send, else the GB figure older ones do. */
const memoryUsed = (s: SystemStats): Option<number> =>
  present(s.mem?.[1]).orElse(() => present(s.mu).map((gb) => gb * GB))

/**
 * A rate in bytes/s. Beszel leaves a zero rate out of the record (`omitzero`), so a record without
 * one is an idle interval and counts as 0; older agents send MB/s under another key.
 */
const rateOf = (bytesPerSecond: number | undefined, legacyMbPerSecond: number | undefined): Option<number> =>
  present(bytesPerSecond)
    .orElse(() => present(legacyMbPerSecond).map((mb) => mb * MB))
    .orElse(() => Option(0))

const diskRead = (s: SystemStats): Option<number> => rateOf(s.dio?.[0], s.dr)
const diskWrite = (s: SystemStats): Option<number> => rateOf(s.dio?.[1], s.dw)
const netSent = (s: SystemStats): Option<number> => rateOf(s.b?.[0], s.ns)
const netReceived = (s: SystemStats): Option<number> => rateOf(s.b?.[1], s.nr)

/** A record's own peak where Beszel keeps one, else its value. */
const peakOr = (peak: number | undefined, value: Option<number>): Option<number> => present(peak).orElse(() => value)

type Row = { readonly label: string; readonly summary: Option<Summary>; readonly show: (n: number) => string }

const summaryTable = (rows: ReadonlyArray<Row>): string =>
  table(
    ["Metric", "Min", "Avg", "Max", "Latest"],
    rows.flatMap((r) =>
      r.summary.fold(
        () => [],
        (sum) => [[r.label, ...[sum.min, sum.avg, sum.max, sum.latest].map(r.show)]],
      ),
    ),
  )

export const formatSystemStats = (
  system: SystemRecord,
  range: Range,
  records: ReadonlyArray<SystemStatsRecord>,
): string => {
  if (records.length === 0) {
    return `No ${intervalFor(range)} stats for ${system.name} in the last ${range}. A system that's down or paused records none.`
  }
  const stats = records.map((r) => r.stats)
  // eslint-disable-next-line functype/prefer-option -- picks a field straight off Beszel's JSON
  const series = (pick: (s: SystemStats) => number | undefined): Option<Summary> =>
    summarize(stats.map((s) => present(pick(s))))
  const sensors = distinctSorted(stats.flatMap((s) => Object.keys(s.t ?? {})))
  const rows: ReadonlyArray<Row> = [
    {
      label: "CPU",
      summary: summarizeWithPeaks(
        stats.map((s) => present(s.cpu)),
        stats.map((s) => peakOr(s.cpum, present(s.cpu))),
      ),
      show: percent,
    },
    { label: "Memory", summary: series((s) => s.mp), show: percent },
    {
      label: "Memory used",
      summary: summarizeWithPeaks(
        stats.map(memoryUsed),
        stats.map((s) => peakOr(s.memm, memoryUsed(s))),
      ),
      show: bytes,
    },
    { label: "Disk", summary: series((s) => s.dp), show: percent },
    { label: "Disk used", summary: series((s) => s.du), show: gigabytes },
    {
      label: "Disk read",
      summary: summarizeWithPeaks(
        stats.map(diskRead),
        stats.map((s) => peakOr(s.diom?.[0], diskRead(s))),
      ),
      show: rate,
    },
    {
      label: "Disk write",
      summary: summarizeWithPeaks(
        stats.map(diskWrite),
        stats.map((s) => peakOr(s.diom?.[1], diskWrite(s))),
      ),
      show: rate,
    },
    {
      label: "Network sent",
      summary: summarizeWithPeaks(
        stats.map(netSent),
        stats.map((s) => peakOr(s.bm?.[0], netSent(s))),
      ),
      show: rate,
    },
    {
      label: "Network received",
      summary: summarizeWithPeaks(
        stats.map(netReceived),
        stats.map((s) => peakOr(s.bm?.[1], netReceived(s))),
      ),
      show: rate,
    },
    { label: "Load 1m", summary: series((s) => s.la?.[0]), show: (n) => number(n) },
    { label: "Load 5m", summary: series((s) => s.la?.[1]), show: (n) => number(n) },
    { label: "Load 15m", summary: series((s) => s.la?.[2]), show: (n) => number(n) },
    ...sensors.map((sensor) => ({ label: `Temp ${sensor}`, summary: series((s) => s.t?.[sensor]), show: celsius })),
  ]
  const first = records[0]?.created ?? "?"
  const last = records.at(-1)?.created ?? "?"
  return [
    `${system.name}, last ${range}: ${records.length} ${intervalFor(range)} records from ${first} to ${last} (UTC).`,
    "",
    summaryTable(rows),
    "",
    "Min, Avg and Latest are of the interval averages. Max is the highest single reading for CPU, memory used, disk I/O and network, which Beszel records inside each interval; for the rest it is the highest interval average.",
  ].join("\n")
}

/**
 * Bytes per second: newer agents send [sent, received] bytes, older ones MB sent and received.
 * A zero rate is left out of the record, so a container without one was idle.
 */
const containerNetwork = (c: ContainerStat): Option<number> =>
  pairSum(c.b)
    .orElse(() =>
      c.ns === undefined && c.nr === undefined ? Option.none<number>() : present(((c.ns ?? 0) + (c.nr ?? 0)) * MB),
    )
    .orElse(() => Option(0))

export const formatContainerStats = (
  system: SystemRecord,
  container: string,
  range: Range,
  records: ReadonlyArray<ContainerStatsRecord>,
): Either<UserError, string> => {
  const points = records.flatMap((r) => r.stats.filter((c) => c.n === container))
  if (points.length === 0) {
    const seen = distinctSorted(records.flatMap((r) => r.stats.map((c) => c.n)))
    return Either.left(
      new UserError(`No stats for a container named "${container}" on ${system.name} in the last ${range}.`, {
        suggestions: [
          seen.length === 0
            ? "No container stats were recorded in that range."
            : `Containers with stats: ${seen.join(", ")}`,
        ],
      }),
    )
  }
  return Either.right(
    [
      `${container} on ${system.name}, last ${range}: ${points.length} ${intervalFor(range)} records (UTC).`,
      "",
      summaryTable([
        { label: "CPU", summary: summarize(points.map((c) => present(c.c))), show: percent },
        { label: "Memory", summary: summarize(points.map((c) => present(c.m))), show: megabytes },
        { label: "Network", summary: summarize(points.map(containerNetwork)), show: rate },
      ]),
      "",
      "Max is the highest interval average: Beszel keeps no peaks for containers, so a short spike can read lower.",
    ].join("\n"),
  )
}

const systemStats = (
  client: BeszelClient,
  systemId: string,
  range: Range,
  now: number,
): IO<never, Error, ReadonlyArray<SystemStatsRecord>> =>
  client.listAll<SystemStatsRecord>("system_stats", { filter: rangeFilter(systemId, range, now), sort: "created,id" })

const containerStats = (
  client: BeszelClient,
  systemId: string,
  range: Range,
  now: number,
): IO<never, Error, ReadonlyArray<ContainerStatsRecord>> =>
  client.listAll<ContainerStatsRecord>("container_stats", {
    filter: rangeFilter(systemId, range, now),
    sort: "created,id",
  })

export function registerStatsTools(server: SomaServerInstance, now: () => number = Date.now): void {
  server.addTool({
    name: "get_system_stats",
    description:
      "How a system has been doing over a time range: minimum, average, maximum and latest CPU, memory, disk, disk I/O, network, load average and temperatures. Reads the interval Beszel keeps for the range (1m points for 1h, up to 8-hour points for 30d).",
    parameters: z.object({ system: systemParam, range: rangeParam }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    execute: async (args) =>
      withClient((client) =>
        resolveSystem(client, args.system).flatMap((system) =>
          systemStats(client, system.id, args.range, now()).map((records) =>
            formatSystemStats(system, args.range, records),
          ),
        ),
      ),
  })

  server.addTool({
    name: "get_container_stats",
    description:
      "One Docker or Podman container's CPU, memory and network over a time range: minimum, average, maximum and latest. list_containers gives the names.",
    parameters: z.object({
      system: systemParam,
      container: z.string().min(1).describe("The container's name, as list_containers shows it."),
      range: rangeParam,
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    execute: async (args) =>
      withClient((client) =>
        resolveSystem(client, args.system).flatMap((system) =>
          containerStats(client, system.id, args.range, now()).flatMap((records) =>
            IO.fromEither(formatContainerStats(system, args.container, args.range, records)),
          ),
        ),
      ),
  })
}
