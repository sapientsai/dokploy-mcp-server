import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployCompose } from "../types"
import { formatCompose } from "../utils/formatters"

const ACTIONS = [
  "create",
  "get",
  "update",
  "delete",
  "deploy",
  "start",
  "stop",
  "move",
  "loadServices",
  "loadMounts",
  "getDefaultCommand",
  "cancelDeployment",
  "cleanQueues",
  "killBuild",
  "refreshToken",
] as const

export function registerComposeTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_compose",
    description:
      "Manage Docker Compose services. create: name+environmentId. get/delete/start/stop/getDefaultCommand: composeId. update: composeId+fields. deploy: composeId, redeploy?. move: composeId+targetEnvironmentId. loadServices: composeId. loadMounts: composeId+serviceName. cancelDeployment/cleanQueues/killBuild/refreshToken: composeId.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      composeId: z.string().optional(),
      name: z.string().optional(),
      environmentId: z.string().optional(),
      description: z.string().optional(),
      composeType: z.string().optional().describe("docker-compose or stack"),
      composeFile: z.string().optional(),
      serverId: z.string().optional(),
      env: z.string().optional(),
      command: z.string().optional(),
      deleteVolumes: z.boolean().optional(),
      redeploy: z.boolean().optional(),
      title: z.string().optional(),
      deployDescription: z.string().optional(),
      targetEnvironmentId: z.string().optional(),
      type: z.string().optional(),
      serviceName: z.string().optional(),
    }),
    execute: async (args) => {
      const client = getDokployClient()

      switch (args.action) {
        case "create": {
          const compose = await client.post<DokployCompose>("compose.create", {
            name: args.name!,
            environmentId: args.environmentId!,
            ...(args.description && { description: args.description }),
            ...(args.composeType && { composeType: args.composeType }),
            ...(args.composeFile && { composeFile: args.composeFile }),
            ...(args.serverId && { serverId: args.serverId }),
          })
          return `# Compose Created\n\n${formatCompose(compose)}`
        }
        case "get": {
          const compose = await client.get<DokployCompose>("compose.one", { composeId: args.composeId! })
          return `# Compose Details\n\n${formatCompose(compose)}`
        }
        case "update": {
          const body: Record<string, unknown> = { composeId: args.composeId! }
          const updateFields = ["name", "description", "composeFile", "env", "command"] as const
          for (const key of updateFields) {
            if (args[key] !== undefined) body[key] = args[key]
          }
          await client.post("compose.update", body)
          return `Compose ${args.composeId} updated.`
        }
        case "delete": {
          await client.post("compose.delete", {
            composeId: args.composeId!,
            deleteVolumes: args.deleteVolumes ?? false,
          })
          return `Compose ${args.composeId} deleted.`
        }
        case "deploy": {
          const endpoint = args.redeploy ? "compose.redeploy" : "compose.deploy"
          await client.post(endpoint, {
            composeId: args.composeId!,
            ...(args.title && { title: args.title }),
            ...(args.deployDescription && { description: args.deployDescription }),
          })
          return `${args.redeploy ? "Redeployment" : "Deployment"} triggered for compose ${args.composeId}.`
        }
        case "start":
        case "stop": {
          await client.post(`compose.${args.action}`, { composeId: args.composeId! })
          return `Compose ${args.composeId}: ${args.action} completed.`
        }
        case "move": {
          await client.post("compose.move", {
            composeId: args.composeId!,
            targetEnvironmentId: args.targetEnvironmentId!,
          })
          return `Compose ${args.composeId} moved to environment ${args.targetEnvironmentId}.`
        }
        case "loadServices": {
          const services = await client.get<unknown>("compose.loadServices", {
            composeId: args.composeId!,
            ...(args.type && { type: args.type }),
          })
          return `# Compose Services\n\n\`\`\`json\n${JSON.stringify(services, null, 2)}\n\`\`\``
        }
        case "loadMounts": {
          const mounts = await client.get<unknown>("compose.loadMountsByService", {
            composeId: args.composeId!,
            serviceName: args.serviceName!,
          })
          return `# Mounts: ${args.serviceName}\n\n\`\`\`json\n${JSON.stringify(mounts, null, 2)}\n\`\`\``
        }
        case "getDefaultCommand": {
          const command = await client.get<string>("compose.getDefaultCommand", { composeId: args.composeId! })
          return `Default command: ${command}`
        }
        case "cancelDeployment":
        case "cleanQueues":
        case "killBuild":
        case "refreshToken": {
          await client.post(`compose.${args.action}`, { composeId: args.composeId! })
          return `Compose ${args.composeId}: ${args.action} completed.`
        }
      }
    },
  })
}
