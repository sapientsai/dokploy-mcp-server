import { HttpErrors, IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerDockerTools } from "../src/tools/docker-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type DockerArgs = {
  action: string
  containerId?: string
  serverId?: string
  appName?: string
  method?: "match" | "label" | "stack" | "service"
  appType?: string
  type?: string
  path?: string
  content?: string
  minutes?: number
  sinceHours?: number
}

const tool = captureTool<DockerArgs>(registerDockerTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_docker getContainers", () => {
  it("calls docker.getContainers without serverId by default", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "getContainers" })
    expect(getMock).toHaveBeenCalledWith("docker.getContainers", {})
  })

  it("passes serverId when provided", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "getContainers", serverId: "srv-1" })
    expect(getMock).toHaveBeenCalledWith("docker.getContainers", { serverId: "srv-1" })
  })
})

describe("dokploy_docker container lifecycle", () => {
  it.each([
    ["restartContainer", "docker.restartContainer", "restarted"],
    ["startContainer", "docker.startContainer", "started"],
    ["stopContainer", "docker.stopContainer", "stopped"],
    ["killContainer", "docker.killContainer", "killed"],
    ["removeContainer", "docker.removeContainer", "removed"],
  ] as const)("%s posts to %s", async (action, endpoint, verb) => {
    const result = (await tool.execute({ action, containerId: "c1" })) as string
    expect(postMock).toHaveBeenCalledWith(endpoint, { containerId: "c1" })
    expect(result).toBe(`Container c1 ${verb}.`)
  })

  it("includes serverId when provided", async () => {
    await tool.execute({ action: "stopContainer", containerId: "c1", serverId: "srv-1" })
    expect(postMock).toHaveBeenCalledWith("docker.stopContainer", { containerId: "c1", serverId: "srv-1" })
  })
})

describe("dokploy_docker getConfig", () => {
  it("GETs docker.getConfig with optional serverId", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ Id: "c1" }))
    await tool.execute({ action: "getConfig", containerId: "c1", serverId: "srv-1" })
    expect(getMock).toHaveBeenCalledWith("docker.getConfig", {
      containerId: "c1",
      serverId: "srv-1",
    })
  })

  it("returns helpful message on 400 (malformed containerId)", async () => {
    getMock.mockReturnValueOnce(IO.fail(HttpErrors.httpStatusError("docker.getConfig", "GET", 400, "Bad Request", "")))
    const result = (await tool.execute({ action: "getConfig", containerId: "c1" })) as string
    expect(result).toContain("Ensure the containerId is a valid Docker container ID")
  })

  it("returns helpful message on 404 (container not found on server)", async () => {
    getMock.mockReturnValueOnce(IO.fail(HttpErrors.httpStatusError("docker.getConfig", "GET", 404, "Not Found", "")))
    const result = (await tool.execute({ action: "getConfig", containerId: "c1" })) as string
    expect(result).toContain("Ensure the containerId is a valid Docker container ID")
  })

  it("returns helpful message when API returns 200 with null body (Dokploy's actual not-found behavior)", async () => {
    getMock.mockReturnValueOnce(IO.succeed(null))
    const result = (await tool.execute({ action: "getConfig", containerId: "c1" })) as string
    expect(result).toContain("Ensure the containerId is a valid Docker container ID")
    expect(result).not.toContain("undefined")
  })

  it("returns helpful message when API returns 200 with undefined body", async () => {
    getMock.mockReturnValueOnce(IO.succeed(undefined))
    const result = (await tool.execute({ action: "getConfig", containerId: "c1" })) as string
    expect(result).toContain("Ensure the containerId is a valid Docker container ID")
    expect(result).not.toContain("undefined")
  })

  it("re-throws 5xx errors", async () => {
    getMock.mockReturnValueOnce(IO.fail(HttpErrors.httpStatusError("docker.getConfig", "GET", 500, "Internal", "boom")))
    await expect(tool.execute({ action: "getConfig", containerId: "c1" })).rejects.toThrow(/500/)
  })
})

describe("dokploy_docker findContainers", () => {
  it.each([
    ["match", "docker.getContainersByAppNameMatch"],
    ["stack", "docker.getStackContainersByAppName"],
    ["service", "docker.getServiceContainersByAppName"],
  ] as const)("%s method hits %s endpoint", async (method, endpoint) => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "findContainers", method, appName: "my-app" })
    expect(getMock).toHaveBeenCalledWith(endpoint, { appName: "my-app" })
  })

  it("label method requires type (standalone|swarm) and hits getContainersByAppLabel", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "findContainers", method: "label", appName: "my-app", type: "swarm" })
    expect(getMock).toHaveBeenCalledWith("docker.getContainersByAppLabel", {
      appName: "my-app",
      type: "swarm",
    })
  })

  it("includes appType only for match method (enum: stack | docker-compose)", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({
      action: "findContainers",
      method: "match",
      appName: "my-app",
      appType: "docker-compose",
      type: "swarm",
    })
    expect(getMock).toHaveBeenCalledWith("docker.getContainersByAppNameMatch", {
      appName: "my-app",
      appType: "docker-compose",
    })
  })

  it("includes type only for label method (enum: standalone | swarm)", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({
      action: "findContainers",
      method: "label",
      appName: "my-app",
      type: "standalone",
      appType: "stack",
    })
    expect(getMock).toHaveBeenCalledWith("docker.getContainersByAppLabel", {
      appName: "my-app",
      type: "standalone",
    })
  })

  it("throws when method missing", async () => {
    await expect(tool.execute({ action: "findContainers", appName: "x" })).rejects.toThrow(/requires method/)
  })

  it("throws when label method called without type", async () => {
    await expect(tool.execute({ action: "findContainers", method: "label", appName: "my-app" })).rejects.toThrow(
      /requires type/,
    )
  })
})

describe("dokploy_docker container files", () => {
  it("listContainerFiles GETs with containerId + path", async () => {
    getMock.mockReturnValueOnce(IO.succeed([{ name: "app.log" }]))
    const out = (await tool.execute({ action: "listContainerFiles", containerId: "c1", path: "/var/log" })) as string
    expect(getMock).toHaveBeenCalledWith("docker.listContainerFiles", { containerId: "c1", path: "/var/log" })
    expect(out).toContain("app.log")
  })

  it("passes serverId through on file actions", async () => {
    getMock.mockReturnValueOnce(IO.succeed("hi"))
    await tool.execute({ action: "readContainerFile", containerId: "c1", path: "/etc/hosts", serverId: "s1" })
    expect(getMock).toHaveBeenCalledWith("docker.readContainerFile", {
      containerId: "c1",
      path: "/etc/hosts",
      serverId: "s1",
    })
  })

  it("readContainerFile returns file contents verbatim when small", async () => {
    getMock.mockReturnValueOnce(IO.succeed("line1\nline2"))
    const out = (await tool.execute({ action: "readContainerFile", containerId: "c1", path: "/f" })) as string
    expect(out).toBe("line1\nline2")
  })

  it("readContainerFile truncates oversized files and says so", async () => {
    getMock.mockReturnValueOnce(IO.succeed("x".repeat(100_050)))
    const out = (await tool.execute({ action: "readContainerFile", containerId: "c1", path: "/big" })) as string
    expect(out).toContain("[truncated: file is 100050 chars, showing first 100000]")
    expect(out.startsWith("x".repeat(100_000))).toBe(true)
  })

  it("readContainerFile reports an empty file rather than returning nothing", async () => {
    getMock.mockReturnValueOnce(IO.succeed(""))
    expect(await tool.execute({ action: "readContainerFile", containerId: "c1", path: "/f" })).toBe("(empty file)")
  })

  it("writeContainerFile POSTs content and confirms the byte count", async () => {
    const out = (await tool.execute({
      action: "writeContainerFile",
      containerId: "c1",
      path: "/f",
      content: "hello",
    })) as string
    expect(postMock).toHaveBeenCalledWith("docker.writeContainerFile", {
      containerId: "c1",
      path: "/f",
      content: "hello",
    })
    expect(out).toBe("Wrote 5 chars to c1:/f.")
  })

  it("deleteContainerFile POSTs containerId + path", async () => {
    const out = (await tool.execute({ action: "deleteContainerFile", containerId: "c1", path: "/f" })) as string
    expect(postMock).toHaveBeenCalledWith("docker.deleteContainerFile", { containerId: "c1", path: "/f" })
    expect(out).toBe("Deleted c1:/f.")
  })

  it.each(["listContainerFiles", "readContainerFile", "writeContainerFile", "deleteContainerFile"] as const)(
    "%s rejects a missing path before calling the API",
    async (action) => {
      await expect(tool.execute({ action, containerId: "c1" })).rejects.toThrow(/requires path/)
      expect(getMock).not.toHaveBeenCalled()
      expect(postMock).not.toHaveBeenCalled()
    },
  )

  it("file actions reject a missing containerId", async () => {
    await expect(tool.execute({ action: "readContainerFile", path: "/f" })).rejects.toThrow(/requires containerId/)
  })

  it("writeContainerFile rejects missing content", async () => {
    await expect(tool.execute({ action: "writeContainerFile", containerId: "c1", path: "/f" })).rejects.toThrow(
      /requires content/,
    )
    expect(postMock).not.toHaveBeenCalled()
  })

  it("writeContainerFile accepts empty-string content as a deliberate truncation", async () => {
    const out = (await tool.execute({
      action: "writeContainerFile",
      containerId: "c1",
      path: "/f",
      content: "",
    })) as string
    expect(postMock).toHaveBeenCalledWith("docker.writeContainerFile", { containerId: "c1", path: "/f", content: "" })
    expect(out).toBe("Wrote 0 chars to c1:/f.")
  })
})

describe("dokploy_docker observability", () => {
  it("getEvents omits minutes when not supplied", async () => {
    getMock.mockReturnValueOnce(IO.succeed([{ type: "container" }]))
    await tool.execute({ action: "getEvents" })
    expect(getMock).toHaveBeenCalledWith("docker.getEvents", {})
  })

  it("getEvents passes serverId and minutes", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "getEvents", serverId: "s1", minutes: 60 })
    expect(getMock).toHaveBeenCalledWith("docker.getEvents", { serverId: "s1", minutes: 60 })
  })

  it("getServerHealth passes sinceHours", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ ok: true }))
    const out = (await tool.execute({ action: "getServerHealth", sinceHours: 24 })) as string
    expect(getMock).toHaveBeenCalledWith("docker.getServerHealth", { sinceHours: 24 })
    expect(out).toContain("Server Health")
  })

  it("reports a null body as no data rather than dumping null", async () => {
    getMock.mockReturnValueOnce(IO.succeed(null))
    expect(await tool.execute({ action: "getServerHealth" })).toBe("(no health data available)")
  })
})

describe("dokploy_docker disk usage", () => {
  it("getDiskUsage GETs the dockerDiskUsage endpoint", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ LayersSize: 1 }))
    const out = (await tool.execute({ action: "getDiskUsage", serverId: "s1" })) as string
    expect(getMock).toHaveBeenCalledWith("dockerDiskUsage.getDiskUsage", { serverId: "s1" })
    expect(out).toContain("Docker Disk Usage")
  })

  it("getBuildCache GETs the build cache endpoint", async () => {
    getMock.mockReturnValueOnce(IO.succeed([{ ID: "abc" }]))
    await tool.execute({ action: "getBuildCache" })
    expect(getMock).toHaveBeenCalledWith("dockerDiskUsage.getBuildCache", {})
  })

  it("pruneBuildCache POSTs an empty body without serverId", async () => {
    const out = (await tool.execute({ action: "pruneBuildCache" })) as string
    expect(postMock).toHaveBeenCalledWith("dockerDiskUsage.pruneBuildCache", {})
    expect(out).toBe("Build cache pruned.")
  })

  it("pruneBuildCache names the server when scoped", async () => {
    const out = (await tool.execute({ action: "pruneBuildCache", serverId: "s1" })) as string
    expect(postMock).toHaveBeenCalledWith("dockerDiskUsage.pruneBuildCache", { serverId: "s1" })
    expect(out).toBe("Build cache pruned on server s1.")
  })

  it("surfaces API failures as thrown errors", async () => {
    getMock.mockReturnValueOnce(
      IO.fail(HttpErrors.httpStatusError("dockerDiskUsage.getDiskUsage", "GET", 500, "Internal", "boom")),
    )
    await expect(tool.execute({ action: "getDiskUsage" })).rejects.toThrow()
  })
})
