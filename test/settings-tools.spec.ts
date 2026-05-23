import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerSettingsTools } from "../src/tools/settings-tools"
import { captureTool } from "./support/tool-harness"

// The migrated settings tool consumes DokployClient.get / post (IO-returning).
// Each mock returns an IO so the tool's Match+IO composition sees the shape it expects.

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type SettingsArgs = {
  action: string
  cleanType?:
    | "all"
    | "images"
    | "volumes"
    | "stoppedContainers"
    | "dockerBuilder"
    | "dockerPrune"
    | "monitoring"
    | "redis"
    | "deploymentQueue"
    | "sshPrivateKey"
  reloadTarget?: "server" | "traefik" | "redis"
  serverId?: string
}

const tool = captureTool<SettingsArgs>(registerSettingsTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  // Default: succeed with undefined. Tests that care about the resolved value override.
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_settings read actions", () => {
  it("health GETs settings.health", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ status: "ok" }))
    const result = (await tool.execute({ action: "health" })) as string
    expect(getMock).toHaveBeenCalledWith("settings.health")
    expect(result).toContain('"status": "ok"')
  })

  it("version GETs settings.getDokployVersion", async () => {
    getMock.mockReturnValueOnce(IO.succeed("1.5.1"))
    const result = (await tool.execute({ action: "version" })) as string
    expect(getMock).toHaveBeenCalledWith("settings.getDokployVersion")
    expect(result).toBe("Dokploy version: 1.5.1")
  })

  it("ip GETs settings.getIp", async () => {
    getMock.mockReturnValueOnce(IO.succeed("1.2.3.4"))
    const result = (await tool.execute({ action: "ip" })) as string
    expect(result).toBe("Server IP: 1.2.3.4")
  })
})

describe("dokploy_settings clean", () => {
  it("defaults to cleanAll when cleanType omitted", async () => {
    await tool.execute({ action: "clean" })
    expect(postMock).toHaveBeenCalledWith("settings.cleanAll", {})
  })

  it.each([
    ["all", "settings.cleanAll"],
    ["images", "settings.cleanUnusedImages"],
    ["volumes", "settings.cleanUnusedVolumes"],
    ["stoppedContainers", "settings.cleanStoppedContainers"],
    ["dockerBuilder", "settings.cleanDockerBuilder"],
    ["dockerPrune", "settings.cleanDockerPrune"],
  ] as const)("server-scoped cleanType=%s passes serverId when supplied", async (cleanType, endpoint) => {
    await tool.execute({ action: "clean", cleanType, serverId: "s1" })
    expect(postMock).toHaveBeenCalledWith(endpoint, { serverId: "s1" })
  })

  it.each([
    ["monitoring", "settings.cleanMonitoring"],
    ["redis", "settings.cleanRedis"],
    ["deploymentQueue", "settings.cleanAllDeploymentQueue"],
    ["sshPrivateKey", "settings.cleanSSHPrivateKey"],
  ] as const)("non-server-scoped cleanType=%s ignores serverId", async (cleanType, endpoint) => {
    await tool.execute({ action: "clean", cleanType, serverId: "s1" })
    expect(postMock).toHaveBeenCalledWith(endpoint)
  })

  it("server-scoped without serverId still passes empty body", async () => {
    await tool.execute({ action: "clean", cleanType: "images" })
    expect(postMock).toHaveBeenCalledWith("settings.cleanUnusedImages", {})
  })
})

describe("dokploy_settings reload", () => {
  it("defaults to reloadServer", async () => {
    await tool.execute({ action: "reload" })
    expect(postMock).toHaveBeenCalledWith("settings.reloadServer")
  })

  it("reloadTarget=server calls settings.reloadServer", async () => {
    await tool.execute({ action: "reload", reloadTarget: "server" })
    expect(postMock).toHaveBeenCalledWith("settings.reloadServer")
  })

  it("reloadTarget=traefik calls settings.reloadTraefik with optional serverId", async () => {
    await tool.execute({ action: "reload", reloadTarget: "traefik", serverId: "s1" })
    expect(postMock).toHaveBeenCalledWith("settings.reloadTraefik", { serverId: "s1" })
  })

  it("reloadTarget=traefik without serverId passes empty body", async () => {
    await tool.execute({ action: "reload", reloadTarget: "traefik" })
    expect(postMock).toHaveBeenCalledWith("settings.reloadTraefik", {})
  })

  it("reloadTarget=redis calls settings.reloadRedis (no body)", async () => {
    await tool.execute({ action: "reload", reloadTarget: "redis" })
    expect(postMock).toHaveBeenCalledWith("settings.reloadRedis")
  })
})
