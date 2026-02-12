import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployCompose } from "../types"
import { formatCompose } from "../utils/formatters"

export function registerComposeTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_compose_create",
    description: "Create a new Docker Compose service in an environment",
    parameters: z.object({
      name: z.string().describe("Compose service name"),
      environmentId: z.string().describe("Environment ID"),
      description: z.string().optional().describe("Description"),
      composeType: z.string().optional().describe("Compose type (docker-compose, stack)"),
      composeFile: z.string().optional().describe("Docker Compose file content"),
      serverId: z.string().optional().describe("Server ID for remote deployment"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const compose = await client.post<DokployCompose>("compose.create", {
        name: args.name,
        environmentId: args.environmentId,
        ...(args.description && { description: args.description }),
        ...(args.composeType && { composeType: args.composeType }),
        ...(args.composeFile && { composeFile: args.composeFile }),
        ...(args.serverId && { serverId: args.serverId }),
      })
      return `# Compose Service Created\n\n${formatCompose(compose)}`
    },
  })

  server.addTool({
    name: "dokploy_compose_get",
    description: "Get details for a Docker Compose service",
    parameters: z.object({
      composeId: z.string().describe("The compose service ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const compose = await client.get<DokployCompose>("compose.one", { composeId: args.composeId })
      return `# Compose Details\n\n${formatCompose(compose)}`
    },
  })

  server.addTool({
    name: "dokploy_compose_update",
    description: "Update a Docker Compose service configuration",
    parameters: z.object({
      composeId: z.string().describe("The compose service ID"),
      name: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
      composeFile: z.string().optional().describe("Updated Docker Compose file content"),
      env: z.string().optional().describe("Environment variables"),
      command: z.string().optional().describe("Custom command"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const { composeId, ...updates } = args
      const body: Record<string, unknown> = { composeId }
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) body[key] = value
      }
      await client.post("compose.update", body)
      return `Compose service ${composeId} updated.`
    },
  })

  server.addTool({
    name: "dokploy_compose_delete",
    description: "Delete a Docker Compose service",
    parameters: z.object({
      composeId: z.string().describe("The compose service ID"),
      deleteVolumes: z.boolean().describe("Whether to also delete associated volumes"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("compose.delete", { composeId: args.composeId, deleteVolumes: args.deleteVolumes })
      return `Compose service ${args.composeId} deleted.`
    },
  })

  server.addTool({
    name: "dokploy_compose_deploy",
    description: "Deploy a Docker Compose service",
    parameters: z.object({
      composeId: z.string().describe("The compose service ID"),
      title: z.string().optional().describe("Deployment title"),
      description: z.string().optional().describe("Deployment description"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("compose.deploy", {
        composeId: args.composeId,
        ...(args.title && { title: args.title }),
        ...(args.description && { description: args.description }),
      })
      return `Deployment triggered for compose service ${args.composeId}.`
    },
  })

  server.addTool({
    name: "dokploy_compose_redeploy",
    description: "Redeploy a Docker Compose service",
    parameters: z.object({
      composeId: z.string().describe("The compose service ID"),
      title: z.string().optional().describe("Deployment title"),
      description: z.string().optional().describe("Deployment description"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("compose.redeploy", {
        composeId: args.composeId,
        ...(args.title && { title: args.title }),
        ...(args.description && { description: args.description }),
      })
      return `Redeployment triggered for compose service ${args.composeId}.`
    },
  })

  server.addTool({
    name: "dokploy_compose_start",
    description: "Start a stopped Docker Compose service",
    parameters: z.object({
      composeId: z.string().describe("The compose service ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("compose.start", { composeId: args.composeId })
      return `Compose service ${args.composeId} started.`
    },
  })

  server.addTool({
    name: "dokploy_compose_stop",
    description: "Stop a running Docker Compose service",
    parameters: z.object({
      composeId: z.string().describe("The compose service ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("compose.stop", { composeId: args.composeId })
      return `Compose service ${args.composeId} stopped.`
    },
  })

  server.addTool({
    name: "dokploy_compose_loadServices",
    description: "Load the list of services defined in a Docker Compose file",
    parameters: z.object({
      composeId: z.string().describe("The compose service ID"),
      type: z.string().optional().describe("Service type filter"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const services = await client.get<unknown>("compose.loadServices", {
        composeId: args.composeId,
        ...(args.type && { type: args.type }),
      })
      return `# Compose Services\n\n\`\`\`json\n${JSON.stringify(services, null, 2)}\n\`\`\``
    },
  })

  server.addTool({
    name: "dokploy_compose_loadMounts",
    description: "Load mounts for a specific service in a Docker Compose setup",
    parameters: z.object({
      composeId: z.string().describe("The compose service ID"),
      serviceName: z.string().describe("The service name within the compose"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const mounts = await client.get<unknown>("compose.loadMountsByService", {
        composeId: args.composeId,
        serviceName: args.serviceName,
      })
      return `# Mounts for ${args.serviceName}\n\n\`\`\`json\n${JSON.stringify(mounts, null, 2)}\n\`\`\``
    },
  })

  server.addTool({
    name: "dokploy_compose_getDefaultCommand",
    description: "Get the default docker compose command for a service",
    parameters: z.object({
      composeId: z.string().describe("The compose service ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const command = await client.get<string>("compose.getDefaultCommand", { composeId: args.composeId })
      return `Default command: ${command}`
    },
  })

  server.addTool({
    name: "dokploy_compose_move",
    description: "Move a Docker Compose service to a different environment",
    parameters: z.object({
      composeId: z.string().describe("The compose service ID"),
      targetEnvironmentId: z.string().describe("The target environment ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("compose.move", {
        composeId: args.composeId,
        targetEnvironmentId: args.targetEnvironmentId,
      })
      return `Compose service ${args.composeId} moved to environment ${args.targetEnvironmentId}.`
    },
  })
}
