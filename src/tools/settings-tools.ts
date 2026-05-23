import type { IO } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { ToolServer } from "./types"

const ACTIONS = ["health", "version", "ip", "clean", "reload"] as const

const CLEAN_TYPES = [
  "all",
  "images",
  "volumes",
  "stoppedContainers",
  "dockerBuilder",
  "dockerPrune",
  "monitoring",
  "redis",
  "deploymentQueue",
  "sshPrivateKey",
] as const

const RELOAD_TARGETS = ["server", "traefik", "redis"] as const

// Map MCP-friendly cleanType to the actual Dokploy endpoint.
// The dropped/null entries are server-scoped; `null` means no serverId in body.
const CLEAN_ENDPOINTS: Record<(typeof CLEAN_TYPES)[number], { endpoint: string; serverScoped: boolean }> = {
  all: { endpoint: "settings.cleanAll", serverScoped: true },
  images: { endpoint: "settings.cleanUnusedImages", serverScoped: true },
  volumes: { endpoint: "settings.cleanUnusedVolumes", serverScoped: true },
  stoppedContainers: { endpoint: "settings.cleanStoppedContainers", serverScoped: true },
  dockerBuilder: { endpoint: "settings.cleanDockerBuilder", serverScoped: true },
  dockerPrune: { endpoint: "settings.cleanDockerPrune", serverScoped: true },
  monitoring: { endpoint: "settings.cleanMonitoring", serverScoped: false },
  redis: { endpoint: "settings.cleanRedis", serverScoped: false },
  deploymentQueue: { endpoint: "settings.cleanAllDeploymentQueue", serverScoped: false },
  sshPrivateKey: { endpoint: "settings.cleanSSHPrivateKey", serverScoped: false },
}

const RELOAD_ENDPOINTS: Record<(typeof RELOAD_TARGETS)[number], { endpoint: string; serverScoped: boolean }> = {
  server: { endpoint: "settings.reloadServer", serverScoped: false },
  traefik: { endpoint: "settings.reloadTraefik", serverScoped: true },
  redis: { endpoint: "settings.reloadRedis", serverScoped: false },
}

type SettingsArgs = {
  action: (typeof ACTIONS)[number]
  cleanType?: (typeof CLEAN_TYPES)[number]
  reloadTarget?: (typeof RELOAD_TARGETS)[number]
  serverId?: string
}

export function buildSettingsProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: SettingsArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("health", () =>
      client
        .get<unknown>("settings.health")
        .map((health) => `# Health\n\n\`\`\`json\n${JSON.stringify(health, null, 2)}\n\`\`\``),
    )
    .case("version", () => client.get<string>("settings.getDokployVersion").map((v) => `Dokploy version: ${v}`))
    .case("ip", () => client.get<string>("settings.getIp").map((ip) => `Server IP: ${ip}`))
    .case("clean", () => {
      const type = args.cleanType ?? "all"
      const { endpoint, serverScoped } = CLEAN_ENDPOINTS[type]
      const io = serverScoped
        ? client.post<unknown>(endpoint, args.serverId ? { serverId: args.serverId } : {})
        : client.post<unknown>(endpoint)
      return io.map(() => `Cleanup (${type}) completed.`)
    })
    .case("reload", () => {
      const target = args.reloadTarget ?? "server"
      const { endpoint, serverScoped } = RELOAD_ENDPOINTS[target]
      const io = serverScoped
        ? client.post<unknown>(endpoint, args.serverId ? { serverId: args.serverId } : {})
        : client.post<unknown>(endpoint)
      return io.map(() => `${target} reloaded.`)
    })
    .exhaustive()
}

export function registerSettingsTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_settings",
    description:
      "System settings. health: check status. version: get version. ip: get IP. clean: cleanType (all|images|volumes|stoppedContainers|dockerBuilder|dockerPrune|monitoring|redis|deploymentQueue|sshPrivateKey), serverId? (only honored for docker-related clean types). reload: reloadTarget (server|traefik|redis), serverId? (traefik only).",
    parameters: z.object({
      action: z.enum(ACTIONS),
      cleanType: z.enum(CLEAN_TYPES).optional(),
      reloadTarget: z.enum(RELOAD_TARGETS).optional(),
      serverId: z.string().optional(),
    }),
    execute: async (args) => {
      const either = await buildSettingsProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // IO→SomaMCP boundary: SomaMCP's telemetry pipeline classifies thrown Errors into
      // structured LLM responses. This is the agreed conversion point.
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
