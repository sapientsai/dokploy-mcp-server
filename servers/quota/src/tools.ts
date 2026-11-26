import { Either, IO } from "functype"
import type { SomaServerInstance } from "somamcp"
import { UserError } from "somamcp"
import { z } from "zod"

import { policiesFor, type QuotaConfig, type Service } from "./config"
import { formatCheck, formatPolicies, formatStatus, type StatusAnswer } from "./format"
import type { CheckResult } from "./ledger/types"
import { isAccount, ledgerKey, type Ledgers } from "./ledgers"
import { observationsFrom } from "./parsers/github"

const serviceParam = z.string().min(1).describe("The service id, such as github. quota_services lists them.")
const accountParam = z
  .string()
  .min(1)
  .max(100)
  .describe("The account whose budget it is, such as a GitHub login. Each account has its own ledger.")

export const findService = (config: QuotaConfig, id: string): Either<UserError, Service> => {
  const service = config.services.find((s) => s.id === id)
  return service === undefined
    ? Either.left(new UserError(`No service ${id}. Configured: ${config.services.map((s) => s.id).join(", ")}.`))
    : Either.right(service)
}

export const checkAccount = (account: string): Either<UserError, string> =>
  isAccount(account) ? Either.right(account) : Either.left(new UserError(`Not an account name: ${account}`))

/** Refuses a resource the service doesn't have, before it reaches the ledger. */
export const checkResource = (service: Service, resource: string | undefined): Either<UserError, string | undefined> =>
  resource === undefined || service.resources.some((r) => r.id === resource)
    ? Either.right(resource)
    : Either.left(
        new UserError(
          `${service.id} has no resource ${resource}; it has ${service.resources.map((r) => r.id).join(", ")}.`,
        ),
      )

const toUserError = (e: Error): UserError => (e instanceof UserError ? e : new UserError(e.message))

/**
 * Runs a tool's effect. somamcp reports a tool's failure from a thrown UserError, so this is where the
 * typed error becomes a throw. @interop
 */
const runTool = <A>(effect: IO<never, Error, A>): Promise<A> => effect.mapError(toUserError).runOrThrow()

/** Ledger keys for one service, or one account of it. */
const keysFor = (
  ledgers: Ledgers,
  service: string,
  account: string | undefined,
): IO<never, Error, ReadonlyArray<string>> =>
  account !== undefined
    ? IO.fromEither(checkAccount(account)).map((a) => [ledgerKey(service, a)])
    : ledgers.accounts().map((keys) => keys.filter((k) => k.startsWith(`${service}:`)))

const statusOf = (ledgers: Ledgers, config: QuotaConfig, service: Service, keys: ReadonlyArray<string>) =>
  IO.all(
    keys.map((key) =>
      ledgers
        .send<StatusAnswer>(key, { op: "status", service, policies: policiesFor(config, service) })
        .map((status) => ({ key, status })),
    ),
  )

const describeService = (config: QuotaConfig, s: Service): string =>
  [
    `## ${s.id}: ${s.label}`,
    `- **Resources:** ${s.resources.map((r) => `${r.id} (${r.windowSeconds / 60}-minute window)`).join(", ")}`,
    `- **Probe:** ${s.probe?.command ?? "none"}${s.probe?.http === undefined ? "" : `; the broker also reads ${s.probe.http.url} when it holds ${s.probe.http.tokenSecret}`}`,
    `- **Free:** ${s.free.length === 0 ? "none" : s.free.join(", ")}`,
    `- **Policies:** ${policiesFor(config, s).length}`,
  ].join("\n")

export function registerQuotaTools(server: SomaServerInstance, config: QuotaConfig, ledgers: Ledgers): void {
  server.addTool({
    name: "quota_services",
    description:
      "List the services this broker keeps ledgers for, their budgets (resources), and how each learns what's left.",
    parameters: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: false },
    execute: () => Promise.resolve(config.services.map((s) => describeService(config, s)).join("\n\n")),
  })

  server.addTool({
    name: "quota_status",
    description:
      "What's left of each budget, when it resets and how fresh that number is, calls in flight, and the sessions that spent most in the last hour. Omit account to see every account the broker knows for the service.",
    parameters: z.object({ service: serviceParam.default("github"), account: accountParam.optional() }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    execute: (args) =>
      runTool(
        IO.fromEither(findService(config, args.service)).flatMap((service) =>
          keysFor(ledgers, service.id, args.account).flatMap((keys) =>
            keys.length === 0
              ? IO.succeed(`No ledger for ${service.id} yet: nothing has checked in.`)
              : statusOf(ledgers, config, service, keys).map((answers) =>
                  answers.map(({ key, status }) => formatStatus(key, status)).join("\n\n"),
                ),
          ),
        ),
      ),
  })

  server.addTool({
    name: "quota_policies",
    description:
      "Every limit the owner set for a service, its mode (enforce, warn or off), and how close the busiest scope is to it now. Policies are read-only here: they change only in the broker's deploy config.",
    parameters: z.object({ service: serviceParam.default("github"), account: accountParam.optional() }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    execute: (args) =>
      runTool(
        IO.fromEither(findService(config, args.service)).flatMap((service) =>
          keysFor(ledgers, service.id, args.account).flatMap((keys) =>
            keys.length === 0
              ? IO.succeed(
                  policiesFor(config, service)
                    .map((p) => `- **${p.id}** (${p.kind}, ${p.mode})`)
                    .join("\n"),
                )
              : statusOf(ledgers, config, service, keys).map((answers) =>
                  answers.map(({ key, status }) => formatPolicies(key, status.policies)).join("\n\n"),
                ),
          ),
        ),
      ),
  })

  server.addTool({
    name: "quota_acquire",
    description:
      "Reserve budget before a batch of calls, such as a script that will make 200 GitHub requests. The lease is checked against the budget (the floor and per-session share); its calls still meet the per-second and per-minute limits as they run. Pass the lease to the hook's checks so calls draw from it instead of counting twice. Give back what wasn't used with quota_release.",
    parameters: z.object({
      service: serviceParam,
      account: accountParam,
      cost: z.number().int().positive().max(100_000).describe("How many calls (or points) the batch will spend."),
      purpose: z.string().min(1).max(80).describe("A few words on what the batch is for. Recorded as its label."),
      resource: z
        .string()
        .min(1)
        .optional()
        .describe("The budget it spends, such as core. Omitted, the one with least left."),
      writes: z.boolean().default(false).describe("True when the batch creates or changes things."),
      session: z.string().min(1).max(100).default("mcp").describe("Who is spending, for the ledger."),
      machine: z.string().min(1).max(100).default("mcp"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    execute: (args) =>
      runTool(
        IO.fromEither(
          findService(config, args.service).flatMap((service) =>
            checkAccount(args.account).flatMap((account) =>
              checkResource(service, args.resource).map((resource) => ({ service, account, resource })),
            ),
          ),
        ).flatMap(({ service, account, resource }) => {
          const key = ledgerKey(service.id, account)
          return ledgers.remember(key).flatMap(() =>
            ledgers
              .send<CheckResult>(key, {
                op: "check",
                service,
                policies: policiesFor(config, service),
                request: {
                  resource,
                  session: args.session,
                  machine: args.machine,
                  label: `lease: ${args.purpose}`,
                  class: args.writes ? "write" : "read",
                  cost: args.cost,
                  reserve: true,
                },
              })
              .map((result) => formatCheck(result, Date.now())),
          )
        }),
      ),
  })

  server.addTool({
    name: "quota_release",
    description:
      "Give back what a lease from quota_acquire didn't use, by saying how much it did use. It can only lower a lease, and only a lease.",
    parameters: z.object({
      service: serviceParam,
      account: accountParam,
      lease: z.uuid(),
      used: z.number().int().nonnegative().describe("How many calls the batch actually made."),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execute: (args) =>
      runTool(
        IO.fromEither(
          findService(config, args.service).flatMap((service) =>
            checkAccount(args.account).map((account) => ledgerKey(service.id, account)),
          ),
        )
          .flatMap((key) =>
            ledgers.send<{ readonly ok: boolean }>(key, { op: "release", lease: args.lease, used: args.used }),
          )
          .flatMap((answer) =>
            answer.ok
              ? IO.succeed(`Lease ${args.lease} now counts ${args.used}.`)
              : IO.fail(
                  new UserError(
                    `No lease ${args.lease}: it isn't a quota_acquire lease, or it's older than the 7 days the ledger keeps.`,
                  ),
                ),
          ),
      ),
  })

  server.addTool({
    name: "quota_report",
    description:
      "Tell the broker what a service said about its budget: a response's rate-limit headers, or the body of its status endpoint (for GitHub, GET /rate_limit). It replaces the broker's estimate.",
    parameters: z
      .object({
        service: serviceParam,
        account: accountParam,
        headers: z
          .record(z.string(), z.string())
          .optional()
          .describe("Response headers, such as x-ratelimit-remaining."),
        body: z.unknown().optional().describe("The status endpoint's JSON body."),
      })
      .refine((a) => a.headers !== undefined || a.body !== undefined, { message: "Give headers or body." }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execute: (args) =>
      runTool(
        IO.fromEither(
          findService(config, args.service).flatMap((service) =>
            checkAccount(args.account).map((account) => ({ service, key: ledgerKey(service.id, account) })),
          ),
        ).flatMap(({ service, key }) => {
          const wanted = service.resources.map((r) => r.id)
          const observations = observationsFrom(wanted, args.headers, args.body)
          if (observations.length === 0) {
            return IO.fail(new UserError(`Nothing in that report names a ${service.id} budget.`))
          }
          return ledgers
            .remember(key)
            .flatMap(() =>
              ledgers.send<{ readonly kept: number }>(key, {
                op: "report",
                service,
                observations,
                source: args.headers === undefined ? "probe" : "header",
              }),
            )
            .map(
              (answer) =>
                `Recorded ${answer.kept} reading${answer.kept === 1 ? "" : "s"} for ${key}: ${observations.map((o) => `${o.resource} ${o.remaining} of ${o.limit}`).join(", ")}.`,
            )
        }),
      ),
  })
}
