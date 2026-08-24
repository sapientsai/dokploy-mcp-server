import { HttpErrors, IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerOverviewTools } from "../src/tools/overview-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type OverviewArgs = { action: string }

const tool = captureTool<OverviewArgs>(registerOverviewTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_overview", () => {
  it.each([
    ["services", "overview.services", "Services Overview"],
    ["backups", "overview.backups", "Backups Overview"],
    ["domains", "overview.domains", "Domains Overview"],
  ] as const)("%s GETs %s with no params", async (action, endpoint, heading) => {
    getMock.mockReturnValueOnce(IO.succeed([{ name: "x" }]))
    const out = (await tool.execute({ action })) as string
    expect(getMock).toHaveBeenCalledWith(endpoint)
    expect(out).toContain(heading)
  })

  it("never issues a write", async () => {
    getMock.mockReturnValue(IO.succeed([]))
    await tool.execute({ action: "services" })
    await tool.execute({ action: "backups" })
    await tool.execute({ action: "domains" })
    expect(postMock).not.toHaveBeenCalled()
  })

  it.each([
    ["services", "No services found across any project."],
    ["backups", "No backups configured across any project."],
    ["domains", "No domains configured across any project."],
  ] as const)("%s reports an empty rollup plainly", async (action, expected) => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    expect(await tool.execute({ action })).toBe(expected)
  })

  it("treats a null body as an empty rollup — the spec describes no response shape", async () => {
    getMock.mockReturnValueOnce(IO.succeed(null))
    expect(await tool.execute({ action: "services" })).toBe("No services found across any project.")
  })

  it("surfaces API failures as thrown errors", async () => {
    getMock.mockReturnValueOnce(
      IO.fail(HttpErrors.httpStatusError("overview.services", "GET", 500, "Internal", "boom")),
    )
    await expect(tool.execute({ action: "services" })).rejects.toThrow()
  })
})
