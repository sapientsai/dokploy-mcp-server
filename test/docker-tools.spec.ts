import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { HttpError } from "../src/client/errors"
import { registerDockerTools } from "../src/tools/docker-tools"
import { captureTool } from "./support/tool-harness"

const { getIOMock, postIOMock } = vi.hoisted(() => ({
  getIOMock: vi.fn(),
  postIOMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ getIO: getIOMock, postIO: postIOMock }),
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
  getIOMock.mockReset()
  postIOMock.mockReset()
  getIOMock.mockImplementation(() => IO.succeed(undefined))
  postIOMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_docker getContainers", () => {
  it("calls docker.getContainers without serverId by default", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "getContainers" })
    expect(getIOMock).toHaveBeenCalledWith("docker.getContainers", {})
  })

  it("passes serverId when provided", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "getContainers", serverId: "srv-1" })
    expect(getIOMock).toHaveBeenCalledWith("docker.getContainers", { serverId: "srv-1" })
  })
})

describe("dokploy_docker restartContainer", () => {
  it("posts docker.restartContainer", async () => {
    await tool.execute({ action: "restartContainer", containerId: "c1" })
    expect(postIOMock).toHaveBeenCalledWith("docker.restartContainer", { containerId: "c1" })
  })
})

describe("dokploy_docker getConfig", () => {
  it("posts docker.getConfig with optional serverId", async () => {
    postIOMock.mockReturnValueOnce(IO.succeed({ Id: "c1" }))
    await tool.execute({ action: "getConfig", containerId: "c1", serverId: "srv-1" })
    expect(postIOMock).toHaveBeenCalledWith("docker.getConfig", {
      containerId: "c1",
      serverId: "srv-1",
    })
  })

  it("returns helpful message on 400", async () => {
    postIOMock.mockReturnValueOnce(IO.fail(HttpError("POST", "docker.getConfig", 400, "Bad Request", "")))
    const result = (await tool.execute({ action: "getConfig", containerId: "c1" })) as string
    expect(result).toContain("Ensure the containerId is a valid Docker container ID")
  })

  it("re-throws non-400 errors", async () => {
    postIOMock.mockReturnValueOnce(IO.fail(HttpError("POST", "docker.getConfig", 500, "Internal", "boom")))
    await expect(tool.execute({ action: "getConfig", containerId: "c1" })).rejects.toThrow(/500/)
  })
})

describe("dokploy_docker findContainers", () => {
  it.each([
    ["match", "docker.getContainersByAppNameMatch"],
    ["label", "docker.getContainersByAppLabel"],
    ["stack", "docker.getStackContainersByAppName"],
    ["service", "docker.getServiceContainersByAppName"],
  ] as const)("%s method hits %s endpoint", async (method, endpoint) => {
    getIOMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "findContainers", method, appName: "my-app" })
    expect(getIOMock).toHaveBeenCalledWith(endpoint, { appName: "my-app" })
  })

  it("includes appType only for match method", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({
      action: "findContainers",
      method: "match",
      appName: "my-app",
      appType: "application",
      type: "ignored-for-match",
    })
    expect(getIOMock).toHaveBeenCalledWith("docker.getContainersByAppNameMatch", {
      appName: "my-app",
      appType: "application",
    })
  })

  it("includes type only for label method", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({
      action: "findContainers",
      method: "label",
      appName: "my-app",
      type: "stack",
      appType: "ignored-for-label",
    })
    expect(getIOMock).toHaveBeenCalledWith("docker.getContainersByAppLabel", {
      appName: "my-app",
      type: "stack",
    })
  })

  it("throws when method missing", async () => {
    await expect(tool.execute({ action: "findContainers", appName: "x" })).rejects.toThrow(/requires method/)
  })
})
