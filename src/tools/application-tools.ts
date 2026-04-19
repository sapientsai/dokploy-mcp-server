import type { IO as IOType } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { RequestBody } from "../generated"
import type { DokployApplication } from "../types"
import { formatApplication } from "../utils/formatters"
import { pickDefined } from "./tool-utils"
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
  "saveBuildType",
  "traefikConfig",
  "readMonitoring",
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
  sourceType?: "github" | "git" | "docker" | "raw"
  repository?: string
  owner?: string
  branch?: string
  customGitUrl?: string
  customGitBranch?: string
  githubId?: string
  env?: string
  buildArgs?: string
  buildSecrets?: string
  createEnvFile?: boolean
  buildType?: string
  dockerfile?: string
  dockerContextPath?: string
  dockerBuildStage?: string
  publishDirectory?: string
  traefikConfig?: string
}

export function buildApplicationProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: ApplicationArgs,
): IOType<never, ApiError, string> {
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
    .exhaustive() as IOType<never, ApiError, string>
}

export function registerApplicationTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_application",
    description:
      "Manage applications. create: name+environmentId. get: applicationId (returns env vars, git source, build config). update: applicationId+fields (supports sourceType, repository, owner, branch, customGitUrl, customGitBranch, githubId, dockerImage, etc.). move: applicationId+targetEnvironmentId. deploy: applicationId, redeploy? (note: first deploy on new services may fail — retry immediately). start/stop/delete/markRunning/refreshToken/cleanQueues/killBuild/cancelDeployment: applicationId. reload: applicationId+appName. saveEnvironment: applicationId+env (KEY=VALUE pairs, one per line). saveBuildType: applicationId+buildType. traefikConfig: applicationId, traefikConfig? (omit to read). readMonitoring: appName.",
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
      sourceType: z.enum(["github", "git", "docker", "raw"]).optional().describe("Source type for the application"),
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
          "Environment variables as KEY=VALUE pairs, one per line. Example: 'DB_HOST=localhost\\nDB_PORT=5432'",
        ),
      buildArgs: z.string().optional(),
      buildSecrets: z.string().optional(),
      createEnvFile: z.boolean().optional(),
      buildType: z.string().optional(),
      dockerfile: z.string().optional(),
      dockerContextPath: z.string().optional(),
      dockerBuildStage: z.string().optional(),
      publishDirectory: z.string().optional(),
      traefikConfig: z.string().optional().describe("New config content (omit to read current)"),
    }),
    execute: async (args) => {
      const either = await buildApplicationProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
