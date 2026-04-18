import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerSettingsTools } from "../src/tools/settings-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type SettingsArgs = {
  action: string
  cleanType?: "all" | "images"
  reloadTarget?: "server" | "traefik"
  serverId?: string
}

const tool = captureTool<SettingsArgs>(registerSettingsTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe("dokploy_settings read actions", () => {
  it("health GETs settings.health", async () => {
    getMock.mockResolvedValue({ status: "ok" })
    await tool.execute({ action: "health" })
    expect(getMock).toHaveBeenCalledWith("settings.health")
  })

  it("version GETs settings.getDokployVersion", async () => {
    getMock.mockResolvedValue("1.5.1")
    const result = (await tool.execute({ action: "version" })) as string
    expect(getMock).toHaveBeenCalledWith("settings.getDokployVersion")
    expect(result).toBe("Dokploy version: 1.5.1")
  })

  it("ip GETs settings.getIp", async () => {
    getMock.mockResolvedValue("1.2.3.4")
    const result = (await tool.execute({ action: "ip" })) as string
    expect(result).toBe("Server IP: 1.2.3.4")
  })
})

describe("dokploy_settings clean", () => {
  it("defaults to cleanAll when cleanType omitted", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "clean" })
    expect(postMock).toHaveBeenCalledWith("settings.cleanAll", {})
  })

  it("uses cleanAll when cleanType=all", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "clean", cleanType: "all", serverId: "s1" })
    expect(postMock).toHaveBeenCalledWith("settings.cleanAll", { serverId: "s1" })
  })

  it("uses cleanUnusedImages when cleanType=images", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "clean", cleanType: "images" })
    expect(postMock).toHaveBeenCalledWith("settings.cleanUnusedImages", {})
  })
})

describe("dokploy_settings reload", () => {
  it("defaults to reloadServer", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "reload" })
    expect(postMock).toHaveBeenCalledWith("settings.reloadServer")
  })

  it("reloadTarget=server calls settings.reloadServer", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "reload", reloadTarget: "server" })
    expect(postMock).toHaveBeenCalledWith("settings.reloadServer")
  })

  it("reloadTarget=traefik calls settings.reloadTraefik with optional serverId", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "reload", reloadTarget: "traefik", serverId: "s1" })
    expect(postMock).toHaveBeenCalledWith("settings.reloadTraefik", { serverId: "s1" })
  })

  it("reloadTarget=traefik without serverId passes empty body", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "reload", reloadTarget: "traefik" })
    expect(postMock).toHaveBeenCalledWith("settings.reloadTraefik", {})
  })
})
