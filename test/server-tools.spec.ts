import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerServerTools } from "../src/tools/server-tools"
import { captureTool } from "./support/tool-harness"

const { getIOMock, postIOMock } = vi.hoisted(() => ({
  getIOMock: vi.fn(),
  postIOMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ getIO: getIOMock, postIO: postIOMock }),
}))

type ServerArgs = {
  action: string
  serverId?: string
  name?: string
  ipAddress?: string
  port?: number
  username?: string
  sshKeyId?: string
  serverType?: string
  description?: string
  url?: string
  token?: string
  dataPoints?: string
}

const tool = captureTool<ServerArgs>(registerServerTools)

beforeEach(() => {
  getIOMock.mockReset()
  postIOMock.mockReset()
  getIOMock.mockImplementation(() => IO.succeed(undefined))
  postIOMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_server", () => {
  it("list calls server.all", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list" })
    expect(getIOMock).toHaveBeenCalledWith("server.all")
  })

  it("get calls server.one", async () => {
    getIOMock.mockReturnValueOnce(
      IO.succeed({
        serverId: "s1",
        name: "n",
        ipAddress: "1.1.1.1",
        port: 22,
        username: "u",
        sshKeyId: "k",
        serverType: "swarm",
      }),
    )
    await tool.execute({ action: "get", serverId: "s1" })
    expect(getIOMock).toHaveBeenCalledWith("server.one", { serverId: "s1" })
  })

  it("create posts server.create with all required fields", async () => {
    postIOMock.mockReturnValueOnce(
      IO.succeed({
        serverId: "s1",
        name: "edge",
        ipAddress: "1.2.3.4",
        port: 22,
        username: "root",
        sshKeyId: "k1",
        serverType: "swarm",
      }),
    )
    await tool.execute({
      action: "create",
      name: "edge",
      ipAddress: "1.2.3.4",
      port: 22,
      username: "root",
      sshKeyId: "k1",
      serverType: "swarm",
      description: "edge node",
    })
    expect(postIOMock).toHaveBeenCalledWith("server.create", {
      name: "edge",
      ipAddress: "1.2.3.4",
      port: 22,
      username: "root",
      sshKeyId: "k1",
      serverType: "swarm",
      description: "edge node",
    })
  })

  it("update posts server.update with all fields", async () => {
    await tool.execute({
      action: "update",
      serverId: "s1",
      name: "edge",
      ipAddress: "1.2.3.4",
      port: 22,
      username: "root",
      sshKeyId: "k1",
      serverType: "swarm",
    })
    expect(postIOMock).toHaveBeenCalledWith("server.update", {
      serverId: "s1",
      name: "edge",
      ipAddress: "1.2.3.4",
      port: 22,
      username: "root",
      sshKeyId: "k1",
      serverType: "swarm",
    })
  })

  it("remove posts server.remove", async () => {
    await tool.execute({ action: "remove", serverId: "s1" })
    expect(postIOMock).toHaveBeenCalledWith("server.remove", { serverId: "s1" })
  })

  it("count GETs server.count and returns total", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed(3))
    const result = (await tool.execute({ action: "count" })) as string
    expect(getIOMock).toHaveBeenCalledWith("server.count")
    expect(result).toBe("Total servers: 3")
  })

  it("publicIp GETs server.publicIp", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed("1.2.3.4"))
    const result = (await tool.execute({ action: "publicIp" })) as string
    expect(result).toBe("Public IP: 1.2.3.4")
  })

  it("getMetrics passes url+token+optional dataPoints", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed({ cpu: [] }))
    await tool.execute({
      action: "getMetrics",
      url: "http://metrics",
      token: "tok",
      dataPoints: "60",
    })
    expect(getIOMock).toHaveBeenCalledWith("server.getServerMetrics", {
      url: "http://metrics",
      token: "tok",
      dataPoints: "60",
    })
  })
})
