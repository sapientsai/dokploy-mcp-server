import { HttpErrors, IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerDockerImageTools } from "../src/tools/docker-image-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type ImageArgs = {
  action: string
  imageRef?: string
  repository?: string
  tag?: string
  id?: string
  force?: boolean
  serverId?: string
}

const tool = captureTool<ImageArgs>(registerDockerImageTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_docker_image getImages", () => {
  it("GETs with no params by default", async () => {
    getMock.mockReturnValueOnce(IO.succeed([{ Id: "sha256:abc" }]))
    const out = (await tool.execute({ action: "getImages" })) as string
    expect(getMock).toHaveBeenCalledWith("dockerImage.getImages", {})
    expect(out).toContain("sha256:abc")
  })

  it("scopes to a server", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "getImages", serverId: "s1" })
    expect(getMock).toHaveBeenCalledWith("dockerImage.getImages", { serverId: "s1" })
  })

  it("reports an empty image list plainly", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    expect(await tool.execute({ action: "getImages" })).toBe("No images found.")
  })
})

describe("dokploy_docker_image getImageConfig", () => {
  it("GETs with imageRef", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ Architecture: "arm64" }))
    const out = (await tool.execute({ action: "getImageConfig", imageRef: "nginx:latest" })) as string
    expect(getMock).toHaveBeenCalledWith("dockerImage.getImageConfig", { imageRef: "nginx:latest" })
    expect(out).toContain("arm64")
  })

  it("rejects a missing imageRef", async () => {
    await expect(tool.execute({ action: "getImageConfig" })).rejects.toThrow(/requires imageRef/)
    expect(getMock).not.toHaveBeenCalled()
  })

  it("treats a null body as not found", async () => {
    getMock.mockReturnValueOnce(IO.succeed(null))
    expect(await tool.execute({ action: "getImageConfig", imageRef: "nope:1" })).toBe("Image nope:1 not found.")
  })
})

describe("dokploy_docker_image removeImage", () => {
  const full = { action: "removeImage", repository: "nginx", tag: "latest", id: "sha256:abc" }

  it("POSTs all three identifying fields", async () => {
    const out = (await tool.execute(full)) as string
    expect(postMock).toHaveBeenCalledWith("dockerImage.removeImage", {
      repository: "nginx",
      tag: "latest",
      id: "sha256:abc",
    })
    expect(out).toBe("Image nginx:latest (sha256:abc) removed.")
  })

  it("forwards force and serverId when given", async () => {
    await tool.execute({ ...full, force: true, serverId: "s1" })
    expect(postMock).toHaveBeenCalledWith("dockerImage.removeImage", {
      repository: "nginx",
      tag: "latest",
      id: "sha256:abc",
      force: true,
      serverId: "s1",
    })
  })

  it("forwards force:false rather than dropping it", async () => {
    await tool.execute({ ...full, force: false })
    expect(postMock).toHaveBeenCalledWith("dockerImage.removeImage", {
      repository: "nginx",
      tag: "latest",
      id: "sha256:abc",
      force: false,
    })
  })

  it("names every missing field instead of letting the API return a bare 400", async () => {
    await expect(tool.execute({ action: "removeImage", repository: "nginx" })).rejects.toThrow(/missing: tag, id/)
    expect(postMock).not.toHaveBeenCalled()
  })

  it("rejects when all three are absent", async () => {
    await expect(tool.execute({ action: "removeImage" })).rejects.toThrow(/missing: repository, tag, id/)
  })

  it("surfaces API failures as thrown errors", async () => {
    postMock.mockReturnValueOnce(
      IO.fail(HttpErrors.httpStatusError("dockerImage.removeImage", "POST", 409, "Conflict", "in use")),
    )
    await expect(tool.execute(full)).rejects.toThrow()
  })
})
