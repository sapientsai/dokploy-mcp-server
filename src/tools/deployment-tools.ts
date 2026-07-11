import { IO, Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError, ValidationError } from "../client/errors"
import type { DokployDeployment } from "../types"
import { formatDeploymentList } from "../utils/formatters"
import type { ToolServer } from "./types"

const ACTIONS = ["list", "queueList", "killProcess", "readLogs", "remove"] as const

const DEPLOYMENT_TYPES = [
  "application",
  "compose",
  "server",
  "schedule",
  "previewDeployment",
  "backup",
  "volumeBackup",
] as const

type DeploymentArgs = {
  action: (typeof ACTIONS)[number]
  deploymentId?: string
  applicationId?: string
  composeId?: string
  serverId?: string
  type?: (typeof DEPLOYMENT_TYPES)[number]
  id?: string
  tail?: number
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
      return IO.fail<ApiError>(ValidationError("Provide applicationId, composeId, serverId, or type+id"))
    })
    .case("queueList", () =>
      client
        .get<DokployDeployment[]>("deployment.queueList")
        .map((queued) =>
          queued.length === 0
            ? "Deployment queue is empty."
            : formatDeploymentList(queued).replace("# Deployments", "# Deployment Queue"),
        ),
    )
    .case("killProcess", () =>
      client
        .post<unknown>("deployment.killProcess", { deploymentId: args.deploymentId! })
        .map(() => `Deployment ${args.deploymentId} killed.`),
    )
    .case("readLogs", () => {
      const params: Record<string, string | number> = { deploymentId: args.deploymentId! }
      if (args.tail !== undefined) params.tail = args.tail
      return client.get<string>("deployment.readLogs", params).map((logs) => logs || "(no log output)")
    })
    .case("remove", () =>
      client
        .post<unknown>("deployment.removeDeployment", { deploymentId: args.deploymentId! })
        .map(() => `Deployment ${args.deploymentId} removed.`),
    )
    .exhaustive()
}

export function registerDeploymentTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_deployment",
    description:
      "Manage deployments. list: applicationId|composeId|serverId|type+id. queueList: no params (currently-queued deployments). killProcess: deploymentId (kill an in-flight build). readLogs: deploymentId, tail?. remove: deploymentId (drops the record). Database deployments are listed via the resource itself, not here.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      deploymentId: z.string().optional(),
      applicationId: z.string().optional(),
      composeId: z.string().optional(),
      serverId: z.string().optional(),
      type: z
        .enum(DEPLOYMENT_TYPES)
        .optional()
        .describe(
          "Resource type. The Dokploy API accepts only: application | compose | server | schedule | previewDeployment | backup | volumeBackup. Database deployments are listed via the resource itself, not here.",
        ),
      id: z.string().optional().describe("Resource ID (used with type)"),
      tail: z.number().int().min(1).max(10000).optional().describe("readLogs: tail N lines (default 100)"),
    }),
    execute: async (args) => {
      const either = await buildDeploymentProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
