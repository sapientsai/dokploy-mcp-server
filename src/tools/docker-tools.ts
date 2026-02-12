import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployContainer } from "../types"
import { formatContainerList } from "../utils/formatters"

export function registerDockerTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_docker_getContainers",
    description: "List all Docker containers, optionally filtered by server",
    parameters: z.object({
      serverId: z.string().optional().describe("Server ID to filter containers (optional)"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const containers = await client.get<DokployContainer[]>("docker.getContainers", {
        ...(args.serverId && { serverId: args.serverId }),
      })
      return formatContainerList(containers)
    },
  })

  server.addTool({
    name: "dokploy_docker_restartContainer",
    description: "Restart a specific Docker container",
    parameters: z.object({
      containerId: z.string().describe("The container ID to restart"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("docker.restartContainer", { containerId: args.containerId })
      return `Container ${args.containerId} restarted.`
    },
  })

  server.addTool({
    name: "dokploy_docker_getConfig",
    description: "Get the Docker configuration/inspect data for a container",
    parameters: z.object({
      containerId: z.string().describe("The container ID"),
      serverId: z.string().optional().describe("Server ID if on a remote server"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const config = await client.get<unknown>("docker.getConfig", {
        containerId: args.containerId,
        ...(args.serverId && { serverId: args.serverId }),
      })
      return `# Container Config\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``
    },
  })

  server.addTool({
    name: "dokploy_docker_getByAppNameMatch",
    description: "Get containers matching an application name pattern",
    parameters: z.object({
      appName: z.string().describe("Application name to match"),
      appType: z.string().optional().describe("Application type filter"),
      serverId: z.string().optional().describe("Server ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const containers = await client.get<DokployContainer[]>("docker.getContainersByAppNameMatch", {
        appName: args.appName,
        ...(args.appType && { appType: args.appType }),
        ...(args.serverId && { serverId: args.serverId }),
      })
      return formatContainerList(containers)
    },
  })

  server.addTool({
    name: "dokploy_docker_getByAppLabel",
    description: "Get containers by application label",
    parameters: z.object({
      appName: z.string().describe("Application name label"),
      type: z.string().describe("Label type"),
      serverId: z.string().optional().describe("Server ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const containers = await client.get<DokployContainer[]>("docker.getContainersByAppLabel", {
        appName: args.appName,
        type: args.type,
        ...(args.serverId && { serverId: args.serverId }),
      })
      return formatContainerList(containers)
    },
  })

  server.addTool({
    name: "dokploy_docker_getStackContainers",
    description: "Get containers for a Docker stack by application name",
    parameters: z.object({
      appName: z.string().describe("Application name"),
      serverId: z.string().optional().describe("Server ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const containers = await client.get<DokployContainer[]>("docker.getStackContainersByAppName", {
        appName: args.appName,
        ...(args.serverId && { serverId: args.serverId }),
      })
      return formatContainerList(containers)
    },
  })

  server.addTool({
    name: "dokploy_docker_getServiceContainers",
    description: "Get containers for a specific Docker service by application name",
    parameters: z.object({
      appName: z.string().describe("Application name"),
      serverId: z.string().optional().describe("Server ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const containers = await client.get<DokployContainer[]>("docker.getServiceContainersByAppName", {
        appName: args.appName,
        ...(args.serverId && { serverId: args.serverId }),
      })
      return formatContainerList(containers)
    },
  })
}
