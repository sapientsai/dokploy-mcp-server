import type { Option } from "functype"
import { IO, Match, None, Some } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError, ValidationError } from "../client/errors"
import { jsonSection, pickDefined } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = [
  "list",
  "get",
  "create",
  "remove",
  "recreate",
  "resync",
  "inspect",
  "import",
  "networksToSync",
] as const

const CREATE_OPTIONAL_FIELDS = [
  "driver",
  "internal",
  "attachable",
  "enableIPv4",
  "enableIPv6",
  "mtu",
  "ipam",
  "serverId",
] as const

type IpamConfig = {
  driver?: string
  config?: Array<{ subnet?: string; gateway?: string; ipRange?: string }>
}

type NetworkArgs = {
  action: (typeof ACTIONS)[number]
  networkId?: string
  serverId?: string
  name?: string
  driver?: "bridge" | "overlay"
  internal?: boolean
  attachable?: boolean
  enableIPv4?: boolean
  enableIPv6?: boolean
  mtu?: number
  ipam?: IpamConfig
  names?: string[]
}

/** The id-keyed actions all take networkId and nothing else. */
function networkIdError(args: NetworkArgs): Option<ApiError> {
  if (!args.networkId) return Some(ValidationError(`${args.action} requires networkId`))
  return None()
}

export function buildNetworkProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: NetworkArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("list", () => {
      const params: Record<string, string> = {}
      if (args.serverId) params.serverId = args.serverId
      return client
        .get<unknown>("network.all", params)
        .map((networks) => jsonSection("Docker Networks", networks, "No networks found."))
    })
    .case("get", () => {
      const invalid = networkIdError(args)
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .get<unknown>("network.one", { networkId: args.networkId! })
        .map((network) => jsonSection(`Network ${args.networkId}`, network, `Network ${args.networkId} not found.`))
    })
    .case("create", () => {
      if (!args.name) return IO.fail<ApiError>(ValidationError("create requires name"))
      return client
        .post<unknown>("network.create", { name: args.name, ...pickDefined(args, CREATE_OPTIONAL_FIELDS) })
        .map(() => `Network ${args.name} created.`)
    })
    .case("remove", () => {
      const invalid = networkIdError(args)
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .post<unknown>("network.remove", { networkId: args.networkId! })
        .map(() => `Network ${args.networkId} removed.`)
    })
    .case("recreate", () => {
      const invalid = networkIdError(args)
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return (
        client
          .post<unknown>("network.recreate", { networkId: args.networkId! })
          // Recreating drops and re-adds the network, so anything attached to it is
          // disconnected for the duration — worth saying rather than a bare "done".
          .map(
            () =>
              `Network ${args.networkId} recreated. Services attached to it were disconnected and reattached; verify them.`,
          )
      )
    })
    .case("resync", () => {
      const invalid = networkIdError(args)
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .post<unknown>("network.resync", { networkId: args.networkId! })
        .map(() => `Network ${args.networkId} resynced from the Docker host.`)
    })
    .case("inspect", () => {
      const invalid = networkIdError(args)
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .get<unknown>("network.inspect", { networkId: args.networkId! })
        .map((detail) =>
          jsonSection(`Network ${args.networkId} (inspect)`, detail, `Network ${args.networkId} not found.`),
        )
    })
    .case("import", () => {
      if (!args.names || args.names.length === 0) {
        return IO.fail<ApiError>(ValidationError("import requires names (at least one network name)"))
      }
      const { names } = args
      return client
        .post<unknown>("network.import", { names, ...(args.serverId && { serverId: args.serverId }) })
        .map(() => `Imported ${names.length} network${names.length === 1 ? "" : "s"}: ${names.join(", ")}.`)
    })
    .case("networksToSync", () => {
      const params: Record<string, string> = {}
      if (args.serverId) params.serverId = args.serverId
      return client
        .get<unknown>("network.networksToSync", params)
        .map((networks) =>
          jsonSection("Networks Available to Import", networks, "No unimported networks found on this server."),
        )
    })
    .exhaustive()
}

export function registerNetworkTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_network",
    description:
      "Docker network management. list: serverId? (networks Dokploy knows about). get/inspect/remove/recreate/resync: networkId — inspect returns the raw Docker inspect payload, recreate drops and re-adds the network so attached services are briefly disconnected, resync re-reads the network from Docker and refreshes Dokploy's stored record without touching the network itself. create: name (+ driver bridge|overlay, internal, attachable, enableIPv4, enableIPv6, mtu 68-65535, ipam, serverId). networksToSync: serverId? — networks that exist on the Docker host but are not yet tracked by Dokploy. import: names (one or more names from networksToSync), serverId?. Attach networks to workloads with dokploy_application update networkIds, or dokploy_compose update serviceNetworks.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      networkId: z.string().optional(),
      serverId: z.string().optional(),
      name: z.string().min(1).optional().describe("create: network name"),
      driver: z.enum(["bridge", "overlay"]).optional().describe("create: bridge | overlay"),
      internal: z.boolean().optional(),
      attachable: z.boolean().optional(),
      enableIPv4: z.boolean().optional(),
      enableIPv6: z.boolean().optional(),
      mtu: z.number().int().min(68).max(65535).optional(),
      ipam: z
        .object({
          driver: z.string().optional(),
          config: z
            .array(
              z.object({
                subnet: z.string().optional(),
                gateway: z.string().optional(),
                ipRange: z.string().optional(),
              }),
            )
            .optional(),
        })
        .optional()
        .describe("create: IPAM settings, e.g. { config: [{ subnet: '10.0.1.0/24', gateway: '10.0.1.1' }] }"),
      names: z.array(z.string().min(1)).min(1).optional().describe("import: network names to bring under Dokploy"),
    }),
    execute: async (args) => {
      const either = await buildNetworkProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
