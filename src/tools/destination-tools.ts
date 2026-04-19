import type { IO } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { DokployDestination } from "../types"
import { formatDestination, formatDestinationList } from "../utils/formatters"
import { pickDefined } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = ["list", "get", "create", "update", "remove", "test"] as const

const PERSIST_FIELDS = [
  "name",
  "provider",
  "accessKey",
  "bucket",
  "region",
  "endpoint",
  "secretAccessKey",
  "additionalFlags",
  "serverId",
] as const

type DestinationArgs = {
  action: (typeof ACTIONS)[number]
  destinationId?: string
  name?: string
  provider?: string | null
  accessKey?: string
  bucket?: string
  region?: string
  endpoint?: string
  secretAccessKey?: string
  additionalFlags?: string[] | null
  serverId?: string
}

function persistBody(args: DestinationArgs): Record<string, unknown> {
  return {
    provider: args.provider ?? null,
    additionalFlags: args.additionalFlags ?? [],
    ...pickDefined(args, PERSIST_FIELDS),
  }
}

export function buildDestinationProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: DestinationArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("list", () => client.get<DokployDestination[]>("destination.all").map(formatDestinationList))
    .case("get", () =>
      client
        .get<DokployDestination>("destination.one", { destinationId: args.destinationId! })
        .map((dest) => `# Destination Details\n\n${formatDestination(dest)}`),
    )
    .case("create", () =>
      client
        .post<DokployDestination>("destination.create", persistBody(args))
        .map((dest) => `# Destination Created\n\n${formatDestination(dest)}`),
    )
    .case("update", () => {
      const body = { destinationId: args.destinationId!, ...persistBody(args) }
      return client.post<unknown>("destination.update", body).map(() => `Destination ${args.destinationId} updated.`)
    })
    .case("remove", () =>
      client
        .post<unknown>("destination.remove", { destinationId: args.destinationId! })
        .map(() => `Destination ${args.destinationId} removed.`),
    )
    .case("test", () =>
      client
        .post<unknown>("destination.testConnection", persistBody(args))
        .map(() => `Destination connection test succeeded for ${args.bucket}.`),
    )
    .exhaustive()
}

export function registerDestinationTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_destination",
    description:
      "Manage S3-compatible backup destinations. list. get: destinationId. create: name+accessKey+bucket+region+endpoint+secretAccessKey, provider?, additionalFlags? (rclone flags). update: destinationId+fields. remove: destinationId. test: same fields as create (without persisting).",
    parameters: z.object({
      action: z.enum(ACTIONS),
      destinationId: z.string().optional(),
      name: z.string().min(1).optional(),
      provider: z.string().nullable().optional().describe("Provider hint for rclone (e.g. AWS, Cloudflare, MinIO)"),
      accessKey: z.string().optional(),
      bucket: z.string().optional(),
      region: z.string().optional(),
      endpoint: z.string().optional().describe("S3 endpoint URL"),
      secretAccessKey: z.string().optional(),
      additionalFlags: z
        .array(z.string().regex(/^--[a-zA-Z0-9-]+(=[a-zA-Z0-9._:/@-]+)?$/))
        .nullable()
        .optional()
        .describe("Extra rclone flags, e.g. ['--s3-no-check-bucket']"),
      serverId: z.string().optional(),
    }),
    execute: async (args) => {
      const either = await buildDestinationProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
