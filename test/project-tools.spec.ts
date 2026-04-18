import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerProjectTools } from "../src/tools/project-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
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
  getMock.mockReset()
  postMock.mockReset()
})

describe("dokploy_project", () => {
  it("list GETs project.all", async () => {
    getMock.mockResolvedValue([])
    await tool.execute({ action: "list" })
    expect(getMock).toHaveBeenCalledWith("project.all")
  })

  it("get calls project.one", async () => {
    getMock.mockResolvedValue({ projectId: "p1", name: "N" })
    await tool.execute({ action: "get", projectId: "p1" })
    expect(getMock).toHaveBeenCalledWith("project.one", { projectId: "p1" })
  })

  it("create posts project.create with name only when no description", async () => {
    postMock.mockResolvedValue({ projectId: "p1", name: "N" })
    await tool.execute({ action: "create", name: "N" })
    expect(postMock).toHaveBeenCalledWith("project.create", { name: "N" })
  })

  it("create includes description when present", async () => {
    postMock.mockResolvedValue({ projectId: "p1", name: "N" })
    await tool.execute({ action: "create", name: "N", description: "desc" })
    expect(postMock).toHaveBeenCalledWith("project.create", { name: "N", description: "desc" })
  })

  it("update omits fields when not set", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "update", projectId: "p1" })
    expect(postMock).toHaveBeenCalledWith("project.update", { projectId: "p1" })
  })

  it("update allows empty-string description (treats undefined as absent)", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "update", projectId: "p1", description: "" })
    expect(postMock).toHaveBeenCalledWith("project.update", { projectId: "p1", description: "" })
  })

  it("remove posts project.remove", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "remove", projectId: "p1" })
    expect(postMock).toHaveBeenCalledWith("project.remove", { projectId: "p1" })
  })

  it("duplicate sends sourceEnvironmentId + name + optional fields", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({
      action: "duplicate",
      sourceEnvironmentId: "env-1",
      name: "Copy",
      description: "d",
      duplicateInSameProject: true,
    })
    expect(postMock).toHaveBeenCalledWith("project.duplicate", {
      sourceEnvironmentId: "env-1",
      name: "Copy",
      description: "d",
      duplicateInSameProject: true,
    })
  })
})
