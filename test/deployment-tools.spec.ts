import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerDeploymentTools } from "../src/tools/deployment-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type DeploymentArgs = {
  action: string
  deploymentId?: string
  applicationId?: string
  composeId?: string
  serverId?: string
  type?: string
  id?: string
}

const tool = captureTool<DeploymentArgs>(registerDeploymentTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_deployment list dispatch", () => {
  it("by applicationId", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list", applicationId: "a1" })
    expect(getMock).toHaveBeenCalledWith("deployment.all", { applicationId: "a1" })
  })

  it("by composeId", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list", composeId: "c1" })
    expect(getMock).toHaveBeenCalledWith("deployment.allByCompose", { composeId: "c1" })
  })

  it("by serverId", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list", serverId: "s1" })
    expect(getMock).toHaveBeenCalledWith("deployment.allByServer", { serverId: "s1" })
  })

  it("by type+id", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list", type: "postgres", id: "db1" })
    expect(getMock).toHaveBeenCalledWith("deployment.allByType", { type: "postgres", id: "db1" })
  })

  it("throws when no identifier provided", async () => {
    await expect(tool.execute({ action: "list" })).rejects.toThrow(/applicationId, composeId, serverId/)
  })

  it("throws when only type without id", async () => {
    await expect(tool.execute({ action: "list", type: "postgres" })).rejects.toThrow()
  })
})

describe("dokploy_deployment killProcess", () => {
  it("posts deployment.killProcess", async () => {
    await tool.execute({ action: "killProcess", deploymentId: "d1" })
    expect(postMock).toHaveBeenCalledWith("deployment.killProcess", { deploymentId: "d1" })
  })
})
