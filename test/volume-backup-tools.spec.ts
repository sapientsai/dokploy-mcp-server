import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { z } from "zod"

import { registerVolumeBackupTools } from "../src/tools/volume-backup-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type VolBackupArgs = {
  action: string
  volumeBackupId?: string
  name?: string
  volumeName?: string
  prefix?: string
  cronExpression?: string
  destinationId?: string
  serviceType?: string
  appName?: string
  applicationId?: string
  keepLatestCount?: number
  id?: string
  volumeBackupType?: string
}

const tool = captureTool<VolBackupArgs>(registerVolumeBackupTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_volume_backup", () => {
  it("create posts volumeBackups.create with core + service-scoped fields", async () => {
    postMock.mockReturnValueOnce(
      IO.succeed({
        volumeBackupId: "vb1",
        name: "nightly",
        volumeName: "ms365-tokens",
        prefix: "app/tokens",
        cronExpression: "0 4 * * *",
        destinationId: "dest-1",
        serviceType: "application",
        applicationId: "app-1",
      }),
    )
    await tool.execute({
      action: "create",
      name: "nightly",
      volumeName: "ms365-tokens",
      prefix: "app/tokens",
      cronExpression: "0 4 * * *",
      destinationId: "dest-1",
      serviceType: "application",
      applicationId: "app-1",
      keepLatestCount: 7,
    })
    expect(postMock).toHaveBeenCalledWith("volumeBackups.create", {
      name: "nightly",
      volumeName: "ms365-tokens",
      prefix: "app/tokens",
      cronExpression: "0 4 * * *",
      destinationId: "dest-1",
      serviceType: "application",
      applicationId: "app-1",
      keepLatestCount: 7,
    })
  })

  it("list calls volumeBackups.list with id + volumeBackupType", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list", id: "app-1", volumeBackupType: "application" })
    expect(getMock).toHaveBeenCalledWith("volumeBackups.list", { id: "app-1", volumeBackupType: "application" })
  })

  it("remove posts volumeBackups.delete", async () => {
    await tool.execute({ action: "remove", volumeBackupId: "vb1" })
    expect(postMock).toHaveBeenCalledWith("volumeBackups.delete", { volumeBackupId: "vb1" })
  })

  it("runManually posts volumeBackups.runManually", async () => {
    const result = (await tool.execute({ action: "runManually", volumeBackupId: "vb1" })) as string
    expect(postMock).toHaveBeenCalledWith("volumeBackups.runManually", { volumeBackupId: "vb1" })
    expect(result).toBe("Volume backup vb1 triggered.")
  })
})

describe("dokploy_volume_backup volumeName validation", () => {
  const schema = tool.parameters as z.ZodType<{ action: string; volumeName?: string }>

  it.each(["my-volume", "vol_1", "app.data", "9lives"])("accepts %s", (volumeName) => {
    expect(schema.safeParse({ action: "create", volumeName }).success).toBe(true)
  })

  it.each(["-leading-dash", "_underscore", ".dot", "has space", "bad/slash"])("rejects %s", (volumeName) => {
    expect(schema.safeParse({ action: "create", volumeName }).success).toBe(false)
  })

  it("allows volumeName to be omitted", () => {
    expect(schema.safeParse({ action: "list" }).success).toBe(true)
  })
})
