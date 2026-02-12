import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DokployBackup } from "../types"
import { formatBackup } from "../utils/formatters"

export function registerBackupTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_backup_create",
    description: "Create a scheduled backup for a database or compose service",
    parameters: z.object({
      schedule: z.string().describe("Cron schedule expression (e.g., '0 2 * * *' for daily at 2AM)"),
      prefix: z.string().describe("Backup file prefix"),
      destinationId: z.string().describe("Backup destination ID"),
      database: z.string().describe("Database name to backup"),
      databaseType: z.string().describe("Database type (postgres, mysql, mariadb, mongo)"),
      enabled: z.boolean().optional().describe("Whether the backup is enabled"),
      keepLatestCount: z.number().optional().describe("Number of backups to keep"),
      postgresId: z.string().optional().describe("Postgres database ID"),
      mysqlId: z.string().optional().describe("MySQL database ID"),
      mariadbId: z.string().optional().describe("MariaDB database ID"),
      mongoId: z.string().optional().describe("MongoDB database ID"),
      composeId: z.string().optional().describe("Compose service ID (for compose backups)"),
      serviceName: z.string().optional().describe("Service name within compose"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const body: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(args)) {
        if (value !== undefined) body[key] = value
      }
      const backup = await client.post<DokployBackup>("backup.create", body)
      return `# Backup Created\n\n${formatBackup(backup)}`
    },
  })

  server.addTool({
    name: "dokploy_backup_get",
    description: "Get details for a backup configuration",
    parameters: z.object({
      backupId: z.string().describe("The backup ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const backup = await client.get<DokployBackup>("backup.one", { backupId: args.backupId })
      return `# Backup Details\n\n${formatBackup(backup)}`
    },
  })

  server.addTool({
    name: "dokploy_backup_update",
    description: "Update a backup configuration",
    parameters: z.object({
      backupId: z.string().describe("The backup ID"),
      schedule: z.string().describe("Cron schedule"),
      prefix: z.string().describe("Backup file prefix"),
      destinationId: z.string().describe("Destination ID"),
      database: z.string().describe("Database name"),
      serviceName: z.string().describe("Service name"),
      databaseType: z.string().describe("Database type"),
      enabled: z.boolean().optional().describe("Enable/disable"),
      keepLatestCount: z.number().optional().describe("Number of backups to keep"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const body: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(args)) {
        if (value !== undefined) body[key] = value
      }
      await client.post("backup.update", body)
      return `Backup ${args.backupId} updated.`
    },
  })

  server.addTool({
    name: "dokploy_backup_remove",
    description: "Remove a backup configuration",
    parameters: z.object({
      backupId: z.string().describe("The backup ID to remove"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post("backup.remove", { backupId: args.backupId })
      return `Backup ${args.backupId} removed.`
    },
  })

  server.addTool({
    name: "dokploy_backup_listFiles",
    description: "List available backup files for a destination",
    parameters: z.object({
      destinationId: z.string().describe("The backup destination ID"),
      search: z.string().optional().describe("Search filter"),
      serverId: z.string().optional().describe("Server ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const files = await client.get<unknown>("backup.listBackupFiles", {
        destinationId: args.destinationId,
        ...(args.search && { search: args.search }),
        ...(args.serverId && { serverId: args.serverId }),
      })
      return `# Backup Files\n\n\`\`\`json\n${JSON.stringify(files, null, 2)}\n\`\`\``
    },
  })

  server.addTool({
    name: "dokploy_backup_manualBackup",
    description:
      "Trigger a manual backup immediately. Works for postgres, mysql, mariadb, mongo, and compose services.",
    parameters: z.object({
      backupId: z.string().describe("The backup configuration ID to trigger"),
      backupType: z.enum(["postgres", "mysql", "mariadb", "mongo", "compose"]).describe("Type of backup to trigger"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const endpointMap: Record<string, string> = {
        postgres: "backup.manualBackupPostgres",
        mysql: "backup.manualBackupMySql",
        mariadb: "backup.manualBackupMariadb",
        mongo: "backup.manualBackupMongo",
        compose: "backup.manualBackupCompose",
      }
      const endpoint = endpointMap[args.backupType]
      await client.post(endpoint, { backupId: args.backupId })
      return `Manual ${args.backupType} backup triggered for backup config ${args.backupId}.`
    },
  })
}
