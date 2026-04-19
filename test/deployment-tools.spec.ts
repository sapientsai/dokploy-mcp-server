import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { HttpError } from "../src/client/errors"
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

describe("dokploy_deployment getLog", () => {
  it("extracts data field from log response", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ data: "line 1\nline 2" }))
    const result = (await tool.execute({ action: "getLog", deploymentId: "d1" })) as string
    expect(getMock).toHaveBeenCalledWith("deployment.readLog", { deploymentId: "d1" })
    expect(result).toContain("line 1")
    expect(result).toContain("line 2")
  })

  it("handles raw string log response", async () => {
    getMock.mockReturnValueOnce(IO.succeed("raw log output"))
    const result = (await tool.execute({ action: "getLog", deploymentId: "d1" })) as string
    expect(result).toContain("raw log output")
  })

  it("returns helpful message on 404", async () => {
    getMock.mockReturnValueOnce(IO.fail(HttpError("GET", "deployment.readLog", 404, "Not Found", "")))
    const result = (await tool.execute({ action: "getLog", deploymentId: "d1" })) as string
    expect(result).toContain("No log available")
  })

  it("re-throws non-404 errors", async () => {
    getMock.mockReturnValueOnce(IO.fail(HttpError("GET", "deployment.readLog", 500, "Internal", "boom")))
    await expect(tool.execute({ action: "getLog", deploymentId: "d1" })).rejects.toThrow(/500/)
  })
})

describe("dokploy_deployment killProcess", () => {
  it("posts deployment.killProcess", async () => {
    await tool.execute({ action: "killProcess", deploymentId: "d1" })
    expect(postMock).toHaveBeenCalledWith("deployment.killProcess", { deploymentId: "d1" })
  })
})
