import { invariant } from "functype"
import { z } from "zod"

/** A window such as `1s`, `10m`, `1h` or `1d`. */
const DURATION = /^(\d+)(s|m|h|d)$/

const UNIT_MS = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000 } as const

/** Milliseconds in a window such as `10m`. The schema has already checked its shape. */
export const durationMs = (window: string): number => {
  const match = DURATION.exec(window)
  invariant(match !== null, () => `Not a window: ${window}`)
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS]
}

const duration = z.string().regex(DURATION, "A window is a number and s, m, h or d, such as 10m.")

const match = z
  .object({
    /** Only calls against this resource, such as `core` or `graphql`. */
    resource: z.string().min(1).optional(),
    /** Only reads, or only writes. */
    class: z.enum(["read", "write"]).optional(),
    /** Only calls whose label starts with this, such as `gh pr create`. */
    label: z.string().min(1).optional(),
  })
  .strict()

const common = {
  id: z.string().min(1),
  /** `enforce` (the default) acts; `warn` only says what it would have done; `off` skips the policy. */
  mode: z.enum(["enforce", "warn", "off"]).default("enforce"),
  match: match.optional(),
}

const scope = z.enum(["fleet", "machine", "session"])
const action = z.enum(["deny", "delay", "warn"]).default("deny")

export const policySchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("floor"), keep: z.number().int().nonnegative() }).strict(),
  z
    .object({
      ...common,
      kind: z.literal("rate"),
      scope,
      max: z.number().positive(),
      per: duration,
      action,
      maxDelayMs: z.number().int().positive().max(60_000).default(10_000),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("share"),
      scope: z.enum(["machine", "session"]),
      /** The largest part of the service's own window this scope may take, while another is active. */
      max: z.number().positive().max(1),
      action,
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("concurrency"),
      scope,
      max: z.number().int().positive(),
      action,
      maxDelayMs: z.number().int().positive().max(60_000).default(10_000),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("repeat"),
      scope: z.enum(["machine", "session"]),
      max: z.number().int().positive(),
      per: duration,
      action,
    })
    .strict(),
])

export type Policy = z.infer<typeof policySchema>

const resourceSchema = z
  .object({
    id: z.string().min(1),
    /** How long the service's own window is, so a `share` policy knows where it started. */
    windowSeconds: z.number().int().positive(),
  })
  .strict()

const probeSchema = z
  .object({
    /** A command a client can run for free to learn the truth, such as `gh api rate_limit`. */
    command: z.string().min(1).optional(),
    /** How to read the probe's answer. */
    parse: z.enum(["github-rate-limit-json"]),
    /**
     * The broker's own probe, used when the Worker holds `tokenSecret`. It must be a free, read-only
     * endpoint, and the token should be able to read or change nothing else.
     */
    http: z
      .object({
        url: z.url(),
        /** The name of the Worker secret holding the token, never the token itself. */
        tokenSecret: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
      })
      .strict()
      .optional(),
  })
  .strict()

export const serviceSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    label: z.string().min(1),
    resources: z.array(resourceSchema).min(1),
    /** Which parser reads this service's rate-limit headers in `quota_report`. */
    headers: z.enum(["github"]).optional(),
    probe: probeSchema.optional(),
    /** Labels that cost nothing and are never limited, such as the probe itself. */
    free: z.array(z.string().min(1)).default([]),
    /** Older than this, the ledger asks for a probe. */
    staleAfterSeconds: z.number().int().positive().default(60),
    policies: z.array(policySchema).default([]),
  })
  .strict()

export type Service = z.infer<typeof serviceSchema>

export const configSchema = z
  .object({
    services: z.array(serviceSchema).min(1),
    /** Policies for every service, run after each service's own. */
    policies: z.array(policySchema).default([]),
  })
  .strict()
  .superRefine((config, ctx) => {
    const ids = config.services.map((s) => s.id)
    const dupe = ids.find((id, i) => ids.indexOf(id) !== i)
    if (dupe !== undefined) ctx.addIssue({ code: "custom", message: `Two services are named ${dupe}.` })
  })

export type QuotaConfig = z.infer<typeof configSchema>
export type QuotaConfigInput = z.input<typeof configSchema>

/** Every policy that applies to a service: its own, then the global ones. */
export const policiesFor = (config: QuotaConfig, service: Service): ReadonlyArray<Policy> => [
  ...service.policies,
  ...config.policies,
]
