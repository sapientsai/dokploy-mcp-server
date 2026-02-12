import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"

export function registerSettingsTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_settings_health",
    description: "Check the health status of the Dokploy instance",
    parameters: z.object({}),
    execute: async () => {
      const client = getDokployClient()
      const health = await client.get<unknown>("settings.health")
      return `# Dokploy Health\n\n\`\`\`json\n${JSON.stringify(health, null, 2)}\n\`\`\``
    },
  })

  server.addTool({
    name: "dokploy_settings_getDokployVersion",
    description: "Get the current Dokploy version",
    parameters: z.object({}),
    execute: async () => {
      const client = getDokployClient()
      const version = await client.get<string>("settings.getDokployVersion")
      return `Dokploy version: ${version}`
    },
  })

  server.addTool({
    name: "dokploy_settings_getIp",
    description: "Get the server IP address configured in Dokploy",
    parameters: z.object({}),
    execute: async () => {
      const client = getDokployClient()
      const ip = await client.get<string>("settings.getIp")
      return `Server IP: ${ip}`
    },
  })

  server.addTool({
    name: "dokploy_settings_cleanAll",
    description: "Run all cleanup tasks (unused images, stopped containers, builder cache, etc.)",
    parameters: z.object({
      serverId: z.string().optional().describe("Server ID to clean (optional, defaults to main server)"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("settings.cleanAll", {
        ...(args.serverId && { serverId: args.serverId }),
      })
      return "All cleanup tasks completed."
    },
  })

  server.addTool({
    name: "dokploy_settings_cleanUnusedImages",
    description: "Remove unused Docker images to free disk space",
    parameters: z.object({
      serverId: z.string().optional().describe("Server ID (optional)"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("settings.cleanUnusedImages", {
        ...(args.serverId && { serverId: args.serverId }),
      })
      return "Unused Docker images cleaned."
    },
  })

  server.addTool({
    name: "dokploy_settings_reloadServer",
    description: "Reload the Dokploy server process",
    parameters: z.object({}),
    execute: async () => {
      const client = getDokployClient()
      await client.post("settings.reloadServer")
      return "Dokploy server reloaded."
    },
  })

  server.addTool({
    name: "dokploy_settings_reloadTraefik",
    description: "Reload the Traefik reverse proxy configuration",
    parameters: z.object({
      serverId: z.string().optional().describe("Server ID (optional)"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("settings.reloadTraefik", {
        ...(args.serverId && { serverId: args.serverId }),
      })
      return "Traefik configuration reloaded."
    },
  })
}
