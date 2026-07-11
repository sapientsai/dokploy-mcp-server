import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerScheduleTools } from "../src/tools/schedule-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type ScheduleArgs = {
  action: string
  scheduleId?: string
  name?: string
  cronExpression?: string
  command?: string
  scheduleType?: string
  applicationId?: string
  id?: string
}

const tool = captureTool<ScheduleArgs>(registerScheduleTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_schedule", () => {
  it("create posts schedule.create with required + optional fields", async () => {
    postMock.mockReturnValueOnce(
      IO.succeed({
        scheduleId: "s1",
        name: "nightly",
        cronExpression: "0 3 * * *",
        command: "backup.sh",
        scheduleType: "application",
        applicationId: "app-1",
      }),
    )
    const result = (await tool.execute({
      action: "create",
      name: "nightly",
      cronExpression: "0 3 * * *",
      command: "backup.sh",
      scheduleType: "application",
      applicationId: "app-1",
    })) as string
    expect(postMock).toHaveBeenCalledWith("schedule.create", {
      name: "nightly",
      cronExpression: "0 3 * * *",
      command: "backup.sh",
      scheduleType: "application",
      applicationId: "app-1",
    })
    expect(result).toContain("Schedule Created")
  })

  it("list calls schedule.list with id + scheduleType", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list", id: "app-1", scheduleType: "application" })
    expect(getMock).toHaveBeenCalledWith("schedule.list", { id: "app-1", scheduleType: "application" })
  })

  it("remove posts schedule.delete", async () => {
    await tool.execute({ action: "remove", scheduleId: "s1" })
    expect(postMock).toHaveBeenCalledWith("schedule.delete", { scheduleId: "s1" })
  })

  it("runManually posts schedule.runManually", async () => {
    const result = (await tool.execute({ action: "runManually", scheduleId: "s1" })) as string
    expect(postMock).toHaveBeenCalledWith("schedule.runManually", { scheduleId: "s1" })
    expect(result).toBe("Schedule s1 triggered.")
  })
})
