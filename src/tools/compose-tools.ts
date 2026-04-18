import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
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
      const client = getDokployClient()

      switch (args.action) {
        case "create": {
          const compose = await client.post<DokployCompose>("compose.create", {
            name: args.name!,
            environmentId: args.environmentId!,
            ...(args.description && { description: args.description }),
            ...(args.composeType && { composeType: args.composeType }),
            ...(args.composeFile && { composeFile: args.composeFile }),
            ...(args.serverId && { serverId: args.serverId }),
          })
          return `# Compose Created\n\n${formatCompose(compose)}`
        }
        case "get": {
          const compose = await client.get<DokployCompose>("compose.one", { composeId: args.composeId! })
          return `# Compose Details\n\n${formatCompose(compose)}`
        }
        case "update": {
          const body: Record<string, unknown> = { composeId: args.composeId! }
          const updateFields = [
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
          for (const key of updateFields) {
            if (args[key] !== undefined) body[key] = args[key]
          }
          await client.post("compose.update", body as RequestBody<"compose-update">)
          return `Compose ${args.composeId} updated.`
        }
        case "delete": {
          await client.post("compose.delete", {
            composeId: args.composeId!,
            deleteVolumes: args.deleteVolumes ?? false,
          } satisfies RequestBody<"compose-delete">)
          return `Compose ${args.composeId} deleted.`
        }
        case "deploy": {
          const endpoint = args.redeploy ? "compose.redeploy" : "compose.deploy"
          await client.post(endpoint, {
            composeId: args.composeId!,
            ...(args.title && { title: args.title }),
            ...(args.deployDescription && { description: args.deployDescription }),
          })
          return `${args.redeploy ? "Redeployment" : "Deployment"} triggered for compose ${args.composeId}.\n\nNote: First deployments on new services may fail on Dokploy. If this fails, try deploying again immediately.`
        }
        case "start":
        case "stop": {
          await client.post(`compose.${args.action}`, { composeId: args.composeId! })
          return `Compose ${args.composeId}: ${args.action} completed.`
        }
        case "move": {
          await client.post("compose.move", {
            composeId: args.composeId!,
            targetEnvironmentId: args.targetEnvironmentId!,
          })
          return `Compose ${args.composeId} moved to environment ${args.targetEnvironmentId}.`
        }
        case "loadServices": {
          try {
            const services = await client.get<unknown>("compose.loadServices", {
              composeId: args.composeId!,
              ...(args.type && { type: args.type }),
            })
            return `# Compose Services\n\n\`\`\`json\n${JSON.stringify(services, null, 2)}\n\`\`\``
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            if (msg.includes("404") || msg.includes("NOT_FOUND") || msg.includes("not found")) {
              return "No services loaded yet. Deploy the compose service first, then call loadServices."
            }
            throw error
          }
        }
        case "loadMounts": {
          const mounts = await client.get<unknown>("compose.loadMountsByService", {
            composeId: args.composeId!,
            serviceName: args.serviceName!,
          })
          return `# Mounts: ${args.serviceName}\n\n\`\`\`json\n${JSON.stringify(mounts, null, 2)}\n\`\`\``
        }
        case "getDefaultCommand": {
          const command = await client.get<string>("compose.getDefaultCommand", { composeId: args.composeId! })
          return `Default command: ${command}`
        }
        case "cancelDeployment":
        case "cleanQueues":
        case "killBuild":
        case "refreshToken": {
          await client.post(`compose.${args.action}`, { composeId: args.composeId! })
          return `Compose ${args.composeId}: ${args.action} completed.`
        }
      }
    },
  })
}
