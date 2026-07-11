import { IO } from "functype"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { registerAuditLogTools } from "../src/tools/audit-log-tools"
import { captureTool } from "./support/tool-harness"

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}))

vi.mock("../src/client/dokploy-client", () => ({
  getDokployClient: () => ({ get: getMock, post: vi.fn() }),
}))

type AuditArgs = {
  action: string
  userId?: string
  userEmail?: string
  resourceName?: string
  auditAction?: string
  resourceType?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

const tool = captureTool<AuditArgs>(registerAuditLogTools)

beforeEach(() => {
  getMock.mockReset()
  getMock.mockImplementation(() => IO.succeed([]))
})

describe("dokploy_audit_log", () => {
  it("list with no filters calls auditLog.all with an empty query", async () => {
    await tool.execute({ action: "list" })
    expect(getMock).toHaveBeenCalledWith("auditLog.all", {})
  })

  it("renames auditAction to action on the wire", async () => {
    await tool.execute({
      action: "list",
      auditAction: "deploy",
      resourceType: "deployment",
      limit: 25,
      offset: 50,
    })
    expect(getMock).toHaveBeenCalledWith("auditLog.all", {
      action: "deploy",
      resourceType: "deployment",
      limit: 25,
      offset: 50,
    })
  })

  it("returns empty message when no entries", async () => {
    getMock.mockReturnValueOnce(IO.succeed([]))
    const result = (await tool.execute({ action: "list" })) as string
    expect(result).toBe("No audit log entries found.")
  })

  it("renders entries with who + when", async () => {
    getMock.mockReturnValueOnce(
      IO.succeed([
        {
          action: "deploy",
          resourceType: "deployment",
          resourceName: "web-prod",
          userEmail: "jane@example.com",
          createdAt: "2025-10-01T12:00:00Z",
        },
      ]),
    )
    const result = (await tool.execute({ action: "list" })) as string
    expect(result).toContain("Audit Log (1)")
    expect(result).toContain("**deploy**")
    expect(result).toContain("web-prod")
    expect(result).toContain("jane@example.com")
  })
})
