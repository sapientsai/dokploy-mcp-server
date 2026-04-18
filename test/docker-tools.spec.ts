import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerDockerTools } from "../src/tools/docker-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type DockerArgs = {
  action: string
  containerId?: string
  serverId?: string
  appName?: string
  method?: "match" | "label" | "stack" | "service"
  appType?: string
  type?: string
}

const tool = captureTool<DockerArgs>(registerDockerTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe("dokploy_docker getContainers", () => {
  it("calls docker.getContainers without serverId by default", async () => {
    getMock.mockResolvedValue([])
    await tool.execute({ action: "getContainers" })
    expect(getMock).toHaveBeenCalledWith("docker.getContainers", {})
  })

  it("passes serverId when provided", async () => {
    getMock.mockResolvedValue([])
    await tool.execute({ action: "getContainers", serverId: "srv-1" })
    expect(getMock).toHaveBeenCalledWith("docker.getContainers", { serverId: "srv-1" })
  })
})

describe("dokploy_docker restartContainer", () => {
  it("posts docker.restartContainer", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "restartContainer", containerId: "c1" })
    expect(postMock).toHaveBeenCalledWith("docker.restartContainer", { containerId: "c1" })
  })
})

describe("dokploy_docker getConfig", () => {
  it("posts docker.getConfig with optional serverId", async () => {
    postMock.mockResolvedValue({ Id: "c1" })
    await tool.execute({ action: "getConfig", containerId: "c1", serverId: "srv-1" })
    expect(postMock).toHaveBeenCalledWith("docker.getConfig", {
      containerId: "c1",
      serverId: "srv-1",
    })
  })

  it("returns helpful message on 400", async () => {
    postMock.mockRejectedValue(new Error("400 Bad Request"))
    const result = (await tool.execute({ action: "getConfig", containerId: "c1" })) as string
    expect(result).toContain("Ensure the containerId is a valid Docker container ID")
  })

  it("re-throws non-400 errors", async () => {
    postMock.mockRejectedValue(new Error("500 Internal"))
    await expect(tool.execute({ action: "getConfig", containerId: "c1" })).rejects.toThrow("500 Internal")
  })
})

describe("dokploy_docker findContainers", () => {
  it.each([
    ["match", "docker.getContainersByAppNameMatch"],
    ["label", "docker.getContainersByAppLabel"],
    ["stack", "docker.getStackContainersByAppName"],
    ["service", "docker.getServiceContainersByAppName"],
  ] as const)("%s method hits %s endpoint", async (method, endpoint) => {
    getMock.mockResolvedValue([])
    await tool.execute({ action: "findContainers", method, appName: "my-app" })
    expect(getMock).toHaveBeenCalledWith(endpoint, { appName: "my-app" })
  })

  it("includes appType only for match method", async () => {
    getMock.mockResolvedValue([])
    await tool.execute({
      action: "findContainers",
      method: "match",
      appName: "my-app",
      appType: "application",
      type: "ignored-for-match",
    })
    expect(getMock).toHaveBeenCalledWith("docker.getContainersByAppNameMatch", {
      appName: "my-app",
      appType: "application",
    })
  })

  it("includes type only for label method", async () => {
    getMock.mockResolvedValue([])
    await tool.execute({
      action: "findContainers",
      method: "label",
      appName: "my-app",
      type: "stack",
      appType: "ignored-for-label",
    })
    expect(getMock).toHaveBeenCalledWith("docker.getContainersByAppLabel", {
      appName: "my-app",
      type: "stack",
    })
  })

  it("throws when method missing", async () => {
    await expect(tool.execute({ action: "findContainers", appName: "x" })).rejects.toThrow(/requires method/)
  })
})
