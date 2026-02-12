import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployCertificate, DokployPort, DokploySecurity } from "../types"

export function registerInfrastructureTools(server: FastMCP) {
  // --- Port management ---

  server.addTool({
    name: "dokploy_port_create",
    description: "Create a port mapping for an application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
      publishedPort: z.number().describe("Published (external) port"),
      targetPort: z.number().describe("Target (container) port"),
      protocol: z.string().optional().describe("Protocol (tcp, udp)"),
      publishMode: z.string().optional().describe("Publish mode"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const port = await client.post<DokployPort>("port.create", {
        applicationId: args.applicationId,
        publishedPort: args.publishedPort,
        targetPort: args.targetPort,
        ...(args.protocol && { protocol: args.protocol }),
        ...(args.publishMode && { publishMode: args.publishMode }),
      })
      return `Port mapping created: ${port.publishedPort} -> ${port.targetPort} (ID: ${port.portId})`
    },
  })

  server.addTool({
    name: "dokploy_port_delete",
    description: "Delete a port mapping",
    parameters: z.object({
      portId: z.string().describe("The port mapping ID to delete"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("port.delete", { portId: args.portId })
      return `Port mapping ${args.portId} deleted.`
    },
  })

  // --- Security (basic auth) ---

  server.addTool({
    name: "dokploy_security_create",
    description: "Create basic auth credentials for an application",
    parameters: z.object({
      applicationId: z.string().describe("The application ID"),
      username: z.string().describe("Basic auth username"),
      password: z.string().describe("Basic auth password"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const security = await client.post<DokploySecurity>("security.create", {
        applicationId: args.applicationId,
        username: args.username,
        password: args.password,
      })
      return `Basic auth created for application ${args.applicationId} (ID: ${security.securityId})`
    },
  })

  server.addTool({
    name: "dokploy_security_delete",
    description: "Remove basic auth credentials",
    parameters: z.object({
      securityId: z.string().describe("The security credentials ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("security.delete", { securityId: args.securityId })
      return `Security credentials ${args.securityId} deleted.`
    },
  })

  // --- Certificates ---

  server.addTool({
    name: "dokploy_certificate_list",
    description: "List all SSL/TLS certificates",
    parameters: z.object({}),
    execute: async () => {
      const client = getDokployClient()
      const certs = await client.get<DokployCertificate[]>("certificates.all")
      if (certs.length === 0) return "No certificates found."
      const lines = certs.map((c) => `- **${c.name}** (ID: ${c.certificateId}) | Auto-renew: ${c.autoRenew ?? "N/A"}`)
      return `# Certificates (${certs.length})\n\n${lines.join("\n")}`
    },
  })

  server.addTool({
    name: "dokploy_certificate_get",
    description: "Get details for a specific certificate",
    parameters: z.object({
      certificateId: z.string().describe("The certificate ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const cert = await client.get<DokployCertificate>("certificates.one", {
        certificateId: args.certificateId,
      })
      return `# Certificate: ${cert.name}\n\n- ID: ${cert.certificateId}\n- Auto-renew: ${cert.autoRenew ?? "N/A"}`
    },
  })

  server.addTool({
    name: "dokploy_certificate_create",
    description: "Upload a new SSL/TLS certificate",
    parameters: z.object({
      name: z.string().describe("Certificate name"),
      certificateData: z.string().describe("Certificate data (PEM format)"),
      privateKey: z.string().describe("Private key (PEM format)"),
      organizationId: z.string().describe("Organization ID"),
      autoRenew: z.boolean().optional().describe("Enable auto-renewal"),
      serverId: z.string().optional().describe("Server ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const body: Record<string, unknown> = {
        name: args.name,
        certificateData: args.certificateData,
        privateKey: args.privateKey,
        organizationId: args.organizationId,
      }
      if (args.autoRenew !== undefined) body.autoRenew = args.autoRenew
      if (args.serverId) body.serverId = args.serverId
      const cert = await client.post<DokployCertificate>("certificates.create", body)
      return `Certificate "${cert.name}" created (ID: ${cert.certificateId}).`
    },
  })

  server.addTool({
    name: "dokploy_certificate_remove",
    description: "Remove an SSL/TLS certificate",
    parameters: z.object({
      certificateId: z.string().describe("The certificate ID to remove"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("certificates.remove", { certificateId: args.certificateId })
      return `Certificate ${args.certificateId} removed.`
    },
  })
}
