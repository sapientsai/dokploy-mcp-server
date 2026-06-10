import type { IO } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { RequestBody } from "../generated"
import type { DokployApplication } from "../types"
import { formatApplication } from "../utils/formatters"
import { formatEnvMutation, listEnvKeys, mergeEnv, pickDefined } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = [
  "create",
  "get",
  "update",
  "move",
  "deploy",
  "start",
  "stop",
  "delete",
  "markRunning",
  "refreshToken",
  "cleanQueues",
  "killBuild",
  "cancelDeployment",
  "reload",
  "saveEnvironment",
  "setEnvVars",
  "getEnvKeys",
  "getEnvValuesUnsafe",
  "saveBuildType",
  "traefikConfig",
  "readMonitoring",
  "readLogs",
] as const

const UPDATE_FIELDS = [
  "name",
  "description",
  "dockerImage",
  "command",
  "memoryLimit",
  "cpuLimit",
  "replicas",
  "autoDeploy",
  "sourceType",
  "repository",
  "owner",
  "branch",
  "customGitUrl",
  "customGitBranch",
  "githubId",
] as const

type ApplicationArgs = {
  action: (typeof ACTIONS)[number]
  applicationId?: string
  name?: string
  environmentId?: string
  description?: string
  serverId?: string
  targetEnvironmentId?: string
  redeploy?: boolean
  title?: string
  deployDescription?: string
  dockerImage?: string
  command?: string
  memoryLimit?: number
  cpuLimit?: number
  replicas?: number
  autoDeploy?: boolean
  appName?: string
  sourceType?: "github" | "git" | "docker"
  repository?: string
  owner?: string
  branch?: string
  customGitUrl?: string
  customGitBranch?: string
  githubId?: string
  env?: string
  set?: string
  unset?: string[]
  buildArgs?: string
  buildSecrets?: string
  createEnvFile?: boolean
  buildType?: "dockerfile" | "heroku_buildpacks" | "paketo_buildpacks" | "nixpacks" | "static" | "railpack"
  dockerfile?: string
  dockerContextPath?: string
  dockerBuildStage?: string
  publishDirectory?: string
  traefikConfig?: string
  tail?: number
  since?: string
  search?: string
}

export function buildApplicationProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: ApplicationArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("create", () =>
      client
        .post<DokployApplication>("application.create", {
          name: args.name!,
          environmentId: args.environmentId!,
          ...(args.description && { description: args.description }),
          ...(args.serverId && { serverId: args.serverId }),
        } satisfies RequestBody<"application-create">)
        .map((app) => `# Application Created\n\n${formatApplication(app)}`),
    )
    .case("get", () =>
      client
        .get<DokployApplication>("application.one", { applicationId: args.applicationId! })
        .map((app) => `# Application Details\n\n${formatApplication(app)}`),
    )
    .case("update", () => {
      const body = { applicationId: args.applicationId!, ...pickDefined(args, UPDATE_FIELDS) }
      return client
        .post<unknown>("application.update", body as RequestBody<"application-update">)
        .map(() => `Application ${args.applicationId} updated.`)
    })
    .case("move", () =>
      client
        .post<unknown>("application.move", {
          applicationId: args.applicationId!,
          targetEnvironmentId: args.targetEnvironmentId!,
        } satisfies RequestBody<"application-move">)
        .map(() => `Application ${args.applicationId} moved to environment ${args.targetEnvironmentId}.`),
    )
    .case("deploy", () => {
      const endpoint = args.redeploy ? "application.redeploy" : "application.deploy"
      const body: Record<string, unknown> = { applicationId: args.applicationId! }
      if (args.title) body.title = args.title
      if (args.deployDescription) body.description = args.deployDescription
      const verb = args.redeploy ? "Redeployment" : "Deployment"
      return client
        .post<unknown>(endpoint, body)
        .map(
          () =>
            `${verb} triggered for application ${args.applicationId}.\n\nNote: First deployments on new services may fail on Dokploy. If this fails, try deploying again immediately.`,
        )
    })
    .case("start", () =>
      client
        .post<unknown>("application.start", { applicationId: args.applicationId! })
        .map(() => `Application ${args.applicationId}: start completed.`),
    )
    .case("stop", () =>
      client
        .post<unknown>("application.stop", { applicationId: args.applicationId! })
        .map(() => `Application ${args.applicationId}: stop completed.`),
    )
    .case("delete", () =>
      client
        .post<unknown>("application.delete", { applicationId: args.applicationId! })
        .map(() => `Application ${args.applicationId}: delete completed.`),
    )
    .case("markRunning", () =>
      client
        .post<unknown>("application.markRunning", { applicationId: args.applicationId! })
        .map(() => `Application ${args.applicationId}: markRunning completed.`),
    )
    .case("refreshToken", () =>
      client
        .post<unknown>("application.refreshToken", { applicationId: args.applicationId! })
        .map(() => `Application ${args.applicationId}: refreshToken completed.`),
    )
    .case("cleanQueues", () =>
      client
        .post<unknown>("application.cleanQueues", { applicationId: args.applicationId! })
        .map(() => `Application ${args.applicationId}: cleanQueues completed.`),
    )
    .case("killBuild", () =>
      client
        .post<unknown>("application.killBuild", { applicationId: args.applicationId! })
        .map(() => `Application ${args.applicationId}: killBuild completed.`),
    )
    .case("cancelDeployment", () =>
      client
        .post<unknown>("application.cancelDeployment", { applicationId: args.applicationId! })
        .map(() => `Application ${args.applicationId}: cancelDeployment completed.`),
    )
    .case("reload", () =>
      client
        .post<unknown>("application.reload", {
          applicationId: args.applicationId!,
          appName: args.appName!,
        } satisfies RequestBody<"application-reload">)
        .map(() => `Application ${args.applicationId} reloaded.`),
    )
    .case("saveEnvironment", () => {
      const body: Record<string, unknown> = {
        applicationId: args.applicationId!,
        createEnvFile: args.createEnvFile ?? false,
        buildArgs: args.buildArgs ?? "",
        buildSecrets: args.buildSecrets ?? "",
      }
      if (args.env !== undefined) body.env = args.env
      return client
        .post<unknown>("application.saveEnvironment", body)
        .map(() => `Environment saved for application ${args.applicationId}.`)
    })
    .case("setEnvVars", () =>
      client.get<DokployApplication>("application.one", { applicationId: args.applicationId! }).flatMap((app) => {
        const merged = mergeEnv(app.env, args.set, args.unset)
        const body: Record<string, unknown> = {
          applicationId: args.applicationId!,
          env: merged.blob,
          createEnvFile: args.createEnvFile ?? false,
          buildArgs: args.buildArgs ?? "",
          buildSecrets: args.buildSecrets ?? "",
        }
        return client
          .post<unknown>("application.saveEnvironment", body)
          .map(() => formatEnvMutation("application", args.applicationId!, merged))
      }),
    )
    .case("getEnvKeys", () =>
      client.get<DokployApplication>("application.one", { applicationId: args.applicationId! }).map((app) => {
        const keys = listEnvKeys(app.env)
        return keys.length
          ? `# Env Keys for application ${args.applicationId} (${keys.length})\n\n${keys.join("\n")}\n\n(Values hidden — use getEnvValuesUnsafe to reveal.)`
          : `No env vars set for application ${args.applicationId}.`
      }),
    )
    .case("getEnvValuesUnsafe", () =>
      client.get<DokployApplication>("application.one", { applicationId: args.applicationId! }).map((app) => {
        const env = app.env ?? ""
        return env
          ? `# Env (UNSAFE — values revealed) for application ${args.applicationId}\n\n\`\`\`\n${env}\n\`\`\`\n\nThis output contains plaintext secret values. They are now in the tool transcript and any retained agent logs. Prefer getEnvKeys + setEnvVars for routine work.`
          : `No env vars set for application ${args.applicationId}.`
      }),
    )
    .case("saveBuildType", () =>
      client
        .post<unknown>("application.saveBuildType", {
          applicationId: args.applicationId!,
          buildType: args.buildType!,
          dockerContextPath: args.dockerContextPath ?? ".",
          dockerBuildStage: args.dockerBuildStage ?? "",
          ...(args.dockerfile && { dockerfile: args.dockerfile }),
          ...(args.publishDirectory && { publishDirectory: args.publishDirectory }),
        })
        .map(() => `Build type set to "${args.buildType}" for application ${args.applicationId}.`),
    )
    .case("traefikConfig", () =>
      args.traefikConfig
        ? client
            .post<unknown>("application.updateTraefikConfig", {
              applicationId: args.applicationId!,
              traefikConfig: args.traefikConfig,
            } satisfies RequestBody<"application-updateTraefikConfig">)
            .map(() => `Traefik config updated for application ${args.applicationId}.`)
        : client
            .get<string>("application.readTraefikConfig", { applicationId: args.applicationId! })
            .map((config) => `# Traefik Config\n\n\`\`\`yaml\n${config}\n\`\`\``),
    )
    .case("readMonitoring", () =>
      client
        .get<unknown>("application.readAppMonitoring", { appName: args.appName! })
        .map((data) => `# Monitoring: ${args.appName}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``),
    )
    .case("readLogs", () => {
      const params: Record<string, string> = { applicationId: args.applicationId! }
      if (args.tail !== undefined) params.tail = String(args.tail)
      if (args.since !== undefined) params.since = args.since
      if (args.search !== undefined) params.search = args.search
      return client
        .get<string>("application.readLogs", params)
        .map((logs) => `# Application Logs (${args.applicationId})\n\n\`\`\`\n${logs}\n\`\`\``)
    })
    .exhaustive()
}

export function registerApplicationTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_application",
    description:
      "Manage applications. create: name+environmentId. get: applicationId (returns metadata + masked env summary — never values). update: applicationId+fields (supports sourceType, repository, owner, branch, customGitUrl, customGitBranch, githubId, dockerImage, etc.). move: applicationId+targetEnvironmentId. deploy: applicationId, redeploy? (note: first deploy on new services may fail — retry immediately). start/stop/delete/markRunning/refreshToken/cleanQueues/killBuild/cancelDeployment: applicationId. reload: applicationId+appName. saveEnvironment: applicationId+env (KEY=VALUE pairs, full replace). setEnvVars: applicationId + set? (KEY=VALUE pairs to upsert) + unset? (KEY names to remove) — read-modify-write inside the server; result is a masked confirmation with changed key names only. getEnvKeys: applicationId — returns just the KEY names (no values). getEnvValuesUnsafe: applicationId — UNSAFE escape hatch that returns full KEY=VALUE pairs (use only when you need actual values; output goes to the tool transcript and any retained logs). saveBuildType: applicationId+buildType. traefikConfig: applicationId, traefikConfig? (omit to read). readMonitoring: appName. readLogs: applicationId, tail? (default 100), since? ('all' or duration like '1h'), search? (substring filter).",
    parameters: z.object({
      action: z.enum(ACTIONS),
      applicationId: z.string().optional(),
      name: z.string().optional(),
      environmentId: z.string().optional(),
      description: z.string().optional(),
      serverId: z.string().optional(),
      targetEnvironmentId: z.string().optional(),
      redeploy: z.boolean().optional(),
      title: z.string().optional(),
      deployDescription: z.string().optional().describe("Deploy description (maps to API description field)"),
      dockerImage: z.string().optional(),
      command: z.string().optional(),
      memoryLimit: z.number().optional(),
      cpuLimit: z.number().optional(),
      replicas: z.number().optional(),
      autoDeploy: z.boolean().optional(),
      appName: z.string().optional(),
      sourceType: z
        .enum(["github", "git", "docker"])
        .optional()
        .describe(
          "Source type. github → set repository+owner+branch (+githubId for private). git → set customGitUrl+customGitBranch. docker → set dockerImage. The API also supports gitlab/bitbucket/gitea/drop sources, but those need provider-specific fields not yet exposed by this tool.",
        ),
      repository: z.string().optional().describe("GitHub repository name"),
      owner: z.string().optional().describe("GitHub org/user"),
      branch: z.string().optional().describe("Branch name"),
      customGitUrl: z.string().optional().describe("Custom git repository URL (for sourceType: git)"),
      customGitBranch: z.string().optional().describe("Branch for custom git source"),
      githubId: z.string().optional().describe("GitHub App provider ID for private repo access"),
      env: z
        .string()
        .optional()
        .describe(
          "Environment variables as KEY=VALUE pairs, one per line. Example: 'DB_HOST=localhost\\nDB_PORT=5432'. Used by saveEnvironment (full replace).",
        ),
      set: z
        .string()
        .optional()
        .describe("setEnvVars: KEY=VALUE pairs to upsert, one per line. Existing keys retain order; new keys append."),
      unset: z
        .array(z.string())
        .optional()
        .describe("setEnvVars: list of KEY names to remove. Unknown keys are silently skipped."),
      buildArgs: z.string().optional(),
      buildSecrets: z.string().optional(),
      createEnvFile: z.boolean().optional(),
      buildType: z
        .enum(["dockerfile", "heroku_buildpacks", "paketo_buildpacks", "nixpacks", "static", "railpack"])
        .optional()
        .describe("dockerfile | heroku_buildpacks | paketo_buildpacks | nixpacks | static | railpack"),
      dockerfile: z.string().optional(),
      dockerContextPath: z.string().optional(),
      dockerBuildStage: z.string().optional(),
      publishDirectory: z.string().optional(),
      traefikConfig: z.string().optional().describe("New config content (omit to read current)"),
      tail: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .optional()
        .describe("Number of recent log lines to return (default 100)"),
      since: z
        .string()
        .regex(/^(all|\d+[smhd])$/)
        .optional()
        .describe("Time range: 'all' or a duration like '30m', '1h', '7d'"),
      search: z
        .string()
        .regex(/^[a-zA-Z0-9 ._-]{0,500}$/)
        .optional()
        .describe("Filter log lines by substring (alphanumeric + ' ._-' only)"),
    }),
    execute: async (args) => {
      const either = await buildApplicationProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
