import type { SomaServerInstance } from "somamcp"
import { z } from "zod"

import { equals } from "../client/filter"
import type { ContainerRecord } from "../types"
import { CONTAINER_HEALTH_NAMES, containerHealth, megabytes, percent, rate, table } from "../utils/format"
import { listSystems, nameOf, pickSystem, systemNames, systemParam, withClient } from "./shared"

export const formatContainers = (
  containers: ReadonlyArray<ContainerRecord>,
  names: ReadonlyMap<string, string>,
): string => {
  if (containers.length === 0) return "No containers match."
  const unhealthy = containers.filter((c) => c.health === 3).length
  const rows = containers.map((c) => [
    c.name,
    nameOf(names, c.system),
    c.status ?? "–",
    containerHealth(c.health),
    percent(c.cpu),
    megabytes(c.memory),
    rate(c.net),
    c.image ?? "–",
    c.updatable === true ? "yes" : "",
  ])
  return [
    `${containers.length} container${containers.length === 1 ? "" : "s"}${unhealthy > 0 ? `, ${unhealthy} unhealthy` : ""}.`,
    "",
    table(["Name", "System", "Status", "Health", "CPU", "Memory", "Network", "Image", "Update"], rows),
  ].join("\n")
}

export function registerContainerTools(server: SomaServerInstance): void {
  server.addTool({
    name: "list_containers",
    description:
      "List Docker and Podman containers with their status, health check result, CPU, memory, network, image and whether an image update is available. Across all systems unless one is given.",
    parameters: z.object({
      system: systemParam.optional(),
      health: z
        .enum(CONTAINER_HEALTH_NAMES)
        .optional()
        .describe("Only containers whose health check is in this state."),
      name: z.string().optional().describe("Only containers whose name contains this text, ignoring case."),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    execute: async (args) =>
      withClient((client) =>
        listSystems(client).flatMap((systems) => {
          const scope =
            args.system === undefined
              ? client.listAll<ContainerRecord>("containers", { sort: "name" })
              : pickSystem(systems, args.system).flatMap((system) =>
                  client.listAll<ContainerRecord>("containers", { filter: equals("system", system.id), sort: "name" }),
                )
          const wantedHealth = args.health === undefined ? undefined : CONTAINER_HEALTH_NAMES.indexOf(args.health)
          return scope.map((containers) =>
            formatContainers(
              containers.filter(
                (c) =>
                  (wantedHealth === undefined || (c.health ?? 0) === wantedHealth) &&
                  (args.name === undefined || c.name.toLowerCase().includes(args.name.toLowerCase())),
              ),
              systemNames(systems),
            ),
          )
        }),
      ),
  })
}
