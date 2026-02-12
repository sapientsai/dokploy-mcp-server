import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployDomain } from "../types"
import { formatDomain, formatDomainList } from "../utils/formatters"

export function registerDomainTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_domain_create",
    description: "Create a domain for an application or compose service",
    parameters: z.object({
      host: z.string().describe("Domain hostname (e.g., app.example.com)"),
      applicationId: z.string().optional().describe("Application ID (for application domains)"),
      composeId: z.string().optional().describe("Compose service ID (for compose domains)"),
      serviceName: z.string().optional().describe("Service name within a compose service"),
      path: z.string().optional().describe("URL path prefix"),
      port: z.number().optional().describe("Target port"),
      https: z.boolean().optional().describe("Enable HTTPS"),
      certificateType: z.string().optional().describe("Certificate type (letsencrypt, none)"),
      domainType: z.string().optional().describe("Domain type"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const body: Record<string, unknown> = { host: args.host }
      for (const [key, value] of Object.entries(args)) {
        if (key !== "host" && value !== undefined) body[key] = value
      }
      const domain = await client.post<DokployDomain>("domain.create", body)
      return `# Domain Created\n\n${formatDomain(domain)}`
    },
  })

  server.addTool({
    name: "dokploy_domain_listByApplication",
    description: "List all domains for an application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const domains = await client.get<DokployDomain[]>("domain.byApplicationId", {
        applicationId: args.applicationId,
      })
      return formatDomainList(domains)
    },
  })

  server.addTool({
    name: "dokploy_domain_listByCompose",
    description: "List all domains for a Docker Compose service",
    parameters: z.object({
      composeId: z.string().describe("The compose service ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const domains = await client.get<DokployDomain[]>("domain.byComposeId", { composeId: args.composeId })
      return formatDomainList(domains)
    },
  })

  server.addTool({
    name: "dokploy_domain_get",
    description: "Get details for a specific domain",
    parameters: z.object({
      domainId: z.string().describe("The domain ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const domain = await client.get<DokployDomain>("domain.one", { domainId: args.domainId })
      return `# Domain Details\n\n${formatDomain(domain)}`
    },
  })

  server.addTool({
    name: "dokploy_domain_update",
    description: "Update a domain's configuration",
    parameters: z.object({
      domainId: z.string().describe("The domain ID"),
      host: z.string().describe("Domain hostname"),
      path: z.string().optional().describe("URL path prefix"),
      port: z.number().optional().describe("Target port"),
      https: z.boolean().optional().describe("Enable HTTPS"),
      certificateType: z.string().optional().describe("Certificate type"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const body: Record<string, unknown> = { domainId: args.domainId, host: args.host }
      for (const [key, value] of Object.entries(args)) {
        if (key !== "domainId" && key !== "host" && value !== undefined) body[key] = value
      }
      await client.post("domain.update", body)
      return `Domain ${args.domainId} updated.`
    },
  })

  server.addTool({
    name: "dokploy_domain_delete",
    description: "Delete a domain",
    parameters: z.object({
      domainId: z.string().describe("The domain ID to delete"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("domain.delete", { domainId: args.domainId })
      return `Domain ${args.domainId} deleted.`
    },
  })

  server.addTool({
    name: "dokploy_domain_generateDomain",
    description: "Auto-generate a domain for an application (e.g., using traefik.me)",
    parameters: z.object({
      appName: z.string().describe("The internal application name"),
      serverId: z.string().optional().describe("Server ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const result = await client.post<unknown>("domain.generateDomain", {
        appName: args.appName,
        ...(args.serverId && { serverId: args.serverId }),
      })
      return `# Generated Domain\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
    },
  })

  server.addTool({
    name: "dokploy_domain_canGenerateTraefikMe",
    description: "Check if traefik.me domains can be generated for a server",
    parameters: z.object({
      serverId: z.string().optional().describe("Server ID to check"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const result = await client.get<boolean>("domain.canGenerateTraefikMeDomains", {
        ...(args.serverId && { serverId: args.serverId }),
      })
      return `Traefik.me domain generation: ${result ? "Available" : "Not available"}`
    },
  })

  server.addTool({
    name: "dokploy_domain_validate",
    description: "Validate that a domain's DNS is properly configured",
    parameters: z.object({
      domain: z.string().describe("The domain to validate"),
      serverIp: z.string().optional().describe("Expected server IP"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const result = await client.post<unknown>("domain.validateDomain", {
        domain: args.domain,
        ...(args.serverIp && { serverIp: args.serverIp }),
      })
      return `# Domain Validation: ${args.domain}\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
    },
  })
}
