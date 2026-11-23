import { afterEach, describe, expect, it, vi } from "vitest"

import { isEnabled, loggers } from "../src/utils/logger.js"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("which namespaces DEBUG turns on", () => {
  it.each([
    ["openfda-mcp:*", "openfda-mcp:api", true],
    ["openfda-mcp:api", "openfda-mcp:api", true],
    ["openfda-mcp:api", "openfda-mcp:tools", false],
    ["*", "openfda-mcp:bulk", true],
    ["openfda-mcp:*,-openfda-mcp:bulk", "openfda-mcp:bulk", false],
    ["openfda-mcp:* -openfda-mcp:bulk", "openfda-mcp:api", true],
    ["other:*", "openfda-mcp:api", false],
    ["", "openfda-mcp:api", false],
  ])("DEBUG=%j %s → %s", (setting, namespace, enabled) => {
    expect(isEnabled(namespace, setting)).toBe(enabled)
  })
})

describe("loggers", () => {
  it("write nothing when DEBUG is unset", () => {
    vi.stubEnv("DEBUG", undefined)
    const written = vi.spyOn(console, "error").mockImplementation(() => undefined)
    loggers.api("Request: x")
    expect(written).not.toHaveBeenCalled()
  })

  it("write a namespace DEBUG turns on to stderr, leaving stdout for JSON-RPC", () => {
    vi.stubEnv("DEBUG", "openfda-mcp:api")
    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const stdout = vi.spyOn(console, "log").mockImplementation(() => undefined)
    loggers.api("Request: x")
    loggers.tools("not on")
    expect(JSON.stringify(stderr.mock.calls)).toContain("openfda-mcp:api Request: x")
    expect(JSON.stringify(stderr.mock.calls)).not.toContain("not on")
    expect(stdout).not.toHaveBeenCalled()
  })
})
