import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerEnvironmentTools } from "../src/tools/environment-tools"
import { captureTool } from "./support/tool-harness"

const { getIOMock, postIOMock } = vi.hoisted(() => ({
  getIOMock: vi.fn(),
  postIOMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ getIO: getIOMock, postIO: postIOMock }),
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
  getIOMock.mockReset()
  postIOMock.mockReset()
  getIOMock.mockImplementation(() => IO.succeed(undefined))
  postIOMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_environment", () => {
  it("create posts environment.create with name + projectId + optional description", async () => {
    postIOMock.mockReturnValueOnce(IO.succeed({ environmentId: "e1", name: "prod", projectId: "p1" }))
    await tool.execute({ action: "create", name: "prod", projectId: "p1", description: "d" })
    expect(postIOMock).toHaveBeenCalledWith("environment.create", {
      name: "prod",
      projectId: "p1",
      description: "d",
    })
  })

  it("create omits description when absent", async () => {
    postIOMock.mockReturnValueOnce(IO.succeed({ environmentId: "e1", name: "prod", projectId: "p1" }))
    await tool.execute({ action: "create", name: "prod", projectId: "p1" })
    expect(postIOMock).toHaveBeenCalledWith("environment.create", { name: "prod", projectId: "p1" })
  })

  it("get calls environment.one", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed({ environmentId: "e1", name: "prod", projectId: "p1" }))
    await tool.execute({ action: "get", environmentId: "e1" })
    expect(getIOMock).toHaveBeenCalledWith("environment.one", { environmentId: "e1" })
  })

  it("list calls environment.byProjectId", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list", projectId: "p1" })
    expect(getIOMock).toHaveBeenCalledWith("environment.byProjectId", { projectId: "p1" })
  })

  it("update allows empty-string description", async () => {
    await tool.execute({ action: "update", environmentId: "e1", name: "new", description: "" })
    expect(postIOMock).toHaveBeenCalledWith("environment.update", {
      environmentId: "e1",
      name: "new",
      description: "",
    })
  })

  it("update without optional fields only sends environmentId", async () => {
    await tool.execute({ action: "update", environmentId: "e1" })
    expect(postIOMock).toHaveBeenCalledWith("environment.update", { environmentId: "e1" })
  })

  it("remove posts environment.remove", async () => {
    await tool.execute({ action: "remove", environmentId: "e1" })
    expect(postIOMock).toHaveBeenCalledWith("environment.remove", { environmentId: "e1" })
  })

  it("duplicate posts environment.duplicate with name + optional description", async () => {
    await tool.execute({
      action: "duplicate",
      environmentId: "e1",
      name: "copy",
      description: "d",
    })
    expect(postIOMock).toHaveBeenCalledWith("environment.duplicate", {
      environmentId: "e1",
      name: "copy",
      description: "d",
    })
  })
})
