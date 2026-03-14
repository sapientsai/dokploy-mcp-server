import { describe, expect, it } from "vitest"

import { DokployClient } from "../src/client/dokploy-client"
import { DB_ID_FIELDS, DB_TYPES } from "../src/types"
import { formatApplication, formatCompose, formatProject, formatProjectList } from "../src/utils/formatters"

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

  it("should handle null/undefined status fields without crashing", () => {
    const result = formatProjectList([
      {
        projectId: "p1",
        name: "Project With Null Status",
        environments: [
          {
            environmentId: "env-1",
            name: "production",
            projectId: "p1",
            applications: [
              {
                applicationId: "app-1",
                name: "My App",
                appName: "my-app",
                applicationStatus: undefined as unknown as string,
                environmentId: "env-1",
              },
            ],
            compose: [
              {
                composeId: "comp-1",
                name: "My Compose",
                appName: "my-compose",
                composeStatus: undefined as unknown as string,
                environmentId: "env-1",
              },
            ],
          },
        ],
      },
    ])
    expect(result).toContain("Project With Null Status")
    expect(result).toContain("[UNKNOWN]")
    expect(result).not.toContain("Cannot read properties")
  })

  it("should include env vars in application output", () => {
    const result = formatApplication({
      applicationId: "app-1",
      name: "My App",
      appName: "my-app",
      applicationStatus: "running",
      environmentId: "env-1",
      env: "DB_HOST=localhost\nDB_PORT=5432",
    })
    expect(result).toContain("DB_HOST=localhost")
    expect(result).toContain("DB_PORT=5432")
  })

  it("should include git source fields in application output", () => {
    const result = formatApplication({
      applicationId: "app-1",
      name: "My App",
      appName: "my-app",
      applicationStatus: "running",
      environmentId: "env-1",
      sourceType: "github",
      repository: "my-repo",
      owner: "my-org",
      branch: "main",
      githubId: "gh-123",
    })
    expect(result).toContain("my-org/my-repo")
    expect(result).toContain("main")
    expect(result).toContain("gh-123")
  })

  it("should include env vars in compose output", () => {
    const result = formatCompose({
      composeId: "comp-1",
      name: "My Compose",
      appName: "my-compose",
      composeStatus: "running",
      environmentId: "env-1",
      env: "REDIS_URL=redis://localhost:6379",
    })
    expect(result).toContain("REDIS_URL=redis://localhost:6379")
  })
})
