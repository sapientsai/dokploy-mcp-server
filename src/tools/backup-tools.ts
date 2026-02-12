import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployBackup } from "../types"
import { formatBackup } from "../utils/formatters"

const ACTIONS = ["create", "get", "update", "remove", "listFiles", "manualBackup"] as const

export function registerBackupTools(server: FastMCP) {
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
      const client = getDokployClient()

      switch (args.action) {
        case "create": {
          const body: Record<string, unknown> = {}
          const fields = [
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
          for (const key of fields) {
            if (args[key] !== undefined) body[key] = args[key]
          }
          const backup = await client.post<DokployBackup>("backup.create", body)
          return `# Backup Created\n\n${formatBackup(backup)}`
        }
        case "get": {
          const backup = await client.get<DokployBackup>("backup.one", { backupId: args.backupId! })
          return `# Backup Details\n\n${formatBackup(backup)}`
        }
        case "update": {
          const body: Record<string, unknown> = {}
          const fields = [
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
          for (const key of fields) {
            if (args[key] !== undefined) body[key] = args[key]
          }
          await client.post("backup.update", body)
          return `Backup ${args.backupId} updated.`
        }
        case "remove": {
          await client.post("backup.remove", { backupId: args.backupId! })
          return `Backup ${args.backupId} removed.`
        }
        case "listFiles": {
          const files = await client.get<unknown>("backup.listBackupFiles", {
            destinationId: args.destinationId!,
            ...(args.search && { search: args.search }),
            ...(args.serverId && { serverId: args.serverId }),
          })
          return `# Backup Files\n\n\`\`\`json\n${JSON.stringify(files, null, 2)}\n\`\`\``
        }
        case "manualBackup": {
          const endpointMap: Record<string, string> = {
            postgres: "backup.manualBackupPostgres",
            mysql: "backup.manualBackupMySql",
            mariadb: "backup.manualBackupMariadb",
            mongo: "backup.manualBackupMongo",
            compose: "backup.manualBackupCompose",
          }
          const endpoint = endpointMap[args.backupType!]
          await client.post(endpoint, { backupId: args.backupId! })
          return `Manual ${args.backupType} backup triggered for backup config ${args.backupId}.`
        }
      }
    },
  })
}
