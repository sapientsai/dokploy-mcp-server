import type { IO as IOType } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { RequestBody } from "../generated"
import type { DokployBackup } from "../types"
import { formatBackup } from "../utils/formatters"
import { pickDefined } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = ["create", "get", "update", "remove", "listFiles", "manualBackup"] as const

const CREATE_FIELDS = [
  "schedule",
  "prefix",
  "destinationId",
  "database",
  "databaseType",
  "enabled",
  "keepLatestCount",
  "postgresId",
  "mysqlId",
  "mariadbId",
  "mongoId",
  "composeId",
  "serviceName",
] as const

const UPDATE_FIELDS = [
  "backupId",
  "schedule",
  "prefix",
  "destinationId",
  "database",
  "serviceName",
  "databaseType",
  "enabled",
  "keepLatestCount",
] as const

type BackupArgs = {
  action: (typeof ACTIONS)[number]
  backupId?: string
  schedule?: string
  prefix?: string
  destinationId?: string
  database?: string
  databaseType?: string
  serviceName?: string
  enabled?: boolean
  keepLatestCount?: number
  postgresId?: string
  mysqlId?: string
  mariadbId?: string
  mongoId?: string
  composeId?: string
  backupType?: "postgres" | "mysql" | "mariadb" | "mongo" | "compose"
  search?: string
  serverId?: string
}

const MANUAL_BACKUP_ENDPOINTS: Record<NonNullable<BackupArgs["backupType"]>, string> = {
  postgres: "backup.manualBackupPostgres",
  mysql: "backup.manualBackupMySql",
  mariadb: "backup.manualBackupMariadb",
  mongo: "backup.manualBackupMongo",
  compose: "backup.manualBackupCompose",
}

export function buildBackupProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: BackupArgs,
): IOType<never, ApiError, string> {
  return Match(args.action)
    .case("create", () =>
      client
        .post<DokployBackup>("backup.create", pickDefined(args, CREATE_FIELDS))
        .map((backup) => `# Backup Created\n\n${formatBackup(backup)}`),
    )
    .case("get", () =>
      client
        .get<DokployBackup>("backup.one", { backupId: args.backupId! })
        .map((backup) => `# Backup Details\n\n${formatBackup(backup)}`),
    )
    .case("update", () =>
      client
        .post<unknown>("backup.update", pickDefined(args, UPDATE_FIELDS))
        .map(() => `Backup ${args.backupId} updated.`),
    )
    .case("remove", () =>
      client
        .post<unknown>("backup.remove", { backupId: args.backupId! } satisfies RequestBody<"backup-remove">)
        .map(() => `Backup ${args.backupId} removed.`),
    )
    .case("listFiles", () => {
      const params: Record<string, string> = { destinationId: args.destinationId! }
      if (args.search) params.search = args.search
      if (args.serverId) params.serverId = args.serverId
      return client
        .get<unknown>("backup.listBackupFiles", params)
        .map((files) => `# Backup Files\n\n\`\`\`json\n${JSON.stringify(files, null, 2)}\n\`\`\``)
    })
    .case("manualBackup", () =>
      client
        .post<unknown>(MANUAL_BACKUP_ENDPOINTS[args.backupType!], { backupId: args.backupId! })
        .map(() => `Manual ${args.backupType} backup triggered for backup config ${args.backupId}.`),
    )
    .exhaustive()
}

export function registerBackupTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_backup",
    description:
      "Manage backups. create: schedule+prefix+destinationId+database+databaseType. get: backupId. update: backupId+fields. remove: backupId. listFiles: destinationId. manualBackup: backupId+backupType.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      backupId: z.string().optional(),
      schedule: z.string().optional().describe("Cron expression"),
      prefix: z.string().optional(),
      destinationId: z.string().optional(),
      database: z.string().optional(),
      databaseType: z.string().optional().describe("postgres, mysql, mariadb, or mongo"),
      serviceName: z.string().optional(),
      enabled: z.boolean().optional(),
      keepLatestCount: z.number().optional(),
      postgresId: z.string().optional(),
      mysqlId: z.string().optional(),
      mariadbId: z.string().optional(),
      mongoId: z.string().optional(),
      composeId: z.string().optional(),
      backupType: z.enum(["postgres", "mysql", "mariadb", "mongo", "compose"]).optional(),
      search: z.string().optional(),
      serverId: z.string().optional(),
    }),
    execute: async (args) => {
      const either = await buildBackupProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
