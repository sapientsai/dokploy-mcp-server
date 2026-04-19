import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { HttpError } from "../src/client/errors"
import { registerComposeTools } from "../src/tools/compose-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type ComposeArgs = {
  action: string
  composeId?: string
  name?: string
  environmentId?: string
  description?: string
  composeType?: string
  composeFile?: string
  serverId?: string
  env?: string
  command?: string
  sourceType?: string
  customGitUrl?: string
  customGitBranch?: string
  customGitSSHKeyId?: string
  repository?: string
  branch?: string
  owner?: string
  composePath?: string
  autoDeploy?: boolean
  appName?: string
  deleteVolumes?: boolean
  redeploy?: boolean
  title?: string
  deployDescription?: string
  targetEnvironmentId?: string
  type?: string
  serviceName?: string
  containerId?: string
  tail?: number
  since?: string
  search?: string
}

const tool = captureTool<ComposeArgs>(registerComposeTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_compose create/get/update", () => {
  it("create posts compose.create with required + optional fields", async () => {
    postMock.mockReturnValueOnce(
      IO.succeed({
        composeId: "c1",
        name: "N",
        appName: "n",
        composeStatus: "idle",
        environmentId: "env",
      }),
    )
    await tool.execute({
      action: "create",
      name: "N",
      environmentId: "env",
      description: "desc",
      composeType: "docker-compose",
      composeFile: "version: '3'",
      serverId: "s1",
    })
    expect(postMock).toHaveBeenCalledWith("compose.create", {
      name: "N",
      environmentId: "env",
      description: "desc",
      composeType: "docker-compose",
      composeFile: "version: '3'",
      serverId: "s1",
    })
  })

  it("get calls compose.one", async () => {
    getMock.mockReturnValueOnce(
      IO.succeed({
        composeId: "c1",
        name: "N",
        appName: "n",
        composeStatus: "running",
        environmentId: "env",
      }),
    )
    await tool.execute({ action: "get", composeId: "c1" })
    expect(getMock).toHaveBeenCalledWith("compose.one", { composeId: "c1" })
  })

  it("update sends only defined fields plus composeId", async () => {
    await tool.execute({
      action: "update",
      composeId: "c1",
      name: "new",
      sourceType: "raw",
      composeFile: "version: '3'",
      autoDeploy: true,
    })
    expect(postMock).toHaveBeenCalledWith("compose.update", {
      composeId: "c1",
      name: "new",
      sourceType: "raw",
      composeFile: "version: '3'",
      autoDeploy: true,
    })
  })
})

describe("dokploy_compose deploy branch", () => {
  it("deploy (default) posts compose.deploy", async () => {
    await tool.execute({
      action: "deploy",
      composeId: "c1",
      title: "t",
      deployDescription: "d",
    })
    expect(postMock).toHaveBeenCalledWith("compose.deploy", {
      composeId: "c1",
      title: "t",
      description: "d",
    })
  })

  it("deploy with redeploy=true posts compose.redeploy", async () => {
    await tool.execute({ action: "deploy", composeId: "c1", redeploy: true })
    expect(postMock).toHaveBeenCalledWith("compose.redeploy", { composeId: "c1" })
  })
})

describe("dokploy_compose delete/start/stop/move", () => {
  it("delete defaults deleteVolumes to false", async () => {
    await tool.execute({ action: "delete", composeId: "c1" })
    expect(postMock).toHaveBeenCalledWith("compose.delete", {
      composeId: "c1",
      deleteVolumes: false,
    })
  })

  it("delete passes deleteVolumes when set", async () => {
    await tool.execute({ action: "delete", composeId: "c1", deleteVolumes: true })
    expect(postMock).toHaveBeenCalledWith("compose.delete", {
      composeId: "c1",
      deleteVolumes: true,
    })
  })

  it.each(["start", "stop"] as const)("%s posts compose.{action}", async (action) => {
    await tool.execute({ action, composeId: "c1" })
    expect(postMock).toHaveBeenCalledWith(`compose.${action}`, { composeId: "c1" })
  })

  it("move sends targetEnvironmentId", async () => {
    await tool.execute({
      action: "move",
      composeId: "c1",
      targetEnvironmentId: "env-2",
    })
    expect(postMock).toHaveBeenCalledWith("compose.move", {
      composeId: "c1",
      targetEnvironmentId: "env-2",
    })
  })
})

describe("dokploy_compose loadServices / loadMounts / getDefaultCommand", () => {
  it("loadServices calls compose.loadServices with optional type", async () => {
    getMock.mockReturnValueOnce(IO.succeed([{ name: "svc-1" }]))
    await tool.execute({ action: "loadServices", composeId: "c1", type: "fetch" })
    expect(getMock).toHaveBeenCalledWith("compose.loadServices", {
      composeId: "c1",
      type: "fetch",
    })
  })

  it("loadServices returns helpful message on 404", async () => {
    getMock.mockReturnValueOnce(IO.fail(HttpError("GET", "compose.loadServices", 404, "Not Found", "NOT_FOUND")))
    const result = (await tool.execute({ action: "loadServices", composeId: "c1" })) as string
    expect(result).toContain("No services loaded yet")
  })

  it("loadServices re-throws non-404 errors", async () => {
    getMock.mockReturnValueOnce(IO.fail(HttpError("GET", "compose.loadServices", 500, "Internal", "boom")))
    await expect(tool.execute({ action: "loadServices", composeId: "c1" })).rejects.toThrow(/500/)
  })

  it("loadMounts calls compose.loadMountsByService", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({
      action: "loadMounts",
      composeId: "c1",
      serviceName: "web",
    })
    expect(getMock).toHaveBeenCalledWith("compose.loadMountsByService", {
      composeId: "c1",
      serviceName: "web",
    })
  })

  it("getDefaultCommand returns command string", async () => {
    getMock.mockReturnValueOnce(IO.succeed("docker compose up -d"))
    const result = (await tool.execute({ action: "getDefaultCommand", composeId: "c1" })) as string
    expect(getMock).toHaveBeenCalledWith("compose.getDefaultCommand", { composeId: "c1" })
    expect(result).toBe("Default command: docker compose up -d")
  })
})

describe("dokploy_compose simple actions", () => {
  it.each(["cancelDeployment", "cleanQueues", "killBuild", "refreshToken"] as const)(
    "%s posts compose.{action}",
    async (action) => {
      await tool.execute({ action, composeId: "c1" })
      expect(postMock).toHaveBeenCalledWith(`compose.${action}`, { composeId: "c1" })
    },
  )
})

describe("dokploy_compose readLogs", () => {
  it("GETs compose.readLogs with composeId+containerId", async () => {
    getMock.mockReturnValueOnce(IO.succeed("compose log line"))
    const result = (await tool.execute({ action: "readLogs", composeId: "c1", containerId: "abc123" })) as string
    expect(getMock).toHaveBeenCalledWith("compose.readLogs", { composeId: "c1", containerId: "abc123" })
    expect(result).toContain("Compose Logs (c1 / abc123)")
    expect(result).toContain("compose log line")
  })

  it("forwards optional tail/since/search", async () => {
    getMock.mockReturnValueOnce(IO.succeed(""))
    await tool.execute({
      action: "readLogs",
      composeId: "c1",
      containerId: "abc123",
      tail: 50,
      since: "30m",
      search: "warn",
    })
    expect(getMock).toHaveBeenCalledWith("compose.readLogs", {
      composeId: "c1",
      containerId: "abc123",
      tail: "50",
      since: "30m",
      search: "warn",
    })
  })
})
