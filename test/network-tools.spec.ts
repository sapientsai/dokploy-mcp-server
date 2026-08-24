import { HttpErrors, IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerNetworkTools } from "../src/tools/network-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type NetworkArgs = {
  action: string
  networkId?: string
  serverId?: string
  name?: string
  driver?: string
  internal?: boolean
  attachable?: boolean
  enableIPv4?: boolean
  enableIPv6?: boolean
  mtu?: number
  ipam?: { driver?: string; config?: Array<{ subnet?: string; gateway?: string; ipRange?: string }> }
  names?: string[]
}

const tool = captureTool<NetworkArgs>(registerNetworkTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_network list", () => {
  it("GETs network.all with no params by default", async () => {
    getMock.mockReturnValueOnce(IO.succeed([{ name: "dokploy-network" }]))
    const out = (await tool.execute({ action: "list" })) as string
    expect(getMock).toHaveBeenCalledWith("network.all", {})
    expect(out).toContain("dokploy-network")
  })

  it("scopes to a server when serverId is given", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list", serverId: "s1" })
    expect(getMock).toHaveBeenCalledWith("network.all", { serverId: "s1" })
  })

  it("reports an empty list rather than rendering an empty JSON array", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    expect(await tool.execute({ action: "list" })).toBe("No networks found.")
  })
})

describe("dokploy_network id-keyed actions", () => {
  it.each([
    ["get", "network.one"],
    ["inspect", "network.inspect"],
  ] as const)("%s GETs %s with networkId", async (action, endpoint) => {
    getMock.mockReturnValueOnce(IO.succeed({ Name: "n" }))
    await tool.execute({ action, networkId: "net-1" })
    expect(getMock).toHaveBeenCalledWith(endpoint, { networkId: "net-1" })
  })

  it("remove POSTs and confirms", async () => {
    const out = (await tool.execute({ action: "remove", networkId: "net-1" })) as string
    expect(postMock).toHaveBeenCalledWith("network.remove", { networkId: "net-1" })
    expect(out).toBe("Network net-1 removed.")
  })

  it("recreate warns that attached services were disconnected", async () => {
    const out = (await tool.execute({ action: "recreate", networkId: "net-1" })) as string
    expect(postMock).toHaveBeenCalledWith("network.recreate", { networkId: "net-1" })
    expect(out).toContain("disconnected and reattached")
  })

  it.each(["get", "inspect", "remove", "recreate"] as const)(
    "%s rejects a missing networkId before calling the API",
    async (action) => {
      await expect(tool.execute({ action })).rejects.toThrow(/requires networkId/)
      expect(getMock).not.toHaveBeenCalled()
      expect(postMock).not.toHaveBeenCalled()
    },
  )

  it("treats a null body as not found", async () => {
    getMock.mockReturnValueOnce(IO.succeed(null))
    expect(await tool.execute({ action: "get", networkId: "net-9" })).toBe("Network net-9 not found.")
  })
})

describe("dokploy_network create", () => {
  it("sends only name when nothing else is supplied", async () => {
    const out = (await tool.execute({ action: "create", name: "app-net" })) as string
    expect(postMock).toHaveBeenCalledWith("network.create", { name: "app-net" })
    expect(out).toBe("Network app-net created.")
  })

  it("forwards the optional fields it is given", async () => {
    await tool.execute({
      action: "create",
      name: "app-net",
      driver: "overlay",
      attachable: true,
      mtu: 1450,
      serverId: "s1",
    })
    expect(postMock).toHaveBeenCalledWith("network.create", {
      name: "app-net",
      driver: "overlay",
      attachable: true,
      mtu: 1450,
      serverId: "s1",
    })
  })

  it("forwards a nested ipam block intact", async () => {
    const ipam = { config: [{ subnet: "10.0.1.0/24", gateway: "10.0.1.1" }] }
    await tool.execute({ action: "create", name: "app-net", ipam })
    expect(postMock).toHaveBeenCalledWith("network.create", { name: "app-net", ipam })
  })

  it("preserves internal:false rather than dropping the falsy value", async () => {
    await tool.execute({ action: "create", name: "app-net", internal: false })
    expect(postMock).toHaveBeenCalledWith("network.create", { name: "app-net", internal: false })
  })

  it("rejects a missing name", async () => {
    await expect(tool.execute({ action: "create" })).rejects.toThrow(/requires name/)
    expect(postMock).not.toHaveBeenCalled()
  })
})

describe("dokploy_network import", () => {
  it("POSTs names and counts them back", async () => {
    const out = (await tool.execute({ action: "import", names: ["a", "b"] })) as string
    expect(postMock).toHaveBeenCalledWith("network.import", { names: ["a", "b"] })
    expect(out).toBe("Imported 2 networks: a, b.")
  })

  it("uses the singular for a single network", async () => {
    const out = (await tool.execute({ action: "import", names: ["a"], serverId: "s1" })) as string
    expect(postMock).toHaveBeenCalledWith("network.import", { names: ["a"], serverId: "s1" })
    expect(out).toBe("Imported 1 network: a.")
  })

  it("rejects an empty names array", async () => {
    await expect(tool.execute({ action: "import", names: [] })).rejects.toThrow(/requires names/)
    expect(postMock).not.toHaveBeenCalled()
  })

  it("rejects a missing names array", async () => {
    await expect(tool.execute({ action: "import" })).rejects.toThrow(/requires names/)
  })
})

describe("dokploy_network networksToSync", () => {
  it("GETs the sync candidates", async () => {
    getMock.mockReturnValueOnce(IO.succeed(["extra-net"]))
    const out = (await tool.execute({ action: "networksToSync", serverId: "s1" })) as string
    expect(getMock).toHaveBeenCalledWith("network.networksToSync", { serverId: "s1" })
    expect(out).toContain("extra-net")
  })

  it("says so when there is nothing to import", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    expect(await tool.execute({ action: "networksToSync" })).toBe("No unimported networks found on this server.")
  })
})

describe("dokploy_network errors", () => {
  it("surfaces API failures as thrown errors", async () => {
    postMock.mockReturnValueOnce(IO.fail(HttpErrors.httpStatusError("network.create", "POST", 409, "Conflict", "dup")))
    await expect(tool.execute({ action: "create", name: "app-net" })).rejects.toThrow()
  })
})
