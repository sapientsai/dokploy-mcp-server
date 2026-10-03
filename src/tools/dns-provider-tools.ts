import type { Option } from "functype"
import { IO, Match, None, Some } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError, ValidationError } from "../client/errors"
import { jsonSection } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = [
  "list",
  "get",
  "create",
  "update",
  "remove",
  "testConnection",
  "listZones",
  "listRecords",
  "createRecord",
  "updateRecord",
  "deleteRecord",
] as const

const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "PTR"] as const

const OVH_ENDPOINTS = [
  "ovh-eu",
  "ovh-ca",
  "ovh-us",
  "kimsufi-eu",
  "kimsufi-ca",
  "soyoustart-eu",
  "soyoustart-ca",
] as const

/**
 * Provider credentials, discriminated on providerType. Modelled as a union
 * rather than flat args so the API's per-provider required fields are enforced
 * before anything is sent — a malformed config still puts live credentials on
 * the wire, it just fails afterwards.
 */
const CONFIG_SCHEMA = z.discriminatedUnion("providerType", [
  z.object({
    providerType: z.literal("cloudflare"),
    apiToken: z.string().min(1),
  }),
  z.object({
    providerType: z.literal("route53"),
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
  }),
  z.object({
    providerType: z.literal("porkbun"),
    apiKey: z.string().min(1),
    secretApiKey: z.string().min(1),
  }),
  z.object({
    providerType: z.literal("infomaniak"),
    apiToken: z.string().min(1),
  }),
  z.object({
    providerType: z.literal("ovh"),
    endpoint: z.enum(OVH_ENDPOINTS).optional().describe("defaults to ovh-eu"),
    applicationKey: z.string().min(1),
    applicationSecret: z.string().min(1),
    consumerKey: z.string().min(1),
  }),
])

type DnsConfig = z.infer<typeof CONFIG_SCHEMA>

type DnsArgs = {
  action: (typeof ACTIONS)[number]
  dnsProviderId?: string
  name?: string
  config?: DnsConfig
  zoneId?: string
  recordId?: string
  type?: (typeof RECORD_TYPES)[number]
  recordName?: string
  content?: string
  ttl?: number
  proxied?: boolean
}

function missing(args: DnsArgs, keys: readonly (keyof DnsArgs)[]): Option<ApiError> {
  const absent = keys.filter((k) => args[k] === undefined || args[k] === "")
  if (absent.length > 0) return Some(ValidationError(`${args.action} requires ${absent.join(", ")}`))
  return None()
}

/**
 * Provider responses may echo the stored config, credentials included. These
 * summaries name the provider and never render the response body — the same
 * rule formatEnvMutation follows for env values.
 */
function summarizeProvider(provider: unknown): string {
  if (provider == null || typeof provider !== "object") return "(provider not found)"
  const p = provider as Record<string, unknown>
  const id = typeof p.dnsProviderId === "string" ? p.dnsProviderId : "?"
  const name = typeof p.name === "string" ? p.name : "?"
  const cfg = typeof p.config === "object" && p.config !== null ? (p.config as Record<string, unknown>) : {}
  const kind = typeof cfg.providerType === "string" ? cfg.providerType : "unknown"
  return `- ${name} (${id}) — ${kind}`
}

function summarizeProviderList(providers: unknown): string {
  if (!Array.isArray(providers) || providers.length === 0) return "No DNS providers configured."
  return `# DNS Providers (${providers.length})\n\n${providers.map(summarizeProvider).join("\n")}\n\nCredentials not echoed.`
}

function recordBody(args: DnsArgs): Record<string, unknown> {
  const body: Record<string, unknown> = {
    type: args.type!,
    name: args.recordName!,
    content: args.content!,
    dnsProviderId: args.dnsProviderId!,
    zoneId: args.zoneId!,
  }
  if (args.ttl !== undefined) body.ttl = args.ttl
  if (args.proxied !== undefined) body.proxied = args.proxied
  return body
}

export function buildDnsProviderProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: DnsArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("list", () => client.get<unknown>("dnsProvider.all").map(summarizeProviderList))
    .case("get", () => {
      const invalid = missing(args, ["dnsProviderId"])
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .get<unknown>("dnsProvider.one", { dnsProviderId: args.dnsProviderId! })
        .map((provider) => `# DNS Provider\n\n${summarizeProvider(provider)}\n\nCredentials not echoed.`)
    })
    .case("create", () => {
      const invalid = missing(args, ["name", "config"])
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .post<unknown>("dnsProvider.create", { name: args.name!, config: args.config! })
        .map(() => `DNS provider ${args.name} created (${args.config!.providerType}). Credentials not echoed.`)
    })
    .case("update", () => {
      // The API replaces the record wholesale: name and config are both required,
      // so a rename means re-sending the credentials.
      const invalid = missing(args, ["dnsProviderId", "name", "config"])
      if (invalid.isSome()) {
        return IO.fail<ApiError>(
          ValidationError(
            `update requires dnsProviderId, name and config — the API replaces the provider wholesale rather than patching it, so name and config must both be sent even when only one is changing. (${(invalid.value as { message?: string }).message ?? ""})`,
          ),
        )
      }
      return client
        .post<unknown>("dnsProvider.update", {
          dnsProviderId: args.dnsProviderId!,
          name: args.name!,
          config: args.config!,
        })
        .map(() => `DNS provider ${args.dnsProviderId} updated. Credentials not echoed.`)
    })
    .case("remove", () => {
      const invalid = missing(args, ["dnsProviderId"])
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .post<unknown>("dnsProvider.remove", { dnsProviderId: args.dnsProviderId! })
        .map(() => `DNS provider ${args.dnsProviderId} removed.`)
    })
    .case("testConnection", () => {
      if (!args.dnsProviderId && !args.config) {
        return IO.fail<ApiError>(ValidationError("testConnection requires dnsProviderId or config"))
      }
      const body: Record<string, unknown> = {}
      if (args.dnsProviderId) body.dnsProviderId = args.dnsProviderId
      if (args.config) body.config = args.config
      return client
        .post<unknown>("dnsProvider.testConnection", body)
        .map(() => "Connection test succeeded. Credentials not echoed.")
    })
    .case("listZones", () => {
      const invalid = missing(args, ["dnsProviderId"])
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .get<unknown>("dnsProvider.listZones", { dnsProviderId: args.dnsProviderId! })
        .map((zones) => jsonSection("DNS Zones", zones, "No zones found for this provider."))
    })
    .case("listRecords", () => {
      const invalid = missing(args, ["dnsProviderId", "zoneId"])
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .get<unknown>("dnsProvider.listRecords", { dnsProviderId: args.dnsProviderId!, zoneId: args.zoneId! })
        .map((records) => jsonSection(`DNS Records in zone ${args.zoneId}`, records, "No records found in this zone."))
    })
    .case("createRecord", () => {
      const invalid = missing(args, ["dnsProviderId", "zoneId", "type", "recordName", "content"])
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .post<unknown>("dnsProvider.createRecord", recordBody(args))
        .map(() => `Created ${args.type} record ${args.recordName} -> ${args.content} in zone ${args.zoneId}.`)
    })
    .case("updateRecord", () => {
      const invalid = missing(args, ["dnsProviderId", "zoneId", "recordId", "type", "recordName", "content"])
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .post<unknown>("dnsProvider.updateRecord", { ...recordBody(args), recordId: args.recordId! })
        .map(() => `Updated record ${args.recordId}: ${args.type} ${args.recordName} -> ${args.content}.`)
    })
    .case("deleteRecord", () => {
      const invalid = missing(args, ["dnsProviderId", "zoneId", "recordId"])
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .post<unknown>("dnsProvider.deleteRecord", {
          dnsProviderId: args.dnsProviderId!,
          zoneId: args.zoneId!,
          recordId: args.recordId!,
        })
        .map(() => `Deleted record ${args.recordId} from zone ${args.zoneId}.`)
    })
    .exhaustive()
}

export function registerDnsProviderTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_dns_provider",
    description:
      "DNS provider configuration and DNS record management. Providers: list, get (dnsProviderId), create (name+config), update (dnsProviderId+name+config — the API REPLACES the provider, so both must be sent even when changing one), remove (dnsProviderId), testConnection (dnsProviderId for a saved provider, or config to check credentials before saving). config is discriminated on providerType: cloudflare{apiToken}, route53{accessKeyId,secretAccessKey}, porkbun{apiKey,secretApiKey}, infomaniak{apiToken} or ovh{applicationKey,applicationSecret,consumerKey,endpoint?}. Records: listZones (dnsProviderId), listRecords (dnsProviderId+zoneId), createRecord/updateRecord (dnsProviderId+zoneId+type+recordName+content, ttl?, proxied?, plus recordId for update), deleteRecord (dnsProviderId+zoneId+recordId). Record type: A, AAAA, CNAME, MX, TXT, NS, SRV, CAA or PTR. proxied only takes effect on Cloudflare. Provider credentials are never echoed back in tool output; provider reads return id, name and providerType only.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      dnsProviderId: z.string().optional(),
      name: z.string().min(1).max(64).optional().describe("Provider name (letters, digits, _ and - only)"),
      config: CONFIG_SCHEMA.optional().describe("Provider credentials, keyed by providerType"),
      zoneId: z.string().optional(),
      recordId: z.string().optional(),
      type: z.enum(RECORD_TYPES).optional().describe("Record type"),
      recordName: z.string().optional().describe("DNS record name (sent as `name`; distinct from the provider name)"),
      content: z.string().optional().describe("Record value, e.g. an IP for A or a target host for CNAME"),
      ttl: z.number().int().positive().optional(),
      proxied: z.boolean().optional().describe("Cloudflare only: route the record through Cloudflare's proxy"),
    }),
    execute: async (args) => {
      const either = await buildDnsProviderProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
