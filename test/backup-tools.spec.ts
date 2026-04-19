import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerBackupTools } from "../src/tools/backup-tools"
import { captureTool } from "./support/tool-harness"

const { getIOMock, postIOMock } = vi.hoisted(() => ({
  getIOMock: vi.fn(),
  postIOMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ getIO: getIOMock, postIO: postIOMock }),
}))

type BackupArgs = {
  action: string
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

const tool = captureTool<BackupArgs>(registerBackupTools)

beforeEach(() => {
  getIOMock.mockReset()
  postIOMock.mockReset()
  getIOMock.mockImplementation(() => IO.succeed(undefined))
  postIOMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_backup CRUD", () => {
  it("create posts only defined fields", async () => {
    postIOMock.mockReturnValueOnce(
      IO.succeed({
        backupId: "b1",
        schedule: "0 2 * * *",
        prefix: "daily",
        destinationId: "d",
        database: "mydb",
        databaseType: "postgres",
      }),
    )
    await tool.execute({
      action: "create",
      schedule: "0 2 * * *",
      prefix: "daily",
      destinationId: "d",
      database: "mydb",
      databaseType: "postgres",
      postgresId: "pg1",
    })
    expect(postIOMock).toHaveBeenCalledWith("backup.create", {
      schedule: "0 2 * * *",
      prefix: "daily",
      destinationId: "d",
      database: "mydb",
      databaseType: "postgres",
      postgresId: "pg1",
    })
  })

  it("get calls backup.one", async () => {
    getIOMock.mockReturnValueOnce(
      IO.succeed({
        backupId: "b1",
        schedule: "@daily",
        prefix: "p",
        destinationId: "d",
        database: "db",
        databaseType: "postgres",
      }),
    )
    await tool.execute({ action: "get", backupId: "b1" })
    expect(getIOMock).toHaveBeenCalledWith("backup.one", { backupId: "b1" })
  })

  it("update includes backupId plus only defined fields", async () => {
    await tool.execute({
      action: "update",
      backupId: "b1",
      schedule: "@hourly",
      enabled: false,
    })
    expect(postIOMock).toHaveBeenCalledWith("backup.update", {
      backupId: "b1",
      schedule: "@hourly",
      enabled: false,
    })
  })

  it("remove posts backup.remove", async () => {
    await tool.execute({ action: "remove", backupId: "b1" })
    expect(postIOMock).toHaveBeenCalledWith("backup.remove", { backupId: "b1" })
  })
})

describe("dokploy_backup listFiles", () => {
  it("calls backup.listBackupFiles with destination + optional params", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({
      action: "listFiles",
      destinationId: "d1",
      search: "2025",
      serverId: "srv-1",
    })
    expect(getIOMock).toHaveBeenCalledWith("backup.listBackupFiles", {
      destinationId: "d1",
      search: "2025",
      serverId: "srv-1",
    })
  })

  it("omits search/serverId when absent", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "listFiles", destinationId: "d1" })
    expect(getIOMock).toHaveBeenCalledWith("backup.listBackupFiles", { destinationId: "d1" })
  })
})

describe("dokploy_backup manualBackup", () => {
  it.each([
    ["postgres", "backup.manualBackupPostgres"],
    ["mysql", "backup.manualBackupMySql"],
    ["mariadb", "backup.manualBackupMariadb"],
    ["mongo", "backup.manualBackupMongo"],
    ["compose", "backup.manualBackupCompose"],
  ] as const)("backupType=%s hits %s", async (backupType, endpoint) => {
    await tool.execute({ action: "manualBackup", backupId: "b1", backupType })
    expect(postIOMock).toHaveBeenCalledWith(endpoint, { backupId: "b1" })
  })
})
