import { IO, Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { DokployContainer } from "../types"
import { formatContainerList } from "../utils/formatters"
import type { ToolServer } from "./types"

const ACTIONS = [
  "getContainers",
  "restartContainer",
  "startContainer",
  "stopContainer",
  "killContainer",
  "removeContainer",
  "getConfig",
  "findContainers",
] as const

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

const SIMPLE_CONTAINER_ACTIONS = {
  restartContainer: { endpoint: "docker.restartContainer", verb: "restarted" },
  startContainer: { endpoint: "docker.startContainer", verb: "started" },
  stopContainer: { endpoint: "docker.stopContainer", verb: "stopped" },
  killContainer: { endpoint: "docker.killContainer", verb: "killed" },
  removeContainer: { endpoint: "docker.removeContainer", verb: "removed" },
} as const

function containerLifecycle(
  client: Pick<DokployClient, "get" | "post">,
  action: keyof typeof SIMPLE_CONTAINER_ACTIONS,
  args: DockerArgs,
): IO<never, ApiError, string> {
  const { endpoint, verb } = SIMPLE_CONTAINER_ACTIONS[action]
  const body: Record<string, unknown> = { containerId: args.containerId! }
  if (args.serverId) body.serverId = args.serverId
  return client.post<unknown>(endpoint, body).map(() => `Container ${args.containerId} ${verb}.`)
}

export function buildDockerProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: DockerArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("getContainers", () => {
      const params: Record<string, string> = {}
      if (args.serverId) params.serverId = args.serverId
      return client.get<DokployContainer[]>("docker.getContainers", params).map(formatContainerList)
    })
    .case("restartContainer", () => containerLifecycle(client, "restartContainer", args))
    .case("startContainer", () => containerLifecycle(client, "startContainer", args))
    .case("stopContainer", () => containerLifecycle(client, "stopContainer", args))
    .case("killContainer", () => containerLifecycle(client, "killContainer", args))
    .case("removeContainer", () => containerLifecycle(client, "removeContainer", args))
    .case("getConfig", () => {
      // docker.getConfig is a GET endpoint in the Dokploy API (openapi.json confirms this — it
      // takes containerId + optional serverId as query params). Earlier versions of this tool
      // POSTed here, which produced 404 "Not found" because no POST route exists at that path.
      const params: Record<string, string> = { containerId: args.containerId! }
      if (args.serverId) params.serverId = args.serverId
      const notFoundHint = `Failed to get config for container ${args.containerId}. Ensure the containerId is a valid Docker container ID (not a name). You can find container IDs using getContainers action.`
      return client
        .get<unknown>("docker.getConfig", params)
        .map((config) => {
          // Empirically, the API returns 200 with a null/undefined body when the container
          // doesn't exist on the server (rather than 404). Treat that as "not found".
          if (config == null) return notFoundHint
          return `# Container Config\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``
        })
        .catchTag("HttpError", (err) =>
          // 400 = malformed containerId (fails the API's `^[a-zA-Z0-9.\-_]+$` pattern).
          // 404 kept for robustness in case Dokploy starts returning it in future versions.
          err.status === 400 || err.status === 404 ? IO.succeed(notFoundHint) : IO.fail(err),
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
      return client.get<DokployContainer[]>(FIND_CONTAINER_ENDPOINTS[method], params).map(formatContainerList)
    })
    .exhaustive()
}

export function registerDockerTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_docker",
    description:
      "Docker container management. Actions: getContainers (list all containers, serverId?), restartContainer/startContainer/stopContainer/killContainer/removeContainer (containerId, serverId?), getConfig (containerId, serverId?), findContainers (appName+method: match|label|stack|service, serverId?).",
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
