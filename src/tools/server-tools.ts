import type { IO as IOType } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { DokployServer } from "../types"
import { formatServer, formatServerList } from "../utils/formatters"
import type { ToolServer } from "./types"

const ACTIONS = ["list", "get", "create", "update", "remove", "count", "publicIp", "getMetrics"] as const

type ServerArgs = {
  action: (typeof ACTIONS)[number]
  serverId?: string
  name?: string
  ipAddress?: string
  port?: number
  username?: string
  sshKeyId?: string
  serverType?: string
  description?: string
  url?: string
  token?: string
  dataPoints?: string
}

export function buildServerProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: ServerArgs,
): IOType<never, ApiError, string> {
  return Match(args.action)
    .case("list", () => client.get<DokployServer[]>("server.all").map(formatServerList))
    .case("get", () =>
      client
        .get<DokployServer>("server.one", { serverId: args.serverId! })
        .map((srv) => `# Server Details\n\n${formatServer(srv)}`),
    )
    .case("create", () =>
      client
        .post<DokployServer>("server.create", {
          name: args.name!,
          ipAddress: args.ipAddress!,
          port: args.port!,
          username: args.username!,
          sshKeyId: args.sshKeyId!,
          serverType: args.serverType!,
          ...(args.description && { description: args.description }),
        })
        .map((srv) => `# Server Created\n\n${formatServer(srv)}`),
    )
    .case("update", () =>
      client
        .post<unknown>("server.update", {
          serverId: args.serverId!,
          name: args.name!,
          ipAddress: args.ipAddress!,
          port: args.port!,
          username: args.username!,
          sshKeyId: args.sshKeyId!,
          serverType: args.serverType!,
          ...(args.description && { description: args.description }),
        })
        .map(() => `Server ${args.serverId} updated.`),
    )
    .case("remove", () =>
      client.post<unknown>("server.remove", { serverId: args.serverId! }).map(() => `Server ${args.serverId} removed.`),
    )
    .case("count", () => client.get<number>("server.count").map((count) => `Total servers: ${count}`))
    .case("publicIp", () => client.get<string>("server.publicIp").map((ip) => `Public IP: ${ip}`))
    .case("getMetrics", () =>
      client
        .get<unknown>("server.getServerMetrics", {
          url: args.url!,
          token: args.token!,
          ...(args.dataPoints && { dataPoints: args.dataPoints }),
        })
        .map((metrics) => `# Server Metrics\n\n\`\`\`json\n${JSON.stringify(metrics, null, 2)}\n\`\`\``),
    )
    .exhaustive()
}

export function registerServerTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_server",
    description:
      "Manage servers. list/count/publicIp: no params. get: serverId. create: name+ipAddress+port+username+sshKeyId+serverType. update: serverId+fields. remove: serverId. getMetrics: url+token.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      serverId: z.string().optional(),
      name: z.string().optional(),
      ipAddress: z.string().optional(),
      port: z.number().optional(),
      username: z.string().optional(),
      sshKeyId: z.string().optional(),
      serverType: z.string().optional(),
      description: z.string().optional(),
      url: z.string().optional(),
      token: z.string().optional(),
      dataPoints: z.string().optional(),
    }),
    execute: async (args) => {
      const either = await buildServerProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
