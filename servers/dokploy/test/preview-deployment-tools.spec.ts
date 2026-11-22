import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerPreviewDeploymentTools } from "../src/tools/preview-deployment-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type PreviewArgs = {
  action: string
  previewDeploymentId?: string
  applicationId?: string
  title?: string
  description?: string
}

const tool = captureTool<PreviewArgs>(registerPreviewDeploymentTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_preview_deployment", () => {
  it("list calls previewDeployment.all with applicationId", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    await tool.execute({ action: "list", applicationId: "app-1" })
    expect(getMock).toHaveBeenCalledWith("previewDeployment.all", { applicationId: "app-1" })
  })

  it("get calls previewDeployment.one", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ previewDeploymentId: "pd1", branch: "feature/x", previewStatus: "done" }))
    const result = (await tool.execute({ action: "get", previewDeploymentId: "pd1" })) as string
    expect(getMock).toHaveBeenCalledWith("previewDeployment.one", { previewDeploymentId: "pd1" })
    expect(result).toContain("Preview Deployment")
    expect(result).toContain("feature/x")
  })

  it("remove posts previewDeployment.delete", async () => {
    await tool.execute({ action: "remove", previewDeploymentId: "pd1" })
    expect(postMock).toHaveBeenCalledWith("previewDeployment.delete", { previewDeploymentId: "pd1" })
  })

  it("redeploy posts previewDeployment.redeploy with title+description when provided", async () => {
    await tool.execute({
      action: "redeploy",
      previewDeploymentId: "pd1",
      title: "retry",
      description: "flaky build",
    })
    expect(postMock).toHaveBeenCalledWith("previewDeployment.redeploy", {
      previewDeploymentId: "pd1",
      title: "retry",
      description: "flaky build",
    })
  })

  it("redeploy omits title/description when absent", async () => {
    await tool.execute({ action: "redeploy", previewDeploymentId: "pd1" })
    expect(postMock).toHaveBeenCalledWith("previewDeployment.redeploy", { previewDeploymentId: "pd1" })
  })
})
