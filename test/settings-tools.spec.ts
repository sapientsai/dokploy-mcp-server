import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerSettingsTools } from "../src/tools/settings-tools"
import { captureTool } from "./support/tool-harness"

// The migrated settings tool consumes DokployClient.getIO / postIO (IO-returning).
// Each mock returns an IO so the tool's Match+IO composition sees the shape it expects.

const { getIOMock, postIOMock } = vi.hoisted(() => ({
  getIOMock: vi.fn(),
  postIOMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ getIO: getIOMock, postIO: postIOMock }),
}))

type SettingsArgs = {
  action: string
  cleanType?: "all" | "images"
  reloadTarget?: "server" | "traefik"
  serverId?: string
}

const tool = captureTool<SettingsArgs>(registerSettingsTools)

beforeEach(() => {
  getIOMock.mockReset()
  postIOMock.mockReset()
  // Default: succeed with undefined. Tests that care about the resolved value override.
  getIOMock.mockImplementation(() => IO.succeed(undefined))
  postIOMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_settings read actions", () => {
  it("health GETs settings.health", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed({ status: "ok" }))
    const result = (await tool.execute({ action: "health" })) as string
    expect(getIOMock).toHaveBeenCalledWith("settings.health")
    expect(result).toContain('"status": "ok"')
  })

  it("version GETs settings.getDokployVersion", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed("1.5.1"))
    const result = (await tool.execute({ action: "version" })) as string
    expect(getIOMock).toHaveBeenCalledWith("settings.getDokployVersion")
    expect(result).toBe("Dokploy version: 1.5.1")
  })

  it("ip GETs settings.getIp", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed("1.2.3.4"))
    const result = (await tool.execute({ action: "ip" })) as string
    expect(result).toBe("Server IP: 1.2.3.4")
  })
})

describe("dokploy_settings clean", () => {
  it("defaults to cleanAll when cleanType omitted", async () => {
    await tool.execute({ action: "clean" })
    expect(postIOMock).toHaveBeenCalledWith("settings.cleanAll", {})
  })

  it("uses cleanAll when cleanType=all", async () => {
    await tool.execute({ action: "clean", cleanType: "all", serverId: "s1" })
    expect(postIOMock).toHaveBeenCalledWith("settings.cleanAll", { serverId: "s1" })
  })

  it("uses cleanUnusedImages when cleanType=images", async () => {
    await tool.execute({ action: "clean", cleanType: "images" })
    expect(postIOMock).toHaveBeenCalledWith("settings.cleanUnusedImages", {})
  })
})

describe("dokploy_settings reload", () => {
  it("defaults to reloadServer", async () => {
    await tool.execute({ action: "reload" })
    expect(postIOMock).toHaveBeenCalledWith("settings.reloadServer")
  })

  it("reloadTarget=server calls settings.reloadServer", async () => {
    await tool.execute({ action: "reload", reloadTarget: "server" })
    expect(postIOMock).toHaveBeenCalledWith("settings.reloadServer")
  })

  it("reloadTarget=traefik calls settings.reloadTraefik with optional serverId", async () => {
    await tool.execute({ action: "reload", reloadTarget: "traefik", serverId: "s1" })
    expect(postIOMock).toHaveBeenCalledWith("settings.reloadTraefik", { serverId: "s1" })
  })

  it("reloadTarget=traefik without serverId passes empty body", async () => {
    await tool.execute({ action: "reload", reloadTarget: "traefik" })
    expect(postIOMock).toHaveBeenCalledWith("settings.reloadTraefik", {})
  })
})
