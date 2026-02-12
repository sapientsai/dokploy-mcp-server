import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployProject } from "../types"
import { formatProject, formatProjectList } from "../utils/formatters"

export function registerProjectTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_project_list",
    description: "List all projects in Dokploy",
    parameters: z.object({}),
    execute: async () => {
      const client = getDokployClient()
      const projects = await client.get<DokployProject[]>("project.all")
      return formatProjectList(projects)
    },
  })

  server.addTool({
    name: "dokploy_project_get",
    description: "Get details for a specific project",
    parameters: z.object({
      projectId: z.string().describe("The project ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const project = await client.get<DokployProject>("project.one", { projectId: args.projectId })
      return `# Project Details\n\n${formatProject(project)}`
    },
  })

  server.addTool({
    name: "dokploy_project_create",
    description: "Create a new project",
    parameters: z.object({
      name: z.string().describe("Project name"),
      description: z.string().optional().describe("Project description"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const project = await client.post<DokployProject>("project.create", {
        name: args.name,
        ...(args.description && { description: args.description }),
      })
      return `# Project Created\n\n${formatProject(project)}`
    },
  })

  server.addTool({
    name: "dokploy_project_update",
    description: "Update a project's name or description",
    parameters: z.object({
      projectId: z.string().describe("The project ID"),
      name: z.string().optional().describe("New project name"),
      description: z.string().optional().describe("New project description"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("project.update", {
        projectId: args.projectId,
        ...(args.name && { name: args.name }),
        ...(args.description !== undefined && { description: args.description }),
      })
      return `Project ${args.projectId} updated successfully.`
    },
  })

  server.addTool({
    name: "dokploy_project_remove",
    description: "Delete a project and all its resources",
    parameters: z.object({
      projectId: z.string().describe("The project ID to remove"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("project.remove", { projectId: args.projectId })
      return `Project ${args.projectId} removed successfully.`
    },
  })

  server.addTool({
    name: "dokploy_project_duplicate",
    description: "Duplicate an environment and its services into a new or existing project",
    parameters: z.object({
      sourceEnvironmentId: z.string().describe("The source environment ID to duplicate from"),
      name: z.string().describe("Name for the duplicated project/environment"),
      description: z.string().optional().describe("Description for the duplicate"),
      includeServices: z.boolean().optional().describe("Whether to include services"),
      duplicateInSameProject: z.boolean().optional().describe("Duplicate within the same project"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("project.duplicate", {
        sourceEnvironmentId: args.sourceEnvironmentId,
        name: args.name,
        ...(args.description && { description: args.description }),
        ...(args.includeServices !== undefined && { includeServices: args.includeServices }),
        ...(args.duplicateInSameProject !== undefined && { duplicateInSameProject: args.duplicateInSameProject }),
      })
      return `Environment duplicated successfully as "${args.name}".`
    },
  })
}
