import { Either, IO, Option } from "functype"
import type { SomaServerInstance } from "somamcp"
import { UserError } from "somamcp"
import { z } from "zod"

import { and, equals, pocketbaseDate, quote } from "../client/filter"
import type { AlertHistoryRecord, AlertRecord } from "../types"
import { table } from "../utils/format"
import { listSystems, nameOf, pickSystem, systemNames, systemParam, withClient } from "./shared"

/** Alerts whose `value` is a percentage, as Beszel's alert code reads them (`internal/alerts`). */
const PERCENT_ALERTS: ReadonlyArray<string> = [
  "CPU",
  "Memory",
  "Disk",
  "GPU",
  "CPUIOWait",
  "CPUSteal",
  "Battery",
  "NetworkMonitorLoss",
] as const

/** What an alert's `value` means. A Status alert has none: it fires when the system is down for `min` minutes. */
const thresholdOf = (alert: AlertRecord): string => {
  if (alert.name === "Status") return "system down"
  if (alert.value === undefined) return "–"
  if (PERCENT_ALERTS.includes(alert.name)) return `${alert.value}%`
  if (alert.name === "Temperature") return `${alert.value}°C`
  if (alert.name === "Bandwidth") return `${alert.value} MB/s`
  if (alert.name === "NetworkMonitorCert") return `${alert.value} days before expiry`
  return `${alert.value}`
}

export const formatAlerts = (alerts: ReadonlyArray<AlertRecord>, names: ReadonlyMap<string, string>): string => {
  if (alerts.length === 0) return "No alerts match."
  const triggered = alerts.filter((a) => a.triggered === true).length
  const rows = alerts.map((a) => [
    nameOf(names, a.system),
    a.name,
    thresholdOf(a),
    a.min === undefined || a.min === 0 ? "–" : `${a.min} min`,
    a.triggered === true ? "**triggered**" : "ok",
  ])
  return [
    `${alerts.length} alert${alerts.length === 1 ? "" : "s"}, ${triggered} triggered now.`,
    "",
    table(["System", "Alert", "Threshold", "For at least", "State"], rows),
  ].join("\n")
}

export const formatAlertHistory = (
  entries: ReadonlyArray<AlertHistoryRecord>,
  names: ReadonlyMap<string, string>,
): string => {
  if (entries.length === 0)
    return "No alert history matches. Beszel keeps only each user's newest 200 to 250 events, so older ones may be gone."
  const active = entries.filter((e) => e.resolved === undefined || e.resolved === "").length
  const rows = entries.map((e) => [
    e.created ?? "–",
    nameOf(names, e.system),
    e.monitor_name === undefined || e.monitor_name === "" ? e.name : `${e.name} (${e.monitor_name})`,
    e.value === undefined ? "–" : `${e.value}`,
    e.resolved === undefined || e.resolved === "" ? "**active**" : e.resolved,
  ])
  return [
    `${entries.length} alert event${entries.length === 1 ? "" : "s"}, ${active} still active. Times are UTC.`,
    "",
    table(["Fired", "System", "Alert", "Value", "Resolved"], rows),
  ].join("\n")
}

/** An optional ISO date or time, refused when it doesn't parse. */
const parseSince = (since: string = ""): Either<UserError, Option<Date>> => {
  if (since === "") return Either.right(Option.none())
  const date = new Date(since)
  return Number.isNaN(date.getTime())
    ? Either.left(new UserError(`since is not a date: ${since}. Use an ISO date such as 2026-11-01.`))
    : Either.right(Option(date))
}

export function registerAlertTools(server: SomaServerInstance): void {
  server.addTool({
    name: "list_alerts",
    description:
      "List this Beszel user's alert rules (CPU, memory, disk, status, temperature and more) with their thresholds, and which are triggered now. Across all systems unless one is given.",
    parameters: z.object({
      system: systemParam.optional(),
      triggered_only: z.boolean().default(false).describe("Only alerts that are triggered now."),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    execute: async (args) =>
      withClient((client) =>
        listSystems(client).flatMap((systems) =>
          (args.system === undefined
            ? client.listAll<AlertRecord>("alerts", { sort: "name,id" })
            : pickSystem(systems, args.system).flatMap((system) =>
                client.listAll<AlertRecord>("alerts", { filter: equals("system", system.id), sort: "name,id" }),
              )
          ).map((alerts) =>
            formatAlerts(
              alerts.filter((a) => !args.triggered_only || a.triggered === true),
              systemNames(systems),
            ),
          ),
        ),
      ),
  })

  server.addTool({
    name: "get_alert_history",
    description:
      "When this user's alerts fired and resolved, newest first. Beszel keeps only each user's newest 200 to 250 events, however old. Across all systems unless one is given.",
    parameters: z.object({
      system: systemParam.optional(),
      since: z.string().optional().describe("Only events since this date or time (ISO 8601, e.g. 2026-11-01)."),
      active_only: z.boolean().default(false).describe("Only alerts that haven't resolved."),
      limit: z.number().int().min(1).max(500).default(100).describe("At most this many events (default 100)."),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    execute: async (args) =>
      withClient((client) =>
        IO.fromEither(parseSince(args.since)).flatMap((since) =>
          listSystems(client).flatMap((systems) => {
            const query = (systemFilter: string) =>
              client.list<AlertHistoryRecord>("alerts_history", {
                filter: and(
                  systemFilter,
                  since.fold(
                    () => "",
                    (d) => `created >= ${quote(pocketbaseDate(d))}`,
                  ),
                  args.active_only ? 'resolved = ""' : "",
                ),
                sort: "-created,-id",
                perPage: args.limit,
              })
            return (
              args.system === undefined
                ? query("")
                : pickSystem(systems, args.system).flatMap((system) => query(equals("system", system.id)))
            ).map((page) => formatAlertHistory(page.items, systemNames(systems)))
          }),
        ),
      ),
  })
}
