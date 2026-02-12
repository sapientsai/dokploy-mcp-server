import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployEnvironment } from "../types"
import { formatEnvironment, formatEnvironmentList } from "../utils/formatters"

const ACTIONS = ["create", "get", "list", "update", "remove", "duplicate"] as const

export function registerEnvironmentTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_environment",
    description:
      "Manage project environments. create: projectId+name. get: environmentId. list: projectId. update: environmentId+fields. remove: environmentId. duplicate: environmentId+name.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      environmentId: z.string().optional(),
      projectId: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
    }),
    execute: async (args) => {
      const client = getDokployClient()

      switch (args.action) {
        case "create": {
          const env = await client.post<DokployEnvironment>("environment.create", {
            name: args.name!,
            projectId: args.projectId!,
            ...(args.description && { description: args.description }),
          })
          return `# Environment Created\n\n${formatEnvironment(env)}`
        }
        case "get": {
          const env = await client.get<DokployEnvironment>("environment.one", { environmentId: args.environmentId! })
          return `# Environment Details\n\n${formatEnvironment(env)}`
        }
        case "list": {
          const envs = await client.get<DokployEnvironment[]>("environment.byProjectId", {
            projectId: args.projectId!,
          })
          return formatEnvironmentList(envs)
        }
        case "update": {
          await client.post("environment.update", {
            environmentId: args.environmentId!,
            ...(args.name && { name: args.name }),
            ...(args.description !== undefined && { description: args.description }),
          })
          return `Environment ${args.environmentId} updated.`
        }
        case "remove": {
          await client.post("environment.remove", { environmentId: args.environmentId! })
          return `Environment ${args.environmentId} removed.`
        }
        case "duplicate": {
          await client.post("environment.duplicate", {
            environmentId: args.environmentId!,
            name: args.name!,
            ...(args.description && { description: args.description }),
          })
          return `Environment duplicated as "${args.name}".`
        }
      }
    },
  })
}
