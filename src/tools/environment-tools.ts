import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployEnvironment } from "../types"
import { formatEnvironment, formatEnvironmentList } from "../utils/formatters"

export function registerEnvironmentTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_environment_create",
    description: "Create a new environment within a project",
    parameters: z.object({
      name: z.string().describe("Environment name"),
      projectId: z.string().describe("Project ID to create the environment in"),
      description: z.string().optional().describe("Environment description"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const env = await client.post<DokployEnvironment>("environment.create", {
        name: args.name,
        projectId: args.projectId,
        ...(args.description && { description: args.description }),
      })
      return `# Environment Created\n\n${formatEnvironment(env)}`
    },
  })

  server.addTool({
    name: "dokploy_environment_get",
    description: "Get details for a specific environment",
    parameters: z.object({
      environmentId: z.string().describe("The environment ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const env = await client.get<DokployEnvironment>("environment.one", { environmentId: args.environmentId })
      return `# Environment Details\n\n${formatEnvironment(env)}`
    },
  })

  server.addTool({
    name: "dokploy_environment_listByProject",
    description: "List all environments for a project",
    parameters: z.object({
      projectId: z.string().describe("The project ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const envs = await client.get<DokployEnvironment[]>("environment.byProjectId", { projectId: args.projectId })
      return formatEnvironmentList(envs)
    },
  })

  server.addTool({
    name: "dokploy_environment_remove",
    description: "Remove an environment and all its services",
    parameters: z.object({
      environmentId: z.string().describe("The environment ID to remove"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("environment.remove", { environmentId: args.environmentId })
      return `Environment ${args.environmentId} removed.`
    },
  })

  server.addTool({
    name: "dokploy_environment_update",
    description: "Update an environment's name or description",
    parameters: z.object({
      environmentId: z.string().describe("The environment ID"),
      name: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("environment.update", {
        environmentId: args.environmentId,
        ...(args.name && { name: args.name }),
        ...(args.description !== undefined && { description: args.description }),
      })
      return `Environment ${args.environmentId} updated.`
    },
  })

  server.addTool({
    name: "dokploy_environment_duplicate",
    description: "Duplicate an environment and its services",
    parameters: z.object({
      environmentId: z.string().describe("The source environment ID"),
      name: z.string().describe("Name for the duplicated environment"),
      description: z.string().optional().describe("Description for the duplicate"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("environment.duplicate", {
        environmentId: args.environmentId,
        name: args.name,
        ...(args.description && { description: args.description }),
      })
      return `Environment duplicated as "${args.name}".`
    },
  })
}
