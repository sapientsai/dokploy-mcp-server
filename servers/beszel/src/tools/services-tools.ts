import type { SomaServerInstance } from "somamcp"
import { z } from "zod"

import { equals } from "../client/filter"
import type { SystemdServiceRecord, SystemRecord } from "../types"
import { bytes, percent, serviceState, serviceSubState, table } from "../utils/format"
import { resolveSystem, systemParam, withClient } from "./shared"

/** `state` 2 is failed. */
const FAILED = 2

export const formatServices = (
  system: SystemRecord,
  services: ReadonlyArray<SystemdServiceRecord>,
  failedOnly: boolean,
): string => {
  const shown = failedOnly ? services.filter((s) => s.state === FAILED) : services
  if (services.length === 0) return `Beszel tracks no systemd services on ${system.name}.`
  if (shown.length === 0) return `No failed services on ${system.name}, of ${services.length} tracked.`
  const failed = services.filter((s) => s.state === FAILED).length
  const rows = shown.map((s) => [
    s.name,
    serviceState(s.state),
    serviceSubState(s.sub),
    percent(s.cpu),
    percent(s.cpuPeak),
    bytes(s.memory),
    bytes(s.memPeak),
  ])
  return [
    `${system.name}: ${services.length} services tracked, ${failed} failed.`,
    "",
    table(["Service", "State", "Sub-state", "CPU", "CPU peak", "Memory", "Memory peak"], rows),
  ].join("\n")
}

export function registerServiceTools(server: SomaServerInstance): void {
  server.addTool({
    name: "list_systemd_services",
    description:
      "List the systemd services Beszel tracks on a system, with state (active, failed, ...), sub-state, CPU and memory, and their peaks.",
    parameters: z.object({
      system: systemParam,
      failed_only: z.boolean().default(false).describe("Only failed services."),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    execute: async (args) =>
      withClient((client) =>
        resolveSystem(client, args.system).flatMap((system) =>
          client
            .listAll<SystemdServiceRecord>("systemd_services", { filter: equals("system", system.id), sort: "name" })
            .map((services) => formatServices(system, services, args.failed_only)),
        ),
      ),
  })
}
