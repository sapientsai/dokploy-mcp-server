import type { IO as IOType } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { RequestBody } from "../generated"
import type { DokployDomain } from "../types"
import { formatDomain, formatDomainList } from "../utils/formatters"
import { pickDefined } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = ["create", "list", "get", "update", "delete", "generate", "canGenerateTraefikMe", "validate"] as const

const DOMAIN_OPTIONAL_FIELDS = [
  "applicationId",
  "composeId",
  "serviceName",
  "path",
  "port",
  "https",
  "certificateType",
  "domainType",
] as const

type DomainArgs = {
  action: (typeof ACTIONS)[number]
  domainId?: string
  host?: string
  applicationId?: string
  composeId?: string
  serviceName?: string
  path?: string
  port?: number
  https?: boolean
  certificateType?: string
  domainType?: string
  appName?: string
  serverId?: string
  domain?: string
  serverIp?: string
}

export function buildDomainProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: DomainArgs,
): IOType<never, ApiError, string> {
  return Match(args.action)
    .case("create", () =>
      client
        .post<DokployDomain>("domain.create", {
          host: args.host!,
          ...pickDefined(args, DOMAIN_OPTIONAL_FIELDS),
        })
        .map((domain) => `# Domain Created\n\n${formatDomain(domain)}`),
    )
    .case("list", () => {
      if (!args.applicationId && !args.composeId) {
        // eslint-disable-next-line functype/prefer-either -- validation failure surfaced as plain Error for SomaMCP classification.
        throw new Error("Provide applicationId or composeId")
      }
      const io = args.applicationId
        ? client.get<DokployDomain[]>("domain.byApplicationId", { applicationId: args.applicationId })
        : client.get<DokployDomain[]>("domain.byComposeId", { composeId: args.composeId! })
      return io.map(formatDomainList)
    })
    .case("get", () =>
      client
        .get<DokployDomain>("domain.one", { domainId: args.domainId! })
        .map((domain) => `# Domain Details\n\n${formatDomain(domain)}`),
    )
    .case("update", () =>
      client
        .post<unknown>("domain.update", {
          domainId: args.domainId!,
          host: args.host!,
          ...pickDefined(args, DOMAIN_OPTIONAL_FIELDS),
        })
        .map(() => `Domain ${args.domainId} updated.`),
    )
    .case("delete", () =>
      client
        .post<unknown>("domain.delete", { domainId: args.domainId! } satisfies RequestBody<"domain-delete">)
        .map(() => `Domain ${args.domainId} deleted.`),
    )
    .case("generate", () =>
      client
        .post<unknown>("domain.generateDomain", {
          appName: args.appName!,
          ...(args.serverId && { serverId: args.serverId }),
        })
        .map((result) => `# Generated Domain\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``),
    )
    .case("canGenerateTraefikMe", () =>
      client
        .get<boolean>("domain.canGenerateTraefikMeDomains", {
          ...(args.serverId && { serverId: args.serverId }),
        })
        .map((available) => `Traefik.me: ${available ? "Available" : "Not available"}`),
    )
    .case("validate", () =>
      client
        .post<unknown>("domain.validateDomain", {
          domain: args.domain!,
          ...(args.serverIp && { serverIp: args.serverIp }),
        })
        .map((result) => `# DNS Validation: ${args.domain}\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``),
    )
    .exhaustive()
}

export function registerDomainTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_domain",
    description:
      "Manage domains. create: host+applicationId|composeId(+serviceName for compose). list: applicationId|composeId. get: domainId. update: domainId+host (include composeId+serviceName for compose domains). delete: domainId. generate: appName. canGenerateTraefikMe: serverId?. validate: domain.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      domainId: z.string().optional(),
      host: z.string().optional(),
      applicationId: z.string().optional(),
      composeId: z.string().optional(),
      serviceName: z.string().optional(),
      path: z.string().optional(),
      port: z.number().optional(),
      https: z.boolean().optional(),
      certificateType: z.string().optional(),
      domainType: z.string().optional(),
      appName: z.string().optional(),
      serverId: z.string().optional(),
      domain: z.string().optional(),
      serverIp: z.string().optional(),
    }),
    execute: async (args) => {
      const either = await buildDomainProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
