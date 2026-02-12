import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployDeployment } from "../types"
import { formatDeploymentList } from "../utils/formatters"

export function registerDeploymentTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_deployment_list",
    description: "List all deployments for an application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const deployments = await client.get<DokployDeployment[]>("deployment.all", {
        applicationId: args.applicationId,
      })
      return formatDeploymentList(deployments)
    },
  })

  server.addTool({
    name: "dokploy_deployment_listByCompose",
    description: "List all deployments for a Docker Compose service",
    parameters: z.object({
      composeId: z.string().describe("The compose service ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const deployments = await client.get<DokployDeployment[]>("deployment.allByCompose", {
        composeId: args.composeId,
      })
      return formatDeploymentList(deployments)
    },
  })

  server.addTool({
    name: "dokploy_deployment_listByServer",
    description: "List all deployments for a specific server",
    parameters: z.object({
      serverId: z.string().describe("The server ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const deployments = await client.get<DokployDeployment[]>("deployment.allByServer", {
        serverId: args.serverId,
      })
      return formatDeploymentList(deployments)
    },
  })

  server.addTool({
    name: "dokploy_deployment_listByType",
    description: "List all deployments by resource type and ID",
    parameters: z.object({
      id: z.string().describe("The resource ID"),
      type: z.string().describe("The resource type (application, compose, postgres, mysql, mariadb, mongo, redis)"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const deployments = await client.get<DokployDeployment[]>("deployment.allByType", {
        id: args.id,
        type: args.type,
      })
      return formatDeploymentList(deployments)
    },
  })

  server.addTool({
    name: "dokploy_deployment_killProcess",
    description: "Kill a running deployment process",
    parameters: z.object({
      deploymentId: z.string().describe("The deployment ID to kill"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("deployment.killProcess", { deploymentId: args.deploymentId })
      return `Deployment process ${args.deploymentId} killed.`
    },
  })
}
