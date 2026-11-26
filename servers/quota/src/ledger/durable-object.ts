import { IO, Option, Try, type Wire } from "functype"

import type { Policy, Service } from "../config"
import { parseGithubRateLimit } from "../parsers/github"
import { check, estimateFor, observe } from "./decide"
import { createStore, type Sql, type Store } from "./store"
import type { CheckRequest, Observation } from "./types"
import { policyUsage } from "./usage"

/** How long the broker waits on a service's status endpoint before giving up for this check. */
const BROKER_PROBE_TIMEOUT_MS = 2_000
const BROKER_PROBE_KEY = "broker-probe-at"
const ACCOUNTS_KEY = "accounts"

/** Every message the Worker sends a ledger, as JSON. The service and its policies travel with each one. */
export type LedgerMessage = Wire<
  | {
      readonly op: "check"
      readonly service: Service
      readonly policies: ReadonlyArray<Policy>
      readonly request: CheckRequest
    }
  | { readonly op: "finish"; readonly callId: string }
  | {
      readonly op: "report"
      readonly service: Service
      readonly observations: ReadonlyArray<Observation>
      readonly source: "probe" | "header" | "report"
    }
  | { readonly op: "release"; readonly lease: string; readonly used: number }
  | { readonly op: "status"; readonly service: Service; readonly policies: ReadonlyArray<Policy> }
  | { readonly op: "remember-account"; readonly key: string }
  | { readonly op: "accounts" }
>

type State = { readonly storage: { readonly sql: Sql } }
type Env = Readonly<Record<string, unknown>>

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const accountsIn = (store: Store): ReadonlyArray<string> =>
  store
    .meta(ACCOUNTS_KEY)
    .flatMap((raw) => Try(() => JSON.parse(raw) as Wire<ReadonlyArray<string>>).toOption())
    .getOrElse(() => [])

/** Whether every budget was read within the service's stale window. */
const fresh = (store: Store, service: Service, now: number): boolean =>
  service.resources.every((r) =>
    estimateFor(store, service, r.id, now).exists((e) => now - e.observedAt <= service.staleAfterSeconds * 1000),
  )

/**
 * Asks the service itself, when the Worker holds a token for its free status endpoint and the ledger
 * is stale. At most once per stale window; a failure leaves the ledger to clients' reports.
 */
const brokerProbe = (store: Store, service: Service, env: Env, now: number): IO<never, never, void> => {
  const target = Option(service.probe?.http).flatMap((http) =>
    Option(env[http.tokenSecret])
      .filter((token): token is string => typeof token === "string" && token !== "")
      .map((token) => ({ url: http.url, token })),
  )
  const lastTry = Number(store.meta(BROKER_PROBE_KEY).getOrElse(() => "0"))
  const due = !fresh(store, service, now) && now - lastTry >= service.staleAfterSeconds * 1000
  return target
    .filter(() => due)
    .fold(
      () => IO.succeed(undefined),
      ({ url, token }) => {
        store.setMeta(BROKER_PROBE_KEY, String(now))
        return IO.tryPromise({
          try: () =>
            fetch(url, {
              headers: {
                accept: "application/json",
                authorization: `Bearer ${token}`,
                "user-agent": "quota-mcp-server",
              },
              signal: AbortSignal.timeout(BROKER_PROBE_TIMEOUT_MS),
            }).then((response) => (response.ok ? (response.json() as Promise<unknown>) : undefined)),
          catch: () => undefined,
        })
          .map((body) => {
            observe(
              store,
              service,
              parseGithubRateLimit(
                body,
                service.resources.map((r) => r.id),
              ),
              "broker",
              Date.now(),
            )
          })
          .recover(undefined)
      },
    )
}

/**
 * One ledger per `service:account`, as a SQLite-backed Durable Object. Requests are handled one at a
 * time, so every check sees every spend before it. One more instance, named `__accounts`, keeps the
 * list of ledger keys for `quota_status`.
 */
export class QuotaLedger {
  private readonly store: Store

  constructor(
    state: State,
    private readonly env: Env,
  ) {
    this.store = createStore(state.storage.sql)
  }

  async fetch(request: Request): Promise<Response> {
    const message = (await request.json()) as LedgerMessage
    const now = Date.now()
    switch (message.op) {
      case "check":
        await brokerProbe(this.store, message.service, this.env, now).runOrThrow()
        return json(
          check(this.store, message.service, message.policies, message.request, {
            now: Date.now(),
            id: crypto.randomUUID(),
          }),
        )
      case "finish":
        this.store.finish(message.callId)
        return json({ ok: true })
      case "report":
        return json({ kept: observe(this.store, message.service, message.observations, message.source, now) })
      case "release":
        return json({ ok: this.store.setCost(message.lease, message.used) })
      case "status":
        await brokerProbe(this.store, message.service, this.env, now).runOrThrow()
        return json({
          estimates: message.service.resources.map((r) => ({
            resource: r.id,
            estimate: estimateFor(this.store, message.service, r.id, Date.now()).orNull(),
          })),
          inFlight: this.store.inFlight({ kind: "fleet" }, now),
          topSessions: this.store.topSessions(now - 3_600_000, 5),
          policies: policyUsage(this.store, message.service, message.policies, now),
          now,
        })
      case "remember-account": {
        const known = accountsIn(this.store)
        if (!known.includes(message.key)) {
          this.store.setMeta(ACCOUNTS_KEY, JSON.stringify([...known, message.key].toSorted()))
        }
        return json({ ok: true })
      }
      case "accounts":
        return json({ accounts: accountsIn(this.store) })
    }
  }
}
