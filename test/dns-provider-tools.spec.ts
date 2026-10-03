import { HttpErrors, IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerDnsProviderTools } from "../src/tools/dns-provider-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type DnsArgs = {
  action: string
  dnsProviderId?: string
  name?: string
  config?: Record<string, string>
  zoneId?: string
  recordId?: string
  type?: string
  recordName?: string
  content?: string
  ttl?: number
  proxied?: boolean
}

const tool = captureTool<DnsArgs>(registerDnsProviderTools)
const CLOUDFLARE = { providerType: "cloudflare", apiToken: "cf-secret-token" }

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_dns_provider providers", () => {
  it("list summarizes by id, name and providerType", async () => {
    getMock.mockReturnValueOnce(
      IO.succeed([{ dnsProviderId: "dns-1", name: "cf", config: { providerType: "cloudflare" } }]),
    )
    const out = (await tool.execute({ action: "list" })) as string
    expect(getMock).toHaveBeenCalledWith("dnsProvider.all")
    expect(out).toContain("cf (dns-1) — cloudflare")
  })

  it("list never echoes credentials that come back in the response", async () => {
    getMock.mockReturnValueOnce(
      IO.succeed([{ dnsProviderId: "dns-1", name: "cf", config: { providerType: "cloudflare", apiToken: "LEAKED" } }]),
    )
    const out = (await tool.execute({ action: "list" })) as string
    expect(out).not.toContain("LEAKED")
    expect(out).toContain("Credentials not echoed.")
  })

  it("get never echoes credentials", async () => {
    getMock.mockReturnValueOnce(
      IO.succeed({
        dnsProviderId: "dns-1",
        name: "cf",
        config: { providerType: "route53", secretAccessKey: "LEAKED" },
      }),
    )
    const out = (await tool.execute({ action: "get", dnsProviderId: "dns-1" })) as string
    expect(getMock).toHaveBeenCalledWith("dnsProvider.one", { dnsProviderId: "dns-1" })
    expect(out).not.toContain("LEAKED")
    expect(out).toContain("route53")
  })

  it("labels a provider with no providerType as unknown, not 'undefined'", async () => {
    getMock.mockReturnValueOnce(IO.succeed([{ dnsProviderId: "dns-1", name: "cf", config: {} }]))
    const out = (await tool.execute({ action: "list" })) as string
    expect(out).toContain("cf (dns-1) — unknown")
    expect(out).not.toContain("undefined")
  })

  it("reports an empty provider list plainly", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    expect(await tool.execute({ action: "list" })).toBe("No DNS providers configured.")
  })

  it("create POSTs name + config and confirms without echoing the token", async () => {
    const out = (await tool.execute({ action: "create", name: "cf", config: CLOUDFLARE })) as string
    expect(postMock).toHaveBeenCalledWith("dnsProvider.create", { name: "cf", config: CLOUDFLARE })
    expect(out).toContain("created (cloudflare)")
    expect(out).not.toContain("cf-secret-token")
  })

  it("update requires all three fields and explains the wholesale replace", async () => {
    await expect(tool.execute({ action: "update", dnsProviderId: "dns-1", name: "cf" })).rejects.toThrow(
      /replaces the provider wholesale/,
    )
    expect(postMock).not.toHaveBeenCalled()
  })

  it("update POSTs all three when given", async () => {
    await tool.execute({ action: "update", dnsProviderId: "dns-1", name: "cf2", config: CLOUDFLARE })
    expect(postMock).toHaveBeenCalledWith("dnsProvider.update", {
      dnsProviderId: "dns-1",
      name: "cf2",
      config: CLOUDFLARE,
    })
  })

  it("remove POSTs the id", async () => {
    const out = (await tool.execute({ action: "remove", dnsProviderId: "dns-1" })) as string
    expect(postMock).toHaveBeenCalledWith("dnsProvider.remove", { dnsProviderId: "dns-1" })
    expect(out).toBe("DNS provider dns-1 removed.")
  })

  it("testConnection accepts a saved provider id", async () => {
    await tool.execute({ action: "testConnection", dnsProviderId: "dns-1" })
    expect(postMock).toHaveBeenCalledWith("dnsProvider.testConnection", { dnsProviderId: "dns-1" })
  })

  it("testConnection accepts a raw config for a not-yet-saved provider", async () => {
    const out = (await tool.execute({ action: "testConnection", config: CLOUDFLARE })) as string
    expect(postMock).toHaveBeenCalledWith("dnsProvider.testConnection", { config: CLOUDFLARE })
    expect(out).not.toContain("cf-secret-token")
  })

  it("testConnection rejects when given neither", async () => {
    await expect(tool.execute({ action: "testConnection" })).rejects.toThrow(/requires dnsProviderId or config/)
  })
})

describe("dokploy_dns_provider zones and records", () => {
  it("listZones GETs with the provider id", async () => {
    getMock.mockReturnValueOnce(IO.succeed([{ id: "z1", name: "example.com" }]))
    const out = (await tool.execute({ action: "listZones", dnsProviderId: "dns-1" })) as string
    expect(getMock).toHaveBeenCalledWith("dnsProvider.listZones", { dnsProviderId: "dns-1" })
    expect(out).toContain("example.com")
  })

  it("listRecords GETs with provider + zone", async () => {
    getMock.mockReturnValueOnce(IO.succeed([{ id: "r1" }]))
    await tool.execute({ action: "listRecords", dnsProviderId: "dns-1", zoneId: "z1" })
    expect(getMock).toHaveBeenCalledWith("dnsProvider.listRecords", { dnsProviderId: "dns-1", zoneId: "z1" })
  })

  it("listRecords names every missing field", async () => {
    await expect(tool.execute({ action: "listRecords", dnsProviderId: "dns-1" })).rejects.toThrow(/requires zoneId/)
  })

  it("createRecord maps recordName onto the API's `name` field", async () => {
    const out = (await tool.execute({
      action: "createRecord",
      dnsProviderId: "dns-1",
      zoneId: "z1",
      type: "A",
      recordName: "app.example.com",
      content: "203.0.113.10",
    })) as string
    expect(postMock).toHaveBeenCalledWith("dnsProvider.createRecord", {
      type: "A",
      name: "app.example.com",
      content: "203.0.113.10",
      dnsProviderId: "dns-1",
      zoneId: "z1",
    })
    expect(out).toContain("app.example.com -> 203.0.113.10")
  })

  it("createRecord forwards ttl when given", async () => {
    await tool.execute({
      action: "createRecord",
      dnsProviderId: "dns-1",
      zoneId: "z1",
      type: "CNAME",
      recordName: "www",
      content: "app.example.com",
      ttl: 300,
    })
    expect(postMock).toHaveBeenCalledWith("dnsProvider.createRecord", {
      type: "CNAME",
      name: "www",
      content: "app.example.com",
      dnsProviderId: "dns-1",
      zoneId: "z1",
      ttl: 300,
    })
  })

  it("updateRecord includes recordId alongside the record body", async () => {
    await tool.execute({
      action: "updateRecord",
      dnsProviderId: "dns-1",
      zoneId: "z1",
      recordId: "r1",
      type: "A",
      recordName: "app",
      content: "203.0.113.11",
    })
    expect(postMock).toHaveBeenCalledWith("dnsProvider.updateRecord", {
      type: "A",
      name: "app",
      content: "203.0.113.11",
      dnsProviderId: "dns-1",
      zoneId: "z1",
      recordId: "r1",
    })
  })

  it("deleteRecord POSTs the three ids only", async () => {
    const out = (await tool.execute({
      action: "deleteRecord",
      dnsProviderId: "dns-1",
      zoneId: "z1",
      recordId: "r1",
    })) as string
    expect(postMock).toHaveBeenCalledWith("dnsProvider.deleteRecord", {
      dnsProviderId: "dns-1",
      zoneId: "z1",
      recordId: "r1",
    })
    expect(out).toBe("Deleted record r1 from zone z1.")
  })

  it("createRecord reports every missing field at once", async () => {
    await expect(tool.execute({ action: "createRecord", dnsProviderId: "dns-1" })).rejects.toThrow(
      /requires zoneId, type, recordName, content/,
    )
    expect(postMock).not.toHaveBeenCalled()
  })

  it("offers every record type the API accepts", () => {
    const shape = tool.parameters as { shape: { type: { unwrap: () => { options: unknown[] } } } }
    expect(shape.shape.type.unwrap().options).toEqual(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "PTR"])
  })

  it("createRecord forwards proxied when given, including false", async () => {
    await tool.execute({
      action: "createRecord",
      dnsProviderId: "dns-1",
      zoneId: "z1",
      type: "A",
      recordName: "app",
      content: "203.0.113.10",
      proxied: false,
    })
    expect(postMock).toHaveBeenCalledWith("dnsProvider.createRecord", expect.objectContaining({ proxied: false }))
  })
})

describe("dokploy_dns_provider config schema", () => {
  const config = (tool.parameters as { shape: { config: { safeParse: (v: unknown) => { success: boolean } } } }).shape
    .config

  it("accepts the providers added in Dokploy v0.30.8", () => {
    expect(config.safeParse({ providerType: "porkbun", apiKey: "k", secretApiKey: "s" }).success).toBe(true)
    expect(config.safeParse({ providerType: "infomaniak", apiToken: "t" }).success).toBe(true)
    expect(
      config.safeParse({
        providerType: "ovh",
        endpoint: "ovh-ca",
        applicationKey: "a",
        applicationSecret: "b",
        consumerKey: "c",
      }).success,
    ).toBe(true)
  })

  it("rejects a provider config missing a required credential", () => {
    expect(config.safeParse({ providerType: "porkbun", apiKey: "k" }).success).toBe(false)
    expect(config.safeParse({ providerType: "ovh", applicationKey: "a", applicationSecret: "b" }).success).toBe(false)
  })
})

describe("dokploy_dns_provider errors", () => {
  it("surfaces API failures as thrown errors", async () => {
    postMock.mockReturnValueOnce(
      IO.fail(HttpErrors.httpStatusError("dnsProvider.testConnection", "POST", 401, "Unauthorized", "bad token")),
    )
    await expect(tool.execute({ action: "testConnection", dnsProviderId: "dns-1" })).rejects.toThrow()
  })
})
