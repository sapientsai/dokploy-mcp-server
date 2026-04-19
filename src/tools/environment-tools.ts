import type { IO as IOType } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { DokployEnvironment } from "../types"
import { formatEnvironment, formatEnvironmentList } from "../utils/formatters"
import type { ToolServer } from "./types"

const ACTIONS = ["create", "get", "list", "update", "remove", "duplicate"] as const

type EnvironmentArgs = {
  action: (typeof ACTIONS)[number]
  environmentId?: string
  projectId?: string
  name?: string
  description?: string
}

export function buildEnvironmentProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: EnvironmentArgs,
): IOType<never, ApiError, string> {
  return Match(args.action)
    .case("create", () =>
      client
        .post<DokployEnvironment>("environment.create", {
          name: args.name!,
          projectId: args.projectId!,
          ...(args.description && { description: args.description }),
        })
        .map((env) => `# Environment Created\n\n${formatEnvironment(env)}`),
    )
    .case("get", () =>
      client
        .get<DokployEnvironment>("environment.one", { environmentId: args.environmentId! })
        .map((env) => `# Environment Details\n\n${formatEnvironment(env)}`),
    )
    .case("list", () =>
      client
        .get<DokployEnvironment[]>("environment.byProjectId", { projectId: args.projectId! })
        .map(formatEnvironmentList),
    )
    .case("update", () => {
      const body: Record<string, unknown> = { environmentId: args.environmentId! }
      if (args.name) body.name = args.name
      if (args.description !== undefined) body.description = args.description
      return client.post<unknown>("environment.update", body).map(() => `Environment ${args.environmentId} updated.`)
    })
    .case("remove", () =>
      client
        .post<unknown>("environment.remove", { environmentId: args.environmentId! })
        .map(() => `Environment ${args.environmentId} removed.`),
    )
    .case("duplicate", () => {
      const body: Record<string, unknown> = {
        environmentId: args.environmentId!,
        name: args.name!,
      }
      if (args.description) body.description = args.description
      return client.post<unknown>("environment.duplicate", body).map(() => `Environment duplicated as "${args.name}".`)
    })
    .exhaustive()
}

export function registerEnvironmentTools(server: ToolServer) {
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
      const either = await buildEnvironmentProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
