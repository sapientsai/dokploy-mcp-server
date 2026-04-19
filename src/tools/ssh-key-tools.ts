import type { IO as IOType } from "functype"
import { IO, Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient, getOrganizationId } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError, NetworkError } from "../client/errors"
import type { DokploySshKey } from "../types"
import { formatSshKey, formatSshKeyList } from "../utils/formatters"
import type { ToolServer } from "./types"

const ACTIONS = ["create", "list", "get", "update", "remove", "generate"] as const

type SshKeyArgs = {
  action: (typeof ACTIONS)[number]
  sshKeyId?: string
  name?: string
  description?: string
  privateKey?: string
  publicKey?: string
  lastUsedAt?: string
  type?: "rsa" | "ed25519"
}

function resolveOrganizationIdIO(resolve: () => Promise<string>): IOType<never, ApiError, string> {
  return IO.tryPromise({
    try: resolve,
    catch: (cause): ApiError => NetworkError("GET", "organizationId", cause),
  })
}

export function buildSshKeyProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: SshKeyArgs,
  resolveOrganizationId: () => Promise<string> = getOrganizationId,
): IOType<never, ApiError, string> {
  return Match(args.action)
    .case("create", () =>
      resolveOrganizationIdIO(resolveOrganizationId).flatMap((organizationId) =>
        client
          .post<DokploySshKey>("sshKey.create", {
            name: args.name!,
            privateKey: args.privateKey!,
            publicKey: args.publicKey!,
            organizationId,
            ...(args.description && { description: args.description }),
          })
          .map((sshKey) => `# SSH Key Created\n\n${formatSshKey(sshKey)}`),
      ),
    )
    .case("list", () => client.get<DokploySshKey[]>("sshKey.all").map(formatSshKeyList))
    .case("get", () =>
      client
        .get<DokploySshKey>("sshKey.one", { sshKeyId: args.sshKeyId! })
        .map((sshKey) => `# SSH Key Details\n\n${formatSshKey(sshKey)}`),
    )
    .case("update", () => {
      const body: Record<string, unknown> = { sshKeyId: args.sshKeyId! }
      if (args.name !== undefined) body.name = args.name
      if (args.description !== undefined) body.description = args.description
      if (args.lastUsedAt !== undefined) body.lastUsedAt = args.lastUsedAt
      return client.post<unknown>("sshKey.update", body).map(() => `SSH key ${args.sshKeyId} updated.`)
    })
    .case("remove", () =>
      client
        .post<unknown>("sshKey.remove", { sshKeyId: args.sshKeyId! })
        .map(() => `SSH key ${args.sshKeyId} removed.`),
    )
    .case("generate", () =>
      resolveOrganizationIdIO(resolveOrganizationId).flatMap((organizationId) =>
        client
          .post<DokploySshKey>("sshKey.generate", {
            type: args.type ?? "ed25519",
            organizationId,
          })
          .map((sshKey) => `# SSH Key Generated\n\n${formatSshKey(sshKey)}`),
      ),
    )
    .exhaustive()
}

export function registerSshKeyTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_ssh_key",
    description:
      "Manage SSH keys. create: name+privateKey+publicKey, description?. list: no params. get: sshKeyId. update: sshKeyId, name?, description?, lastUsedAt?. remove: sshKeyId. generate: type (rsa or ed25519). Note: organizationId is resolved automatically from the API key.",
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
      const either = await buildSshKeyProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
