import type { IO as IOType } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { RequestBody } from "../generated"
import type { DokployProject } from "../types"
import { formatProject, formatProjectList } from "../utils/formatters"
import type { ToolServer } from "./types"

const ACTIONS = ["list", "get", "create", "update", "remove", "duplicate"] as const

type ProjectArgs = {
  action: (typeof ACTIONS)[number]
  projectId?: string
  name?: string
  description?: string
  sourceEnvironmentId?: string
  duplicateInSameProject?: boolean
}

export function buildProjectProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: ProjectArgs,
): IOType<never, ApiError, string> {
  return Match(args.action)
    .case("list", () => client.get<DokployProject[]>("project.all").map(formatProjectList))
    .case("get", () =>
      client
        .get<DokployProject>("project.one", { projectId: args.projectId! })
        .map((project) => `# Project Details\n\n${formatProject(project)}`),
    )
    .case("create", () =>
      client
        .post<DokployProject>("project.create", {
          name: args.name!,
          ...(args.description && { description: args.description }),
        } satisfies RequestBody<"project-create">)
        .map((project) => `# Project Created\n\n${formatProject(project)}`),
    )
    .case("update", () => {
      const body: Record<string, unknown> = { projectId: args.projectId! }
      if (args.name) body.name = args.name
      if (args.description !== undefined) body.description = args.description
      return client.post<unknown>("project.update", body).map(() => `Project ${args.projectId} updated.`)
    })
    .case("remove", () =>
      client
        .post<unknown>("project.remove", { projectId: args.projectId! } satisfies RequestBody<"project-remove">)
        .map(() => `Project ${args.projectId} removed.`),
    )
    .case("duplicate", () => {
      const body: Record<string, unknown> = {
        sourceEnvironmentId: args.sourceEnvironmentId!,
        name: args.name!,
      }
      if (args.description) body.description = args.description
      if (args.duplicateInSameProject !== undefined) body.duplicateInSameProject = args.duplicateInSameProject
      return client.post<unknown>("project.duplicate", body).map(() => `Environment duplicated as "${args.name}".`)
    })
    .exhaustive()
}

export function registerProjectTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_project",
    description:
      "Manage projects. list: all (includes nested environments with applications, composes, databases). get: projectId (same nested detail). create: name. update: projectId+fields. remove: projectId. duplicate: sourceEnvironmentId+name.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      projectId: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      sourceEnvironmentId: z.string().optional(),
      duplicateInSameProject: z.boolean().optional(),
    }),
    execute: async (args) => {
      const either = await buildProjectProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
