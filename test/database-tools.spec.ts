import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerDatabaseTools } from "../src/tools/database-tools"
import { DB_ID_FIELDS, DB_TYPES } from "../src/types"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type DbArgs = {
  action: string
  dbType: (typeof DB_TYPES)[number]
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
}

const tool = captureTool<DbArgs>(registerDatabaseTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_database metadata", () => {
  it("registers with the expected name and action enum", () => {
    expect(tool.name).toBe("dokploy_database")
    expect(tool.description).toContain("Manage databases")
  })
})

describe("dokploy_database dispatch across DB types", () => {
  it.each(DB_TYPES)("create (%s) posts to {dbType}.create with only defined fields", async (dbType) => {
    postMock.mockReturnValueOnce(
      IO.succeed({
        databaseId: "new",
        name: "N",
        appName: "n",
        applicationStatus: "idle",
        environmentId: "env",
      }),
    )
    await tool.execute({
      action: "create",
      dbType,
      name: "N",
      environmentId: "env",
      databasePassword: "secret",
    })
    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith(`${dbType}.create`, {
      name: "N",
      environmentId: "env",
      databasePassword: "secret",
    })
  })

  it.each(DB_TYPES)("get (%s) calls {dbType}.one with {idField: databaseId}", async (dbType) => {
    getMock.mockReturnValueOnce(
      IO.succeed({
        databaseId: "db1",
        name: "N",
        appName: "n",
        applicationStatus: "running",
        environmentId: "env",
      }),
    )
    await tool.execute({ action: "get", dbType, databaseId: "db1" })
    expect(getMock).toHaveBeenCalledWith(`${dbType}.one`, { [DB_ID_FIELDS[dbType]]: "db1" })
  })

  it.each(DB_TYPES)("update (%s) posts only defined fields plus id", async (dbType) => {
    await tool.execute({
      action: "update",
      dbType,
      databaseId: "db1",
      name: "new-name",
      memoryLimit: 1024,
    })
    expect(postMock).toHaveBeenCalledWith(`${dbType}.update`, {
      [DB_ID_FIELDS[dbType]]: "db1",
      name: "new-name",
      memoryLimit: 1024,
    })
  })

  it.each(DB_TYPES)("move (%s) sends targetEnvironmentId", async (dbType) => {
    await tool.execute({
      action: "move",
      dbType,
      databaseId: "db1",
      targetEnvironmentId: "env-2",
    })
    expect(postMock).toHaveBeenCalledWith(`${dbType}.move`, {
      [DB_ID_FIELDS[dbType]]: "db1",
      targetEnvironmentId: "env-2",
    })
  })

  const simpleActions = ["start", "stop", "deploy", "rebuild", "remove"] as const
  for (const action of simpleActions) {
    it.each(DB_TYPES)(`${action} (%s) posts to {dbType}.${action} with just id`, async (dbType) => {
      await tool.execute({ action, dbType, databaseId: "db1" })
      expect(postMock).toHaveBeenCalledWith(`${dbType}.${action}`, { [DB_ID_FIELDS[dbType]]: "db1" })
    })
  }

  it.each(DB_TYPES)("reload (%s) includes appName", async (dbType) => {
    await tool.execute({ action: "reload", dbType, databaseId: "db1", appName: "my-app" })
    expect(postMock).toHaveBeenCalledWith(`${dbType}.reload`, {
      [DB_ID_FIELDS[dbType]]: "db1",
      appName: "my-app",
    })
  })

  it.each(DB_TYPES)("changeStatus (%s) sends applicationStatus", async (dbType) => {
    await tool.execute({
      action: "changeStatus",
      dbType,
      databaseId: "db1",
      applicationStatus: "error",
    })
    expect(postMock).toHaveBeenCalledWith(`${dbType}.changeStatus`, {
      [DB_ID_FIELDS[dbType]]: "db1",
      applicationStatus: "error",
    })
  })

  it.each(DB_TYPES)("saveEnvironment (%s) includes env only when provided", async (dbType) => {
    await tool.execute({
      action: "saveEnvironment",
      dbType,
      databaseId: "db1",
      env: "FOO=1",
    })
    expect(postMock).toHaveBeenLastCalledWith(`${dbType}.saveEnvironment`, {
      [DB_ID_FIELDS[dbType]]: "db1",
      env: "FOO=1",
    })

    await tool.execute({ action: "saveEnvironment", dbType, databaseId: "db1" })
    expect(postMock).toHaveBeenLastCalledWith(`${dbType}.saveEnvironment`, {
      [DB_ID_FIELDS[dbType]]: "db1",
    })
  })

  it.each(DB_TYPES)("saveExternalPort (%s) sends externalPort", async (dbType) => {
    await tool.execute({
      action: "saveExternalPort",
      dbType,
      databaseId: "db1",
      externalPort: 5432,
    })
    expect(postMock).toHaveBeenCalledWith(`${dbType}.saveExternalPort`, {
      [DB_ID_FIELDS[dbType]]: "db1",
      externalPort: 5432,
    })
  })
})

describe("dokploy_database return values", () => {
  it("create returns formatted markdown including type", async () => {
    postMock.mockReturnValueOnce(
      IO.succeed({
        databaseId: "db-1",
        name: "MyDB",
        appName: "my-db",
        applicationStatus: "idle",
        environmentId: "env",
      }),
    )
    const result = await tool.execute({
      action: "create",
      dbType: "postgres",
      name: "MyDB",
      environmentId: "env",
      databasePassword: "pw",
    })
    expect(result).toContain("Database Created")
    expect(result).toContain("MyDB")
    expect(result).toContain("Type: postgres")
  })

  it("simple action returns confirmation message", async () => {
    const result = await tool.execute({
      action: "start",
      dbType: "redis",
      databaseId: "db-9",
    })
    expect(result).toBe("Database db-9 (redis): start completed.")
  })

  it("move returns message naming target environment", async () => {
    const result = await tool.execute({
      action: "move",
      dbType: "mongo",
      databaseId: "db-9",
      targetEnvironmentId: "env-2",
    })
    expect(result).toBe("Database db-9 moved to environment env-2.")
  })
})
