import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerInfrastructureTools } from "../src/tools/infrastructure-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock, getOrganizationIdMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  getOrganizationIdMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
  getOrganizationId: getOrganizationIdMock,
}))

type InfraArgs = {
  action: string
  applicationId?: string
  publishedPort?: number
  targetPort?: number
  protocol?: string
  publishMode?: string
  portId?: string
  username?: string
  password?: string
  securityId?: string
  certificateId?: string
  name?: string
  certificateData?: string
  privateKey?: string
  autoRenew?: boolean
  serverId?: string
}

const tool = captureTool<InfraArgs>(registerInfrastructureTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getOrganizationIdMock.mockReset()
})

describe("dokploy_infrastructure ports", () => {
  it("createPort posts port.create with required + optional fields", async () => {
    postMock.mockResolvedValue({
      portId: "p1",
      publishedPort: 80,
      targetPort: 8080,
    })
    await tool.execute({
      action: "createPort",
      applicationId: "a1",
      publishedPort: 80,
      targetPort: 8080,
      protocol: "tcp",
      publishMode: "ingress",
    })
    expect(postMock).toHaveBeenCalledWith("port.create", {
      applicationId: "a1",
      publishedPort: 80,
      targetPort: 8080,
      protocol: "tcp",
      publishMode: "ingress",
    })
  })

  it("createPort omits protocol/publishMode when absent", async () => {
    postMock.mockResolvedValue({ portId: "p1", publishedPort: 80, targetPort: 8080 })
    await tool.execute({
      action: "createPort",
      applicationId: "a1",
      publishedPort: 80,
      targetPort: 8080,
    })
    expect(postMock).toHaveBeenCalledWith("port.create", {
      applicationId: "a1",
      publishedPort: 80,
      targetPort: 8080,
    })
  })

  it("deletePort posts port.delete with portId", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "deletePort", portId: "p1" })
    expect(postMock).toHaveBeenCalledWith("port.delete", { portId: "p1" })
  })
})

describe("dokploy_infrastructure auth", () => {
  it("createAuth posts security.create with credentials", async () => {
    postMock.mockResolvedValue({ securityId: "s1", username: "u", password: "p", applicationId: "a1" })
    await tool.execute({
      action: "createAuth",
      applicationId: "a1",
      username: "admin",
      password: "secret",
    })
    expect(postMock).toHaveBeenCalledWith("security.create", {
      applicationId: "a1",
      username: "admin",
      password: "secret",
    })
  })

  it("deleteAuth posts security.delete with securityId", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "deleteAuth", securityId: "s1" })
    expect(postMock).toHaveBeenCalledWith("security.delete", { securityId: "s1" })
  })
})

describe("dokploy_infrastructure certificates", () => {
  it("listCerts returns formatted list", async () => {
    getMock.mockResolvedValue([
      { certificateId: "c1", name: "Cert 1", autoRenew: true },
      { certificateId: "c2", name: "Cert 2" },
    ])
    const result = (await tool.execute({ action: "listCerts" })) as string
    expect(getMock).toHaveBeenCalledWith("certificates.all")
    expect(result).toContain("Certificates (2)")
    expect(result).toContain("Cert 1")
    expect(result).toContain("Cert 2")
  })

  it("listCerts returns empty message when no certs", async () => {
    getMock.mockResolvedValue([])
    const result = await tool.execute({ action: "listCerts" })
    expect(result).toBe("No certificates found.")
  })

  it("getCert calls certificates.one", async () => {
    getMock.mockResolvedValue({ certificateId: "c1", name: "Cert" })
    await tool.execute({ action: "getCert", certificateId: "c1" })
    expect(getMock).toHaveBeenCalledWith("certificates.one", { certificateId: "c1" })
  })

  it("createCert resolves organizationId and includes it in body", async () => {
    getOrganizationIdMock.mockResolvedValue("org-xyz")
    postMock.mockResolvedValue({ certificateId: "c1", name: "NewCert" })
    await tool.execute({
      action: "createCert",
      name: "NewCert",
      certificateData: "-----BEGIN CERT-----",
      privateKey: "-----BEGIN KEY-----",
      autoRenew: true,
      serverId: "srv-1",
    })
    expect(getOrganizationIdMock).toHaveBeenCalled()
    expect(postMock).toHaveBeenCalledWith("certificates.create", {
      name: "NewCert",
      certificateData: "-----BEGIN CERT-----",
      privateKey: "-----BEGIN KEY-----",
      organizationId: "org-xyz",
      autoRenew: true,
      serverId: "srv-1",
    })
  })

  it("createCert omits autoRenew/serverId when absent", async () => {
    getOrganizationIdMock.mockResolvedValue("org-xyz")
    postMock.mockResolvedValue({ certificateId: "c1", name: "NewCert" })
    await tool.execute({
      action: "createCert",
      name: "NewCert",
      certificateData: "cert",
      privateKey: "key",
    })
    expect(postMock).toHaveBeenCalledWith("certificates.create", {
      name: "NewCert",
      certificateData: "cert",
      privateKey: "key",
      organizationId: "org-xyz",
    })
  })

  it("createCert passes autoRenew=false explicitly", async () => {
    getOrganizationIdMock.mockResolvedValue("org-xyz")
    postMock.mockResolvedValue({ certificateId: "c1", name: "N" })
    await tool.execute({
      action: "createCert",
      name: "N",
      certificateData: "cert",
      privateKey: "key",
      autoRenew: false,
    })
    const [, body] = postMock.mock.calls[0]
    expect(body).toMatchObject({ autoRenew: false })
  })

  it("removeCert posts certificates.remove", async () => {
    postMock.mockResolvedValue(undefined)
    await tool.execute({ action: "removeCert", certificateId: "c1" })
    expect(postMock).toHaveBeenCalledWith("certificates.remove", { certificateId: "c1" })
  })
})
