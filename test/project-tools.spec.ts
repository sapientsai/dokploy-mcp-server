import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerProjectTools } from "../src/tools/project-tools"
import { captureTool } from "./support/tool-harness"

const { getIOMock, postIOMock } = vi.hoisted(() => ({
  getIOMock: vi.fn(),
  postIOMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ getIO: getIOMock, postIO: postIOMock }),
}))

type ProjectArgs = {
  action: string
  projectId?: string
  name?: string
  description?: string
  sourceEnvironmentId?: string
  duplicateInSameProject?: boolean
}

const tool = captureTool<ProjectArgs>(registerProjectTools)

beforeEach(() => {
  getIOMock.mockReset()
  postIOMock.mockReset()
  getIOMock.mockImplementation(() => IO.succeed(undefined))
  postIOMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_project", () => {
  it("list GETs project.all", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list" })
    expect(getIOMock).toHaveBeenCalledWith("project.all")
  })

  it("get calls project.one", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed({ projectId: "p1", name: "N" }))
    await tool.execute({ action: "get", projectId: "p1" })
    expect(getIOMock).toHaveBeenCalledWith("project.one", { projectId: "p1" })
  })

  it("create posts project.create with name only when no description", async () => {
    postIOMock.mockReturnValueOnce(IO.succeed({ projectId: "p1", name: "N" }))
    await tool.execute({ action: "create", name: "N" })
    expect(postIOMock).toHaveBeenCalledWith("project.create", { name: "N" })
  })

  it("create includes description when present", async () => {
    postIOMock.mockReturnValueOnce(IO.succeed({ projectId: "p1", name: "N" }))
    await tool.execute({ action: "create", name: "N", description: "desc" })
    expect(postIOMock).toHaveBeenCalledWith("project.create", { name: "N", description: "desc" })
  })

  it("update omits fields when not set", async () => {
    await tool.execute({ action: "update", projectId: "p1" })
    expect(postIOMock).toHaveBeenCalledWith("project.update", { projectId: "p1" })
  })

  it("update allows empty-string description (treats undefined as absent)", async () => {
    await tool.execute({ action: "update", projectId: "p1", description: "" })
    expect(postIOMock).toHaveBeenCalledWith("project.update", { projectId: "p1", description: "" })
  })

  it("remove posts project.remove", async () => {
    await tool.execute({ action: "remove", projectId: "p1" })
    expect(postIOMock).toHaveBeenCalledWith("project.remove", { projectId: "p1" })
  })

  it("duplicate sends sourceEnvironmentId + name + optional fields", async () => {
    await tool.execute({
      action: "duplicate",
      sourceEnvironmentId: "env-1",
      name: "Copy",
      description: "d",
      duplicateInSameProject: true,
    })
    expect(postIOMock).toHaveBeenCalledWith("project.duplicate", {
      sourceEnvironmentId: "env-1",
      name: "Copy",
      description: "d",
      duplicateInSameProject: true,
    })
  })
})
