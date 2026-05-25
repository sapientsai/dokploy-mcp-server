import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerMountsTools } from "../src/tools/mounts-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type MountArgs = {
  action: string
  mountId?: string
  type?: string
  mountPath?: string
  hostPath?: string | null
  volumeName?: string | null
  filePath?: string | null
  content?: string | null
  serviceType?: string
  serviceId?: string
  applicationId?: string | null
  composeId?: string | null
}

const tool = captureTool<MountArgs>(registerMountsTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_mounts create", () => {
  it("posts mounts.create for a volume mount with required fields", async () => {
    postMock.mockReturnValueOnce(
      IO.succeed({
        mountId: "m1",
        type: "volume",
        volumeName: "tokens",
        mountPath: "/data",
        serviceType: "application",
      }),
    )
    const result = (await tool.execute({
      action: "create",
      type: "volume",
      volumeName: "tokens",
      mountPath: "/data",
      serviceType: "application",
      serviceId: "app-1",
    })) as string
    expect(postMock).toHaveBeenCalledWith("mounts.create", {
      type: "volume",
      mountPath: "/data",
      serviceId: "app-1",
      serviceType: "application",
      volumeName: "tokens",
    })
    expect(result).toContain("Mount Created")
    expect(result).toContain("volume")
  })

  it("posts mounts.create for a bind mount including hostPath", async () => {
    postMock.mockReturnValueOnce(IO.succeed({ mountId: "m2", type: "bind", hostPath: "/srv/x", mountPath: "/data" }))
    await tool.execute({
      action: "create",
      type: "bind",
      hostPath: "/srv/x",
      mountPath: "/data",
      serviceType: "compose",
      serviceId: "c1",
    })
    expect(postMock).toHaveBeenCalledWith("mounts.create", {
      type: "bind",
      mountPath: "/data",
      serviceId: "c1",
      serviceType: "compose",
      hostPath: "/srv/x",
    })
  })

  it("posts mounts.create for a file mount including filePath+content", async () => {
    postMock.mockReturnValueOnce(IO.succeed({ mountId: "m3", type: "file", mountPath: "/etc/x" }))
    await tool.execute({
      action: "create",
      type: "file",
      filePath: "x.conf",
      content: "key=value",
      mountPath: "/etc/x",
      serviceType: "application",
      serviceId: "app-2",
    })
    expect(postMock).toHaveBeenCalledWith("mounts.create", {
      type: "file",
      mountPath: "/etc/x",
      serviceId: "app-2",
      serviceType: "application",
      filePath: "x.conf",
      content: "key=value",
    })
  })

  it("omits absent optional source fields", async () => {
    postMock.mockReturnValueOnce(IO.succeed({ mountId: "m4", type: "volume", mountPath: "/d" }))
    await tool.execute({
      action: "create",
      type: "volume",
      volumeName: "v",
      mountPath: "/d",
      serviceType: "postgres",
      serviceId: "pg-1",
    })
    const [, body] = postMock.mock.calls[0]
    expect(body).not.toHaveProperty("hostPath")
    expect(body).not.toHaveProperty("filePath")
    expect(body).not.toHaveProperty("content")
  })
})

describe("dokploy_mounts update / remove / get", () => {
  it("update posts mounts.update with mountId and provided fields only", async () => {
    await tool.execute({
      action: "update",
      mountId: "m1",
      mountPath: "/new",
      volumeName: "v2",
    })
    expect(postMock).toHaveBeenCalledWith("mounts.update", {
      mountId: "m1",
      mountPath: "/new",
      volumeName: "v2",
    })
  })

  it("remove posts mounts.remove with mountId", async () => {
    const result = (await tool.execute({ action: "remove", mountId: "m1" })) as string
    expect(postMock).toHaveBeenCalledWith("mounts.remove", { mountId: "m1" })
    expect(result).toBe("Mount m1 removed.")
  })

  it("get calls mounts.one with mountId", async () => {
    getMock.mockReturnValueOnce(
      IO.succeed({ mountId: "m1", type: "volume", volumeName: "v", mountPath: "/d", serviceType: "application" }),
    )
    const result = (await tool.execute({ action: "get", mountId: "m1" })) as string
    expect(getMock).toHaveBeenCalledWith("mounts.one", { mountId: "m1" })
    expect(result).toContain("Mount Details")
  })
})

describe("dokploy_mounts list endpoints", () => {
  it("listByServiceId calls mounts.listByServiceId with serviceType+serviceId", async () => {
    getMock.mockReturnValueOnce(
      IO.succeed([
        { mountId: "m1", type: "volume", volumeName: "v", mountPath: "/a", serviceType: "application" },
        { mountId: "m2", type: "bind", hostPath: "/h", mountPath: "/b", serviceType: "application" },
      ]),
    )
    const result = (await tool.execute({
      action: "listByServiceId",
      serviceType: "application",
      serviceId: "app-1",
    })) as string
    expect(getMock).toHaveBeenCalledWith("mounts.listByServiceId", {
      serviceType: "application",
      serviceId: "app-1",
    })
    expect(result).toContain("Mounts (2)")
  })

  it("listByServiceId returns empty message when no mounts", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    const result = await tool.execute({
      action: "listByServiceId",
      serviceType: "application",
      serviceId: "app-1",
    })
    expect(result).toBe("No mounts found.")
  })

  it("allNamedByApplicationId calls mounts.allNamedByApplicationId with applicationId", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "allNamedByApplicationId", applicationId: "app-1" })
    expect(getMock).toHaveBeenCalledWith("mounts.allNamedByApplicationId", { applicationId: "app-1" })
  })
})
