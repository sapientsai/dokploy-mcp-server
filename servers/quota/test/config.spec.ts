import { describe, expect, it } from "vitest"

import { configSchema, durationMs } from "../src/config"
import { defaultConfig } from "../src/defaults"
import { observationsFrom, parseGithubHeaders, parseGithubRateLimit } from "../src/parsers/github"

describe("config", () => {
  it("reads windows in seconds, minutes, hours and days", () => {
    expect([durationMs("1s"), durationMs("10m"), durationMs("2h"), durationMs("1d")]).toEqual([
      1000, 600_000, 7_200_000, 86_400_000,
    ])
  })

  it("parses the defaults, with every policy but the floor and the daily warning in warn mode", () => {
    const github = defaultConfig.services.find((s) => s.id === "github")
    expect(github?.policies.filter((p) => p.mode === "enforce").map((p) => p.id)).toEqual(["floor", "machine-day"])
    expect(github?.probe?.http?.tokenSecret).toBe("GITHUB_PROBE_TOKEN")
  })

  it.each([
    [{ services: [] }, "services"],
    [
      {
        services: [
          { id: "a", label: "A", resources: [{ id: "x", windowSeconds: 60 }] },
          { id: "a", label: "A", resources: [{ id: "x", windowSeconds: 60 }] },
        ],
      },
      "Two services are named a",
    ],
    [
      {
        services: [
          {
            id: "a",
            label: "A",
            resources: [{ id: "x", windowSeconds: 60 }],
            policies: [{ id: "p", kind: "rate", scope: "fleet", max: 1, per: "a minute" }],
          },
        ],
      },
      "A window is a number",
    ],
    [
      {
        services: [
          {
            id: "a",
            label: "A",
            resources: [{ id: "x", windowSeconds: 60 }],
            probe: {
              parse: "github-rate-limit-json",
              http: { url: "https://x.test", tokenSecret: "ghp_realtokenvalue" },
            },
          },
        ],
      },
      "tokenSecret",
    ],
  ])("refuses a bad config (%#)", (input, message) => {
    const result = configSchema.safeParse(input)
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain(message)
  })
})

describe("GitHub parsers", () => {
  const RESET = 1_795_000_000

  it("reads the budgets the service names from GET /rate_limit", () => {
    const body = {
      resources: {
        core: { limit: 5000, remaining: 4211, reset: RESET, used: 789 },
        graphql: { limit: 5000, remaining: 4990, reset: RESET + 60, used: 10 },
        search: { limit: 30, remaining: 30, reset: RESET },
      },
    }
    expect(parseGithubRateLimit(body, ["core", "graphql"])).toEqual([
      { resource: "core", limit: 5000, remaining: 4211, resetAt: RESET * 1000 },
      { resource: "graphql", limit: 5000, remaining: 4990, resetAt: (RESET + 60) * 1000 },
    ])
  })

  it.each([null, "nope", {}, { resources: { core: { limit: "5000", remaining: 1, reset: RESET } } }])(
    "reads nothing from a body that isn't a rate_limit answer (%o)",
    (body) => {
      expect(parseGithubRateLimit(body, ["core"])).toEqual([])
    },
  )

  it("reads one response's headers, whatever their case", () => {
    const headers = {
      "X-RateLimit-Limit": "5000",
      "X-RateLimit-Remaining": "17",
      "X-RateLimit-Reset": String(RESET),
      "X-RateLimit-Resource": "graphql",
    }
    expect(parseGithubHeaders(headers, ["core", "graphql"])).toEqual([
      { resource: "graphql", limit: 5000, remaining: 17, resetAt: RESET * 1000 },
    ])
  })

  it("takes headers without a resource as core, and ignores incomplete ones", () => {
    const base = { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "1", "x-ratelimit-reset": String(RESET) }
    expect(parseGithubHeaders(base, ["core"])).toHaveLength(1)
    expect(parseGithubHeaders({ ...base, "x-ratelimit-reset": "" }, ["core"])).toEqual([])
    expect(parseGithubHeaders({ ...base, "x-ratelimit-resource": "search" }, ["core"])).toEqual([])
  })

  it("combines headers and a body", () => {
    const headers = { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "1", "x-ratelimit-reset": String(RESET) }
    const body = { resources: { graphql: { limit: 5000, remaining: 2, reset: RESET } } }
    expect(observationsFrom(["core", "graphql"], headers, body).map((o) => o.resource)).toEqual(["core", "graphql"])
    expect(observationsFrom(["core"], undefined, undefined)).toEqual([])
  })
})
