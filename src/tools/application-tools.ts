import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployApplication } from "../types"
import { formatApplication } from "../utils/formatters"

export function registerApplicationTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_application_create",
    description: "Create a new application in an environment",
    parameters: z.object({
      name: z.string().describe("Application name"),
      environmentId: z.string().describe("Environment ID to create the application in"),
      description: z.string().optional().describe("Application description"),
      serverId: z.string().optional().describe("Server ID to deploy on (optional for remote servers)"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const app = await client.post<DokployApplication>("application.create", {
        name: args.name,
        environmentId: args.environmentId,
        ...(args.description && { description: args.description }),
        ...(args.serverId && { serverId: args.serverId }),
      })
      return `# Application Created\n\n${formatApplication(app)}`
    },
  })

  server.addTool({
    name: "dokploy_application_get",
    description: "Get details for a specific application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const app = await client.get<DokployApplication>("application.one", { applicationId: args.applicationId })
      return `# Application Details\n\n${formatApplication(app)}`
    },
  })

  server.addTool({
    name: "dokploy_application_deploy",
    description: "Deploy an application (trigger a new deployment)",
    parameters: z.object({
      applicationId: z.string().describe("The application ID to deploy"),
      title: z.string().optional().describe("Deployment title"),
      description: z.string().optional().describe("Deployment description"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.deploy", {
        applicationId: args.applicationId,
        ...(args.title && { title: args.title }),
        ...(args.description && { description: args.description }),
      })
      return `Deployment triggered for application ${args.applicationId}.`
    },
  })

  server.addTool({
    name: "dokploy_application_redeploy",
    description: "Redeploy an application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID to redeploy"),
      title: z.string().optional().describe("Deployment title"),
      description: z.string().optional().describe("Deployment description"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.redeploy", {
        applicationId: args.applicationId,
        ...(args.title && { title: args.title }),
        ...(args.description && { description: args.description }),
      })
      return `Redeployment triggered for application ${args.applicationId}.`
    },
  })

  server.addTool({
    name: "dokploy_application_start",
    description: "Start a stopped application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID to start"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.start", { applicationId: args.applicationId })
      return `Application ${args.applicationId} started.`
    },
  })

  server.addTool({
    name: "dokploy_application_stop",
    description: "Stop a running application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID to stop"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.stop", { applicationId: args.applicationId })
      return `Application ${args.applicationId} stopped.`
    },
  })

  server.addTool({
    name: "dokploy_application_delete",
    description: "Delete an application permanently",
    parameters: z.object({
      applicationId: z.string().describe("The application ID to delete"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.delete", { applicationId: args.applicationId })
      return `Application ${args.applicationId} deleted.`
    },
  })

  server.addTool({
    name: "dokploy_application_update",
    description: "Update application configuration (name, description, docker image, build settings, resources, etc.)",
    parameters: z.object({
      applicationId: z.string().describe("The application ID to update"),
      name: z.string().optional().describe("New application name"),
      description: z.string().optional().describe("New description"),
      dockerImage: z.string().optional().describe("Docker image to use"),
      command: z.string().optional().describe("Custom command"),
      memoryLimit: z.number().optional().describe("Memory limit in MB"),
      cpuLimit: z.number().optional().describe("CPU limit"),
      replicas: z.number().optional().describe("Number of replicas"),
      autoDeploy: z.boolean().optional().describe("Enable auto-deploy on push"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const { applicationId, ...updates } = args
      const body: Record<string, unknown> = { applicationId }
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) body[key] = value
      }
      await client.post("application.update", body)
      return `Application ${applicationId} updated.`
    },
  })

  server.addTool({
    name: "dokploy_application_saveEnvironment",
    description: "Save environment variables for an application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
      env: z.string().optional().describe("Environment variables (KEY=VALUE format, newline separated)"),
      buildArgs: z.string().optional().describe("Build arguments"),
      createEnvFile: z.boolean().describe("Whether to create a .env file in the container"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.saveEnvironment", {
        applicationId: args.applicationId,
        createEnvFile: args.createEnvFile,
        ...(args.env !== undefined && { env: args.env }),
        ...(args.buildArgs !== undefined && { buildArgs: args.buildArgs }),
      })
      return `Environment saved for application ${args.applicationId}.`
    },
  })

  server.addTool({
    name: "dokploy_application_saveBuildType",
    description: "Configure the build type for an application (dockerfile, nixpacks, heroku, etc.)",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
      buildType: z.string().describe("Build type (dockerfile, nixpacks, heroku, buildpacks, railpack, static)"),
      dockerfile: z.string().optional().describe("Dockerfile path"),
      dockerContextPath: z.string().optional().describe("Docker context path"),
      dockerBuildStage: z.string().optional().describe("Docker build stage"),
      publishDirectory: z.string().optional().describe("Publish directory for static builds"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.saveBuildType", {
        applicationId: args.applicationId,
        buildType: args.buildType,
        dockerContextPath: args.dockerContextPath || ".",
        dockerBuildStage: args.dockerBuildStage || "",
        ...(args.dockerfile && { dockerfile: args.dockerfile }),
        ...(args.publishDirectory && { publishDirectory: args.publishDirectory }),
      })
      return `Build type set to "${args.buildType}" for application ${args.applicationId}.`
    },
  })

  server.addTool({
    name: "dokploy_application_readMonitoring",
    description: "Read monitoring metrics for an application",
    parameters: z.object({
      appName: z.string().describe("The internal app name"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const data = await client.get<unknown>("application.readAppMonitoring", { appName: args.appName })
      return `# Monitoring Data for ${args.appName}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``
    },
  })

  server.addTool({
    name: "dokploy_application_readTraefikConfig",
    description: "Read the Traefik configuration for an application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const config = await client.get<string>("application.readTraefikConfig", {
        applicationId: args.applicationId,
      })
      return `# Traefik Config for ${args.applicationId}\n\n\`\`\`yaml\n${config}\n\`\`\``
    },
  })

  server.addTool({
    name: "dokploy_application_updateTraefikConfig",
    description: "Update the Traefik configuration for an application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
      traefikConfig: z.string().describe("The Traefik configuration content"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.updateTraefikConfig", {
        applicationId: args.applicationId,
        traefikConfig: args.traefikConfig,
      })
      return `Traefik config updated for application ${args.applicationId}.`
    },
  })

  server.addTool({
    name: "dokploy_application_reload",
    description: "Reload an application without a full redeploy",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
      appName: z.string().describe("The internal app name"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.reload", { applicationId: args.applicationId, appName: args.appName })
      return `Application ${args.applicationId} reloaded.`
    },
  })

  server.addTool({
    name: "dokploy_application_markRunning",
    description: "Manually mark an application as running",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.markRunning", { applicationId: args.applicationId })
      return `Application ${args.applicationId} marked as running.`
    },
  })

  server.addTool({
    name: "dokploy_application_refreshToken",
    description: "Refresh the webhook token for an application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.refreshToken", { applicationId: args.applicationId })
      return `Webhook token refreshed for application ${args.applicationId}.`
    },
  })

  server.addTool({
    name: "dokploy_application_cleanQueues",
    description: "Clean the build/deploy queues for an application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.cleanQueues", { applicationId: args.applicationId })
      return `Queues cleaned for application ${args.applicationId}.`
    },
  })

  server.addTool({
    name: "dokploy_application_killBuild",
    description: "Kill a running build process for an application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.killBuild", { applicationId: args.applicationId })
      return `Build killed for application ${args.applicationId}.`
    },
  })

  server.addTool({
    name: "dokploy_application_move",
    description: "Move an application to a different environment",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
      targetEnvironmentId: z.string().describe("The target environment ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.move", {
        applicationId: args.applicationId,
        targetEnvironmentId: args.targetEnvironmentId,
      })
      return `Application ${args.applicationId} moved to environment ${args.targetEnvironmentId}.`
    },
  })

  server.addTool({
    name: "dokploy_application_cancelDeployment",
    description: "Cancel an ongoing deployment for an application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("application.cancelDeployment", { applicationId: args.applicationId })
      return `Deployment cancelled for application ${args.applicationId}.`
    },
  })
}
