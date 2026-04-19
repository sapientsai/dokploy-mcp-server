import type { IO } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { DokployDeployment } from "../types"
import { formatDeploymentList } from "../utils/formatters"
import type { ToolServer } from "./types"

const ACTIONS = ["list", "killProcess"] as const

type DeploymentArgs = {
  action: (typeof ACTIONS)[number]
  deploymentId?: string
  applicationId?: string
  composeId?: string
  serverId?: string
  type?: string
  id?: string
}

export function buildDeploymentProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: DeploymentArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("list", () => {
      if (args.applicationId) {
        return client
          .get<DokployDeployment[]>("deployment.all", { applicationId: args.applicationId })
          .map(formatDeploymentList)
      }
      if (args.composeId) {
        return client
          .get<DokployDeployment[]>("deployment.allByCompose", { composeId: args.composeId })
          .map(formatDeploymentList)
      }
      if (args.serverId) {
        return client
          .get<DokployDeployment[]>("deployment.allByServer", { serverId: args.serverId })
          .map(formatDeploymentList)
      }
      if (args.type && args.id) {
        return client
          .get<DokployDeployment[]>("deployment.allByType", { type: args.type, id: args.id })
          .map(formatDeploymentList)
      }
      // eslint-disable-next-line functype/prefer-either -- validation failure surfaced as plain Error for SomaMCP classification.
      throw new Error("Provide applicationId, composeId, serverId, or type+id")
    })
    .case("killProcess", () =>
      client
        .post<unknown>("deployment.killProcess", { deploymentId: args.deploymentId! })
        .map(() => `Deployment ${args.deploymentId} killed.`),
    )
    .exhaustive()
}

export function registerDeploymentTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_deployment",
    description:
      "Manage deployments. list: applicationId|composeId|serverId|type+id. killProcess: deploymentId. Note: Dokploy does not expose per-deployment log retrieval via API — use dokploy_application (readMonitoring) or the service-scoped *.readLogs endpoints for service logs.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      deploymentId: z.string().optional(),
      applicationId: z.string().optional(),
      composeId: z.string().optional(),
      serverId: z.string().optional(),
      type: z.string().optional().describe("Resource type (application, compose, postgres, mysql, etc.)"),
      id: z.string().optional().describe("Resource ID (used with type)"),
    }),
    execute: async (args) => {
      const either = await buildDeploymentProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
