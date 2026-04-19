import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerRegistryTools } from "../src/tools/registry-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type RegistryArgs = {
  action: string
  registryId?: string
  registryName?: string
  username?: string
  password?: string
  registryUrl?: string
  registryType?: "cloud"
  imagePrefix?: string | null
  serverId?: string
}

const tool = captureTool<RegistryArgs>(registerRegistryTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_registry metadata", () => {
  it("registers with the expected name", () => {
    expect(tool.name).toBe("dokploy_registry")
    expect(tool.description).toContain("registries")
  })
})

describe("dokploy_registry actions", () => {
  it("list GETs registry.all", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    const result = (await tool.execute({ action: "list" })) as string
    expect(getMock).toHaveBeenCalledWith("registry.all")
    expect(result).toContain("No registries found")
  })

  it("get GETs registry.one with registryId", async () => {
    getMock.mockReturnValueOnce(
      IO.succeed({
        registryId: "r1",
        registryName: "ghcr",
        registryUrl: "ghcr.io",
        registryType: "cloud",
      }),
    )
    const result = (await tool.execute({ action: "get", registryId: "r1" })) as string
    expect(getMock).toHaveBeenCalledWith("registry.one", { registryId: "r1" })
    expect(result).toContain("ghcr")
  })

  it("create defaults registryType=cloud and imagePrefix=null", async () => {
    postMock.mockReturnValueOnce(
      IO.succeed({
        registryId: "r1",
        registryName: "ghcr",
        registryUrl: "ghcr.io",
        registryType: "cloud",
      }),
    )
    await tool.execute({
      action: "create",
      registryName: "ghcr",
      username: "u",
      password: "p",
      registryUrl: "ghcr.io",
    })
    expect(postMock).toHaveBeenCalledWith("registry.create", {
      registryType: "cloud",
      imagePrefix: null,
      registryName: "ghcr",
      username: "u",
      password: "p",
      registryUrl: "ghcr.io",
    })
  })

  it("update sends only defined fields plus registryId", async () => {
    await tool.execute({ action: "update", registryId: "r1", username: "new-user" })
    expect(postMock).toHaveBeenCalledWith("registry.update", {
      registryId: "r1",
      username: "new-user",
    })
  })

  it("remove posts registry.remove", async () => {
    await tool.execute({ action: "remove", registryId: "r1" })
    expect(postMock).toHaveBeenCalledWith("registry.remove", { registryId: "r1" })
  })

  it("test posts registry.testRegistry without persisting (no registryId)", async () => {
    await tool.execute({
      action: "test",
      registryName: "ghcr",
      username: "u",
      password: "p",
      registryUrl: "ghcr.io",
    })
    expect(postMock).toHaveBeenCalledWith("registry.testRegistry", {
      registryType: "cloud",
      registryName: "ghcr",
      username: "u",
      password: "p",
      registryUrl: "ghcr.io",
    })
  })

  it("testById posts registry.testRegistryById with registryId", async () => {
    await tool.execute({ action: "testById", registryId: "r1", serverId: "srv-1" })
    expect(postMock).toHaveBeenCalledWith("registry.testRegistryById", {
      registryId: "r1",
      serverId: "srv-1",
    })
  })
})
