import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerRedirectsTools } from "../src/tools/redirects-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type RedirectArgs = {
  action: string
  redirectId?: string
  regex?: string
  replacement?: string
  permanent?: boolean
  applicationId?: string
}

const tool = captureTool<RedirectArgs>(registerRedirectsTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_redirects", () => {
  it("create posts redirects.create with all required fields", async () => {
    postMock.mockReturnValueOnce(
      IO.succeed({ redirectId: "r1", regex: "^/old$", replacement: "/new", permanent: true, applicationId: "app-1" }),
    )
    const result = (await tool.execute({
      action: "create",
      regex: "^/old$",
      replacement: "/new",
      permanent: true,
      applicationId: "app-1",
    })) as string
    expect(postMock).toHaveBeenCalledWith("redirects.create", {
      regex: "^/old$",
      replacement: "/new",
      permanent: true,
      applicationId: "app-1",
    })
    expect(result).toContain("Redirect Created")
  })

  it("create defaults permanent to false when omitted", async () => {
    postMock.mockReturnValueOnce(IO.succeed({ redirectId: "r2", regex: "^/a$", replacement: "/b", permanent: false }))
    await tool.execute({ action: "create", regex: "^/a$", replacement: "/b", applicationId: "app-1" })
    const [, body] = postMock.mock.calls[0]
    expect((body as Record<string, unknown>).permanent).toBe(false)
  })

  it("update posts redirects.update with redirectId + all rewritten fields", async () => {
    await tool.execute({
      action: "update",
      redirectId: "r1",
      regex: "^/old$",
      replacement: "/new-v2",
      permanent: false,
    })
    expect(postMock).toHaveBeenCalledWith("redirects.update", {
      redirectId: "r1",
      regex: "^/old$",
      replacement: "/new-v2",
      permanent: false,
    })
  })

  it("remove posts redirects.delete with redirectId", async () => {
    const result = (await tool.execute({ action: "remove", redirectId: "r1" })) as string
    expect(postMock).toHaveBeenCalledWith("redirects.delete", { redirectId: "r1" })
    expect(result).toBe("Redirect r1 removed.")
  })

  it("get calls redirects.one", async () => {
    getMock.mockReturnValueOnce(IO.succeed({ redirectId: "r1", regex: "^/a$", replacement: "/b", permanent: true }))
    const result = (await tool.execute({ action: "get", redirectId: "r1" })) as string
    expect(getMock).toHaveBeenCalledWith("redirects.one", { redirectId: "r1" })
    expect(result).toContain("Redirect Details")
  })
})
