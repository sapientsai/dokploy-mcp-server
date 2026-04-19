import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerEnvironmentTools } from "../src/tools/environment-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type EnvArgs = {
  action: string
  environmentId?: string
  projectId?: string
  name?: string
  description?: string
}

const tool = captureTool<EnvArgs>(registerEnvironmentTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_environment", () => {
  it("create posts environment.create with name + projectId + optional description", async () => {
    postMock.mockReturnValueOnce(IO.succeed({ environmentId: "e1", name: "prod", projectId: "p1" }))
    await tool.execute({ action: "create", name: "prod", projectId: "p1", description: "d" })
    expect(postMock).toHaveBeenCalledWith("environment.create", {
      name: "prod",
      projectId: "p1",
      description: "d",
    })
  })

  it("create omits description when absent", async () => {
    postMock.mockReturnValueOnce(IO.succeed({ environmentId: "e1", name: "prod", projectId: "p1" }))
    await tool.execute({ action: "create", name: "prod", projectId: "p1" })
    expect(postMock).toHaveBeenCalledWith("environment.create", { name: "prod", projectId: "p1" })
  })

  it("get calls environment.one", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ environmentId: "e1", name: "prod", projectId: "p1" }))
    await tool.execute({ action: "get", environmentId: "e1" })
    expect(getMock).toHaveBeenCalledWith("environment.one", { environmentId: "e1" })
  })

  it("list calls environment.byProjectId", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list", projectId: "p1" })
    expect(getMock).toHaveBeenCalledWith("environment.byProjectId", { projectId: "p1" })
  })

  it("update allows empty-string description", async () => {
    await tool.execute({ action: "update", environmentId: "e1", name: "new", description: "" })
    expect(postMock).toHaveBeenCalledWith("environment.update", {
      environmentId: "e1",
      name: "new",
      description: "",
    })
  })

  it("update without optional fields only sends environmentId", async () => {
    await tool.execute({ action: "update", environmentId: "e1" })
    expect(postMock).toHaveBeenCalledWith("environment.update", { environmentId: "e1" })
  })

  it("remove posts environment.remove", async () => {
    await tool.execute({ action: "remove", environmentId: "e1" })
    expect(postMock).toHaveBeenCalledWith("environment.remove", { environmentId: "e1" })
  })

  it("duplicate posts environment.duplicate with name + optional description", async () => {
    await tool.execute({
      action: "duplicate",
      environmentId: "e1",
      name: "copy",
      description: "d",
    })
    expect(postMock).toHaveBeenCalledWith("environment.duplicate", {
      environmentId: "e1",
      name: "copy",
      description: "d",
    })
  })
})
