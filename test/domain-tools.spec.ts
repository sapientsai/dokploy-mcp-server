import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerDomainTools } from "../src/tools/domain-tools"
import { captureTool } from "./support/tool-harness"

const { getIOMock, postIOMock } = vi.hoisted(() => ({
  getIOMock: vi.fn(),
  postIOMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ getIO: getIOMock, postIO: postIOMock }),
}))

type DomainArgs = {
  action: string
  domainId?: string
  host?: string
  applicationId?: string
  composeId?: string
  serviceName?: string
  path?: string
  port?: number
  https?: boolean
  certificateType?: string
  domainType?: string
  appName?: string
  serverId?: string
  domain?: string
  serverIp?: string
}

const tool = captureTool<DomainArgs>(registerDomainTools)

beforeEach(() => {
  getIOMock.mockReset()
  postIOMock.mockReset()
  getIOMock.mockImplementation(() => IO.succeed(undefined))
  postIOMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_domain create", () => {
  it("posts domain.create with host + only defined optional fields", async () => {
    postIOMock.mockReturnValueOnce(IO.succeed({ domainId: "d1", host: "x.com", https: true }))
    await tool.execute({
      action: "create",
      host: "x.com",
      applicationId: "a1",
      path: "/api",
      port: 8080,
      https: true,
      certificateType: "letsencrypt",
    })
    expect(postIOMock).toHaveBeenCalledWith("domain.create", {
      host: "x.com",
      applicationId: "a1",
      path: "/api",
      port: 8080,
      https: true,
      certificateType: "letsencrypt",
    })
  })

  it("omits undefined optional fields", async () => {
    postIOMock.mockReturnValueOnce(IO.succeed({ domainId: "d1", host: "x.com", https: false }))
    await tool.execute({ action: "create", host: "x.com" })
    expect(postIOMock).toHaveBeenCalledWith("domain.create", { host: "x.com" })
  })

  it("supports compose domains with serviceName", async () => {
    postIOMock.mockReturnValueOnce(IO.succeed({ domainId: "d1", host: "x.com", https: true }))
    await tool.execute({
      action: "create",
      host: "x.com",
      composeId: "c1",
      serviceName: "web",
      https: true,
    })
    expect(postIOMock).toHaveBeenCalledWith("domain.create", {
      host: "x.com",
      composeId: "c1",
      serviceName: "web",
      https: true,
    })
  })
})

describe("dokploy_domain list", () => {
  it("by applicationId calls domain.byApplicationId", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list", applicationId: "a1" })
    expect(getIOMock).toHaveBeenCalledWith("domain.byApplicationId", { applicationId: "a1" })
  })

  it("by composeId calls domain.byComposeId", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list", composeId: "c1" })
    expect(getIOMock).toHaveBeenCalledWith("domain.byComposeId", { composeId: "c1" })
  })

  it("throws when neither applicationId nor composeId provided", async () => {
    await expect(tool.execute({ action: "list" })).rejects.toThrow(/applicationId or composeId/)
  })
})

describe("dokploy_domain get/update/delete", () => {
  it("get calls domain.one", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed({ domainId: "d1", host: "x.com", https: true }))
    await tool.execute({ action: "get", domainId: "d1" })
    expect(getIOMock).toHaveBeenCalledWith("domain.one", { domainId: "d1" })
  })

  it("update sends domainId + host + defined optional fields", async () => {
    await tool.execute({
      action: "update",
      domainId: "d1",
      host: "new.com",
      https: false,
      path: "/v2",
    })
    expect(postIOMock).toHaveBeenCalledWith("domain.update", {
      domainId: "d1",
      host: "new.com",
      https: false,
      path: "/v2",
    })
  })

  it("delete posts domain.delete", async () => {
    await tool.execute({ action: "delete", domainId: "d1" })
    expect(postIOMock).toHaveBeenCalledWith("domain.delete", { domainId: "d1" })
  })
})

describe("dokploy_domain generate / canGenerateTraefikMe / validate", () => {
  it("generate posts domain.generateDomain with appName + optional serverId", async () => {
    postIOMock.mockReturnValueOnce(IO.succeed({ domain: "app.traefik.me" }))
    await tool.execute({ action: "generate", appName: "my-app", serverId: "srv-1" })
    expect(postIOMock).toHaveBeenCalledWith("domain.generateDomain", {
      appName: "my-app",
      serverId: "srv-1",
    })
  })

  it("generate omits serverId when absent", async () => {
    postIOMock.mockReturnValueOnce(IO.succeed({}))
    await tool.execute({ action: "generate", appName: "my-app" })
    expect(postIOMock).toHaveBeenCalledWith("domain.generateDomain", { appName: "my-app" })
  })

  it("canGenerateTraefikMe GETs and formats result boolean", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed(true))
    const result = (await tool.execute({ action: "canGenerateTraefikMe", serverId: "srv-1" })) as string
    expect(getIOMock).toHaveBeenCalledWith("domain.canGenerateTraefikMeDomains", { serverId: "srv-1" })
    expect(result).toBe("Traefik.me: Available")
  })

  it("canGenerateTraefikMe formats false result", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed(false))
    const result = (await tool.execute({ action: "canGenerateTraefikMe" })) as string
    expect(getIOMock).toHaveBeenCalledWith("domain.canGenerateTraefikMeDomains", {})
    expect(result).toBe("Traefik.me: Not available")
  })

  it("validate posts domain.validateDomain", async () => {
    postIOMock.mockReturnValueOnce(IO.succeed({ ok: true }))
    await tool.execute({ action: "validate", domain: "x.com", serverIp: "1.2.3.4" })
    expect(postIOMock).toHaveBeenCalledWith("domain.validateDomain", {
      domain: "x.com",
      serverIp: "1.2.3.4",
    })
  })

  it("validate omits serverIp when absent", async () => {
    postIOMock.mockReturnValueOnce(IO.succeed({ ok: true }))
    await tool.execute({ action: "validate", domain: "x.com" })
    expect(postIOMock).toHaveBeenCalledWith("domain.validateDomain", { domain: "x.com" })
  })
})
