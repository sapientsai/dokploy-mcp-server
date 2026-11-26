# quota-mcp-server: a shared API-quota broker for agent fleets

Status: draft, 2026-11-26. Nothing is built yet.

## The problem

Many agent sessions, on several machines, call the same APIs as the same account. Each service gives that account one budget. GitHub gives a user 5,000 REST calls an hour and 5,000 GraphQL points an hour, shared by every token and every app the user signs in with. Today no session knows what the others are spending. One polling loop can drain the budget, and then `gh` fails for every session on every machine until the window resets. No one can tell afterwards which session spent it.

## The goal

One broker that every session checks before it spends, for any rate-limited API:

- **A shared ledger** per service and account: what's left, when it resets, and who spent what.
- **A floor** kept for the human: agents are refused before the budget hits it.
- **Governance:** the owner's own limits on top of the service's: calls per second, minute, hour or day, for the whole fleet, one machine or one session; how many calls may run at once; how much of a window one session may take; and how often one command may repeat. Each limit can deny, delay or only warn.
- **Generic:** GitHub first. Each further service is a config entry that names a header scheme and a probe, not new code.
- **Fails open:** if the broker can't be reached, work goes on as it does today.

Not goals: proxying writes, holding service credentials (until phase 5), or limiting a human's own calls.

## How it fits together

```
 agent session ──(Bash: gh …)──► PreToolUse hook ──► /v1/check ──► quota Worker ──► Durable Object
       │                          (fails open)                      (somamcp)        one per service:account
       └──(MCP tools)──────────────────────────────► /mcp ─────────┘
```

- **The broker** is a Cloudflare Worker built on somamcp (WinterTC entry only, as `servers/temporal` does), with a SQLite-backed Durable Object per ledger key `service:account`. A Durable Object handles one request at a time, so every check sees every spend before it. SQLite-backed Durable Objects are on the Workers Free plan (Cloudflare's pricing page: "Workers Free plan: Only Durable Objects with SQLite storage backend are available"), with 5 GB of storage for the account; a ledger needs kilobytes.
- **Two doors on one Worker:** `/mcp` for the MCP tools, and a small JSON API (`/v1/check`, `/v1/report`) for the hook, which runs on every Bash call and must answer fast.
- **Auth:** one bearer key, `QUOTA_KEY`, set with `wrangler secret put` and kept on each machine in envpkt beside `QUOTA_URL`. Without the secret set, the Worker refuses every request rather than run open.
- **The hook** is a Claude Code `PreToolUse` hook on `Bash`, shipped in the owner's dotfiles so every machine gets it.

## Services are config

A service entry:

```jsonc
{
  "id": "github",
  "label": "GitHub (user)",
  "resources": ["core", "graphql"], // budgets within the service; a check names one, or all
  "headers": "github", // which parser reads its rate-limit headers
  "probe": {
    // how a client learns the truth for free
    "kind": "command",
    "command": "gh api rate_limit",
    "parse": "github-rate-limit-json",
  },
  "staleAfterSeconds": 60, // older than this, ask a client to probe
  "policies": [/* see Governance */],
}
```

Header parsers are code, one per scheme, and a service picks one. Phase 2 ships `github`. Phase 4 adds the others, each checked against the service's own docs first, because none is verified yet:

| Parser        | Headers it reads (to confirm before building)                                         |
| ------------- | ------------------------------------------------------------------------------------- |
| `github`      | `x-ratelimit-limit`, `-remaining`, `-used`, `-reset` (UTC epoch seconds), `-resource` |
| `ietf`        | `RateLimit` and `RateLimit-Policy`, from the IETF httpapi rate-limit headers draft    |
| `openai`      | `x-ratelimit-remaining-requests`, `x-ratelimit-reset-requests` (a duration)           |
| `anthropic`   | `anthropic-ratelimit-requests-remaining`, `-reset` (RFC 3339)                         |
| `retry-after` | `Retry-After` alone, for services that only say when to come back                     |

The GitHub facts come from GitHub's docs (read 2026-11-26): requests "authenticated as a user share the user's rate limit across credentials"; `GET /rate_limit` "does not count against your primary rate limit, but it can count against your secondary rate limit"; GraphQL has a separate budget of 5,000 points an hour per user.

## Governance

A **policy** is one limit the owner sets. Every check runs every policy that matches it, and the strictest answer wins. Policies sit on a service, or at the top level to cover every service.

```jsonc
"policies": [
  // Keep the last 1,000 of each GitHub budget for the owner.
  { "id": "floor", "kind": "floor", "keep": 1000 },
  // The whole fleet: at most 60 calls a minute, and at most 5 a second; past either, wait.
  { "id": "fleet-minute", "kind": "rate", "scope": "fleet", "max": 60, "per": "1m", "action": "delay" },
  { "id": "fleet-second", "kind": "rate", "scope": "fleet", "max": 5, "per": "1s", "action": "delay" },
  // One session: at most 2 calls a second, and 40% of the service's window while others are active.
  { "id": "session-second", "kind": "rate", "scope": "session", "max": 2, "per": "1s", "action": "delay" },
  { "id": "session-share", "kind": "share", "scope": "session", "max": 0.4 },
  // Writes, under GitHub's content-creation limits (80 a minute, 500 an hour).
  { "id": "writes-minute", "kind": "rate", "scope": "fleet", "match": { "class": "write" }, "max": 40, "per": "1m" },
  { "id": "writes-hour", "kind": "rate", "scope": "fleet", "match": { "class": "write" }, "max": 300, "per": "1h" },
  // At most 10 calls in flight across the fleet, under GitHub's 100 concurrent.
  { "id": "in-flight", "kind": "concurrency", "scope": "fleet", "max": 10, "action": "delay" },
  // The same command from one session more than 20 times in 10 minutes is a loop.
  { "id": "loop", "kind": "repeat", "scope": "session", "max": 20, "per": "10m" },
  // A machine spending more than 20,000 in a day: say so, but don't stop it.
  { "id": "machine-day", "kind": "rate", "scope": "machine", "max": 20000, "per": "1d", "action": "warn" },
]
```

- **Kinds:**
  - `floor` keeps `keep` of each budget out of agents' reach.
  - `rate` limits cost per sliding window.
  - `share` caps one scope's part of the service's own window, while two or more are active.
  - `concurrency` caps calls in flight.
  - `repeat` caps the same `label` within a window.
- **Scope:** `fleet` (everyone on the account), `machine` or `session`.
- **Windows:** `1s`, `1m`, `1h`, `1d`, or any count of those units, such as `10m`.
- **`match`** narrows a policy, by `resource` (`core`, `graphql`), `class` (`read` or `write`) or `label` prefix (`gh pr create`). Without it, a policy covers every call to its service.
- **Actions:**
  - `deny`, the default, refuses with a reason and `retryAt`.
  - `delay` holds the call until it fits, up to `maxDelayMs` (default 10 s), and denies past that. The broker books the slot when it answers, so held calls run in the order they asked.
  - `warn` allows the call and adds a note the agent sees.
- **`mode`** on any policy: `enforce` (the default), `warn` or `off`. A new policy can run in `warn` for a few days first, to show what it would have stopped.
- **Who sets them:** policies live in the Worker's deploy config, in `sapientsai/somamcp-hosted`, so a change is a reviewed commit. No MCP tool can change a policy, so an agent that gets refused can't loosen the limit that refused it. `quota_policies` only reads them.
- **The GitHub numbers above** come from GitHub's docs on secondary limits (read 2026-11-26): "No more than 100 concurrent requests," 900 points a minute for REST, and "no more than 80 content-generating requests per minute and no more than 500 content-generating requests per hour." The defaults sit well under each.

## The broker holds no service credentials

Clients learn the truth and report it. When the ledger is older than `staleAfterSeconds`, the broker answers a check with `probe: true`, and the client runs the service's probe (for GitHub, `gh api rate_limit`, which is free) and reports the result. The broker asks one client at a time, so a fleet probes about once a minute, not once per call. Between probes, the broker estimates: each allowed call takes its cost off `remaining`.

## The ledger

Per Durable Object (`service:account`):

- **`resources`:** for each, `limit`, `remaining`, `reset`, `observedAt`, and where the number came from (`probe`, `header`, `estimate`).
- **`spends`:** one row per allowed call: `session`, `machine`, `label` (the command's first words, such as `gh pr create`, never its arguments), `class`, `cost`, `at`. Kept 7 days. Sliding windows of a minute or more count from here; one-second windows are kept in the Durable Object's memory.
- **`inflight`:** calls started and not yet finished, by `toolUseId`, each with a TTL (default 10 minutes) in case its finish never arrives.
- **`leases`:** reservations from `quota_acquire`: `session`, `resource`, `cost`, `expiresAt`. Leased cost counts as spent until it expires or is released.

## Deciding a check

`check(service, account, resource, session, machine, label, class, cost, toolUseId)` answers `allow`, `allow` after a delay, `deny` with a reason and a `retryAt`, or any of those with `probe: true`. In order:

1. **Free calls pass:** the probe itself, and a short allowlist per service (`gh auth status`, `gh api rate_limit`).
2. **The service's own budget:** deny when the call would take `remaining − leased − cost` under the `floor` policy, with `retryAt` at the resource's `reset`.
3. **Every matching policy,** each answering allow, delay, warn or deny. The strictest wins: deny, then the longest delay, then warn.
4. **Allow:** take `cost` off the estimate, record the spend and the call in flight, and book any delayed slot.

A deny names the policy that refused, and for a loop suggests a longer interval or waiting with ScheduleWakeup.

A deny reaches the agent as the hook's `permissionDecisionReason`, so it reads, for example: "GitHub core has 940 calls left, under the 1,000 kept for the owner. It resets at 16:25 UTC (in 11 minutes). Wait until then."

## The hook

`quota-check.mjs`, registered under `PreToolUse` with matcher `Bash`, and again under `PostToolUse` to mark the call finished for `concurrency` policies. Claude Code sends it `session_id`, `cwd` and `tool_input.command` on stdin, and it blocks a call by printing `hookSpecificOutput` with `permissionDecision: "deny"` and a reason.

- **Finds `gh` calls** in the command, including after `&&`, `|`, `;` and `$(`. A command with none exits at once, so the hook costs nothing for other Bash calls.
- **Classes each call:** `write` for `gh pr create`, `gh issue create`, `gh issue comment`, `gh release create` and any `gh api` with `-X POST`, `PATCH`, `PUT` or `DELETE`; otherwise `read`.
- **Picks the resource:** `gh api graphql` and the `gh pr`, `gh issue` and `gh repo` families count against `graphql`; other `gh api` paths and `gh run` against `core`; anything unknown against whichever has less left.
- **Prices known loops:** `gh run watch` without an `--interval` of 30 or more is denied outright, since its 3-second default polls about 1,200 times an hour. A command it can't price costs 1.
- **Waits when told to:** a `delay` answer holds the call for at most `maxDelayMs`, then lets it run. The hook's own timeout in the settings is set above that.
- **Fails open:** 800 ms timeout on the check itself, and any error lets the call through. It tells the user once per session that the broker was unreachable.
- **Probes when asked,** in the background, so the agent's call isn't held up.
- **Off switch:** `QUOTA_HOOK=off`.

## MCP tools

| Tool             | Does                                                                                           | Writes? |
| ---------------- | ---------------------------------------------------------------------------------------------- | ------- |
| `quota_status`   | What's left per service and resource, when it resets, the floor, and the top sessions by spend | no      |
| `quota_acquire`  | Reserves cost for a batch of work, for a TTL; answers granted, or when to retry                | yes     |
| `quota_release`  | Returns what's left of a lease                                                                 | yes     |
| `quota_report`   | Records what a response's headers or a probe said                                              | yes     |
| `quota_services` | Lists the configured services and their resources                                              | no      |
| `quota_policies` | Lists every policy, its mode, and how close each scope is to it now                            | no      |

## Phases

1. **This spec,** reviewed.
2. **The broker:** Worker, Durable Object, the `github` parser and probe, `/v1/check`, `/v1/report`, the tools. Tests run the Durable Object in workerd through Miniflare, as openFDA's worker tests do.
3. **The hook,** in the dotfiles, first in a warn-only mode for a few days (it says what it would deny, and denies nothing), then enforcing.
4. **More services,** one parser at a time, each checked against that service's docs.
5. **A GitHub read proxy** with an ETag cache, so repeated reads such as CI polling come back 304. This needs a read-only token in the Worker. Whether GitHub counts a 304 against the limit isn't stated on its rate-limit pages; confirm before relying on it.

## Deploying

The package publishes from this monorepo like the others. Following temporal, the Worker itself would deploy from `sapientsai/somamcp-hosted` through Cloudflare Workers Builds, installing the package from npm, so this repo never holds a Cloudflare token. The owner's steps: connect the Worker in Cloudflare, set `QUOTA_KEY`, and put `QUOTA_URL` and `QUOTA_KEY` in envpkt.

## Open questions

- **Default policies:** the example under Governance: a floor of 1,000; the fleet at 60 a minute and 5 a second; a session at 2 a second and 40% of a window; writes at 40 a minute and 300 an hour; 10 in flight; loops at 20 in 10 minutes; a warning past 20,000 a day per machine.
- **First week:** every policy except the floor in `warn` mode, then `enforce`?
- **Names in the ledger:** sessions are recorded by `session_id` and machine hostname. That stays in the owner's own Worker, but it is still personal data; keep 7 days?
- **Other accounts:** each account is its own ledger key (`github:<login>`), so sessions signed in as different GitHub users never share or see each other's budget.
