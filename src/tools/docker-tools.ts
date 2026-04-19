import type { IO as IOType } from "functype"
import { IO, Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { DokployContainer } from "../types"
import { formatContainerList } from "../utils/formatters"
import type { ToolServer } from "./types"

const ACTIONS = ["getContainers", "restartContainer", "getConfig", "findContainers"] as const

type DockerArgs = {
  action: (typeof ACTIONS)[number]
  containerId?: string
  serverId?: string
  appName?: string
  method?: "match" | "label" | "stack" | "service"
  appType?: string
  type?: string
}

const FIND_CONTAINER_ENDPOINTS: Record<NonNullable<DockerArgs["method"]>, string> = {
  match: "docker.getContainersByAppNameMatch",
  label: "docker.getContainersByAppLabel",
  stack: "docker.getStackContainersByAppName",
  service: "docker.getServiceContainersByAppName",
}

export function buildDockerProgram(
  client: Pick<DokployClient, "getIO" | "postIO">,
  args: DockerArgs,
): IOType<never, ApiError, string> {
  return Match(args.action)
    .case("getContainers", () => {
      const params: Record<string, string> = {}
      if (args.serverId) params.serverId = args.serverId
      return client.getIO<DokployContainer[]>("docker.getContainers", params).map(formatContainerList)
    })
    .case("restartContainer", () =>
      client
        .postIO<unknown>("docker.restartContainer", { containerId: args.containerId! })
        .map(() => `Container ${args.containerId} restarted.`),
    )
    .case("getConfig", () => {
      const body: Record<string, unknown> = { containerId: args.containerId! }
      if (args.serverId) body.serverId = args.serverId
      return client
        .postIO<unknown>("docker.getConfig", body)
        .map((config) => `# Container Config\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``)
        .recoverWith(
          (err): IOType<never, ApiError, string> =>
            err._tag === "HttpError" && err.status === 400
              ? IO.succeed(
                  `Failed to get config for container ${args.containerId}. Ensure the containerId is a valid Docker container ID (not a name). You can find container IDs using getContainers action.`,
                )
              : IO.fail(err),
        )
    })
    .case("findContainers", () => {
      if (!args.method) {
        // eslint-disable-next-line functype/prefer-either -- validation failure surfaced as plain Error for SomaMCP classification.
        throw new Error("findContainers requires method (match|label|stack|service)")
      }
      const { method } = args
      const params: Record<string, string> = { appName: args.appName! }
      if (args.serverId) params.serverId = args.serverId
      if (args.appType && method === "match") params.appType = args.appType
      if (args.type && method === "label") params.type = args.type
      return client.getIO<DokployContainer[]>(FIND_CONTAINER_ENDPOINTS[method], params).map(formatContainerList)
    })
    .exhaustive() as IOType<never, ApiError, string>
}

export function registerDockerTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_docker",
    description:
      "Docker container management. Actions: getContainers (list all containers, serverId?), restartContainer (containerId), getConfig (containerId, serverId?), findContainers (appName+method: match|label|stack|service, serverId?).",
    parameters: z.object({
      action: z.enum(ACTIONS),
      containerId: z.string().optional(),
      serverId: z.string().optional(),
      appName: z.string().optional(),
      method: z.enum(["match", "label", "stack", "service"]).optional(),
      appType: z.string().optional().describe("App type filter (match method only)"),
      type: z.string().optional().describe("Label type (label method only)"),
    }),
    execute: async (args) => {
      const either = await buildDockerProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
