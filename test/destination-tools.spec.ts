import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerDestinationTools } from "../src/tools/destination-tools"
import { captureTool } from "./support/tool-harness"

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: postMock }),
}))

type DestinationArgs = {
  action: string
  destinationId?: string
  name?: string
  provider?: string | null
  accessKey?: string
  bucket?: string
  region?: string
  endpoint?: string
  secretAccessKey?: string
  additionalFlags?: string[] | null
  serverId?: string
}

const tool = captureTool<DestinationArgs>(registerDestinationTools)

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation(() => IO.succeed(undefined))
  postMock.mockImplementation(() => IO.succeed(undefined))
})

describe("dokploy_destination metadata", () => {
  it("registers with the expected name", () => {
    expect(tool.name).toBe("dokploy_destination")
    expect(tool.description).toContain("destinations")
  })
})

describe("dokploy_destination actions", () => {
  it("list GETs destination.all", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    const result = (await tool.execute({ action: "list" })) as string
    expect(getMock).toHaveBeenCalledWith("destination.all")
    expect(result).toContain("No destinations found")
  })

  it("get GETs destination.one with destinationId", async () => {
    getMock.mockReturnValueOnce(
      IO.succeed({
        destinationId: "d1",
        name: "S3 Backups",
        bucket: "my-bucket",
        region: "us-east-1",
        endpoint: "https://s3.amazonaws.com",
      }),
    )
    const result = (await tool.execute({ action: "get", destinationId: "d1" })) as string
    expect(getMock).toHaveBeenCalledWith("destination.one", { destinationId: "d1" })
    expect(result).toContain("S3 Backups")
  })

  it("create defaults provider=null and additionalFlags=[] when omitted", async () => {
    postMock.mockReturnValueOnce(
      IO.succeed({
        destinationId: "d1",
        name: "S3",
        bucket: "b",
        region: "r",
        endpoint: "e",
      }),
    )
    await tool.execute({
      action: "create",
      name: "S3",
      accessKey: "AK",
      secretAccessKey: "SK",
      bucket: "b",
      region: "r",
      endpoint: "e",
    })
    expect(postMock).toHaveBeenCalledWith("destination.create", {
      provider: null,
      additionalFlags: [],
      name: "S3",
      accessKey: "AK",
      secretAccessKey: "SK",
      bucket: "b",
      region: "r",
      endpoint: "e",
    })
  })

  it("update merges destinationId with persisted body", async () => {
    await tool.execute({
      action: "update",
      destinationId: "d1",
      name: "renamed",
      accessKey: "AK",
      secretAccessKey: "SK",
      bucket: "b",
      region: "r",
      endpoint: "e",
    })
    expect(postMock).toHaveBeenCalledWith("destination.update", {
      destinationId: "d1",
      provider: null,
      additionalFlags: [],
      name: "renamed",
      accessKey: "AK",
      secretAccessKey: "SK",
      bucket: "b",
      region: "r",
      endpoint: "e",
    })
  })

  it("remove posts destination.remove", async () => {
    await tool.execute({ action: "remove", destinationId: "d1" })
    expect(postMock).toHaveBeenCalledWith("destination.remove", { destinationId: "d1" })
  })

  it("test posts destination.testConnection with persisted body shape", async () => {
    await tool.execute({
      action: "test",
      name: "S3",
      provider: "AWS",
      accessKey: "AK",
      secretAccessKey: "SK",
      bucket: "b",
      region: "r",
      endpoint: "e",
      additionalFlags: ["--s3-no-check-bucket"],
    })
    expect(postMock).toHaveBeenCalledWith("destination.testConnection", {
      provider: "AWS",
      additionalFlags: ["--s3-no-check-bucket"],
      name: "S3",
      accessKey: "AK",
      secretAccessKey: "SK",
      bucket: "b",
      region: "r",
      endpoint: "e",
    })
  })
})
