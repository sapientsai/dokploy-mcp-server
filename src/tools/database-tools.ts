import type { IO } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { RequestBody } from "../generated"
import type { DatabaseType, DokployDatabase } from "../types"
import { DB_ID_FIELDS, DB_TYPES } from "../types"
import { formatDatabase } from "../utils/formatters"
import { pickDefined } from "./tool-utils"
import type { ToolServer } from "./types"

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

const CREATE_FIELDS = [
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

const LIBSQL_CREATE_FIELDS = [
  "name",
  "appName",
  "dockerImage",
  "environmentId",
  "description",
  "databaseUser",
  "databasePassword",
  "sqldNode",
  "sqldPrimaryUrl",
  "enableNamespaces",
  "serverId",
] as const

const UPDATE_FIELDS = ["name", "description", "dockerImage", "command", "memoryLimit", "cpuLimit"] as const

type DatabaseArgs = {
  action: (typeof ACTIONS)[number]
  dbType: DatabaseType
  databaseId?: string
  name?: string
  environmentId?: string
  databaseName?: string
  databaseUser?: string
  databasePassword?: string
  databaseRootPassword?: string
  dockerImage?: string
  description?: string
  serverId?: string
  command?: string
  memoryLimit?: number
  cpuLimit?: number
  targetEnvironmentId?: string
  appName?: string
  applicationStatus?: string
  env?: string
  externalPort?: number
  externalGRPCPort?: number
  externalAdminPort?: number
  sqldNode?: "primary" | "replica"
  sqldPrimaryUrl?: string | null
  enableNamespaces?: boolean
}

function dbBody(dbType: DatabaseType, databaseId: string): Record<string, unknown> {
  return { [DB_ID_FIELDS[dbType]]: databaseId }
}

export function buildDatabaseProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: DatabaseArgs,
): IO<never, ApiError, string> {
  const { dbType } = args
  return Match(args.action)
    .case("create", () => {
      const fields = dbType === "libsql" ? LIBSQL_CREATE_FIELDS : CREATE_FIELDS
      const body =
        dbType === "libsql"
          ? { enableNamespaces: args.enableNamespaces ?? false, ...pickDefined(args, fields) }
          : pickDefined(args, fields)
      return client
        .post<DokployDatabase>(`${dbType}.create`, body)
        .map((db) => `# Database Created\n\n${formatDatabase(db, dbType)}`)
    })
    .case("get", () =>
      client
        .get<DokployDatabase>(`${dbType}.one`, dbBody(dbType, args.databaseId!) as Record<string, string>)
        .map((db) => `# Database Details\n\n${formatDatabase(db, dbType)}`),
    )
    .case("update", () => {
      const body = { ...dbBody(dbType, args.databaseId!), ...pickDefined(args, UPDATE_FIELDS) }
      return client
        .post<unknown>(`${dbType}.update`, body as RequestBody<"postgres-update">)
        .map(() => `Database ${args.databaseId} (${dbType}) updated.`)
    })
    .case("move", () =>
      client
        .post<unknown>(`${dbType}.move`, {
          ...dbBody(dbType, args.databaseId!),
          targetEnvironmentId: args.targetEnvironmentId!,
        })
        .map(() => `Database ${args.databaseId} moved to environment ${args.targetEnvironmentId}.`),
    )
    .case("start", () =>
      client
        .post<unknown>(`${dbType}.start`, dbBody(dbType, args.databaseId!))
        .map(() => `Database ${args.databaseId} (${dbType}): start completed.`),
    )
    .case("stop", () =>
      client
        .post<unknown>(`${dbType}.stop`, dbBody(dbType, args.databaseId!))
        .map(() => `Database ${args.databaseId} (${dbType}): stop completed.`),
    )
    .case("deploy", () =>
      client
        .post<unknown>(`${dbType}.deploy`, dbBody(dbType, args.databaseId!))
        .map(() => `Database ${args.databaseId} (${dbType}): deploy completed.`),
    )
    .case("rebuild", () =>
      client
        .post<unknown>(`${dbType}.rebuild`, dbBody(dbType, args.databaseId!))
        .map(() => `Database ${args.databaseId} (${dbType}): rebuild completed.`),
    )
    .case("remove", () =>
      client
        .post<unknown>(`${dbType}.remove`, dbBody(dbType, args.databaseId!))
        .map(() => `Database ${args.databaseId} (${dbType}): remove completed.`),
    )
    .case("reload", () =>
      client
        .post<unknown>(`${dbType}.reload`, {
          ...dbBody(dbType, args.databaseId!),
          appName: args.appName!,
        })
        .map(() => `Database ${args.databaseId} (${dbType}) reloaded.`),
    )
    .case("changeStatus", () =>
      client
        .post<unknown>(`${dbType}.changeStatus`, {
          ...dbBody(dbType, args.databaseId!),
          applicationStatus: args.applicationStatus!,
        })
        .map(() => `Database ${args.databaseId} status changed to ${args.applicationStatus}.`),
    )
    .case("saveEnvironment", () => {
      const body: Record<string, unknown> = dbBody(dbType, args.databaseId!)
      if (args.env !== undefined) body.env = args.env
      return client
        .post<unknown>(`${dbType}.saveEnvironment`, body)
        .map(() => `Environment saved for database ${args.databaseId}.`)
    })
    .case("saveExternalPort", () => {
      // libsql exposes three port endpoints via a single saveExternalPorts (plural) call.
      if (dbType === "libsql") {
        const body: Record<string, unknown> = dbBody(dbType, args.databaseId!)
        if (args.externalPort !== undefined) body.externalPort = args.externalPort
        if (args.externalGRPCPort !== undefined) body.externalGRPCPort = args.externalGRPCPort
        if (args.externalAdminPort !== undefined) body.externalAdminPort = args.externalAdminPort
        return client
          .post<unknown>("libsql.saveExternalPorts", body)
          .map(() => `External ports updated for libsql database ${args.databaseId}.`)
      }
      return client
        .post<unknown>(`${dbType}.saveExternalPort`, {
          ...dbBody(dbType, args.databaseId!),
          externalPort: args.externalPort!,
        })
        .map(() => `External port set to ${args.externalPort} for database ${args.databaseId}.`)
    })
    .exhaustive()
}

export function registerDatabaseTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_database",
    description:
      "Manage databases (postgres/mysql/mariadb/mongo/redis/libsql). create: dbType+name+environmentId+databasePassword (libsql additionally requires appName+dockerImage+sqldNode, accepts sqldPrimaryUrl+enableNamespaces). get: dbType+databaseId. update: dbType+databaseId+fields. move: dbType+databaseId+targetEnvironmentId. start/stop/deploy/rebuild/remove: dbType+databaseId. reload: dbType+databaseId+appName. changeStatus: dbType+databaseId+applicationStatus. saveEnvironment: dbType+databaseId+env. saveExternalPort: dbType+databaseId+externalPort (libsql also accepts externalGRPCPort/externalAdminPort).",
    parameters: z.object({
      action: z.enum(ACTIONS),
      dbType: z.enum(DB_TYPES).describe("postgres, mysql, mariadb, mongo, redis, or libsql"),
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
      env: z
        .string()
        .optional()
        .describe(
          "Environment variables as KEY=VALUE pairs, one per line. Example: 'DB_HOST=localhost\\nDB_PORT=5432'",
        ),
      externalPort: z.number().optional(),
      externalGRPCPort: z.number().optional().describe("libsql only"),
      externalAdminPort: z.number().optional().describe("libsql only"),
      sqldNode: z.enum(["primary", "replica"]).optional().describe("libsql sqld role"),
      sqldPrimaryUrl: z.string().nullable().optional().describe("libsql replica primary URL"),
      enableNamespaces: z.boolean().optional().describe("libsql multi-tenant namespaces"),
    }),
    execute: async (args) => {
      const either = await buildDatabaseProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
