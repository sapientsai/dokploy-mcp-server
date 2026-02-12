import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DatabaseType, DokployDatabase } from "../types"
import { DB_ID_FIELDS, DB_TYPES } from "../types"
import { formatDatabase } from "../utils/formatters"

const dbTypeSchema = z.enum(DB_TYPES).describe("Database type (postgres, mysql, mariadb, mongo, redis)")

function dbIdField(dbType: DatabaseType): string {
  return DB_ID_FIELDS[dbType]
}

function dbBody(dbType: DatabaseType, databaseId: string): Record<string, unknown> {
  return { [dbIdField(dbType)]: databaseId }
}

export function registerDatabaseTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_database_create",
    description:
      "Create a new database service (supports postgres, mysql, mariadb, mongo, redis). " +
      "Required fields vary by type: all need name + environmentId, relational DBs need databaseName/User/Password, " +
      "redis needs databasePassword, mongo needs databaseUser/Password.",
    parameters: z.object({
      dbType: dbTypeSchema,
      name: z.string().describe("Database service name"),
      environmentId: z.string().describe("Environment ID"),
      databaseName: z.string().optional().describe("Database name (required for postgres, mysql, mariadb)"),
      databaseUser: z.string().optional().describe("Database user (required for postgres, mysql, mariadb, mongo)"),
      databasePassword: z.string().optional().describe("Database password (required for all types)"),
      databaseRootPassword: z.string().optional().describe("Root password (optional, mysql/mariadb only)"),
      dockerImage: z.string().optional().describe("Custom Docker image"),
      description: z.string().optional().describe("Description"),
      serverId: z.string().optional().describe("Server ID for remote deployment"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const { dbType, ...rest } = args
      const body: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) body[key] = value
      }
      const db = await client.post<DokployDatabase>(`${dbType}.create`, body)
      return `# Database Created\n\n${formatDatabase(db, dbType)}`
    },
  })

  server.addTool({
    name: "dokploy_database_get",
    description: "Get details for a database service",
    parameters: z.object({
      dbType: dbTypeSchema,
      databaseId: z.string().describe("The database ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const db = await client.get<DokployDatabase>(`${args.dbType}.one`, {
        [dbIdField(args.dbType)]: args.databaseId,
      })
      return `# Database Details\n\n${formatDatabase(db, args.dbType)}`
    },
  })

  server.addTool({
    name: "dokploy_database_deploy",
    description: "Deploy a database service",
    parameters: z.object({
      dbType: dbTypeSchema,
      databaseId: z.string().describe("The database ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post(`${args.dbType}.deploy`, dbBody(args.dbType, args.databaseId))
      return `Database ${args.databaseId} (${args.dbType}) deployment triggered.`
    },
  })

  server.addTool({
    name: "dokploy_database_start",
    description: "Start a stopped database service",
    parameters: z.object({
      dbType: dbTypeSchema,
      databaseId: z.string().describe("The database ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post(`${args.dbType}.start`, dbBody(args.dbType, args.databaseId))
      return `Database ${args.databaseId} (${args.dbType}) started.`
    },
  })

  server.addTool({
    name: "dokploy_database_stop",
    description: "Stop a running database service",
    parameters: z.object({
      dbType: dbTypeSchema,
      databaseId: z.string().describe("The database ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post(`${args.dbType}.stop`, dbBody(args.dbType, args.databaseId))
      return `Database ${args.databaseId} (${args.dbType}) stopped.`
    },
  })

  server.addTool({
    name: "dokploy_database_remove",
    description: "Remove a database service",
    parameters: z.object({
      dbType: dbTypeSchema,
      databaseId: z.string().describe("The database ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post(`${args.dbType}.remove`, dbBody(args.dbType, args.databaseId))
      return `Database ${args.databaseId} (${args.dbType}) removed.`
    },
  })

  server.addTool({
    name: "dokploy_database_reload",
    description: "Reload a database service",
    parameters: z.object({
      dbType: dbTypeSchema,
      databaseId: z.string().describe("The database ID"),
      appName: z.string().describe("The internal app name"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post(`${args.dbType}.reload`, {
        ...dbBody(args.dbType, args.databaseId),
        appName: args.appName,
      })
      return `Database ${args.databaseId} (${args.dbType}) reloaded.`
    },
  })

  server.addTool({
    name: "dokploy_database_update",
    description: "Update database service configuration (name, image, resources, etc.)",
    parameters: z.object({
      dbType: dbTypeSchema,
      databaseId: z.string().describe("The database ID"),
      name: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
      dockerImage: z.string().optional().describe("Docker image"),
      command: z.string().optional().describe("Custom command"),
      memoryLimit: z.number().optional().describe("Memory limit in MB"),
      cpuLimit: z.number().optional().describe("CPU limit"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const { dbType, databaseId, ...updates } = args
      const body: Record<string, unknown> = { [dbIdField(dbType)]: databaseId }
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) body[key] = value
      }
      await client.post(`${dbType}.update`, body)
      return `Database ${databaseId} (${dbType}) updated.`
    },
  })

  server.addTool({
    name: "dokploy_database_rebuild",
    description: "Rebuild a database service container",
    parameters: z.object({
      dbType: dbTypeSchema,
      databaseId: z.string().describe("The database ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post(`${args.dbType}.rebuild`, dbBody(args.dbType, args.databaseId))
      return `Database ${args.databaseId} (${args.dbType}) rebuild triggered.`
    },
  })

  server.addTool({
    name: "dokploy_database_move",
    description: "Move a database service to a different environment",
    parameters: z.object({
      dbType: dbTypeSchema,
      databaseId: z.string().describe("The database ID"),
      targetEnvironmentId: z.string().describe("Target environment ID"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post(`${args.dbType}.move`, {
        ...dbBody(args.dbType, args.databaseId),
        targetEnvironmentId: args.targetEnvironmentId,
      })
      return `Database ${args.databaseId} (${args.dbType}) moved to environment ${args.targetEnvironmentId}.`
    },
  })

  server.addTool({
    name: "dokploy_database_changeStatus",
    description: "Change the application status of a database service",
    parameters: z.object({
      dbType: dbTypeSchema,
      databaseId: z.string().describe("The database ID"),
      applicationStatus: z.string().describe("New status (idle, running, done, error)"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post(`${args.dbType}.changeStatus`, {
        ...dbBody(args.dbType, args.databaseId),
        applicationStatus: args.applicationStatus,
      })
      return `Database ${args.databaseId} (${args.dbType}) status changed to ${args.applicationStatus}.`
    },
  })

  server.addTool({
    name: "dokploy_database_saveEnvironment",
    description: "Save environment variables for a database service",
    parameters: z.object({
      dbType: dbTypeSchema,
      databaseId: z.string().describe("The database ID"),
      env: z.string().optional().describe("Environment variables (KEY=VALUE, newline separated)"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post(`${args.dbType}.saveEnvironment`, {
        ...dbBody(args.dbType, args.databaseId),
        ...(args.env !== undefined && { env: args.env }),
      })
      return `Environment saved for database ${args.databaseId} (${args.dbType}).`
    },
  })

  server.addTool({
    name: "dokploy_database_saveExternalPort",
    description: "Set or update the external port for a database service",
    parameters: z.object({
      dbType: dbTypeSchema,
      databaseId: z.string().describe("The database ID"),
      externalPort: z.number().describe("External port number"),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      await client.post(`${args.dbType}.saveExternalPort`, {
        ...dbBody(args.dbType, args.databaseId),
        externalPort: args.externalPort,
      })
      return `External port set to ${args.externalPort} for database ${args.databaseId} (${args.dbType}).`
    },
  })
}
