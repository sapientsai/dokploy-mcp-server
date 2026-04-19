import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerApplicationTools } from "../src/tools/application-tools"
import { captureTool } from "./support/tool-harness"

const { getIOMock, postIOMock } = vi.hoisted(() => ({
  getIOMock: vi.fn(),
  postIOMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ getIO: getIOMock, postIO: postIOMock }),
}))

type AppArgs = {
  action: string
  applicationId?: string
  name?: string
  environmentId?: string
  description?: string
  serverId?: string
  targetEnvironmentId?: string
  redeploy?: boolean
  title?: string
  deployDescription?: string
  dockerImage?: string
  command?: string
  memoryLimit?: number
  cpuLimit?: number
  replicas?: number
  autoDeploy?: boolean
  appName?: string
  sourceType?: string
  repository?: string
  owner?: string
  branch?: string
  customGitUrl?: string
  customGitBranch?: string
  githubId?: string
  env?: string
  buildArgs?: string
  buildSecrets?: string
  createEnvFile?: boolean
  buildType?: string
  dockerfile?: string
  dockerContextPath?: string
  dockerBuildStage?: string
  publishDirectory?: string
  traefikConfig?: string
}

const tool = captureTool<AppArgs>(registerApplicationTools)

beforeEach(() => {
  getIOMock.mockReset()
  postIOMock.mockReset()
  getIOMock.mockImplementation(() => IO.succeed(undefined))
  postIOMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_application metadata", () => {
  it("registers with the expected name", () => {
    expect(tool.name).toBe("dokploy_application")
    expect(tool.description).toContain("Manage applications")
  })
})

describe("dokploy_application create/get/update/move", () => {
  it("create posts application.create with required fields", async () => {
    postIOMock.mockReturnValueOnce(
      IO.succeed({
        applicationId: "a1",
        name: "N",
        appName: "n",
        applicationStatus: "idle",
        environmentId: "env",
      }),
    )
    await tool.execute({
      action: "create",
      name: "N",
      environmentId: "env",
      description: "desc",
      serverId: "srv-1",
    })
    expect(postIOMock).toHaveBeenCalledWith("application.create", {
      name: "N",
      environmentId: "env",
      description: "desc",
      serverId: "srv-1",
    })
  })

  it("create omits optional fields when not provided", async () => {
    postIOMock.mockReturnValueOnce(
      IO.succeed({
        applicationId: "a1",
        name: "N",
        appName: "n",
        applicationStatus: "idle",
        environmentId: "env",
      }),
    )
    await tool.execute({ action: "create", name: "N", environmentId: "env" })
    expect(postIOMock).toHaveBeenCalledWith("application.create", { name: "N", environmentId: "env" })
  })

  it("get calls application.one", async () => {
    getIOMock.mockReturnValueOnce(
      IO.succeed({
        applicationId: "a1",
        name: "N",
        appName: "n",
        applicationStatus: "running",
        environmentId: "env",
      }),
    )
    await tool.execute({ action: "get", applicationId: "a1" })
    expect(getIOMock).toHaveBeenCalledWith("application.one", { applicationId: "a1" })
  })

  it("update sends only defined fields plus applicationId", async () => {
    await tool.execute({
      action: "update",
      applicationId: "a1",
      name: "new",
      memoryLimit: 1024,
      autoDeploy: true,
      repository: "repo",
      owner: "org",
      branch: "main",
    })
    expect(postIOMock).toHaveBeenCalledWith("application.update", {
      applicationId: "a1",
      name: "new",
      memoryLimit: 1024,
      autoDeploy: true,
      repository: "repo",
      owner: "org",
      branch: "main",
    })
  })

  it("move sends targetEnvironmentId", async () => {
    await tool.execute({
      action: "move",
      applicationId: "a1",
      targetEnvironmentId: "env-2",
    })
    expect(postIOMock).toHaveBeenCalledWith("application.move", {
      applicationId: "a1",
      targetEnvironmentId: "env-2",
    })
  })
})

describe("dokploy_application deploy branch", () => {
  it("deploy (default) posts to application.deploy", async () => {
    await tool.execute({
      action: "deploy",
      applicationId: "a1",
      title: "t",
      deployDescription: "d",
    })
    expect(postIOMock).toHaveBeenCalledWith("application.deploy", {
      applicationId: "a1",
      title: "t",
      description: "d",
    })
  })

  it("deploy with redeploy=true posts to application.redeploy", async () => {
    await tool.execute({ action: "deploy", applicationId: "a1", redeploy: true })
    expect(postIOMock).toHaveBeenCalledWith("application.redeploy", { applicationId: "a1" })
  })

  it("deploy result message distinguishes redeploy vs deploy", async () => {
    const r1 = (await tool.execute({ action: "deploy", applicationId: "a1" })) as string
    expect(r1).toContain("Deployment triggered")
    const r2 = (await tool.execute({ action: "deploy", applicationId: "a1", redeploy: true })) as string
    expect(r2).toContain("Redeployment triggered")
  })
})

describe("dokploy_application simple actions", () => {
  const simpleActions = [
    "start",
    "stop",
    "delete",
    "markRunning",
    "refreshToken",
    "cleanQueues",
    "killBuild",
    "cancelDeployment",
  ] as const

  it.each(simpleActions)("%s posts application.{action} with just applicationId", async (action) => {
    await tool.execute({ action, applicationId: "a1" })
    expect(postIOMock).toHaveBeenCalledWith(`application.${action}`, { applicationId: "a1" })
  })
})

describe("dokploy_application reload/saveEnvironment/saveBuildType", () => {
  it("reload sends applicationId + appName", async () => {
    await tool.execute({ action: "reload", applicationId: "a1", appName: "my-app" })
    expect(postIOMock).toHaveBeenCalledWith("application.reload", {
      applicationId: "a1",
      appName: "my-app",
    })
  })

  it("saveEnvironment defaults createEnvFile to false and buildArgs/buildSecrets to empty string", async () => {
    await tool.execute({
      action: "saveEnvironment",
      applicationId: "a1",
      env: "FOO=1",
    })
    expect(postIOMock).toHaveBeenCalledWith("application.saveEnvironment", {
      applicationId: "a1",
      createEnvFile: false,
      env: "FOO=1",
      buildArgs: "",
      buildSecrets: "",
    })
  })

  it("saveEnvironment without env omits env field", async () => {
    await tool.execute({ action: "saveEnvironment", applicationId: "a1" })
    const [, body] = postIOMock.mock.calls[0]
    expect(body).not.toHaveProperty("env")
    expect(body).toMatchObject({ applicationId: "a1", createEnvFile: false })
  })

  it("saveEnvironment passes createEnvFile when provided", async () => {
    await tool.execute({
      action: "saveEnvironment",
      applicationId: "a1",
      createEnvFile: true,
      buildArgs: "ARG=1",
      buildSecrets: "SEC=1",
    })
    expect(postIOMock).toHaveBeenCalledWith("application.saveEnvironment", {
      applicationId: "a1",
      createEnvFile: true,
      buildArgs: "ARG=1",
      buildSecrets: "SEC=1",
    })
  })

  it("saveBuildType defaults dockerContextPath='.' and dockerBuildStage=''", async () => {
    await tool.execute({
      action: "saveBuildType",
      applicationId: "a1",
      buildType: "dockerfile",
    })
    expect(postIOMock).toHaveBeenCalledWith("application.saveBuildType", {
      applicationId: "a1",
      buildType: "dockerfile",
      dockerContextPath: ".",
      dockerBuildStage: "",
    })
  })

  it("saveBuildType includes dockerfile / publishDirectory when set", async () => {
    await tool.execute({
      action: "saveBuildType",
      applicationId: "a1",
      buildType: "nixpacks",
      dockerfile: "Dockerfile.prod",
      publishDirectory: "dist",
      dockerContextPath: "./app",
      dockerBuildStage: "build",
    })
    expect(postIOMock).toHaveBeenCalledWith("application.saveBuildType", {
      applicationId: "a1",
      buildType: "nixpacks",
      dockerContextPath: "./app",
      dockerBuildStage: "build",
      dockerfile: "Dockerfile.prod",
      publishDirectory: "dist",
    })
  })
})

describe("dokploy_application traefikConfig / readMonitoring", () => {
  it("traefikConfig without value reads config via GET", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed("some: yaml"))
    const result = (await tool.execute({ action: "traefikConfig", applicationId: "a1" })) as string
    expect(getIOMock).toHaveBeenCalledWith("application.readTraefikConfig", { applicationId: "a1" })
    expect(result).toContain("some: yaml")
    expect(postIOMock).not.toHaveBeenCalled()
  })

  it("traefikConfig with value writes via POST", async () => {
    await tool.execute({
      action: "traefikConfig",
      applicationId: "a1",
      traefikConfig: "updated: config",
    })
    expect(postIOMock).toHaveBeenCalledWith("application.updateTraefikConfig", {
      applicationId: "a1",
      traefikConfig: "updated: config",
    })
    expect(getIOMock).not.toHaveBeenCalled()
  })

  it("readMonitoring GETs application.readAppMonitoring by appName", async () => {
    getIOMock.mockReturnValueOnce(IO.succeed({ cpu: 0.5, memory: 100 }))
    const result = (await tool.execute({ action: "readMonitoring", appName: "my-app" })) as string
    expect(getIOMock).toHaveBeenCalledWith("application.readAppMonitoring", { appName: "my-app" })
    expect(result).toContain("Monitoring: my-app")
    expect(result).toContain("cpu")
  })
})
