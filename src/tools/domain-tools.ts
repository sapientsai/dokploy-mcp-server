import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployDomain } from "../types"
import { formatDomain, formatDomainList } from "../utils/formatters"

const ACTIONS = ["create", "list", "get", "update", "delete", "generate", "canGenerateTraefikMe", "validate"] as const

export function registerDomainTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_domain",
    description:
      "Manage domains. create: host+applicationId|composeId. list: applicationId|composeId. get: domainId. update: domainId+host. delete: domainId. generate: appName. canGenerateTraefikMe: serverId?. validate: domain.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      domainId: z.string().optional(),
      host: z.string().optional(),
      applicationId: z.string().optional(),
      composeId: z.string().optional(),
      serviceName: z.string().optional(),
      path: z.string().optional(),
      port: z.number().optional(),
      https: z.boolean().optional(),
      certificateType: z.string().optional(),
      domainType: z.string().optional(),
      appName: z.string().optional(),
      serverId: z.string().optional(),
      domain: z.string().optional(),
      serverIp: z.string().optional(),
    }),
    execute: async (args) => {
      const client = getDokployClient()

      switch (args.action) {
        case "create": {
          const body: Record<string, unknown> = { host: args.host! }
          const optionalFields = [
            "applicationId",
            "composeId",
            "serviceName",
            "path",
            "port",
            "https",
            "certificateType",
            "domainType",
          ] as const
          for (const key of optionalFields) {
            if (args[key] !== undefined) body[key] = args[key]
          }
          const domain = await client.post<DokployDomain>("domain.create", body)
          return `# Domain Created\n\n${formatDomain(domain)}`
        }
        case "list": {
          let domains: DokployDomain[]
          if (args.applicationId) {
            domains = await client.get<DokployDomain[]>("domain.byApplicationId", {
              applicationId: args.applicationId,
            })
          } else if (args.composeId) {
            domains = await client.get<DokployDomain[]>("domain.byComposeId", { composeId: args.composeId })
          } else {
            throw new Error("Provide applicationId or composeId")
          }
          return formatDomainList(domains)
        }
        case "get": {
          const domain = await client.get<DokployDomain>("domain.one", { domainId: args.domainId! })
          return `# Domain Details\n\n${formatDomain(domain)}`
        }
        case "update": {
          const body: Record<string, unknown> = { domainId: args.domainId!, host: args.host! }
          const optionalFields = ["path", "port", "https", "certificateType"] as const
          for (const key of optionalFields) {
            if (args[key] !== undefined) body[key] = args[key]
          }
          await client.post("domain.update", body)
          return `Domain ${args.domainId} updated.`
        }
        case "delete": {
          await client.post("domain.delete", { domainId: args.domainId! })
          return `Domain ${args.domainId} deleted.`
        }
        case "generate": {
          const result = await client.post<unknown>("domain.generateDomain", {
            appName: args.appName!,
            ...(args.serverId && { serverId: args.serverId }),
          })
          return `# Generated Domain\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
        }
        case "canGenerateTraefikMe": {
          const result = await client.get<boolean>("domain.canGenerateTraefikMeDomains", {
            ...(args.serverId && { serverId: args.serverId }),
          })
          return `Traefik.me: ${result ? "Available" : "Not available"}`
        }
        case "validate": {
          const result = await client.post<unknown>("domain.validateDomain", {
            domain: args.domain!,
            ...(args.serverIp && { serverIp: args.serverIp }),
          })
          return `# DNS Validation: ${args.domain}\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
        }
      }
    },
  })
}
