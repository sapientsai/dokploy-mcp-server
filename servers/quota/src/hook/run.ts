import { Option, type Wire } from "functype"

import { describe, type Described, ghCalls, loopRefusal } from "./parse"

/** What Claude Code sends a command hook on stdin. */
export type HookInput = Wire<{
  readonly hook_event_name?: string
  readonly session_id?: string
  readonly tool_name?: string
  readonly tool_use_id?: string
  readonly tool_input?: { readonly command?: unknown }
}>

/** What the hook prints for a PreToolUse event. */
export type HookOutput = Wire<{
  readonly systemMessage?: string
  readonly hookSpecificOutput: {
    readonly hookEventName: "PreToolUse"
    readonly permissionDecision?: "deny"
    readonly permissionDecisionReason?: string
    readonly additionalContext?: string
  }
}>

export type Broker = { readonly url: string; readonly key: string }

/** `warn` reports what the broker would refuse and refuses nothing; `enforce` refuses. */
export type Mode = "warn" | "enforce"

/** Everything the hook does to the outside world, passed in so the logic is tested without it. */
export type Deps = {
  readonly mode: Mode
  readonly broker: () => Promise<Option<Broker>>
  /** Forgets a cached broker key the broker refused, so the next call reads it afresh. */
  readonly forgetBroker: () => void
  readonly account: () => Option<string>
  readonly machine: string
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>
  readonly sleep: (ms: number) => Promise<void>
  /** Starts the probe the broker asked for in the background, so the call isn't held up. */
  readonly probe: (account: string) => void
  /** True the first time it's called for this session and key; false after. */
  readonly firstTime: (session: string, key: string) => boolean
}

/** The broker's answer to `/v1/check`, as much of it as the hook reads. */
type Answer = Wire<{
  readonly decision?: "allow" | "wait" | "deny"
  readonly waitMs?: number
  readonly booked?: boolean
  readonly reason?: string
  readonly warnings?: ReadonlyArray<string>
  readonly probe?: string | null
}>

const CHECK_TIMEOUT_MS = 800
const FINISH_TIMEOUT_MS = 500
/** The longest the hook holds one command for the broker's delays, in total. */
const MAX_HOLD_MS = 10_000

type Verdict = {
  readonly refusals: ReadonlyArray<string>
  readonly notes: ReadonlyArray<string>
  readonly unreachable: boolean
  readonly probe: boolean
  readonly heldMs: number
}

const EMPTY: Verdict = { refusals: [], notes: [], unreachable: false, probe: false, heldMs: 0 }

const merge = (a: Verdict, b: Verdict): Verdict => ({
  refusals: [...a.refusals, ...b.refusals],
  notes: [...a.notes, ...b.notes],
  unreachable: a.unreachable || b.unreachable,
  probe: a.probe || b.probe,
  heldMs: a.heldMs + b.heldMs,
})

type Call = { readonly index: number; readonly described: Described }

const endpoint = (broker: Broker, path: string): string => `${broker.url.replace(/\/+$/, "")}${path}`

const post = (deps: Deps, broker: Broker, path: string, body: unknown, timeoutMs: number) =>
  deps
    .fetch(endpoint(broker, path), {
      method: "POST",
      headers: { authorization: `Bearer ${broker.key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    .then(
      (r) => Option(r),
      () => Option.none<Response>(),
    )

/** Asks the broker about one call, waiting out a delay it asks for, up to what's left of the hold. */
const ask = async (
  deps: Deps,
  broker: Broker,
  input: HookInput,
  account: string,
  call: Call,
  holdLeftMs: number,
): Promise<Verdict> => {
  const response = await post(
    deps,
    broker,
    "/v1/check",
    {
      service: "github",
      account,
      resource: call.described.resource,
      session: input.session_id ?? "unknown",
      machine: deps.machine,
      label: call.described.label,
      class: call.described.class,
      cost: 1,
      callId: `${input.tool_use_id ?? "call"}:${call.index}`,
    },
    CHECK_TIMEOUT_MS,
  )
  if (response.exists((r) => r.status === 401)) deps.forgetBroker()
  const usable = response.filter((r) => r.ok)
  if (usable.isNone()) return { ...EMPTY, unreachable: true }
  const answer = await usable.fold(
    () => Promise.resolve<Answer>({}),
    (r) =>
      r.json().then(
        (a) => a as Answer,
        () => ({}) as Answer,
      ),
  )
  const notes = answer.warnings ?? []
  const probe = typeof answer.probe === "string"

  if (answer.decision === "deny") {
    return { ...EMPTY, refusals: [answer.reason ?? `The quota broker refused ${call.described.label}.`], notes, probe }
  }
  if (answer.decision === "wait") {
    const waitMs = Math.max(0, Math.min(answer.waitMs ?? 0, holdLeftMs))
    await deps.sleep(waitMs)
    const held: Verdict = { ...EMPTY, notes, probe, heldMs: waitMs }
    // A booked slot is ours after the wait; an unbooked one (calls in flight) means asking again.
    if (answer.booked === true || holdLeftMs - waitMs <= 0) return held
    return merge(held, await ask(deps, broker, input, account, call, holdLeftMs - waitMs))
  }
  return { ...EMPTY, notes, probe }
}

const output = (deps: Deps, verdict: Verdict, input: HookInput): Option<HookOutput> => {
  const enforce = deps.mode === "enforce" && verdict.refusals.length > 0
  const context = [
    ...(deps.mode === "warn"
      ? verdict.refusals.map((r) => `The quota broker would refuse this GitHub call if it were enforcing: ${r}`)
      : []),
    ...verdict.notes.map((n) => `Quota broker note: ${n}`),
    ...(verdict.heldMs > 0
      ? [`The quota broker held this command ${Math.ceil(verdict.heldMs / 1000)} s to stay under a rate limit.`]
      : []),
  ]
  const message =
    verdict.unreachable && deps.firstTime(input.session_id ?? "unknown", "unreachable")
      ? Option("The quota broker didn't answer, so GitHub calls in this session run ungoverned until it does.")
      : Option.none<string>()
  if (!enforce && context.length === 0 && message.isNone()) return Option.none()
  return Option({
    ...message.fold(
      () => ({}),
      (systemMessage) => ({ systemMessage }),
    ),
    hookSpecificOutput: {
      hookEventName: "PreToolUse" as const,
      ...(enforce
        ? { permissionDecision: "deny" as const, permissionDecisionReason: verdict.refusals.join("\n\n") }
        : {}),
      ...(context.length === 0 ? {} : { additionalContext: context.join("\n") }),
    },
  })
}

const commandOf = (input: HookInput): string =>
  input.tool_name === "Bash" && typeof input.tool_input?.command === "string" ? input.tool_input.command : ""

const callsIn = (command: string): ReadonlyArray<Call> =>
  ghCalls(command).flatMap((call, index) =>
    describe(call)
      .map((described) => ({ index, described }))
      .toArray(),
  )

/** The broker and the account to check against, when both are known. */
const target = async (deps: Deps): Promise<Option<{ readonly broker: Broker; readonly account: string }>> => {
  const broker = await deps.broker().catch(() => Option.none<Broker>())
  return broker.flatMap((b) => deps.account().map((account) => ({ broker: b, account })))
}

/**
 * PreToolUse: checks every `gh` call in a Bash command with the broker, in order. Anything that goes
 * wrong lets the command through: the hook never stops work because the broker is down.
 */
export const runPre = async (input: HookInput, deps: Deps): Promise<Option<HookOutput>> => {
  const command = commandOf(input)
  const calls = command === "" ? [] : callsIn(command)
  if (calls.length === 0) return Option.none()

  const local: Verdict = {
    ...EMPTY,
    refusals: [...calls.flatMap((c) => Option(c.described.refuse).toArray()), ...loopRefusal(command).toArray()],
  }
  return (await target(deps)).fold(
    () => Promise.resolve(output(deps, local, input)),
    async ({ broker, account }) => {
      const verdict = await calls.reduce<Promise<Verdict>>(async (done, call) => {
        const sofar = await done
        // One refusal settles the command; the rest needn't spend a check.
        if (sofar.refusals.length > 0 && deps.mode === "enforce") return sofar
        return merge(sofar, await ask(deps, broker, input, account, call, MAX_HOLD_MS - sofar.heldMs))
      }, Promise.resolve(local))
      if (verdict.probe) deps.probe(account)
      return output(deps, verdict, input)
    },
  )
}

/** PostToolUse: tells the broker each `gh` call finished, for `concurrency` policies. Best effort. */
export const runPost = async (input: HookInput, deps: Deps): Promise<void> => {
  const command = commandOf(input)
  const calls = command === "" ? [] : callsIn(command)
  if (calls.length === 0) return
  const found = await target(deps)
  await found.fold(
    () => Promise.resolve(),
    ({ broker, account }) =>
      Promise.all(
        calls.map((call) =>
          post(
            deps,
            broker,
            "/v1/finish",
            { service: "github", account, callId: `${input.tool_use_id ?? "call"}:${call.index}` },
            FINISH_TIMEOUT_MS,
          ),
        ),
      ).then(() => undefined),
  )
}
