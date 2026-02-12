import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployContainer } from "../types"
import { formatContainerList } from "../utils/formatters"

const ACTIONS = ["getContainers", "restartContainer", "getConfig", "findContainers"] as const

export function registerDockerTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_docker",
    description:
      "Docker management. getContainers: serverId?. restartContainer: containerId. getConfig: containerId, serverId?. findContainers: appName+method(match|label|stack|service), serverId?.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      containerId: z.string().optional(),
      serverId: z.string().optional(),
      appName: z.string().optional(),
      method: z.enum(["match", "label", "stack", "service"]).optional(),
      appType: z.string().optional().describe("App type filter (match method only)"),
      type: z.string().optional().describe("Label type (label method only)"),
    }),
    execute: async (args) => {
      const client = getDokployClient()

      switch (args.action) {
        case "getContainers": {
          const containers = await client.get<DokployContainer[]>("docker.getContainers", {
            ...(args.serverId && { serverId: args.serverId }),
          })
          return formatContainerList(containers)
        }
        case "restartContainer": {
          await client.post("docker.restartContainer", { containerId: args.containerId! })
          return `Container ${args.containerId} restarted.`
        }
        case "getConfig": {
          const config = await client.get<unknown>("docker.getConfig", {
            containerId: args.containerId!,
            ...(args.serverId && { serverId: args.serverId }),
          })
          return `# Container Config\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``
        }
        case "findContainers": {
          const endpointMap: Record<string, string> = {
            match: "docker.getContainersByAppNameMatch",
            label: "docker.getContainersByAppLabel",
            stack: "docker.getStackContainersByAppName",
            service: "docker.getServiceContainersByAppName",
          }
          const method = args.method!
          const params: Record<string, string> = { appName: args.appName! }
          if (args.serverId) params.serverId = args.serverId
          if (args.appType && method === "match") params.appType = args.appType
          if (args.type && method === "label") params.type = args.type
          const containers = await client.get<DokployContainer[]>(endpointMap[method], params)
          return formatContainerList(containers)
        }
      }
    },
  })
}
