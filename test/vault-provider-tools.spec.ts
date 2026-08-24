import { HttpErrors, IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerVaultProviderTools } from "../src/tools/vault-provider-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type VaultArgs = {
  action: string
  vaultProviderId?: string
  name?: string
  config?: Record<string, string>
  assignments?: Array<{ projectId: string; environmentIds?: string[] }>
  projectId?: string
  environmentId?: string
}

const tool = captureTool<VaultArgs>(registerVaultProviderTools)
const HASHICORP = { providerType: "hashicorp", url: "https://vault.example.com", token: "hvs.SUPERSECRET" }
const ASSIGNMENTS = [{ projectId: "proj-1", environmentIds: ["env-1"] }]

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_vault_provider reads never echo credentials", () => {
  it("list summarizes id, name and providerType only", async () => {
    getMock.mockReturnValueOnce(
      IO.succeed([
        { vaultProviderId: "v-1", name: "prod-vault", config: { providerType: "hashicorp", token: "LEAKED" } },
      ]),
    )
    const out = (await tool.execute({ action: "list" })) as string
    expect(getMock).toHaveBeenCalledWith("vaultProvider.all")
    expect(out).toContain("prod-vault (v-1) — hashicorp")
    expect(out).not.toContain("LEAKED")
  })

  it("get drops the stored config body", async () => {
    getMock.mockReturnValueOnce(
      IO.succeed({
        vaultProviderId: "v-1",
        name: "prod-vault",
        config: { providerType: "aws", accessKeyId: "AKIA_LEAKED", secretAccessKey: "LEAKED" },
      }),
    )
    const out = (await tool.execute({ action: "get", vaultProviderId: "v-1" })) as string
    expect(out).toContain("aws")
    expect(out).not.toContain("LEAKED")
    expect(out).not.toContain("AKIA_LEAKED")
  })

  it("reports an empty provider list plainly", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    expect(await tool.execute({ action: "list" })).toBe("No vault providers configured.")
  })

  it("get reports a missing provider rather than rendering null", async () => {
    getMock.mockReturnValueOnce(IO.succeed(null))
    const out = (await tool.execute({ action: "get", vaultProviderId: "gone" })) as string
    expect(out).toContain("(provider not found)")
  })
})

describe("dokploy_vault_provider writes", () => {
  it("create POSTs name, config and assignments without echoing the token", async () => {
    const out = (await tool.execute({
      action: "create",
      name: "prod-vault",
      config: HASHICORP,
      assignments: ASSIGNMENTS,
    })) as string
    expect(postMock).toHaveBeenCalledWith("vaultProvider.create", {
      name: "prod-vault",
      config: HASHICORP,
      assignments: ASSIGNMENTS,
    })
    expect(out).toContain("created (hashicorp)")
    expect(out).toContain("assigned to 1 project")
    expect(out).not.toContain("hvs.SUPERSECRET")
  })

  it("create reports every missing field", async () => {
    await expect(tool.execute({ action: "create", name: "prod-vault" })).rejects.toThrow(/requires config, assignments/)
    expect(postMock).not.toHaveBeenCalled()
  })

  it("update explains that the API replaces the provider wholesale", async () => {
    await expect(tool.execute({ action: "update", vaultProviderId: "v-1", name: "renamed" })).rejects.toThrow(
      /replaces the provider wholesale/,
    )
    expect(postMock).not.toHaveBeenCalled()
  })

  it("update POSTs all four fields when given", async () => {
    await tool.execute({
      action: "update",
      vaultProviderId: "v-1",
      name: "renamed",
      config: HASHICORP,
      assignments: ASSIGNMENTS,
    })
    expect(postMock).toHaveBeenCalledWith("vaultProvider.update", {
      vaultProviderId: "v-1",
      name: "renamed",
      config: HASHICORP,
      assignments: ASSIGNMENTS,
    })
  })

  it("remove POSTs the id", async () => {
    const out = (await tool.execute({ action: "remove", vaultProviderId: "v-1" })) as string
    expect(postMock).toHaveBeenCalledWith("vaultProvider.remove", { vaultProviderId: "v-1" })
    expect(out).toBe("Vault provider v-1 removed.")
  })

  it("testConnection works from a saved id or a raw config", async () => {
    await tool.execute({ action: "testConnection", vaultProviderId: "v-1" })
    expect(postMock).toHaveBeenCalledWith("vaultProvider.testConnection", { vaultProviderId: "v-1" })

    postMock.mockClear()
    const out = (await tool.execute({ action: "testConnection", config: HASHICORP })) as string
    expect(postMock).toHaveBeenCalledWith("vaultProvider.testConnection", { config: HASHICORP })
    expect(out).not.toContain("hvs.SUPERSECRET")
  })

  it("testConnection rejects when given neither", async () => {
    await expect(tool.execute({ action: "testConnection" })).rejects.toThrow(/requires vaultProviderId or config/)
  })
})

describe("dokploy_vault_provider listSecretNames", () => {
  it("GETs with provider + project, and says names only", async () => {
    getMock.mockReturnValueOnce(IO.succeed(["DB_PASSWORD", "API_KEY"]))
    const out = (await tool.execute({
      action: "listSecretNames",
      vaultProviderId: "v-1",
      projectId: "proj-1",
    })) as string
    expect(getMock).toHaveBeenCalledWith("vaultProvider.listSecretNames", {
      vaultProviderId: "v-1",
      projectId: "proj-1",
    })
    expect(out).toContain("DB_PASSWORD")
    expect(out).toContain("API_KEY")
    expect(out).toContain("no API to read secret values")
  })

  it("narrows to one environment when given", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({
      action: "listSecretNames",
      vaultProviderId: "v-1",
      projectId: "proj-1",
      environmentId: "env-1",
    })
    expect(getMock).toHaveBeenCalledWith("vaultProvider.listSecretNames", {
      vaultProviderId: "v-1",
      projectId: "proj-1",
      environmentId: "env-1",
    })
  })

  it("handles objects as well as bare strings in the response", async () => {
    getMock.mockReturnValueOnce(IO.succeed([{ name: "DB_PASSWORD" }]))
    const out = (await tool.execute({
      action: "listSecretNames",
      vaultProviderId: "v-1",
      projectId: "proj-1",
    })) as string
    expect(out).toContain("DB_PASSWORD")
  })

  it("reports an empty result plainly", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    expect(await tool.execute({ action: "listSecretNames", vaultProviderId: "v-1", projectId: "proj-1" })).toBe(
      "No secret names returned for this project/environment.",
    )
  })

  it("requires both provider and project", async () => {
    await expect(tool.execute({ action: "listSecretNames", vaultProviderId: "v-1" })).rejects.toThrow(
      /requires projectId/,
    )
  })
})

describe("dokploy_vault_provider errors", () => {
  it("surfaces API failures as thrown errors", async () => {
    postMock.mockReturnValueOnce(
      IO.fail(HttpErrors.httpStatusError("vaultProvider.testConnection", "POST", 403, "Forbidden", "denied")),
    )
    await expect(tool.execute({ action: "testConnection", vaultProviderId: "v-1" })).rejects.toThrow()
  })
})
