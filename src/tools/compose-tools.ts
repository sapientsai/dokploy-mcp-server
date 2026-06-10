import { IO, Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { RequestBody } from "../generated"
import type { DokployCompose } from "../types"
import { formatCompose } from "../utils/formatters"
import { formatEnvMutation, listEnvKeys, mergeEnv, pickDefined } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = [
  "create",
  "get",
  "update",
  "delete",
  "deploy",
  "start",
  "stop",
  "move",
  "loadServices",
  "loadMounts",
  "getDefaultCommand",
  "cancelDeployment",
  "cleanQueues",
  "killBuild",
  "refreshToken",
  "saveEnvironment",
  "setEnvVars",
  "getEnvKeys",
  "getEnvValuesUnsafe",
  "readLogs",
] as const

const UPDATE_FIELDS = [
  "name",
  "description",
  "composeFile",
  "env",
  "command",
  "sourceType",
  "customGitUrl",
  "customGitBranch",
  "customGitSSHKeyId",
  "repository",
  "branch",
  "owner",
  "composePath",
  "autoDeploy",
  "appName",
] as const

type ComposeArgs = {
  action: (typeof ACTIONS)[number]
  composeId?: string
  name?: string
  environmentId?: string
  description?: string
  composeType?: string
  composeFile?: string
  serverId?: string
  env?: string
  set?: string
  unset?: string[]
  command?: string
  sourceType?: "github" | "git" | "raw"
  customGitUrl?: string
  customGitBranch?: string
  customGitSSHKeyId?: string
  repository?: string
  branch?: string
  owner?: string
  composePath?: string
  autoDeploy?: boolean
  appName?: string
  deleteVolumes?: boolean
  redeploy?: boolean
  title?: string
  deployDescription?: string
  targetEnvironmentId?: string
  type?: string
  serviceName?: string
  containerId?: string
  tail?: number
  since?: string
  search?: string
}

export function buildComposeProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: ComposeArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("create", () =>
      client
        .post<DokployCompose>("compose.create", {
          name: args.name!,
          environmentId: args.environmentId!,
          ...(args.description && { description: args.description }),
          ...(args.composeType && { composeType: args.composeType }),
          ...(args.composeFile && { composeFile: args.composeFile }),
          ...(args.serverId && { serverId: args.serverId }),
        })
        .map((compose) => `# Compose Created\n\n${formatCompose(compose)}`),
    )
    .case("get", () =>
      client
        .get<DokployCompose>("compose.one", { composeId: args.composeId! })
        .map((compose) => `# Compose Details\n\n${formatCompose(compose)}`),
    )
    .case("update", () => {
      const body = { composeId: args.composeId!, ...pickDefined(args, UPDATE_FIELDS) }
      return client
        .post<unknown>("compose.update", body as RequestBody<"compose-update">)
        .map(() => `Compose ${args.composeId} updated.`)
    })
    .case("delete", () =>
      client
        .post<unknown>("compose.delete", {
          composeId: args.composeId!,
          deleteVolumes: args.deleteVolumes ?? false,
        } satisfies RequestBody<"compose-delete">)
        .map(() => `Compose ${args.composeId} deleted.`),
    )
    .case("deploy", () => {
      const endpoint = args.redeploy ? "compose.redeploy" : "compose.deploy"
      const body: Record<string, unknown> = { composeId: args.composeId! }
      if (args.title) body.title = args.title
      if (args.deployDescription) body.description = args.deployDescription
      const verb = args.redeploy ? "Redeployment" : "Deployment"
      return client
        .post<unknown>(endpoint, body)
        .map(
          () =>
            `${verb} triggered for compose ${args.composeId}.\n\nNote: First deployments on new services may fail on Dokploy. If this fails, try deploying again immediately.`,
        )
    })
    .case("start", () =>
      client
        .post<unknown>("compose.start", { composeId: args.composeId! })
        .map(() => `Compose ${args.composeId}: start completed.`),
    )
    .case("stop", () =>
      client
        .post<unknown>("compose.stop", { composeId: args.composeId! })
        .map(() => `Compose ${args.composeId}: stop completed.`),
    )
    .case("move", () =>
      client
        .post<unknown>("compose.move", {
          composeId: args.composeId!,
          targetEnvironmentId: args.targetEnvironmentId!,
        })
        .map(() => `Compose ${args.composeId} moved to environment ${args.targetEnvironmentId}.`),
    )
    .case("loadServices", () =>
      client
        .get<unknown>("compose.loadServices", {
          composeId: args.composeId!,
          ...(args.type && { type: args.type }),
        })
        .map((services) => `# Compose Services\n\n\`\`\`json\n${JSON.stringify(services, null, 2)}\n\`\`\``)
        .catchTag("HttpError", (err) =>
          err.status === 404
            ? IO.succeed("No services loaded yet. Deploy the compose service first, then call loadServices.")
            : IO.fail(err),
        ),
    )
    .case("loadMounts", () =>
      client
        .get<unknown>("compose.loadMountsByService", {
          composeId: args.composeId!,
          serviceName: args.serviceName!,
        })
        .map((mounts) => `# Mounts: ${args.serviceName}\n\n\`\`\`json\n${JSON.stringify(mounts, null, 2)}\n\`\`\``),
    )
    .case("getDefaultCommand", () =>
      client
        .get<string>("compose.getDefaultCommand", { composeId: args.composeId! })
        .map((command) => `Default command: ${command}`),
    )
    .case("cancelDeployment", () =>
      client
        .post<unknown>("compose.cancelDeployment", { composeId: args.composeId! })
        .map(() => `Compose ${args.composeId}: cancelDeployment completed.`),
    )
    .case("cleanQueues", () =>
      client
        .post<unknown>("compose.cleanQueues", { composeId: args.composeId! })
        .map(() => `Compose ${args.composeId}: cleanQueues completed.`),
    )
    .case("killBuild", () =>
      client
        .post<unknown>("compose.killBuild", { composeId: args.composeId! })
        .map(() => `Compose ${args.composeId}: killBuild completed.`),
    )
    .case("refreshToken", () =>
      client
        .post<unknown>("compose.refreshToken", { composeId: args.composeId! })
        .map(() => `Compose ${args.composeId}: refreshToken completed.`),
    )
    .case("saveEnvironment", () =>
      client
        .post<unknown>("compose.saveEnvironment", {
          composeId: args.composeId!,
          env: args.env ?? null,
        })
        .map(() => `Environment saved for compose ${args.composeId}.`),
    )
    .case("setEnvVars", () =>
      client.get<DokployCompose>("compose.one", { composeId: args.composeId! }).flatMap((compose) => {
        const merged = mergeEnv(compose.env, args.set, args.unset)
        return client
          .post<unknown>("compose.saveEnvironment", { composeId: args.composeId!, env: merged.blob })
          .map(() => formatEnvMutation("compose", args.composeId!, merged))
      }),
    )
    .case("getEnvKeys", () =>
      client.get<DokployCompose>("compose.one", { composeId: args.composeId! }).map((compose) => {
        const keys = listEnvKeys(compose.env)
        return keys.length
          ? `# Env Keys for compose ${args.composeId} (${keys.length})\n\n${keys.join("\n")}\n\n(Values hidden — use getEnvValuesUnsafe to reveal.)`
          : `No env vars set for compose ${args.composeId}.`
      }),
    )
    .case("getEnvValuesUnsafe", () =>
      client.get<DokployCompose>("compose.one", { composeId: args.composeId! }).map((compose) => {
        const env = compose.env ?? ""
        return env
          ? `# Env (UNSAFE — values revealed) for compose ${args.composeId}\n\n\`\`\`\n${env}\n\`\`\`\n\nThis output contains plaintext secret values. They are now in the tool transcript and any retained agent logs. Prefer getEnvKeys + setEnvVars for routine work.`
          : `No env vars set for compose ${args.composeId}.`
      }),
    )
    .case("readLogs", () => {
      const params: Record<string, string> = {
        composeId: args.composeId!,
        containerId: args.containerId!,
      }
      if (args.tail !== undefined) params.tail = String(args.tail)
      if (args.since !== undefined) params.since = args.since
      if (args.search !== undefined) params.search = args.search
      return client
        .get<string>("compose.readLogs", params)
        .map((logs) => `# Compose Logs (${args.composeId} / ${args.containerId})\n\n\`\`\`\n${logs}\n\`\`\``)
    })
    .exhaustive()
}

export function registerComposeTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_compose",
    description:
      "Manage Docker Compose services. create: name+environmentId. get: composeId (metadata + masked env summary — never values). update: composeId+fields (supports sourceType, composeFile for raw/inline, git source fields, autoDeploy). delete/start/stop/getDefaultCommand: composeId. deploy: composeId, redeploy? (note: first deploy on new services may fail — retry immediately). move: composeId+targetEnvironmentId. loadServices: composeId (must deploy first). loadMounts: composeId+serviceName. saveEnvironment: composeId+env (full replace). setEnvVars: composeId + set?/unset? (merge inside the server, masked confirmation only). getEnvKeys: composeId — KEY names only. getEnvValuesUnsafe: composeId — UNSAFE escape hatch that returns full KEY=VALUE pairs (output goes to the tool transcript). cancelDeployment/cleanQueues/killBuild/refreshToken: composeId. readLogs: composeId+containerId, tail?, since?, search?.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      composeId: z.string().optional(),
      name: z.string().optional(),
      environmentId: z.string().optional(),
      description: z.string().optional(),
      composeType: z.string().optional().describe("docker-compose or stack"),
      composeFile: z
        .string()
        .optional()
        .describe("Docker Compose YAML content (for sourceType: raw, set this to the inline compose file)"),
      serverId: z.string().optional(),
      env: z
        .string()
        .optional()
        .describe(
          "Environment variables as KEY=VALUE pairs, one per line. Example: 'DB_HOST=localhost\\nDB_PORT=5432'. Used by saveEnvironment (full replace).",
        ),
      set: z.string().optional().describe("setEnvVars: KEY=VALUE pairs to upsert, one per line."),
      unset: z.array(z.string()).optional().describe("setEnvVars: list of KEY names to remove."),
      command: z.string().optional(),
      sourceType: z
        .enum(["github", "git", "raw"])
        .optional()
        .describe(
          "Source type. github → set repository+owner+branch (+composePath). git → set customGitUrl+customGitBranch (+customGitSSHKeyId for private). raw → set composeFile (inline YAML). The API also supports gitlab/bitbucket/gitea sources, but those need provider-specific fields not yet exposed by this tool.",
        ),
      customGitUrl: z.string().optional().describe("Custom git repository URL"),
      customGitBranch: z.string().optional().describe("Custom git branch"),
      customGitSSHKeyId: z.string().optional().describe("SSH key ID for private git repos"),
      repository: z.string().optional().describe("GitHub repository (owner/repo format)"),
      branch: z.string().optional().describe("GitHub branch"),
      owner: z.string().optional().describe("GitHub owner/organization"),
      composePath: z.string().optional().describe("Path to compose file in repo"),
      autoDeploy: z.boolean().optional().describe("Enable auto-deploy on git push"),
      appName: z.string().optional().describe("Internal app name"),
      deleteVolumes: z.boolean().optional(),
      redeploy: z.boolean().optional(),
      title: z.string().optional(),
      deployDescription: z.string().optional(),
      targetEnvironmentId: z.string().optional(),
      type: z.string().optional(),
      serviceName: z.string().optional(),
      containerId: z
        .string()
        .regex(/^[a-zA-Z0-9.\-_]+$/)
        .optional()
        .describe("Container ID for readLogs (use dokploy_docker findContainers to discover)"),
      tail: z.number().int().min(1).max(10000).optional().describe("Number of recent log lines (default 100)"),
      since: z
        .string()
        .regex(/^(all|\d+[smhd])$/)
        .optional()
        .describe("Time range: 'all' or a duration like '30m', '1h', '7d'"),
      search: z
        .string()
        .regex(/^[a-zA-Z0-9 ._-]{0,500}$/)
        .optional()
        .describe("Filter log lines by substring"),
    }),
    execute: async (args) => {
      const either = await buildComposeProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
