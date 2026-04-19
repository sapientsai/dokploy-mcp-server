import type { IO } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { ToolServer } from "./types"

const ACTIONS = ["health", "version", "ip", "clean", "reload"] as const

type SettingsArgs = {
  action: (typeof ACTIONS)[number]
  cleanType?: "all" | "images"
  reloadTarget?: "server" | "traefik"
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
      const endpoint = type === "all" ? "settings.cleanAll" : "settings.cleanUnusedImages"
      const body: Record<string, unknown> = args.serverId ? { serverId: args.serverId } : {}
      return client.post<unknown>(endpoint, body).map(() => `Cleanup (${type}) completed.`)
    })
    .case("reload", () => {
      const target = args.reloadTarget ?? "server"
      const io =
        target === "server"
          ? client.post<unknown>("settings.reloadServer")
          : client.post<unknown>("settings.reloadTraefik", args.serverId ? { serverId: args.serverId } : {})
      return io.map(() => `${target} reloaded.`)
    })
    .exhaustive() as IO<never, ApiError, string>
}

export function registerSettingsTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_settings",
    description:
      "System settings. health: check status. version: get version. ip: get IP. clean: cleanType (all|images), serverId?. reload: reloadTarget (server|traefik), serverId?.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      cleanType: z.enum(["all", "images"]).optional(),
      reloadTarget: z.enum(["server", "traefik"]).optional(),
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
