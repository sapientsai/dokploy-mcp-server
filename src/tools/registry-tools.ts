import type { IO } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { DokployRegistry } from "../types"
import { formatRegistry, formatRegistryList } from "../utils/formatters"
import { pickDefined } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = ["list", "get", "create", "update", "remove", "test", "testById"] as const

const CREATE_FIELDS = [
  "registryName",
  "username",
  "password",
  "registryUrl",
  "registryType",
  "imagePrefix",
  "serverId",
] as const

const UPDATE_FIELDS = [
  "registryName",
  "username",
  "password",
  "registryUrl",
  "registryType",
  "imagePrefix",
  "serverId",
] as const

type RegistryArgs = {
  action: (typeof ACTIONS)[number]
  registryId?: string
  registryName?: string
  username?: string
  password?: string
  registryUrl?: string
  registryType?: "cloud"
  imagePrefix?: string | null
  serverId?: string
}

export function buildRegistryProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: RegistryArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("list", () => client.get<DokployRegistry[]>("registry.all").map(formatRegistryList))
    .case("get", () =>
      client
        .get<DokployRegistry>("registry.one", { registryId: args.registryId! })
        .map((reg) => `# Registry Details\n\n${formatRegistry(reg)}`),
    )
    .case("create", () =>
      client
        .post<DokployRegistry>("registry.create", {
          registryType: args.registryType ?? "cloud",
          imagePrefix: args.imagePrefix ?? null,
          ...pickDefined(args, CREATE_FIELDS),
        })
        .map((reg) => `# Registry Created\n\n${formatRegistry(reg)}`),
    )
    .case("update", () => {
      const body = { registryId: args.registryId!, ...pickDefined(args, UPDATE_FIELDS) }
      return client.post<unknown>("registry.update", body).map(() => `Registry ${args.registryId} updated.`)
    })
    .case("remove", () =>
      client
        .post<unknown>("registry.remove", { registryId: args.registryId! })
        .map(() => `Registry ${args.registryId} removed.`),
    )
    .case("test", () =>
      client
        .post<unknown>("registry.testRegistry", {
          registryType: args.registryType ?? "cloud",
          ...pickDefined(args, CREATE_FIELDS),
        })
        .map(() => `Registry connection test succeeded for ${args.registryUrl}.`),
    )
    .case("testById", () =>
      client
        .post<unknown>("registry.testRegistryById", {
          registryId: args.registryId!,
          ...(args.serverId && { serverId: args.serverId }),
        })
        .map(() => `Registry ${args.registryId} connection test succeeded.`),
    )
    .exhaustive()
}

export function registerRegistryTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_registry",
    description:
      "Manage container registries for pulling private images. list. get: registryId. create: registryName+username+password+registryUrl (registryType defaults to 'cloud'). update: registryId+fields. remove: registryId. test: registryName+username+password+registryUrl (without persisting). testById: registryId, serverId?.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      registryId: z.string().optional(),
      registryName: z.string().min(1).optional(),
      username: z.string().min(1).optional(),
      password: z.string().min(1).optional(),
      registryUrl: z.string().optional().describe("Registry URL, e.g. ghcr.io or registry.hub.docker.com"),
      registryType: z.enum(["cloud"]).optional(),
      imagePrefix: z.string().nullable().optional().describe("Optional image prefix prepended to pull paths"),
      serverId: z.string().optional(),
    }),
    execute: async (args) => {
      const either = await buildRegistryProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
