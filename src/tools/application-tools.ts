import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployApplication } from "../types"
import { formatApplication } from "../utils/formatters"

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

const SIMPLE_ACTIONS = [
  "start",
  "stop",
  "delete",
  "markRunning",
  "refreshToken",
  "cleanQueues",
  "killBuild",
  "cancelDeployment",
] as const
type SimpleAction = (typeof SIMPLE_ACTIONS)[number]

export function registerApplicationTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_application",
    description:
      "Manage applications. create: name+environmentId. get: applicationId. update: applicationId+fields. move: applicationId+targetEnvironmentId. deploy: applicationId, redeploy?. start/stop/delete/markRunning/refreshToken/cleanQueues/killBuild/cancelDeployment: applicationId. reload: applicationId+appName. saveEnvironment: applicationId+env. saveBuildType: applicationId+buildType. traefikConfig: applicationId, traefikConfig? (omit to read). readMonitoring: appName.",
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
      env: z.string().optional().describe("KEY=VALUE pairs, newline separated"),
      buildArgs: z.string().optional(),
      createEnvFile: z.boolean().optional(),
      buildType: z.string().optional(),
      dockerfile: z.string().optional(),
      dockerContextPath: z.string().optional(),
      dockerBuildStage: z.string().optional(),
      publishDirectory: z.string().optional(),
      traefikConfig: z.string().optional().describe("New config content (omit to read current)"),
    }),
    execute: async (args) => {
      const client = getDokployClient()

      switch (args.action) {
        case "create": {
          const app = await client.post<DokployApplication>("application.create", {
            name: args.name!,
            environmentId: args.environmentId!,
            ...(args.description && { description: args.description }),
            ...(args.serverId && { serverId: args.serverId }),
          })
          return `# Application Created\n\n${formatApplication(app)}`
        }
        case "get": {
          const app = await client.get<DokployApplication>("application.one", {
            applicationId: args.applicationId!,
          })
          return `# Application Details\n\n${formatApplication(app)}`
        }
        case "update": {
          const body: Record<string, unknown> = { applicationId: args.applicationId! }
          const updateFields = [
            "name",
            "description",
            "dockerImage",
            "command",
            "memoryLimit",
            "cpuLimit",
            "replicas",
            "autoDeploy",
          ] as const
          for (const key of updateFields) {
            if (args[key] !== undefined) body[key] = args[key]
          }
          await client.post("application.update", body)
          return `Application ${args.applicationId} updated.`
        }
        case "move": {
          await client.post("application.move", {
            applicationId: args.applicationId!,
            targetEnvironmentId: args.targetEnvironmentId!,
          })
          return `Application ${args.applicationId} moved to environment ${args.targetEnvironmentId}.`
        }
        case "deploy": {
          const endpoint = args.redeploy ? "application.redeploy" : "application.deploy"
          await client.post(endpoint, {
            applicationId: args.applicationId!,
            ...(args.title && { title: args.title }),
            ...(args.deployDescription && { description: args.deployDescription }),
          })
          return `${args.redeploy ? "Redeployment" : "Deployment"} triggered for application ${args.applicationId}.`
        }
        case "start":
        case "stop":
        case "delete":
        case "markRunning":
        case "refreshToken":
        case "cleanQueues":
        case "killBuild":
        case "cancelDeployment": {
          await client.post(`application.${args.action satisfies SimpleAction}`, {
            applicationId: args.applicationId!,
          })
          return `Application ${args.applicationId}: ${args.action} completed.`
        }
        case "reload": {
          await client.post("application.reload", {
            applicationId: args.applicationId!,
            appName: args.appName!,
          })
          return `Application ${args.applicationId} reloaded.`
        }
        case "saveEnvironment": {
          await client.post("application.saveEnvironment", {
            applicationId: args.applicationId!,
            createEnvFile: args.createEnvFile ?? false,
            ...(args.env !== undefined && { env: args.env }),
            ...(args.buildArgs !== undefined && { buildArgs: args.buildArgs }),
          })
          return `Environment saved for application ${args.applicationId}.`
        }
        case "saveBuildType": {
          await client.post("application.saveBuildType", {
            applicationId: args.applicationId!,
            buildType: args.buildType!,
            dockerContextPath: args.dockerContextPath || ".",
            dockerBuildStage: args.dockerBuildStage || "",
            ...(args.dockerfile && { dockerfile: args.dockerfile }),
            ...(args.publishDirectory && { publishDirectory: args.publishDirectory }),
          })
          return `Build type set to "${args.buildType}" for application ${args.applicationId}.`
        }
        case "traefikConfig": {
          if (args.traefikConfig) {
            await client.post("application.updateTraefikConfig", {
              applicationId: args.applicationId!,
              traefikConfig: args.traefikConfig,
            })
            return `Traefik config updated for application ${args.applicationId}.`
          }
          const config = await client.get<string>("application.readTraefikConfig", {
            applicationId: args.applicationId!,
          })
          return `# Traefik Config\n\n\`\`\`yaml\n${config}\n\`\`\``
        }
        case "readMonitoring": {
          const data = await client.get<unknown>("application.readAppMonitoring", { appName: args.appName! })
          return `# Monitoring: ${args.appName}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``
        }
      }
    },
  })
}
