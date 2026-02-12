import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"

const ACTIONS = ["health", "version", "ip", "clean", "reload"] as const

export function registerSettingsTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_settings",
    description:
      "System settings. health: check status. version: get version. ip: get IP. clean: cleanType (all|images), serverId?. reload: reloadTarget (server|traefik), serverId?.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      cleanType: z.enum(["all", "images"]).optional(),
      reloadTarget: z.enum(["server", "traefik"]).optional(),
      serverId: z.string().optional(),
    }),
    execute: async (args) => {
      const client = getDokployClient()

      switch (args.action) {
        case "health": {
          const health = await client.get<unknown>("settings.health")
          return `# Health\n\n\`\`\`json\n${JSON.stringify(health, null, 2)}\n\`\`\``
        }
        case "version": {
          const version = await client.get<string>("settings.getDokployVersion")
          return `Dokploy version: ${version}`
        }
        case "ip": {
          const ip = await client.get<string>("settings.getIp")
          return `Server IP: ${ip}`
        }
        case "clean": {
          const type = args.cleanType ?? "all"
          const endpoint = type === "all" ? "settings.cleanAll" : "settings.cleanUnusedImages"
          await client.post(endpoint, {
            ...(args.serverId && { serverId: args.serverId }),
          })
          return `Cleanup (${type}) completed.`
        }
        case "reload": {
          const target = args.reloadTarget ?? "server"
          if (target === "server") {
            await client.post("settings.reloadServer")
          } else {
            await client.post("settings.reloadTraefik", {
              ...(args.serverId && { serverId: args.serverId }),
            })
          }
          return `${target} reloaded.`
        }
      }
    },
  })
}
