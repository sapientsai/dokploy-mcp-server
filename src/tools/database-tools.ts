import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { getDokployClient } from "../client/dokploy-client"
import type { DatabaseType, DokployDatabase } from "../types"
import { DB_ID_FIELDS, DB_TYPES } from "../types"
import { formatDatabase } from "../utils/formatters"

const dbTypeSchema = z.enum(DB_TYPES).describe("postgres, mysql, mariadb, mongo, or redis")

function dbIdField(dbType: DatabaseType): string {
  return DB_ID_FIELDS[dbType]
}

function dbBody(dbType: DatabaseType, databaseId: string): Record<string, unknown> {
  return { [dbIdField(dbType)]: databaseId }
}

const ACTIONS = [
  "create",
  "get",
  "update",
  "move",
  "start",
  "stop",
  "deploy",
  "rebuild",
  "remove",
  "reload",
  "changeStatus",
  "saveEnvironment",
  "saveExternalPort",
] as const

const SIMPLE_ACTIONS = ["start", "stop", "deploy", "rebuild", "remove"] as const
type SimpleAction = (typeof SIMPLE_ACTIONS)[number]

export function registerDatabaseTools(server: FastMCP) {
  server.addTool({
    name: "dokploy_database",
    description:
      "Manage databases (postgres/mysql/mariadb/mongo/redis). create: dbType+name+environmentId+databasePassword. get: dbType+databaseId. update: dbType+databaseId+fields. move: dbType+databaseId+targetEnvironmentId. start/stop/deploy/rebuild/remove: dbType+databaseId. reload: dbType+databaseId+appName. changeStatus: dbType+databaseId+applicationStatus. saveEnvironment: dbType+databaseId+env. saveExternalPort: dbType+databaseId+externalPort.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      dbType: dbTypeSchema,
      databaseId: z.string().optional(),
      name: z.string().optional(),
      environmentId: z.string().optional(),
      databaseName: z.string().optional(),
      databaseUser: z.string().optional(),
      databasePassword: z.string().optional(),
      databaseRootPassword: z.string().optional().describe("mysql/mariadb only"),
      dockerImage: z.string().optional(),
      description: z.string().optional(),
      serverId: z.string().optional(),
      command: z.string().optional(),
      memoryLimit: z.number().optional(),
      cpuLimit: z.number().optional(),
      targetEnvironmentId: z.string().optional(),
      appName: z.string().optional(),
      applicationStatus: z.string().optional().describe("idle, running, done, or error"),
      env: z.string().optional().describe("KEY=VALUE, newline separated"),
      externalPort: z.number().optional(),
    }),
    execute: async (args) => {
      const client = getDokployClient()
      const { dbType } = args

      switch (args.action) {
        case "create": {
          const body: Record<string, unknown> = {}
          const createFields = [
            "name",
            "environmentId",
            "databaseName",
            "databaseUser",
            "databasePassword",
            "databaseRootPassword",
            "dockerImage",
            "description",
            "serverId",
          ] as const
          for (const key of createFields) {
            if (args[key] !== undefined) body[key] = args[key]
          }
          const db = await client.post<DokployDatabase>(`${dbType}.create`, body)
          return `# Database Created\n\n${formatDatabase(db, dbType)}`
        }
        case "get": {
          const db = await client.get<DokployDatabase>(`${dbType}.one`, {
            [dbIdField(dbType)]: args.databaseId!,
          })
          return `# Database Details\n\n${formatDatabase(db, dbType)}`
        }
        case "update": {
          const body: Record<string, unknown> = { [dbIdField(dbType)]: args.databaseId! }
          const updateFields = ["name", "description", "dockerImage", "command", "memoryLimit", "cpuLimit"] as const
          for (const key of updateFields) {
            if (args[key] !== undefined) body[key] = args[key]
          }
          await client.post(`${dbType}.update`, body)
          return `Database ${args.databaseId} (${dbType}) updated.`
        }
        case "move": {
          await client.post(`${dbType}.move`, {
            ...dbBody(dbType, args.databaseId!),
            targetEnvironmentId: args.targetEnvironmentId!,
          })
          return `Database ${args.databaseId} moved to environment ${args.targetEnvironmentId}.`
        }
        case "start":
        case "stop":
        case "deploy":
        case "rebuild":
        case "remove": {
          await client.post(`${dbType}.${args.action satisfies SimpleAction}`, dbBody(dbType, args.databaseId!))
          return `Database ${args.databaseId} (${dbType}): ${args.action} completed.`
        }
        case "reload": {
          await client.post(`${dbType}.reload`, {
            ...dbBody(dbType, args.databaseId!),
            appName: args.appName!,
          })
          return `Database ${args.databaseId} (${dbType}) reloaded.`
        }
        case "changeStatus": {
          await client.post(`${dbType}.changeStatus`, {
            ...dbBody(dbType, args.databaseId!),
            applicationStatus: args.applicationStatus!,
          })
          return `Database ${args.databaseId} status changed to ${args.applicationStatus}.`
        }
        case "saveEnvironment": {
          await client.post(`${dbType}.saveEnvironment`, {
            ...dbBody(dbType, args.databaseId!),
            ...(args.env !== undefined && { env: args.env }),
          })
          return `Environment saved for database ${args.databaseId}.`
        }
        case "saveExternalPort": {
          await client.post(`${dbType}.saveExternalPort`, {
            ...dbBody(dbType, args.databaseId!),
            externalPort: args.externalPort!,
          })
          return `External port set to ${args.externalPort} for database ${args.databaseId}.`
        }
      }
    },
  })
}
