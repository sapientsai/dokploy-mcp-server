import { IO } from "functype"
import { z } from "zod"

import { policiesFor, type QuotaConfig, type Service } from "./config"
import type { StatusAnswer } from "./format"
import type { CheckResult } from "./ledger/types"
import { isAccount, ledgerKey, type Ledgers } from "./ledgers"
import { observationsFrom } from "./parsers/github"

// The JSON API the hook calls on every `gh` command. It answers fast, and in words an agent can act on.

const who = z.string().min(1).max(200)
const base = { service: z.string().min(1), account: z.string().refine(isAccount, "Not an account name.") }

const checkBody = z.object({
  ...base,
  resource: z.string().min(1).optional(),
  session: who,
  machine: who,
  label: z.string().min(1).max(200),
  class: z.enum(["read", "write"]).default("read"),
  cost: z.number().positive().max(100_000).default(1),
  callId: z.string().min(1).max(200).optional(),
  /** A quota_acquire lease this call draws from. */
  lease: z.uuid().optional(),
})

const finishBody = z.object({ ...base, callId: z.string().min(1).max(200) })

const reportBody = z
  .object({
    ...base,
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional(),
  })
  .refine((r) => r.headers !== undefined || r.body !== undefined, { message: "Give headers or body." })

/** A request the API refuses, with the status to answer it with. */
class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const parse = <T>(request: Request, schema: z.ZodType<T>): IO<never, Error, T> =>
  IO.tryPromise({
    try: () => request.json() as Promise<unknown>,
    catch: () => new Refusal(400, "The body isn't JSON."),
  }).flatMap((raw) => {
    const parsed = schema.safeParse(raw)
    return parsed.success
      ? IO.succeed(parsed.data)
      : IO.fail(
          new Refusal(400, parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")),
        )
  })

const serviceOf = (config: QuotaConfig, id: string): IO<never, Error, Service> => {
  const service = config.services.find((s) => s.id === id)
  return service === undefined ? IO.fail(new Refusal(404, `No service ${id}.`)) : IO.succeed(service)
}

/** The check's answer in the hook's terms: what to do, for how long, and why. */
export const checkAnswer = (r: CheckResult) => {
  const d = r.decision
  return {
    decision: d.kind,
    ...(d.kind === "wait" ? { waitMs: d.waitMs, booked: d.booked } : {}),
    ...(d.kind === "deny" ? { retryAt: Number.isFinite(d.retryAt) ? new Date(d.retryAt).toISOString() : null } : {}),
    ...(d.kind === "allow" ? {} : { policy: d.policy, reason: d.reason }),
    warnings: d.warnings,
    resource: r.resource,
    remaining: r.estimate === null ? null : Math.max(0, Math.floor(r.estimate.remaining)),
    resetAt: r.estimate === null ? null : new Date(r.estimate.resetAt).toISOString(),
    probe: r.probe,
    lease: r.spendId,
  }
}

const route = (request: Request, config: QuotaConfig, ledgers: Ledgers): IO<never, Error, unknown> => {
  const { pathname, searchParams } = new URL(request.url)

  if (pathname === "/v1/status" && request.method === "GET") {
    const account = searchParams.get("account") ?? ""
    return serviceOf(config, searchParams.get("service") ?? "github").flatMap((service) =>
      isAccount(account)
        ? ledgers.send<StatusAnswer>(ledgerKey(service.id, account), {
            op: "status",
            service,
            policies: policiesFor(config, service),
          })
        : IO.fail(new Refusal(400, "account: Not an account name.")),
    )
  }

  if (request.method !== "POST") return IO.fail(new Refusal(405, "Use POST."))

  if (pathname === "/v1/check") {
    return parse(request, checkBody).flatMap((body) =>
      serviceOf(config, body.service).flatMap((service) => {
        if (body.resource !== undefined && !service.resources.some((r) => r.id === body.resource)) {
          return IO.fail(new Refusal(400, `${service.id} has no resource ${body.resource}.`))
        }
        const key = ledgerKey(service.id, body.account)
        return ledgers.remember(key).flatMap(() =>
          ledgers
            .send<CheckResult>(key, {
              op: "check",
              service,
              policies: policiesFor(config, service),
              request: {
                resource: body.resource,
                session: body.session,
                machine: body.machine,
                label: body.label,
                class: body.class,
                cost: body.cost,
                callId: body.callId,
                drawFrom: body.lease,
              },
            })
            .map(checkAnswer),
        )
      }),
    )
  }

  if (pathname === "/v1/finish") {
    return parse(request, finishBody).flatMap((body) =>
      serviceOf(config, body.service).flatMap((service) =>
        ledgers.send(ledgerKey(service.id, body.account), { op: "finish", callId: body.callId }),
      ),
    )
  }

  if (pathname === "/v1/report") {
    return parse(request, reportBody).flatMap((body) =>
      serviceOf(config, body.service).flatMap((service) => {
        const wanted = service.resources.map((r) => r.id)
        const observations = observationsFrom(wanted, body.headers, body.body)
        if (observations.length === 0) {
          return IO.fail(new Refusal(422, `Nothing in that report names a ${service.id} budget.`))
        }
        const key = ledgerKey(service.id, body.account)
        return ledgers.remember(key).flatMap(() =>
          ledgers.send(key, {
            op: "report",
            service,
            observations,
            source: body.headers === undefined ? "probe" : "header",
          }),
        )
      }),
    )
  }

  return IO.fail(new Refusal(404, "No such route."))
}

/** Routes `/v1/*`. Every request has already passed the bearer-key check. */
export const handleApi = async (request: Request, config: QuotaConfig, ledgers: Ledgers): Promise<Response> =>
  (await route(request, config, ledgers).run()).fold(
    (e) => json({ error: e.message }, e instanceof Refusal ? e.status : 502),
    (body) => json(body),
  )
