import { describe, expect, it } from "vitest"

import { DokployClient } from "../src/client/dokploy-client"
import { DB_ID_FIELDS, DB_TYPES } from "../src/types"
import { formatProject, formatProjectList } from "../src/utils/formatters"

describe("DokployClient", () => {
  it("should construct with base URL and API key", () => {
    const client = new DokployClient("https://dokploy.example.com", "test-key")
    expect(client).toBeDefined()
  })

  it("should strip trailing slashes from base URL", () => {
    const client = new DokployClient("https://dokploy.example.com///", "test-key")
    expect(client).toBeDefined()
  })
})

describe("Types", () => {
  it("should have 5 database types", () => {
    expect(DB_TYPES).toEqual(["postgres", "mysql", "mariadb", "mongo", "redis"])
  })

  it("should map database types to correct ID fields", () => {
    expect(DB_ID_FIELDS.postgres).toBe("postgresId")
    expect(DB_ID_FIELDS.mysql).toBe("mysqlId")
    expect(DB_ID_FIELDS.mariadb).toBe("mariadbId")
    expect(DB_ID_FIELDS.mongo).toBe("mongoId")
    expect(DB_ID_FIELDS.redis).toBe("redisId")
  })
})

describe("Formatters", () => {
  it("should format a project", () => {
    const result = formatProject({
      projectId: "proj-1",
      name: "My Project",
      description: "A test project",
      createdAt: "2025-01-01T00:00:00.000Z",
      environments: [],
    })
    expect(result).toContain("My Project")
    expect(result).toContain("proj-1")
    expect(result).toContain("A test project")
  })

  it("should handle empty project list", () => {
    const result = formatProjectList([])
    expect(result).toBe("No projects found.")
  })

  it("should format project list with count", () => {
    const result = formatProjectList([
      { projectId: "p1", name: "Project 1" },
      { projectId: "p2", name: "Project 2" },
    ])
    expect(result).toContain("Projects (2)")
    expect(result).toContain("Project 1")
    expect(result).toContain("Project 2")
  })
})
