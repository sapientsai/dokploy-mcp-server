import type { IO } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { DokployAuditLog } from "../types"
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from "../types"
import { formatAuditLogList } from "../utils/formatters"
import { pickDefined } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = ["list"] as const

const AUDIT_QUERY_FIELDS = [
  "userId",
  "userEmail",
  "resourceName",
  "action",
  "resourceType",
  "from",
  "to",
  "limit",
  "offset",
] as const

type AuditLogArgs = {
  action: (typeof ACTIONS)[number]
  userId?: string
  userEmail?: string
  resourceName?: string
  auditAction?: (typeof AUDIT_ACTIONS)[number]
  resourceType?: (typeof AUDIT_RESOURCE_TYPES)[number]
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export function buildAuditLogProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: AuditLogArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("list", () => {
      // Rename our `auditAction` back to `action` at the wire boundary — the
      // Zod schema exposes `auditAction` so it doesn't collide with the top-level
      // `action` discriminator.
      const params = {
        ...pickDefined({ ...args, action: args.auditAction }, AUDIT_QUERY_FIELDS),
      } as Record<string, string | number | boolean | undefined>
      return client.get<DokployAuditLog[]>("auditLog.all", params).map(formatAuditLogList)
    })
    .exhaustive()
}

export function registerAuditLogTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_audit_log",
    description:
      "Read the Dokploy audit log with filters. Only action is 'list'. Filters (all optional): userId, userEmail, resourceName, auditAction (create|update|delete|deploy|cancel|redeploy|login|logout), resourceType (project|service|environment|deployment|user|customRole|domain|certificate|registry|server|sshKey|gitProvider|notification|settings|session), from/to (ISO timestamps), limit (default 50, max 500), offset. Note: the wire-level query parameter is called `action`; the MCP arg is `auditAction` to avoid clashing with the tool's action discriminator.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      userId: z.string().optional(),
      userEmail: z.string().optional(),
      resourceName: z.string().optional(),
      auditAction: z.enum(AUDIT_ACTIONS).optional().describe("Filter by audit action verb"),
      resourceType: z.enum(AUDIT_RESOURCE_TYPES).optional(),
      from: z.string().optional().describe("ISO-8601 start timestamp"),
      to: z.string().optional().describe("ISO-8601 end timestamp"),
      limit: z.number().int().min(1).max(500).optional(),
      offset: z.number().int().min(0).optional(),
    }),
    execute: async (args) => {
      const either = await buildAuditLogProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
