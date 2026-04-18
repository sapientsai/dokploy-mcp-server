import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerDomainTools } from "../src/tools/domain-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
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
  getMock.mockReset()
  postMock.mockReset()
})

describe("dokploy_domain create", () => {
  it("posts domain.create with host + only defined optional fields", async () => {
    postMock.mockResolvedValue({ domainId: "d1", host: "x.com", https: true })
    await tool.execute({
      action: "create",
      host: "x.com",
      applicationId: "a1",
      path: "/api",
      port: 8080,
      https: true,
      certificateType: "letsencrypt",
    })
    expect(postMock).toHaveBeenCalledWith("domain.create", {
      host: "x.com",
      applicationId: "a1",
      path: "/api",
      port: 8080,
      https: true,
      certificateType: "letsencrypt",
    })
  })

  it("omits undefined optional fields", async () => {
    postMock.mockResolvedValue({ domainId: "d1", host: "x.com", https: false })
    await tool.execute({ action: "create", host: "x.com" })
    expect(postMock).toHaveBeenCalledWith("domain.create", { host: "x.com" })
  })

  it("supports compose domains with serviceName", async () => {
    postMock.mockResolvedValue({ domainId: "d1", host: "x.com", https: true })
    await tool.execute({
      action: "create",
      host: "x.com",
      composeId: "c1",
      serviceName: "web",
      https: true,
    })
    expect(postMock).toHaveBeenCalledWith("domain.create", {
      host: "x.com",
      composeId: "c1",
      serviceName: "web",
      https: true,
    })
  })
})

describe("dokploy_domain list", () => {
  it("by applicationId calls domain.byApplicationId", async () => {
    getMock.mockResolvedValue([])
    await tool.execute({ action: "list", applicationId: "a1" })
    expect(getMock).toHaveBeenCalledWith("domain.byApplicationId", { applicationId: "a1" })
  })

  it("by composeId calls domain.byComposeId", async () => {
    getMock.mockResolvedValue([])
    await tool.execute({ action: "list", composeId: "c1" })
    expect(getMock).toHaveBeenCalledWith("domain.byComposeId", { composeId: "c1" })
  })

  it("throws when neither applicationId nor composeId provided", async () => {
    await expect(tool.execute({ action: "list" })).rejects.toThrow(/applicationId or composeId/)
  })
})

describe("dokploy_domain get/update/delete", () => {
  it("get calls domain.one", async () => {
    getMock.mockResolvedValue({ domainId: "d1", host: "x.com", https: true })
    await tool.execute({ action: "get", domainId: "d1" })
    expect(getMock).toHaveBeenCalledWith("domain.one", { domainId: "d1" })
  })

  it("update sends domainId + host + defined optional fields", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({
      action: "update",
      domainId: "d1",
      host: "new.com",
      https: false,
      path: "/v2",
    })
    expect(postMock).toHaveBeenCalledWith("domain.update", {
      domainId: "d1",
      host: "new.com",
      https: false,
      path: "/v2",
    })
  })

  it("delete posts domain.delete", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "delete", domainId: "d1" })
    expect(postMock).toHaveBeenCalledWith("domain.delete", { domainId: "d1" })
  })
})

describe("dokploy_domain generate / canGenerateTraefikMe / validate", () => {
  it("generate posts domain.generateDomain with appName + optional serverId", async () => {
    postMock.mockResolvedValue({ domain: "app.traefik.me" })
    await tool.execute({ action: "generate", appName: "my-app", serverId: "srv-1" })
    expect(postMock).toHaveBeenCalledWith("domain.generateDomain", {
      appName: "my-app",
      serverId: "srv-1",
    })
  })

  it("generate omits serverId when absent", async () => {
    postMock.mockResolvedValue({})
    await tool.execute({ action: "generate", appName: "my-app" })
    expect(postMock).toHaveBeenCalledWith("domain.generateDomain", { appName: "my-app" })
  })

  it("canGenerateTraefikMe GETs and formats result boolean", async () => {
    getMock.mockResolvedValue(true)
    const result = (await tool.execute({ action: "canGenerateTraefikMe", serverId: "srv-1" })) as string
    expect(getMock).toHaveBeenCalledWith("domain.canGenerateTraefikMeDomains", { serverId: "srv-1" })
    expect(result).toBe("Traefik.me: Available")
  })

  it("canGenerateTraefikMe formats false result", async () => {
    getMock.mockResolvedValue(false)
    const result = (await tool.execute({ action: "canGenerateTraefikMe" })) as string
    expect(getMock).toHaveBeenCalledWith("domain.canGenerateTraefikMeDomains", {})
    expect(result).toBe("Traefik.me: Not available")
  })

  it("validate posts domain.validateDomain", async () => {
    postMock.mockResolvedValue({ ok: true })
    await tool.execute({ action: "validate", domain: "x.com", serverIp: "1.2.3.4" })
    expect(postMock).toHaveBeenCalledWith("domain.validateDomain", {
      domain: "x.com",
      serverIp: "1.2.3.4",
    })
  })

  it("validate omits serverIp when absent", async () => {
    postMock.mockResolvedValue({ ok: true })
    await tool.execute({ action: "validate", domain: "x.com" })
    expect(postMock).toHaveBeenCalledWith("domain.validateDomain", { domain: "x.com" })
  })
})
