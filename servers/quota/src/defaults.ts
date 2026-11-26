import { configSchema, type QuotaConfig, type QuotaConfigInput } from "./config"

/**
 * GitHub, as a signed-in user sees it. GitHub's docs (read 2026-11-26): requests "authenticated as a
 * user share the user's rate limit across credentials", 5,000 an hour for REST and 5,000 points an hour
 * for GraphQL; `GET /rate_limit` "does not count against your primary rate limit"; and the secondary
 * limits are "No more than 100 concurrent requests" and "no more than 80 content-generating requests
 * per minute and no more than 500 content-generating requests per hour". The policies sit well under
 * each. All but the floor start in `warn`, so a first week shows what they would have stopped.
 */
export const defaultConfigInput: QuotaConfigInput = {
  services: [
    {
      id: "github",
      label: "GitHub (user)",
      resources: [
        { id: "core", windowSeconds: 3600 },
        { id: "graphql", windowSeconds: 3600 },
      ],
      headers: "github",
      probe: {
        command: "gh api rate_limit",
        parse: "github-rate-limit-json",
        http: { url: "https://api.github.com/rate_limit", tokenSecret: "GITHUB_PROBE_TOKEN" },
      },
      free: ["gh api rate_limit", "gh auth status"],
      staleAfterSeconds: 60,
      policies: [
        { id: "floor", kind: "floor", keep: 1000 },
        { id: "fleet-minute", kind: "rate", scope: "fleet", max: 60, per: "1m", action: "delay", mode: "warn" },
        { id: "fleet-second", kind: "rate", scope: "fleet", max: 5, per: "1s", action: "delay", mode: "warn" },
        { id: "session-second", kind: "rate", scope: "session", max: 2, per: "1s", action: "delay", mode: "warn" },
        { id: "session-share", kind: "share", scope: "session", max: 0.4, mode: "warn" },
        {
          id: "writes-minute",
          kind: "rate",
          scope: "fleet",
          match: { class: "write" },
          max: 40,
          per: "1m",
          mode: "warn",
        },
        {
          id: "writes-hour",
          kind: "rate",
          scope: "fleet",
          match: { class: "write" },
          max: 300,
          per: "1h",
          mode: "warn",
        },
        { id: "in-flight", kind: "concurrency", scope: "fleet", max: 10, action: "delay", mode: "warn" },
        { id: "loop", kind: "repeat", scope: "session", max: 20, per: "10m", mode: "warn" },
        { id: "machine-day", kind: "rate", scope: "machine", max: 20_000, per: "1d", action: "warn" },
      ],
    },
  ],
}

export const defaultConfig: QuotaConfig = configSchema.parse(defaultConfigInput)
