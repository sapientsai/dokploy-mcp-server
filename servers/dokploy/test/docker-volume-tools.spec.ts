import { HttpErrors, IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerDockerVolumeTools } from "../src/tools/docker-volume-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type VolumeArgs = {
  action: string
  volumeName?: string
  path?: string
  content?: string
  serverId?: string
}

const tool = captureTool<VolumeArgs>(registerDockerVolumeTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_docker_volume listings", () => {
  it.each([
    ["getVolumes", "dockerVolume.getVolumes"],
    ["getVolumesSize", "dockerVolume.getVolumesSize"],
  ] as const)("%s GETs %s with no params by default", async (action, endpoint) => {
    getMock.mockReturnValueOnce(IO.succeed([{ Name: "pgdata" }]))
    await tool.execute({ action })
    expect(getMock).toHaveBeenCalledWith(endpoint, {})
  })

  it("scopes listings to a server", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "getVolumes", serverId: "s1" })
    expect(getMock).toHaveBeenCalledWith("dockerVolume.getVolumes", { serverId: "s1" })
  })

  it("reports an empty volume list plainly", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    expect(await tool.execute({ action: "getVolumes" })).toBe("No volumes found.")
  })
})

describe("dokploy_docker_volume volume-keyed actions", () => {
  it("getVolumeConfig GETs with volumeName", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ Name: "pgdata" }))
    const out = (await tool.execute({ action: "getVolumeConfig", volumeName: "pgdata" })) as string
    expect(getMock).toHaveBeenCalledWith("dockerVolume.getVolumeConfig", { volumeName: "pgdata" })
    expect(out).toContain("pgdata")
  })

  it("removeVolume warns that the data is gone", async () => {
    const out = (await tool.execute({ action: "removeVolume", volumeName: "pgdata" })) as string
    expect(postMock).toHaveBeenCalledWith("dockerVolume.removeVolume", { volumeName: "pgdata" })
    expect(out).toContain("data is gone unless a backup exists")
  })

  it.each(["getVolumeConfig", "removeVolume"] as const)("%s rejects a missing volumeName", async (action) => {
    await expect(tool.execute({ action })).rejects.toThrow(/requires volumeName/)
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })

  it("treats a null config body as not found", async () => {
    getMock.mockReturnValueOnce(IO.succeed(null))
    expect(await tool.execute({ action: "getVolumeConfig", volumeName: "gone" })).toBe(
      "Volume gone not found on this server.",
    )
  })
})

describe("dokploy_docker_volume files", () => {
  it("listVolumeFiles GETs volumeName + path", async () => {
    getMock.mockReturnValueOnce(IO.succeed([{ name: "dump.sql" }]))
    const out = (await tool.execute({ action: "listVolumeFiles", volumeName: "pgdata", path: "/" })) as string
    expect(getMock).toHaveBeenCalledWith("dockerVolume.listVolumeFiles", { volumeName: "pgdata", path: "/" })
    expect(out).toContain("dump.sql")
  })

  it("readVolumeFile returns small files verbatim", async () => {
    getMock.mockReturnValueOnce(IO.succeed("hello"))
    expect(await tool.execute({ action: "readVolumeFile", volumeName: "v", path: "/f" })).toBe("hello")
  })

  it("readVolumeFile truncates oversized files", async () => {
    getMock.mockReturnValueOnce(IO.succeed("y".repeat(100_010)))
    const out = (await tool.execute({ action: "readVolumeFile", volumeName: "v", path: "/big" })) as string
    expect(out).toContain("[truncated: file is 100010 chars, showing first 100000]")
  })

  it("readVolumeFile reports an empty file", async () => {
    getMock.mockReturnValueOnce(IO.succeed(""))
    expect(await tool.execute({ action: "readVolumeFile", volumeName: "v", path: "/f" })).toBe("(empty file)")
  })

  it("writeVolumeFile POSTs content and confirms the size", async () => {
    const out = (await tool.execute({
      action: "writeVolumeFile",
      volumeName: "v",
      path: "/f",
      content: "abc",
    })) as string
    expect(postMock).toHaveBeenCalledWith("dockerVolume.writeVolumeFile", {
      volumeName: "v",
      path: "/f",
      content: "abc",
    })
    expect(out).toBe("Wrote 3 chars to v:/f.")
  })

  it("writeVolumeFile accepts empty content as a deliberate truncation", async () => {
    const out = (await tool.execute({ action: "writeVolumeFile", volumeName: "v", path: "/f", content: "" })) as string
    expect(postMock).toHaveBeenCalledWith("dockerVolume.writeVolumeFile", { volumeName: "v", path: "/f", content: "" })
    expect(out).toBe("Wrote 0 chars to v:/f.")
  })

  it("deleteVolumeFile POSTs volumeName + path", async () => {
    const out = (await tool.execute({ action: "deleteVolumeFile", volumeName: "v", path: "/f" })) as string
    expect(postMock).toHaveBeenCalledWith("dockerVolume.deleteVolumeFile", { volumeName: "v", path: "/f" })
    expect(out).toBe("Deleted v:/f.")
  })

  it("passes serverId through on file actions", async () => {
    getMock.mockReturnValueOnce(IO.succeed("x"))
    await tool.execute({ action: "readVolumeFile", volumeName: "v", path: "/f", serverId: "s1" })
    expect(getMock).toHaveBeenCalledWith("dockerVolume.readVolumeFile", {
      volumeName: "v",
      path: "/f",
      serverId: "s1",
    })
  })

  it.each(["listVolumeFiles", "readVolumeFile", "writeVolumeFile", "deleteVolumeFile"] as const)(
    "%s rejects a missing path",
    async (action) => {
      await expect(tool.execute({ action, volumeName: "v" })).rejects.toThrow(/requires path/)
    },
  )

  it("file actions reject a missing volumeName before checking path", async () => {
    await expect(tool.execute({ action: "readVolumeFile", path: "/f" })).rejects.toThrow(/requires volumeName/)
  })

  it("writeVolumeFile rejects missing content", async () => {
    await expect(tool.execute({ action: "writeVolumeFile", volumeName: "v", path: "/f" })).rejects.toThrow(
      /requires content/,
    )
    expect(postMock).not.toHaveBeenCalled()
  })
})

describe("dokploy_docker_volume errors", () => {
  it("surfaces API failures as thrown errors", async () => {
    postMock.mockReturnValueOnce(
      IO.fail(HttpErrors.httpStatusError("dockerVolume.removeVolume", "POST", 409, "Conflict", "in use")),
    )
    await expect(tool.execute({ action: "removeVolume", volumeName: "v" })).rejects.toThrow()
  })
})
