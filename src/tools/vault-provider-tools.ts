import type { Option } from "functype"
import { IO, Match, None, Some } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError, ValidationError } from "../client/errors"
import type { ToolServer } from "./types"

const ACTIONS = ["list", "get", "create", "update", "remove", "testConnection", "listSecretNames"] as const

/**
 * Vault credentials, discriminated on providerType.
 *
 * A discriminated union rather than flat args: several providers reuse field
 * names with different meanings (infisical and scaleway both have `projectId`,
 * which is NOT the Dokploy projectId used in `assignments`, and doppler has a
 * field literally called `config`). Flattening would collide, and a config the
 * API rejects has still put live credentials on the wire by the time it fails.
 */
const CONFIG_SCHEMA = z.discriminatedUnion("providerType", [
  z.object({
    providerType: z.literal("hashicorp"),
    url: z.string().url(),
    token: z.string().min(1),
    namespace: z.string().optional(),
    mount: z.string().min(1).optional().describe("defaults to 'secret'"),
  }),
  z.object({
    providerType: z.literal("infisical"),
    siteUrl: z.string().url().optional().describe("defaults to https://app.infisical.com"),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    projectId: z.string().min(1).describe("the Infisical project, not a Dokploy projectId"),
    environmentSlug: z.string().min(1),
    secretPath: z.string().optional().describe("defaults to '/'"),
  }),
  z.object({
    providerType: z.literal("aws"),
    region: z.string().min(1),
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    endpoint: z.string().url().optional(),
  }),
  z.object({
    providerType: z.literal("aws-parameter-store"),
    region: z.string().min(1),
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    endpoint: z.string().url().optional(),
    parameterPath: z
      .string()
      .refine((path) => path === "" || path.startsWith("/"), "parameterPath must start with /")
      .optional()
      .describe("parameter discovery path, e.g. '/myapp/prod'"),
  }),
  z.object({
    providerType: z.literal("doppler"),
    serviceToken: z.string().min(1),
    project: z.string().optional(),
    config: z.string().optional().describe("Doppler config name, e.g. 'prod'"),
  }),
  z.object({
    providerType: z.literal("azure"),
    vaultUri: z.string().url(),
    tenantId: z.string().min(1),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
  }),
  z.object({
    providerType: z.literal("scaleway"),
    region: z.string().optional().describe("defaults to 'fr-par'"),
    projectId: z.string().min(1).describe("the Scaleway project, not a Dokploy projectId"),
    secretKey: z.string().min(1),
    apiUrl: z.string().url().optional().describe("defaults to https://api.scaleway.com"),
  }),
  z.object({
    providerType: z.literal("phase"),
    token: z.string().min(1),
    appId: z.string().min(1).describe("the Phase app ID"),
    env: z.string().min(1).describe("Phase environment name, e.g. 'production'"),
    path: z.string().optional().describe("defaults to '/'"),
    apiUrl: z.string().url().optional().describe("defaults to https://api.phase.dev"),
  }),
])

const ASSIGNMENTS_SCHEMA = z.array(
  z.object({
    projectId: z.string().min(1).describe("Dokploy project ID"),
    environmentIds: z.array(z.string().min(1)).optional(),
  }),
)

type VaultConfig = z.infer<typeof CONFIG_SCHEMA>
type Assignments = z.infer<typeof ASSIGNMENTS_SCHEMA>

type VaultArgs = {
  action: (typeof ACTIONS)[number]
  vaultProviderId?: string
  name?: string
  config?: VaultConfig
  assignments?: Assignments
  projectId?: string
  environmentId?: string
}

function missing(args: VaultArgs, keys: readonly (keyof VaultArgs)[]): Option<ApiError> {
  const absent = keys.filter((k) => args[k] === undefined || args[k] === "")
  if (absent.length > 0) return Some(ValidationError(`${args.action} requires ${absent.join(", ")}`))
  return None()
}

/**
 * Vault provider responses may echo the stored config — tokens, client secrets,
 * access keys. These summaries render id, name and providerType only, and the
 * response body is never dumped. Same rule formatEnvMutation follows for env
 * values: names travel, values do not.
 */
function summarizeProvider(provider: unknown): string {
  if (provider == null || typeof provider !== "object") return "(provider not found)"
  const p = provider as Record<string, unknown>
  const id = typeof p.vaultProviderId === "string" ? p.vaultProviderId : "?"
  const name = typeof p.name === "string" ? p.name : "?"
  const cfg = typeof p.config === "object" && p.config !== null ? (p.config as Record<string, unknown>) : {}
  const kind = typeof cfg.providerType === "string" ? cfg.providerType : "unknown"
  return `- ${name} (${id}) — ${kind}`
}

function summarizeProviderList(providers: unknown): string {
  if (!Array.isArray(providers) || providers.length === 0) return "No vault providers configured."
  return `# Vault Providers (${providers.length})\n\n${providers.map(summarizeProvider).join("\n")}\n\nCredentials not echoed.`
}

/** listSecretNames returns names only — Dokploy exposes no API to read a secret's value. */
function formatSecretNames(payload: unknown): string {
  const names = Array.isArray(payload)
    ? payload.map((n) =>
        typeof n === "string"
          ? n
          : typeof n === "object" && n !== null
            ? String((n as Record<string, unknown>).name ?? n)
            : String(n),
      )
    : []
  if (names.length === 0) return "No secret names returned for this project/environment."
  return `# Secret Names (${names.length})\n\n${names.join("\n")}\n\nNames only — Dokploy exposes no API to read secret values.`
}

export function buildVaultProviderProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: VaultArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("list", () => client.get<unknown>("vaultProvider.all").map(summarizeProviderList))
    .case("get", () => {
      const invalid = missing(args, ["vaultProviderId"])
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .get<unknown>("vaultProvider.one", { vaultProviderId: args.vaultProviderId! })
        .map((provider) => `# Vault Provider\n\n${summarizeProvider(provider)}\n\nCredentials not echoed.`)
    })
    .case("create", () => {
      const invalid = missing(args, ["name", "config", "assignments"])
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .post<unknown>("vaultProvider.create", {
          name: args.name!,
          config: args.config!,
          assignments: args.assignments!,
        })
        .map(
          () =>
            `Vault provider ${args.name} created (${args.config!.providerType}), assigned to ${args.assignments!.length} project${args.assignments!.length === 1 ? "" : "s"}. Credentials not echoed.`,
        )
    })
    .case("update", () => {
      const invalid = missing(args, ["vaultProviderId", "name", "config", "assignments"])
      if (invalid.isSome()) {
        return IO.fail<ApiError>(
          ValidationError(
            "update requires vaultProviderId, name, config and assignments — the API replaces the provider wholesale rather than patching it, so renaming or re-assigning means re-sending the credentials too. Read the current name and assignments with get first.",
          ),
        )
      }
      return client
        .post<unknown>("vaultProvider.update", {
          vaultProviderId: args.vaultProviderId!,
          name: args.name!,
          config: args.config!,
          assignments: args.assignments!,
        })
        .map(() => `Vault provider ${args.vaultProviderId} updated. Credentials not echoed.`)
    })
    .case("remove", () => {
      const invalid = missing(args, ["vaultProviderId"])
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .post<unknown>("vaultProvider.remove", { vaultProviderId: args.vaultProviderId! })
        .map(() => `Vault provider ${args.vaultProviderId} removed.`)
    })
    .case("testConnection", () => {
      if (!args.vaultProviderId && !args.config) {
        return IO.fail<ApiError>(ValidationError("testConnection requires vaultProviderId or config"))
      }
      const body: Record<string, unknown> = {}
      if (args.vaultProviderId) body.vaultProviderId = args.vaultProviderId
      if (args.config) body.config = args.config
      return client
        .post<unknown>("vaultProvider.testConnection", body)
        .map(() => "Connection test succeeded. Credentials not echoed.")
    })
    .case("listSecretNames", () => {
      const invalid = missing(args, ["vaultProviderId", "projectId"])
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      const params: Record<string, string> = {
        vaultProviderId: args.vaultProviderId!,
        projectId: args.projectId!,
      }
      if (args.environmentId) params.environmentId = args.environmentId
      return client.get<unknown>("vaultProvider.listSecretNames", params).map(formatSecretNames)
    })
    .exhaustive()
}

export function registerVaultProviderTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_vault_provider",
    description:
      "External secret-manager (vault) configuration. list, get (vaultProviderId), create (name+config+assignments), update (vaultProviderId+name+config+assignments — the API REPLACES the provider, so all four must be sent even when changing one; run get first), remove (vaultProviderId), testConnection (vaultProviderId for a saved provider, or config to check credentials before saving), listSecretNames (vaultProviderId+projectId, environmentId?). config is discriminated on providerType: hashicorp | infisical | aws | aws-parameter-store | doppler | azure | scaleway | phase. Note infisical.projectId and scaleway.projectId are that provider's own project, NOT the Dokploy projectId used in assignments. assignments is [{projectId, environmentIds?}] naming the Dokploy projects the vault serves. listSecretNames returns names only — Dokploy exposes no API to read a secret's value — and provider credentials are never echoed back in tool output.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      vaultProviderId: z.string().optional(),
      name: z.string().min(1).max(64).optional().describe("Provider name (letters, digits, _ and - only)"),
      config: CONFIG_SCHEMA.optional().describe("Vault credentials, keyed by providerType"),
      assignments: ASSIGNMENTS_SCHEMA.optional().describe("Dokploy projects/environments this vault serves"),
      projectId: z.string().optional().describe("listSecretNames: Dokploy project ID"),
      environmentId: z.string().optional().describe("listSecretNames: narrow to one environment"),
    }),
    execute: async (args) => {
      const either = await buildVaultProviderProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
