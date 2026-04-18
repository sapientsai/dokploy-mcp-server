import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployDeployment } from "../types"
import { formatDeploymentList } from "../utils/formatters"
import type { ToolServer } from "./types"

const ACTIONS = ["list", "getLog", "killProcess"] as const

export function registerDeploymentTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_deployment",
    description:
      "Manage deployments. list: applicationId|composeId|serverId|type+id. getLog: deploymentId (read deployment log content). killProcess: deploymentId.",
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
        case "getLog": {
          try {
            const log = await client.get<{ data: string }>("deployment.readLog", {
              deploymentId: args.deploymentId!,
            })
            const content = typeof log === "string" ? log : (log?.data ?? JSON.stringify(log, null, 2))
            return `# Deployment Log\n\n\`\`\`\n${content}\n\`\`\``
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            if (msg.includes("404") || msg.includes("not found")) {
              return `No log available for deployment ${args.deploymentId}. The log may not exist yet or has been cleaned up.`
            }
            throw error
          }
        }
        case "killProcess": {
          await client.post("deployment.killProcess", { deploymentId: args.deploymentId! })
          return `Deployment ${args.deploymentId} killed.`
        }
      }
    },
  })
}
