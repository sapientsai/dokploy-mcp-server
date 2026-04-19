import type { IO as IOType } from "functype"
import { IO, Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { RequestBody } from "../generated"
import type { DokployCompose } from "../types"
import { formatCompose } from "../utils/formatters"
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
  command?: string
  sourceType?: string
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
}

function pickDefined<T extends Record<string, unknown>, K extends readonly (keyof T)[]>(
  source: T,
  keys: K,
): Record<string, unknown> {
  return Object.fromEntries(keys.filter((k) => source[k] !== undefined).map((k) => [k, source[k]]))
}

export function buildComposeProgram(
  client: Pick<DokployClient, "getIO" | "postIO">,
  args: ComposeArgs,
): IOType<never, ApiError, string> {
  return Match(args.action)
    .case("create", () =>
      client
        .postIO<DokployCompose>("compose.create", {
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
        .getIO<DokployCompose>("compose.one", { composeId: args.composeId! })
        .map((compose) => `# Compose Details\n\n${formatCompose(compose)}`),
    )
    .case("update", () => {
      const body = { composeId: args.composeId!, ...pickDefined(args, UPDATE_FIELDS) }
      return client
        .postIO<unknown>("compose.update", body as RequestBody<"compose-update">)
        .map(() => `Compose ${args.composeId} updated.`)
    })
    .case("delete", () =>
      client
        .postIO<unknown>("compose.delete", {
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
        .postIO<unknown>(endpoint, body)
        .map(
          () =>
            `${verb} triggered for compose ${args.composeId}.\n\nNote: First deployments on new services may fail on Dokploy. If this fails, try deploying again immediately.`,
        )
    })
    .case("start", () =>
      client
        .postIO<unknown>("compose.start", { composeId: args.composeId! })
        .map(() => `Compose ${args.composeId}: start completed.`),
    )
    .case("stop", () =>
      client
        .postIO<unknown>("compose.stop", { composeId: args.composeId! })
        .map(() => `Compose ${args.composeId}: stop completed.`),
    )
    .case("move", () =>
      client
        .postIO<unknown>("compose.move", {
          composeId: args.composeId!,
          targetEnvironmentId: args.targetEnvironmentId!,
        })
        .map(() => `Compose ${args.composeId} moved to environment ${args.targetEnvironmentId}.`),
    )
    .case("loadServices", () =>
      client
        .getIO<unknown>("compose.loadServices", {
          composeId: args.composeId!,
          ...(args.type && { type: args.type }),
        })
        .map((services) => `# Compose Services\n\n\`\`\`json\n${JSON.stringify(services, null, 2)}\n\`\`\``)
        .recoverWith(
          (err): IOType<never, ApiError, string> =>
            err._tag === "HttpError" && err.status === 404
              ? IO.succeed("No services loaded yet. Deploy the compose service first, then call loadServices.")
              : IO.fail(err),
        ),
    )
    .case("loadMounts", () =>
      client
        .getIO<unknown>("compose.loadMountsByService", {
          composeId: args.composeId!,
          serviceName: args.serviceName!,
        })
        .map((mounts) => `# Mounts: ${args.serviceName}\n\n\`\`\`json\n${JSON.stringify(mounts, null, 2)}\n\`\`\``),
    )
    .case("getDefaultCommand", () =>
      client
        .getIO<string>("compose.getDefaultCommand", { composeId: args.composeId! })
        .map((command) => `Default command: ${command}`),
    )
    .case("cancelDeployment", () =>
      client
        .postIO<unknown>("compose.cancelDeployment", { composeId: args.composeId! })
        .map(() => `Compose ${args.composeId}: cancelDeployment completed.`),
    )
    .case("cleanQueues", () =>
      client
        .postIO<unknown>("compose.cleanQueues", { composeId: args.composeId! })
        .map(() => `Compose ${args.composeId}: cleanQueues completed.`),
    )
    .case("killBuild", () =>
      client
        .postIO<unknown>("compose.killBuild", { composeId: args.composeId! })
        .map(() => `Compose ${args.composeId}: killBuild completed.`),
    )
    .case("refreshToken", () =>
      client
        .postIO<unknown>("compose.refreshToken", { composeId: args.composeId! })
        .map(() => `Compose ${args.composeId}: refreshToken completed.`),
    )
    .exhaustive() as IOType<never, ApiError, string>
}

export function registerComposeTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_compose",
    description:
      "Manage Docker Compose services. create: name+environmentId. get: composeId (returns env vars). update: composeId+fields (supports sourceType, composeFile for raw/inline, git source fields, autoDeploy). delete/start/stop/getDefaultCommand: composeId. deploy: composeId, redeploy? (note: first deploy on new services may fail — retry immediately). move: composeId+targetEnvironmentId. loadServices: composeId (must deploy first). loadMounts: composeId+serviceName. saveEnvironment: composeId+env (KEY=VALUE pairs, one per line). cancelDeployment/cleanQueues/killBuild/refreshToken: composeId.",
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
          "Environment variables as KEY=VALUE pairs, one per line. Example: 'DB_HOST=localhost\\nDB_PORT=5432'",
        ),
      command: z.string().optional(),
      sourceType: z.string().optional().describe("git, github, gitlab, bitbucket, gitea, raw"),
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
    }),
    execute: async (args) => {
      const either = await buildComposeProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
