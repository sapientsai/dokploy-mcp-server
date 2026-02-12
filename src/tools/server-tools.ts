import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployServer } from "../types"
import { formatServer, formatServerList } from "../utils/formatters"

export function registerServerTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_server_list",
    description: "List all remote servers configured in Dokploy",
    parameters: z.object({}),
    execute: async () => {
      const client = getDokployClient()
      const servers = await client.get<DokployServer[]>("server.all")
      return formatServerList(servers)
    },
  })

  server.addTool({
    name: "dokploy_server_get",
    description: "Get details for a specific server",
    parameters: z.object({
      serverId: z.string().describe("The server ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const srv = await client.get<DokployServer>("server.one", { serverId: args.serverId })
      return `# Server Details\n\n${formatServer(srv)}`
    },
  })

  server.addTool({
    name: "dokploy_server_create",
    description: "Add a new remote server to Dokploy",
    parameters: z.object({
      name: z.string().describe("Server name"),
      ipAddress: z.string().describe("Server IP address"),
      port: z.number().describe("SSH port"),
      username: z.string().describe("SSH username"),
      sshKeyId: z.string().describe("SSH key ID to use for connection"),
      serverType: z.string().describe("Server type (docker, swarm)"),
      description: z.string().optional().describe("Server description"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const srv = await client.post<DokployServer>("server.create", {
        name: args.name,
        ipAddress: args.ipAddress,
        port: args.port,
        username: args.username,
        sshKeyId: args.sshKeyId,
        serverType: args.serverType,
        ...(args.description && { description: args.description }),
      })
      return `# Server Created\n\n${formatServer(srv)}`
    },
  })

  server.addTool({
    name: "dokploy_server_update",
    description: "Update a server's configuration",
    parameters: z.object({
      serverId: z.string().describe("The server ID"),
      name: z.string().describe("Server name"),
      ipAddress: z.string().describe("Server IP address"),
      port: z.number().describe("SSH port"),
      username: z.string().describe("SSH username"),
      sshKeyId: z.string().describe("SSH key ID"),
      serverType: z.string().describe("Server type"),
      description: z.string().optional().describe("Server description"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("server.update", {
        serverId: args.serverId,
        name: args.name,
        ipAddress: args.ipAddress,
        port: args.port,
        username: args.username,
        sshKeyId: args.sshKeyId,
        serverType: args.serverType,
        ...(args.description && { description: args.description }),
      })
      return `Server ${args.serverId} updated.`
    },
  })

  server.addTool({
    name: "dokploy_server_remove",
    description: "Remove a server from Dokploy",
    parameters: z.object({
      serverId: z.string().describe("The server ID to remove"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("server.remove", { serverId: args.serverId })
      return `Server ${args.serverId} removed.`
    },
  })

  server.addTool({
    name: "dokploy_server_count",
    description: "Get the total number of servers",
    parameters: z.object({}),
    execute: async () => {
      const client = getDokployClient()
      const count = await client.get<number>("server.count")
      return `Total servers: ${count}`
    },
  })

  server.addTool({
    name: "dokploy_server_publicIp",
    description: "Get the public IP address of the Dokploy host server",
    parameters: z.object({}),
    execute: async () => {
      const client = getDokployClient()
      const ip = await client.get<string>("server.publicIp")
      return `Public IP: ${ip}`
    },
  })

  server.addTool({
    name: "dokploy_server_getMetrics",
    description: "Get resource metrics (CPU, memory, disk) for a server",
    parameters: z.object({
      url: z.string().describe("Metrics URL"),
      token: z.string().describe("Metrics auth token"),
      dataPoints: z.string().optional().describe("Number of data points"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const metrics = await client.get<unknown>("server.getServerMetrics", {
        url: args.url,
        token: args.token,
        ...(args.dataPoints && { dataPoints: args.dataPoints }),
      })
      return `# Server Metrics\n\n\`\`\`json\n${JSON.stringify(metrics, null, 2)}\n\`\`\``
    },
  })
}
