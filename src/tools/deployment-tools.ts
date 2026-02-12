import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployDeployment } from "../types"
import { formatDeploymentList } from "../utils/formatters"

const ACTIONS = ["list", "killProcess"] as const

export function registerDeploymentTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_deployment",
    description: "Manage deployments. list: applicationId|composeId|serverId|type+id. killProcess: deploymentId.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      deploymentId: z.string().optional(),
      applicationId: z.string().optional(),
      composeId: z.string().optional(),
      serverId: z.string().optional(),
      type: z.string().optional().describe("Resource type (application, compose, postgres, mysql, etc.)"),
      id: z.string().optional().describe("Resource ID (used with type)"),
    }),
    execute: async (args) => {
      const client = getDokployClient()

      switch (args.action) {
        case "list": {
          let deployments: DokployDeployment[]

          if (args.applicationId) {
            deployments = await client.get<DokployDeployment[]>("deployment.all", {
              applicationId: args.applicationId,
            })
          } else if (args.composeId) {
            deployments = await client.get<DokployDeployment[]>("deployment.allByCompose", {
              composeId: args.composeId,
            })
          } else if (args.serverId) {
            deployments = await client.get<DokployDeployment[]>("deployment.allByServer", {
              serverId: args.serverId,
            })
          } else if (args.type && args.id) {
            deployments = await client.get<DokployDeployment[]>("deployment.allByType", {
              type: args.type,
              id: args.id,
            })
          } else {
            throw new Error("Provide applicationId, composeId, serverId, or type+id")
          }

          return formatDeploymentList(deployments)
        }
        case "killProcess": {
          await client.post("deployment.killProcess", { deploymentId: args.deploymentId! })
          return `Deployment ${args.deploymentId} killed.`
        }
      }
    },
  })
}
