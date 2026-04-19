import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerSshKeyTools } from "../src/tools/ssh-key-tools"
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

type SshKeyArgs = {
  action: string
  sshKeyId?: string
  name?: string
  description?: string
  privateKey?: string
  publicKey?: string
  lastUsedAt?: string
  type?: "rsa" | "ed25519"
}

const tool = captureTool<SshKeyArgs>(registerSshKeyTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getOrganizationIdMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_ssh_key create", () => {
  it("resolves organizationId and posts sshKey.create", async () => {
    getOrganizationIdMock.mockResolvedValue("org-xyz")
    postMock.mockReturnValueOnce(IO.succeed({ sshKeyId: "k1", name: "deploy" }))
    await tool.execute({
      action: "create",
      name: "deploy",
      privateKey: "priv",
      publicKey: "pub",
      description: "d",
    })
    expect(getOrganizationIdMock).toHaveBeenCalled()
    expect(postMock).toHaveBeenCalledWith("sshKey.create", {
      name: "deploy",
      privateKey: "priv",
      publicKey: "pub",
      organizationId: "org-xyz",
      description: "d",
    })
  })

  it("omits description when absent", async () => {
    getOrganizationIdMock.mockResolvedValue("org-xyz")
    postMock.mockReturnValueOnce(IO.succeed({ sshKeyId: "k1", name: "deploy" }))
    await tool.execute({ action: "create", name: "deploy", privateKey: "p", publicKey: "pk" })
    expect(postMock).toHaveBeenCalledWith("sshKey.create", {
      name: "deploy",
      privateKey: "p",
      publicKey: "pk",
      organizationId: "org-xyz",
    })
  })
})

describe("dokploy_ssh_key list/get/remove", () => {
  it("list GETs sshKey.all", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list" })
    expect(getMock).toHaveBeenCalledWith("sshKey.all")
  })

  it("get calls sshKey.one", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ sshKeyId: "k1", name: "deploy" }))
    await tool.execute({ action: "get", sshKeyId: "k1" })
    expect(getMock).toHaveBeenCalledWith("sshKey.one", { sshKeyId: "k1" })
  })

  it("remove posts sshKey.remove", async () => {
    await tool.execute({ action: "remove", sshKeyId: "k1" })
    expect(postMock).toHaveBeenCalledWith("sshKey.remove", { sshKeyId: "k1" })
  })
})

describe("dokploy_ssh_key update", () => {
  it("includes sshKeyId plus only defined fields", async () => {
    await tool.execute({
      action: "update",
      sshKeyId: "k1",
      name: "new-name",
      lastUsedAt: "2025-01-01T00:00:00Z",
    })
    expect(postMock).toHaveBeenCalledWith("sshKey.update", {
      sshKeyId: "k1",
      name: "new-name",
      lastUsedAt: "2025-01-01T00:00:00Z",
    })
  })

  it("allows empty-string description", async () => {
    await tool.execute({ action: "update", sshKeyId: "k1", description: "" })
    expect(postMock).toHaveBeenCalledWith("sshKey.update", { sshKeyId: "k1", description: "" })
  })
})

describe("dokploy_ssh_key generate", () => {
  it("defaults type to ed25519 and includes organizationId", async () => {
    getOrganizationIdMock.mockResolvedValue("org-xyz")
    postMock.mockReturnValueOnce(IO.succeed({ sshKeyId: "k1", name: "gen" }))
    await tool.execute({ action: "generate" })
    expect(postMock).toHaveBeenCalledWith("sshKey.generate", {
      type: "ed25519",
      organizationId: "org-xyz",
    })
  })

  it("respects explicit type", async () => {
    getOrganizationIdMock.mockResolvedValue("org-xyz")
    postMock.mockReturnValueOnce(IO.succeed({ sshKeyId: "k1", name: "gen" }))
    await tool.execute({ action: "generate", type: "rsa" })
    expect(postMock).toHaveBeenCalledWith("sshKey.generate", {
      type: "rsa",
      organizationId: "org-xyz",
    })
  })
})
