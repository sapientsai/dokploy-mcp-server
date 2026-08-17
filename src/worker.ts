// Cloudflare Workers entry point.
//
// Imports `somamcp/edge`, never `somamcp` — the root barrel re-exports helpers
// that pull in `node:fs`, which would break the Workers bundle. The tools
// themselves are the same registration used by the Node entry point.

import { createServer } from "somamcp/edge"

import { INSTRUCTIONS, registerTemporalTools, SERVER_NAME, SERVER_VERSION } from "./index.js"

type Env = {
  /** Optional bearer token. When unset, the MCP endpoint is public. */
  MCP_AUTH_TOKEN?: string
  /**
   * Build provenance, forwarded by scripts/deploy.mjs at deploy time — Workers
   * Builds' own variables are build-only and invisible at runtime. Surfaced by
   * the `info` tool and /info so you can tell what is actually deployed.
   */
  BUILD_DATE?: string
  ENVIRONMENT?: string
  GIT_BRANCH?: string
  GIT_COMMIT?: string
}

/**
 * Built once per isolate, on first request.
 *
 * Workers forbids network I/O at module scope and Hono seals its router after
 * the first request, so the server is constructed lazily and then reused for
 * every subsequent request the isolate handles.
 */
let instance: ReturnType<typeof createServer> | undefined

const build = (env: Env): ReturnType<typeof createServer> => {
  const token = env.MCP_AUTH_TOKEN

  const server = createServer({
    // Workers has no process.env, so build info comes from the binding.
    build: {
      branch: env.GIT_BRANCH,
      commit: env.GIT_COMMIT,
      date: env.BUILD_DATE,
      environment: env.ENVIRONMENT,
    },
    instructions: INSTRUCTIONS,
    name: SERVER_NAME,
    // Bind a token to gate the MCP endpoint and the protected artifacts.
    // Without one the server is intentionally public — fine for a clock.
    ...(token === undefined
      ? {}
      : {
          authenticate: async (request: unknown) => {
            const header = (request as Request).headers?.get("authorization")
            if (header !== `Bearer ${token}`) throw new Error("unauthorized")
            return { user: "mcp-client" }
          },
        }),
    version: SERVER_VERSION,
  })

  registerTemporalTools(server)
  return server
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> => {
    instance ??= build(env)
    return instance.fetch(request)
  },
}
