import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployProject } from "../types"
import { formatProject, formatProjectList } from "../utils/formatters"

const ACTIONS = ["list", "get", "create", "update", "remove", "duplicate"] as const

export function registerProjectTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_project",
    description:
      "Manage projects. list: all. get: projectId. create: name. update: projectId+fields. remove: projectId. duplicate: sourceEnvironmentId+name.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      projectId: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      sourceEnvironmentId: z.string().optional(),
      includeServices: z.boolean().optional(),
      duplicateInSameProject: z.boolean().optional(),
    }),
    execute: async (args) => {
      const client = getDokployClient()

      switch (args.action) {
        case "list": {
          const projects = await client.get<DokployProject[]>("project.all")
          return formatProjectList(projects)
        }
        case "get": {
          const project = await client.get<DokployProject>("project.one", { projectId: args.projectId! })
          return `# Project Details\n\n${formatProject(project)}`
        }
        case "create": {
          const project = await client.post<DokployProject>("project.create", {
            name: args.name!,
            ...(args.description && { description: args.description }),
          })
          return `# Project Created\n\n${formatProject(project)}`
        }
        case "update": {
          await client.post("project.update", {
            projectId: args.projectId!,
            ...(args.name && { name: args.name }),
            ...(args.description !== undefined && { description: args.description }),
          })
          return `Project ${args.projectId} updated.`
        }
        case "remove": {
          await client.post("project.remove", { projectId: args.projectId! })
          return `Project ${args.projectId} removed.`
        }
        case "duplicate": {
          await client.post("project.duplicate", {
            sourceEnvironmentId: args.sourceEnvironmentId!,
            name: args.name!,
            ...(args.description && { description: args.description }),
            ...(args.includeServices !== undefined && { includeServices: args.includeServices }),
            ...(args.duplicateInSameProject !== undefined && { duplicateInSameProject: args.duplicateInSameProject }),
          })
          return `Environment duplicated as "${args.name}".`
        }
      }
    },
  })
}
