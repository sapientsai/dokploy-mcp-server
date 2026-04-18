import type { IO as IOType } from "functype"
import { IO, Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { DokployDeployment } from "../types"
import { formatDeploymentList } from "../utils/formatters"
import type { ToolServer } from "./types"

const ACTIONS = ["list", "getLog", "killProcess"] as const

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
  client: Pick<DokployClient, "getIO" | "postIO">,
  args: DeploymentArgs,
): IOType<never, ApiError, string> {
  return Match(args.action)
    .case("list", () => {
      if (args.applicationId) {
        return client
          .getIO<DokployDeployment[]>("deployment.all", { applicationId: args.applicationId })
          .map(formatDeploymentList)
      }
      if (args.composeId) {
        return client
          .getIO<DokployDeployment[]>("deployment.allByCompose", { composeId: args.composeId })
          .map(formatDeploymentList)
      }
      if (args.serverId) {
        return client
          .getIO<DokployDeployment[]>("deployment.allByServer", { serverId: args.serverId })
          .map(formatDeploymentList)
      }
      if (args.type && args.id) {
        return client
          .getIO<DokployDeployment[]>("deployment.allByType", { type: args.type, id: args.id })
          .map(formatDeploymentList)
      }
      // eslint-disable-next-line functype/prefer-either -- validation failure surfaced as plain Error for SomaMCP classification.
      throw new Error("Provide applicationId, composeId, serverId, or type+id")
    })
    .case("getLog", () =>
      client
        .getIO<unknown>("deployment.readLog", { deploymentId: args.deploymentId! })
        .map((log) => {
          const content =
            typeof log === "string"
              ? log
              : typeof log === "object" && log !== null && "data" in log && typeof log.data === "string"
                ? log.data
                : JSON.stringify(log, null, 2)
          return `# Deployment Log\n\n\`\`\`\n${content}\n\`\`\``
        })
        .recoverWith(
          (err): IOType<never, ApiError, string> =>
            err._tag === "HttpError" && err.status === 404
              ? (IO.succeed(
                  `No log available for deployment ${args.deploymentId}. The log may not exist yet or has been cleaned up.`,
                ) as unknown as IOType<never, ApiError, string>)
              : IO.fail(err),
        ),
    )
    .case("killProcess", () =>
      client
        .postIO<unknown>("deployment.killProcess", { deploymentId: args.deploymentId! })
        .map(() => `Deployment ${args.deploymentId} killed.`),
    )
    .exhaustive() as IOType<never, ApiError, string>
}

export function registerDeploymentTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_deployment",
    description:
      "Manage deployments. list: applicationId|composeId|serverId|type+id. getLog: deploymentId (read deployment log content). killProcess: deploymentId.",
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
