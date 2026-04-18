import { describe, expect, it } from "vitest"

import type {
  DokployApplication,
  DokployBackup,
  DokployCompose,
  DokployContainer,
  DokployDatabase,
  DokployDeployment,
  DokployDomain,
  DokployEnvironment,
  DokployProject,
  DokployServer,
  DokploySshKey,
} from "../src/types"
import {
  formatApplication,
  formatBackup,
  formatCompose,
  formatContainer,
  formatContainerList,
  formatDatabase,
  formatDeployment,
  formatDeploymentList,
  formatDomain,
  formatDomainList,
  formatEnvironment,
  formatEnvironmentList,
  formatProject,
  formatProjectList,
  formatServer,
  formatServerList,
  formatSshKey,
  formatSshKeyList,
} from "../src/utils/formatters"

describe("formatProject", () => {
  it("includes name, id, description, and formatted date", () => {
    const result = formatProject({
      projectId: "proj-1",
      name: "My Project",
      description: "A test project",
      createdAt: "2025-01-02T03:04:05.000Z",
      environments: [],
    })
    expect(result).toContain("My Project")
    expect(result).toContain("proj-1")
    expect(result).toContain("A test project")
    expect(result).toContain("2025-01-02 03:04:05 UTC")
    expect(result).toContain("Environments: 0")
  })

  it("renders 'None' when description missing", () => {
    const result = formatProject({
      projectId: "p1",
      name: "No Desc",
    })
    expect(result).toContain("Description: None")
  })

  it("renders 'N/A' when createdAt missing", () => {
    const result = formatProject({ projectId: "p1", name: "X" })
    expect(result).toContain("Created: N/A")
  })

  it("falls back to raw string on unparseable createdAt", () => {
    const result = formatProject({
      projectId: "p1",
      name: "X",
      createdAt: "not-a-date",
    })
    expect(result).toContain("Created: not-a-date")
  })

  it("lists environment services including all DB types", () => {
    const env: DokployEnvironment = {
      environmentId: "env-1",
      name: "production",
      projectId: "p1",
      applications: [
        {
          applicationId: "app-1",
          name: "App1",
          appName: "a1",
          applicationStatus: "running",
          environmentId: "env-1",
        },
      ],
      compose: [
        {
          composeId: "c1",
          name: "Compose1",
          appName: "c1-app",
          composeStatus: "error",
          environmentId: "env-1",
        },
      ],
      postgres: [
        {
          databaseId: "pg1",
          name: "PG",
          appName: "pg-app",
          applicationStatus: "idle",
          environmentId: "env-1",
        },
      ],
      mysql: [
        {
          databaseId: "my1",
          name: "MY",
          appName: "my-app",
          applicationStatus: "stopped",
          environmentId: "env-1",
        },
      ],
      mariadb: [
        {
          databaseId: "ma1",
          name: "MA",
          appName: "ma-app",
          applicationStatus: "failed",
          environmentId: "env-1",
        },
      ],
      mongo: [
        {
          databaseId: "mo1",
          name: "MO",
          appName: "mo-app",
          applicationStatus: "done",
          environmentId: "env-1",
        },
      ],
      redis: [
        {
          databaseId: "re1",
          name: "RE",
          appName: "re-app",
          applicationStatus: "pending",
          environmentId: "env-1",
        },
      ],
    }
    const result = formatProject({
      projectId: "p1",
      name: "Full",
      environments: [env],
    })
    expect(result).toContain("App: **App1** [RUNNING]")
    expect(result).toContain("Compose: **Compose1** [ERROR]")
    expect(result).toContain("postgres: **PG** [RUNNING]")
    expect(result).toContain("mysql: **MY** [STOPPED]")
    expect(result).toContain("mariadb: **MA** [ERROR]")
    expect(result).toContain("mongo: **MO** [RUNNING]")
    expect(result).toContain("redis: **RE** [PENDING]")
  })
})

describe("formatProjectList", () => {
  it("returns explicit empty message", () => {
    expect(formatProjectList([])).toBe("No projects found.")
  })

  it("handles project.all minimal DB shape (only postgresId, no name/status)", () => {
    // Real project.all endpoint strips DBs down to just their type-specific ID.
    // Formatter must surface the ID rather than rendering 'undefined'.
    const result = formatProjectList([
      {
        projectId: "p1",
        name: "data",
        environments: [
          {
            environmentId: "env-1",
            name: "production",
            projectId: "p1",
            postgres: [{ postgresId: "pg-123" } as unknown as never],
          },
        ],
      },
    ])
    expect(result).toContain("ID: pg-123")
    expect(result).not.toContain("ID: undefined")
    expect(result).not.toContain("**undefined**")
  })

  it("includes count header and each project", () => {
    const result = formatProjectList([
      { projectId: "p1", name: "Project 1" },
      { projectId: "p2", name: "Project 2" },
    ])
    expect(result).toContain("Projects (2)")
    expect(result).toContain("Project 1")
    expect(result).toContain("Project 2")
  })

  it("renders [UNKNOWN] for missing status without crashing", () => {
    const result = formatProjectList([
      {
        projectId: "p1",
        name: "Nullable",
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
    expect(result).toContain("[UNKNOWN]")
    expect(result).not.toContain("Cannot read properties")
  })
})

describe("formatEnvironment", () => {
  it("includes name, id, project, and description", () => {
    const env: DokployEnvironment = {
      environmentId: "env-1",
      name: "staging",
      projectId: "p1",
      description: "Staging env",
      createdAt: "2025-03-04T05:06:07.000Z",
    }
    const result = formatEnvironment(env)
    expect(result).toContain("staging")
    expect(result).toContain("env-1")
    expect(result).toContain("p1")
    expect(result).toContain("Staging env")
    expect(result).toContain("2025-03-04 05:06:07 UTC")
  })

  it("renders 'None' when description missing", () => {
    const result = formatEnvironment({
      environmentId: "e",
      name: "n",
      projectId: "p",
    })
    expect(result).toContain("Description: None")
  })
})

describe("formatEnvironmentList", () => {
  it("returns explicit empty message", () => {
    expect(formatEnvironmentList([])).toBe("No environments found.")
  })

  it("includes count header", () => {
    const result = formatEnvironmentList([
      { environmentId: "e1", name: "dev", projectId: "p1" },
      { environmentId: "e2", name: "prod", projectId: "p1" },
    ])
    expect(result).toContain("Environments (2)")
  })
})

describe("formatApplication", () => {
  const base: DokployApplication = {
    applicationId: "app-1",
    name: "My App",
    appName: "my-app",
    applicationStatus: "running",
    environmentId: "env-1",
  }

  it("includes env vars block when env present", () => {
    const result = formatApplication({
      ...base,
      env: "DB_HOST=localhost\nDB_PORT=5432",
    })
    expect(result).toContain("DB_HOST=localhost")
    expect(result).toContain("DB_PORT=5432")
    expect(result).toContain("Env Variables:")
  })

  it("omits env block when env missing", () => {
    const result = formatApplication(base)
    expect(result).not.toContain("Env Variables:")
  })

  it("renders owner/repo when both present", () => {
    const result = formatApplication({
      ...base,
      sourceType: "github",
      repository: "repo",
      owner: "org",
      branch: "main",
      githubId: "gh-123",
    })
    expect(result).toContain("org/repo")
    expect(result).toContain("main")
    expect(result).toContain("gh-123")
  })

  it("renders repo without owner slash when owner missing", () => {
    const result = formatApplication({ ...base, repository: "orphan-repo" })
    expect(result).toContain("Repository: orphan-repo")
    expect(result).not.toContain("/orphan-repo")
  })

  it("includes custom git fields when present", () => {
    const result = formatApplication({
      ...base,
      customGitUrl: "git@example.com:me/proj.git",
      customGitBranch: "develop",
    })
    expect(result).toContain("git@example.com:me/proj.git")
    expect(result).toContain("Custom Git Branch: develop")
  })

  it("includes docker image and dockerfile when present", () => {
    const result = formatApplication({
      ...base,
      dockerImage: "nginx:latest",
      dockerfile: "Dockerfile.prod",
    })
    expect(result).toContain("nginx:latest")
    expect(result).toContain("Dockerfile.prod")
  })

  it("renders autoDeploy value literally including false", () => {
    const result = formatApplication({ ...base, autoDeploy: false })
    expect(result).toContain("Auto Deploy: false")
  })
})

describe("formatDeployment", () => {
  it("includes title, status, description", () => {
    const dep: DokployDeployment = {
      deploymentId: "d1",
      title: "Build #42",
      status: "done",
      description: "Merged PR",
      createdAt: "2025-05-06T07:08:09.000Z",
    }
    const result = formatDeployment(dep)
    expect(result).toContain("Build #42")
    expect(result).toContain("[RUNNING]")
    expect(result).toContain("Merged PR")
    expect(result).toContain("d1")
    expect(result).toContain("2025-05-06 07:08:09 UTC")
  })

  it("defaults title to 'Deployment' when missing", () => {
    const result = formatDeployment({ deploymentId: "d2", status: "error" })
    expect(result).toContain("Deployment")
    expect(result).toContain("[ERROR]")
  })
})

describe("formatDeploymentList", () => {
  it("returns empty message when none", () => {
    expect(formatDeploymentList([])).toBe("No deployments found.")
  })

  it("includes count header", () => {
    const result = formatDeploymentList([{ deploymentId: "d1", status: "done" }])
    expect(result).toContain("Deployments (1)")
  })
})

describe("formatDomain", () => {
  it("uses https protocol when https=true", () => {
    const domain: DokployDomain = {
      domainId: "dm1",
      host: "example.com",
      path: "/api",
      port: 8080,
      https: true,
      certificateType: "letsencrypt",
      domainType: "application",
      serviceName: "svc",
    }
    const result = formatDomain(domain)
    expect(result).toContain("https://example.com/api")
    expect(result).toContain("Port: 8080")
    expect(result).toContain("letsencrypt")
    expect(result).toContain("svc")
  })

  it("uses http protocol when https=false", () => {
    const result = formatDomain({
      domainId: "dm2",
      host: "plain.local",
      https: false,
    })
    expect(result).toContain("http://plain.local")
  })

  it("renders defaults when optional fields missing", () => {
    const result = formatDomain({
      domainId: "dm3",
      host: "basic.test",
      https: true,
    })
    expect(result).toContain("Port: default")
    expect(result).toContain("Certificate: None")
  })
})

describe("formatDomainList", () => {
  it("returns empty message when none", () => {
    expect(formatDomainList([])).toBe("No domains found.")
  })

  it("includes count header", () => {
    const result = formatDomainList([{ domainId: "d", host: "x.com", https: true }])
    expect(result).toContain("Domains (1)")
  })
})

describe("formatServer", () => {
  it("includes ip:port, user, type", () => {
    const server: DokployServer = {
      serverId: "s1",
      name: "edge-1",
      ipAddress: "10.0.0.1",
      port: 22,
      username: "root",
      sshKeyId: "k1",
      serverType: "swarm",
      description: "Edge node",
      createdAt: "2025-06-07T08:09:10.000Z",
    }
    const result = formatServer(server)
    expect(result).toContain("edge-1")
    expect(result).toContain("10.0.0.1:22")
    expect(result).toContain("User: root")
    expect(result).toContain("Type: swarm")
    expect(result).toContain("Edge node")
    expect(result).toContain("2025-06-07 08:09:10 UTC")
  })
})

describe("formatServerList", () => {
  it("returns empty message when none", () => {
    expect(formatServerList([])).toBe("No servers found.")
  })

  it("includes count header", () => {
    const result = formatServerList([
      {
        serverId: "s1",
        name: "n",
        ipAddress: "1.1.1.1",
        port: 22,
        username: "u",
        sshKeyId: "k",
        serverType: "swarm",
      },
    ])
    expect(result).toContain("Servers (1)")
  })
})

describe("formatDatabase", () => {
  const base: DokployDatabase = {
    databaseId: "db1",
    name: "PrimaryDB",
    appName: "primary-db",
    applicationStatus: "running",
    environmentId: "env-1",
  }

  it.each(["postgres", "mysql", "mariadb", "mongo", "redis"])("labels type %s", (dbType) => {
    const result = formatDatabase(base, dbType)
    expect(result).toContain(`Type: ${dbType}`)
    expect(result).toContain("PrimaryDB")
    expect(result).toContain("[RUNNING]")
  })

  it("resolves ID from type-specific field (postgresId) when databaseId absent", () => {
    // Matches the real Dokploy project.one response shape.
    const result = formatDatabase(
      {
        postgresId: "pg-real-1",
        name: "postgres",
        appName: "data-postgres",
        applicationStatus: "done",
        environmentId: "env-1",
      } as unknown as DokployDatabase,
      "postgres",
    )
    expect(result).toContain("ID: pg-real-1")
    expect(result).toContain("postgres")
    expect(result).toContain("[RUNNING]")
  })

  it.each([
    ["mysql", "mysqlId"],
    ["mariadb", "mariadbId"],
    ["mongo", "mongoId"],
    ["redis", "redisId"],
  ])("resolves ID from type-specific %s → %s field", (dbType, idField) => {
    const result = formatDatabase(
      { [idField]: `${dbType}-real`, name: dbType, applicationStatus: "done" } as unknown as DokployDatabase,
      dbType,
    )
    expect(result).toContain(`ID: ${dbType}-real`)
  })

  it("renders defaults for missing optional fields", () => {
    const result = formatDatabase(base, "postgres")
    expect(result).toContain("Database Name: N/A")
    expect(result).toContain("Image: default")
    expect(result).toContain("External Port: None")
  })

  it("renders external port when set", () => {
    const result = formatDatabase({ ...base, externalPort: 5432 }, "postgres")
    expect(result).toContain("External Port: 5432")
  })
})

describe("formatContainer", () => {
  it("renders name, state (uppercase), image, ports", () => {
    const container: DokployContainer = {
      containerId: "c-abc",
      name: "web-1",
      image: "nginx:1.27",
      state: "running",
      status: "Up 2 minutes",
      ports: "80->8080/tcp",
    }
    const result = formatContainer(container)
    expect(result).toContain("web-1")
    expect(result).toContain("[RUNNING]")
    expect(result).toContain("nginx:1.27")
    expect(result).toContain("Up 2 minutes")
    expect(result).toContain("80->8080/tcp")
  })

  it("falls back to UNKNOWN state and None ports", () => {
    const result = formatContainer({
      containerId: "c1",
      name: "c",
      image: "img",
      state: "",
      status: "",
    })
    expect(result).toContain("[UNKNOWN]")
    expect(result).toContain("Ports: None")
  })
})

describe("formatContainerList", () => {
  it("returns empty message when none", () => {
    expect(formatContainerList([])).toBe("No containers found.")
  })

  it("includes count header", () => {
    const result = formatContainerList([{ containerId: "c1", name: "x", image: "i", state: "running", status: "ok" }])
    expect(result).toContain("Containers (1)")
  })
})

describe("formatBackup", () => {
  it("includes schedule, destination, retention", () => {
    const backup: DokployBackup = {
      backupId: "b1",
      schedule: "0 2 * * *",
      enabled: true,
      prefix: "daily",
      destinationId: "dest-1",
      database: "maindb",
      databaseType: "postgres",
      keepLatestCount: 7,
    }
    const result = formatBackup(backup)
    expect(result).toContain("daily")
    expect(result).toContain("b1")
    expect(result).toContain("0 2 * * *")
    expect(result).toContain("postgres")
    expect(result).toContain("dest-1")
    expect(result).toContain("Keep Latest: 7")
  })

  it("defaults enabled to true and keepLatest to 'unlimited' when missing", () => {
    const result = formatBackup({
      backupId: "b2",
      schedule: "@hourly",
      prefix: "p",
      destinationId: "d",
      database: "db",
      databaseType: "mysql",
    })
    expect(result).toContain("Enabled: true")
    expect(result).toContain("Keep Latest: unlimited")
  })
})

describe("formatSshKey", () => {
  it("truncates public key to 40 chars with ellipsis", () => {
    const pubKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPQRSTUVWXYZ foo@host"
    const result = formatSshKey({
      sshKeyId: "k1",
      name: "deploy-key",
      publicKey: pubKey,
      createdAt: "2025-07-08T09:10:11.000Z",
    })
    expect(result).toContain("deploy-key")
    expect(result).toContain(`${pubKey.substring(0, 40)}...`)
    expect(result).not.toContain("foo@host")
    expect(result).toContain("2025-07-08 09:10:11 UTC")
  })

  it("renders N/A when no public key", () => {
    const result = formatSshKey({ sshKeyId: "k2", name: "empty" })
    expect(result).toContain("Public Key: N/A")
  })
})

describe("formatSshKeyList", () => {
  it("returns empty message when none", () => {
    expect(formatSshKeyList([])).toBe("No SSH keys found.")
  })

  it("includes count header", () => {
    const result = formatSshKeyList([{ sshKeyId: "k1", name: "n" }])
    expect(result).toContain("SSH Keys (1)")
  })
})

describe("formatCompose", () => {
  const base: DokployCompose = {
    composeId: "comp-1",
    name: "My Compose",
    appName: "my-compose",
    composeStatus: "running",
    environmentId: "env-1",
  }

  it("includes env block when env present", () => {
    const result = formatCompose({
      ...base,
      env: "REDIS_URL=redis://localhost:6379",
    })
    expect(result).toContain("REDIS_URL=redis://localhost:6379")
    expect(result).toContain("Env Variables:")
  })

  it("omits env block when env missing", () => {
    const result = formatCompose(base)
    expect(result).not.toContain("Env Variables:")
  })

  it("renders defaults for missing optional fields", () => {
    const result = formatCompose(base)
    expect(result).toContain("Description: None")
    expect(result).toContain("Type: N/A")
    expect(result).toContain("Source: N/A")
  })
})

describe("statusIcon (via formatters)", () => {
  const base: DokployApplication = {
    applicationId: "app",
    name: "n",
    appName: "a",
    applicationStatus: "",
    environmentId: "e",
  }

  it.each([
    ["running", "[RUNNING]"],
    ["done", "[RUNNING]"],
    ["idle", "[RUNNING]"],
    ["RUNNING", "[RUNNING]"],
    ["error", "[ERROR]"],
    ["failed", "[ERROR]"],
    ["stopped", "[STOPPED]"],
    ["building", "[BUILDING]"],
    ["pending", "[PENDING]"],
  ])("maps %s → %s", (status, icon) => {
    const result = formatApplication({ ...base, applicationStatus: status })
    expect(result).toContain(icon)
  })

  it("renders [UNKNOWN] when status missing", () => {
    const result = formatApplication({
      ...base,
      applicationStatus: undefined as unknown as string,
    })
    expect(result).toContain("[UNKNOWN]")
  })
})

describe("formatProject edge cases (via list)", () => {
  it("handles project without environments field", () => {
    const project: DokployProject = { projectId: "p1", name: "Bare" }
    const result = formatProject(project)
    expect(result).toContain("Environments: 0")
  })
})
