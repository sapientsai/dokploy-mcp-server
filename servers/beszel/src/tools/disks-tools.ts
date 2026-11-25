import type { SomaServerInstance } from "somamcp"
import { z } from "zod"

import { equals } from "../client/filter"
import type { SmartDeviceRecord } from "../types"
import { bytes, celsius, table } from "../utils/format"
import { listSystems, nameOf, pickSystem, systemNames, systemParam, withClient } from "./shared"

export const formatSmartDevices = (
  devices: ReadonlyArray<SmartDeviceRecord>,
  names: ReadonlyMap<string, string>,
): string => {
  if (devices.length === 0) return "No S.M.A.R.T. data. The agent needs smartctl and access to the disks to report it."
  const notPassed = devices.filter((d) => d.state !== undefined && d.state.toUpperCase() !== "PASSED").length
  const rows = devices.map((d) => [
    d.name ?? "–",
    nameOf(names, d.system),
    d.model ?? "–",
    d.type ?? "–",
    bytes(d.capacity),
    d.state ?? "–",
    celsius(d.temp),
    d.hours === undefined ? "–" : `${d.hours}`,
    d.cycles === undefined ? "–" : `${d.cycles}`,
  ])
  return [
    `${devices.length} disk${devices.length === 1 ? "" : "s"}${notPassed > 0 ? `, ${notPassed} not reporting PASSED` : ""}.`,
    "",
    table(["Disk", "System", "Model", "Type", "Capacity", "Health", "Temp", "Power-on hours", "Power cycles"], rows),
  ].join("\n")
}

export function registerDiskTools(server: SomaServerInstance): void {
  server.addTool({
    name: "list_smart_devices",
    description:
      "List disks with their S.M.A.R.T. health: model, type, capacity, health status, temperature, power-on hours and power cycles. Across all systems unless one is given.",
    parameters: z.object({ system: systemParam.optional() }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    execute: async (args) =>
      withClient((client) =>
        listSystems(client).flatMap((systems) =>
          (args.system === undefined
            ? client.listAll<SmartDeviceRecord>("smart_devices", { sort: "name" })
            : pickSystem(systems, args.system).flatMap((system) =>
                client.listAll<SmartDeviceRecord>("smart_devices", {
                  filter: equals("system", system.id),
                  sort: "name",
                }),
              )
          ).map((devices) => formatSmartDevices(devices, systemNames(systems))),
        ),
      ),
  })
}
