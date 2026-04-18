import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerBackupTools } from "../src/tools/backup-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
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
  getMock.mockReset()
  postMock.mockReset()
})

describe("dokploy_backup CRUD", () => {
  it("create posts only defined fields", async () => {
    postMock.mockResolvedValue({
      backupId: "b1",
      schedule: "0 2 * * *",
      prefix: "daily",
      destinationId: "d",
      database: "mydb",
      databaseType: "postgres",
    })
    await tool.execute({
      action: "create",
      schedule: "0 2 * * *",
      prefix: "daily",
      destinationId: "d",
      database: "mydb",
      databaseType: "postgres",
      postgresId: "pg1",
    })
    expect(postMock).toHaveBeenCalledWith("backup.create", {
      schedule: "0 2 * * *",
      prefix: "daily",
      destinationId: "d",
      database: "mydb",
      databaseType: "postgres",
      postgresId: "pg1",
    })
  })

  it("get calls backup.one", async () => {
    getMock.mockResolvedValue({
      backupId: "b1",
      schedule: "@daily",
      prefix: "p",
      destinationId: "d",
      database: "db",
      databaseType: "postgres",
    })
    await tool.execute({ action: "get", backupId: "b1" })
    expect(getMock).toHaveBeenCalledWith("backup.one", { backupId: "b1" })
  })

  it("update includes backupId plus only defined fields", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({
      action: "update",
      backupId: "b1",
      schedule: "@hourly",
      enabled: false,
    })
    expect(postMock).toHaveBeenCalledWith("backup.update", {
      backupId: "b1",
      schedule: "@hourly",
      enabled: false,
    })
  })

  it("remove posts backup.remove", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "remove", backupId: "b1" })
    expect(postMock).toHaveBeenCalledWith("backup.remove", { backupId: "b1" })
  })
})

describe("dokploy_backup listFiles", () => {
  it("calls backup.listBackupFiles with destination + optional params", async () => {
    getMock.mockResolvedValue([])
    await tool.execute({
      action: "listFiles",
      destinationId: "d1",
      search: "2025",
      serverId: "srv-1",
    })
    expect(getMock).toHaveBeenCalledWith("backup.listBackupFiles", {
      destinationId: "d1",
      search: "2025",
      serverId: "srv-1",
    })
  })

  it("omits search/serverId when absent", async () => {
    getMock.mockResolvedValue([])
    await tool.execute({ action: "listFiles", destinationId: "d1" })
    expect(getMock).toHaveBeenCalledWith("backup.listBackupFiles", { destinationId: "d1" })
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
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "manualBackup", backupId: "b1", backupType })
    expect(postMock).toHaveBeenCalledWith(endpoint, { backupId: "b1" })
  })
})
