import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient, getOrganizationId } from "../client/dokploy-client"
import type { DokploySshKey } from "../types"
import { formatSshKey, formatSshKeyList } from "../utils/formatters"

const ACTIONS = ["create", "list", "get", "update", "remove", "generate"] as const

export function registerSshKeyTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_ssh_key",
    description:
      "Manage SSH keys. create: name+privateKey+publicKey, description?. list: no params. get: sshKeyId. update: sshKeyId, name?, description?, lastUsedAt?. remove: sshKeyId. generate: type (rsa or ed25519).",
    parameters: z.object({
      action: z.enum(ACTIONS),
      sshKeyId: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      privateKey: z.string().optional(),
      publicKey: z.string().optional(),
      lastUsedAt: z.string().optional().describe("ISO date string for update action"),
      type: z.enum(["rsa", "ed25519"]).optional().describe("Key type for generate action"),
    }),
    execute: async (args) => {
      const client = getDokployClient()

      switch (args.action) {
        case "create": {
          const organizationId = await getOrganizationId()
          const sshKey = await client.post<DokploySshKey>("sshKey.create", {
            name: args.name!,
            privateKey: args.privateKey!,
            publicKey: args.publicKey!,
            organizationId,
            ...(args.description && { description: args.description }),
          })
          return `# SSH Key Created\n\n${formatSshKey(sshKey)}`
        }
        case "list": {
          const sshKeys = await client.get<DokploySshKey[]>("sshKey.all")
          return formatSshKeyList(sshKeys)
        }
        case "get": {
          const sshKey = await client.get<DokploySshKey>("sshKey.one", { sshKeyId: args.sshKeyId! })
          return `# SSH Key Details\n\n${formatSshKey(sshKey)}`
        }
        case "update": {
          const body: Record<string, unknown> = { sshKeyId: args.sshKeyId! }
          if (args.name !== undefined) body.name = args.name
          if (args.description !== undefined) body.description = args.description
          if (args.lastUsedAt !== undefined) body.lastUsedAt = args.lastUsedAt
          await client.post("sshKey.update", body)
          return `SSH key ${args.sshKeyId} updated.`
        }
        case "remove": {
          await client.post("sshKey.remove", { sshKeyId: args.sshKeyId! })
          return `SSH key ${args.sshKeyId} removed.`
        }
        case "generate": {
          const organizationId = await getOrganizationId()
          const result = await client.post<DokploySshKey>("sshKey.generate", {
            type: args.type ?? "ed25519",
            organizationId,
          })
          return `# SSH Key Generated\n\n${formatSshKey(result)}`
        }
      }
    },
  })
}
