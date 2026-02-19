import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient, getOrganizationId } from "../client/dokploy-client"
import type { DokployCertificate, DokployPort, DokploySecurity } from "../types"

const ACTIONS = [
  "createPort",
  "deletePort",
  "createAuth",
  "deleteAuth",
  "listCerts",
  "getCert",
  "createCert",
  "removeCert",
] as const

export function registerInfrastructureTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_infrastructure",
    description:
      "Manage ports, auth, certs. createPort: applicationId+publishedPort+targetPort. deletePort: portId. createAuth: applicationId+username+password. deleteAuth: securityId. listCerts: all. getCert: certificateId. createCert: name+certificateData+privateKey. removeCert: certificateId.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      applicationId: z.string().optional(),
      publishedPort: z.number().optional(),
      targetPort: z.number().optional(),
      protocol: z.string().optional(),
      publishMode: z.string().optional(),
      portId: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      securityId: z.string().optional(),
      certificateId: z.string().optional(),
      name: z.string().optional(),
      certificateData: z.string().optional().describe("PEM format"),
      privateKey: z.string().optional().describe("PEM format"),
      autoRenew: z.boolean().optional(),
      serverId: z.string().optional(),
    }),
    execute: async (args) => {
      const client = getDokployClient()

      switch (args.action) {
        case "createPort": {
          const port = await client.post<DokployPort>("port.create", {
            applicationId: args.applicationId!,
            publishedPort: args.publishedPort!,
            targetPort: args.targetPort!,
            ...(args.protocol && { protocol: args.protocol }),
            ...(args.publishMode && { publishMode: args.publishMode }),
          })
          return `Port mapping created: ${port.publishedPort} -> ${port.targetPort} (ID: ${port.portId})`
        }
        case "deletePort": {
          await client.post("port.delete", { portId: args.portId! })
          return `Port mapping ${args.portId} deleted.`
        }
        case "createAuth": {
          const security = await client.post<DokploySecurity>("security.create", {
            applicationId: args.applicationId!,
            username: args.username!,
            password: args.password!,
          })
          return `Basic auth created for application ${args.applicationId} (ID: ${security.securityId})`
        }
        case "deleteAuth": {
          await client.post("security.delete", { securityId: args.securityId! })
          return `Security credentials ${args.securityId} deleted.`
        }
        case "listCerts": {
          const certs = await client.get<DokployCertificate[]>("certificates.all")
          if (certs.length === 0) return "No certificates found."
          const lines = certs.map(
            (c) => `- **${c.name}** (ID: ${c.certificateId}) | Auto-renew: ${c.autoRenew ?? "N/A"}`,
          )
          return `# Certificates (${certs.length})\n\n${lines.join("\n")}`
        }
        case "getCert": {
          const cert = await client.get<DokployCertificate>("certificates.one", {
            certificateId: args.certificateId!,
          })
          return `# Certificate: ${cert.name}\n\n- ID: ${cert.certificateId}\n- Auto-renew: ${cert.autoRenew ?? "N/A"}`
        }
        case "createCert": {
          const organizationId = await getOrganizationId()
          const body: Record<string, unknown> = {
            name: args.name!,
            certificateData: args.certificateData!,
            privateKey: args.privateKey!,
            organizationId,
          }
          if (args.autoRenew !== undefined) body.autoRenew = args.autoRenew
          if (args.serverId) body.serverId = args.serverId
          const cert = await client.post<DokployCertificate>("certificates.create", body)
          return `Certificate "${cert.name}" created (ID: ${cert.certificateId}).`
        }
        case "removeCert": {
          await client.post("certificates.remove", { certificateId: args.certificateId! })
          return `Certificate ${args.certificateId} removed.`
        }
      }
    },
  })
}
