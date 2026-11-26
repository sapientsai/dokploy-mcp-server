// Cloudflare Workers entry. Imports `somamcp`, never `somamcp/node`: the Worker runs without Node
// compatibility, and `pnpm check:worker` fails the build if a Node built-in reaches it.
//
// workerd treats every named export of this module as an entrypoint, so it exports only the Durable
// Object class, the factory and the default Worker. Constants live in their own modules.

import { Option, Ref } from "functype"
import { createServer, getRequestHeader } from "somamcp"

import { configSchema, type QuotaConfig, type QuotaConfigInput } from "./config"
import { defaultConfigInput } from "./defaults"
import { handleApi } from "./http"
import { INSTRUCTIONS } from "./instructions"
import { createLedgers, type LedgerNamespace, type Ledgers } from "./ledgers"
import { registerQuotaTools } from "./tools"
import { SERVER_VERSION } from "./version"

export { QuotaLedger } from "./ledger/durable-object"

type Built = { readonly server: ReturnType<typeof createServer>; readonly ledgers: Ledgers }

export type QuotaEnv = {
  /** The bearer key every client sends. Unset, the broker refuses every request. */
  readonly QUOTA_KEY?: string
  /** The `QuotaLedger` Durable Object namespace. */
  readonly LEDGER: LedgerNamespace
} & Readonly<Record<string, unknown>>

/** Compares in time that doesn't depend on where the strings first differ. */
const sameKey = (given: string, expected: string): boolean => {
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  return (
    Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) ^ (b[i] ?? 0)).reduce(
      (diff, x) => diff | x,
      a.length ^ b.length,
    ) === 0
  )
}

const bearer = (header: string | undefined): string =>
  header?.startsWith("Bearer ") === true ? header.slice("Bearer ".length) : ""

const refuse = (status: number, error: string): Response =>
  new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } })

/**
 * A Worker for the given config. The deploy repo calls this with its own services and policies, so a
 * policy change is a reviewed commit there, never a tool call.
 */
export const createQuotaWorker = (input: QuotaConfigInput = defaultConfigInput) => {
  const config: QuotaConfig = configSchema.parse(input)
  // Built once per isolate, on the first request: Workers forbids I/O at module scope.
  const built = Ref(Option.none<Built>())

  const build = (env: QuotaEnv, key: string) => {
    const ledgers = createLedgers(env.LEDGER)
    const server = createServer({
      name: "quota-mcp-server",
      version: SERVER_VERSION as `${number}.${number}.${number}`,
      instructions: INSTRUCTIONS,
      enableDashboard: false,
      // somamcp answers 401 when this rejects.
      authenticate: (request: Request | undefined) =>
        sameKey(bearer(getRequestHeader(request, "authorization")), key)
          ? Promise.resolve({ user: "quota-client" })
          : Promise.reject(new Error("unauthorized")),
    })
    registerQuotaTools(server, config, ledgers)
    return { server, ledgers }
  }

  return {
    async fetch(request: Request, env: QuotaEnv): Promise<Response> {
      const key = env.QUOTA_KEY
      if (typeof key !== "string" || key === "") {
        return refuse(
          503,
          "QUOTA_KEY is not set, so the broker refuses every request. Set it with wrangler secret put.",
        )
      }
      const { server, ledgers } = built.get().getOrElse(() => {
        const fresh = build(env, key)
        built.set(Option(fresh))
        return fresh
      })
      // Every path needs the key, somamcp's /health and /info included: the ledger names sessions and machines.
      if (!sameKey(bearer(request.headers.get("authorization") ?? undefined), key)) {
        return refuse(401, "Send the broker's key as Authorization: Bearer <QUOTA_KEY>.")
      }
      return new URL(request.url).pathname.startsWith("/v1/")
        ? handleApi(request, config, ledgers)
        : server.fetch(request)
    },
  }
}

export default createQuotaWorker()
