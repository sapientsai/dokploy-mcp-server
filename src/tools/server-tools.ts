import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployServer } from "../types"
import { formatServer, formatServerList } from "../utils/formatters"

const ACTIONS = ["list", "get", "create", "update", "remove", "count", "publicIp", "getMetrics"] as const

export function registerServerTools(server: FastMCP) {
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
      const client = getDokployClient()

      switch (args.action) {
        case "list": {
          const servers = await client.get<DokployServer[]>("server.all")
          return formatServerList(servers)
        }
        case "get": {
          const srv = await client.get<DokployServer>("server.one", { serverId: args.serverId! })
          return `# Server Details\n\n${formatServer(srv)}`
        }
        case "create": {
          const srv = await client.post<DokployServer>("server.create", {
            name: args.name!,
            ipAddress: args.ipAddress!,
            port: args.port!,
            username: args.username!,
            sshKeyId: args.sshKeyId!,
            serverType: args.serverType!,
            ...(args.description && { description: args.description }),
          })
          return `# Server Created\n\n${formatServer(srv)}`
        }
        case "update": {
          await client.post("server.update", {
            serverId: args.serverId!,
            name: args.name!,
            ipAddress: args.ipAddress!,
            port: args.port!,
            username: args.username!,
            sshKeyId: args.sshKeyId!,
            serverType: args.serverType!,
            ...(args.description && { description: args.description }),
          })
          return `Server ${args.serverId} updated.`
        }
        case "remove": {
          await client.post("server.remove", { serverId: args.serverId! })
          return `Server ${args.serverId} removed.`
        }
        case "count": {
          const count = await client.get<number>("server.count")
          return `Total servers: ${count}`
        }
        case "publicIp": {
          const ip = await client.get<string>("server.publicIp")
          return `Public IP: ${ip}`
        }
        case "getMetrics": {
          const metrics = await client.get<unknown>("server.getServerMetrics", {
            url: args.url!,
            token: args.token!,
            ...(args.dataPoints && { dataPoints: args.dataPoints }),
          })
          return `# Server Metrics\n\n\`\`\`json\n${JSON.stringify(metrics, null, 2)}\n\`\`\``
        }
      }
    },
  })
}
