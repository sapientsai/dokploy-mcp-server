# quota-mcp-server: a shared API-quota broker for agent fleets

Status: draft, 2026-11-26. Nothing is built yet.

## The problem

Many agent sessions, on several machines, call the same APIs as the same account. Each service gives that account one budget. GitHub gives a user 5,000 REST calls an hour and 5,000 GraphQL points an hour, shared by every token and every app the user signs in with. Today no session knows what the others are spending. One polling loop can drain the budget, and then `gh` fails for every session on every machine until the window resets. No one can tell afterwards which session spent it.

## The goal

One broker that every session checks before it spends, for any rate-limited API:

- **A shared ledger** per service and account: what's left, when it resets, and who spent what.
- **A floor** kept for the human: agents are refused before the budget hits it.
- **Fair shares:** no single session can take most of a window while others are working.
- **Loop guard:** the same command repeated many times in a few minutes is refused, with advice.
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
  "floor": 1000, // per resource: refuse agents below this
  "sessionShare": 0.4, // most of a window one session may take while others are active
  "staleAfterSeconds": 60, // older than this, ask a client to probe
  "loopGuard": { "repeats": 20, "withinSeconds": 600 },
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

## The broker holds no service credentials

Clients learn the truth and report it. When the ledger is older than `staleAfterSeconds`, the broker answers a check with `probe: true`, and the client runs the service's probe (for GitHub, `gh api rate_limit`, which is free) and reports the result. The broker asks one client at a time, so a fleet probes about once a minute, not once per call. Between probes, the broker estimates: each allowed call takes its cost off `remaining`.

## The ledger

Per Durable Object (`service:account`):

- **`resources`:** for each, `limit`, `remaining`, `reset`, `observedAt`, and where the number came from (`probe`, `header`, `estimate`).
- **`spends`:** one row per allowed call: `session`, `machine`, `label` (the command's first two words, such as `gh pr`, never its arguments), `cost`, `at`. Kept 7 days.
- **`leases`:** reservations from `quota_acquire`: `session`, `resource`, `cost`, `expiresAt`. Leased cost counts as spent until it expires or is released.

## Deciding a check

`check(service, account, resource, session, machine, label, cost)` answers `allow`, `deny` with a reason and a `retryAt`, or `allow` with `probe: true`. In order:

1. **Free calls pass:** the probe itself, and a short allowlist per service (`gh auth status`, `gh api rate_limit`).
2. **Floor:** deny when `remaining − leased − cost < floor`. `retryAt` is the resource's `reset`.
3. **Fair share:** when two or more sessions spent in the window, deny a session whose spend would pass `sessionShare × limit`.
4. **Loop guard:** deny the same `label` from the same session past `repeats` within `withinSeconds`. The reason suggests a longer interval, or waiting with ScheduleWakeup.
5. **Otherwise allow,** take `cost` off the estimate, and record the spend.

A deny reaches the agent as the hook's `permissionDecisionReason`, so it reads, for example: "GitHub core has 940 calls left, under the 1,000 kept for the owner. It resets at 16:25 UTC (in 11 minutes). Wait until then."

## The hook

`quota-check.mjs`, registered under `PreToolUse` with matcher `Bash`. Claude Code sends it `session_id`, `cwd` and `tool_input.command` on stdin, and it blocks a call by printing `hookSpecificOutput` with `permissionDecision: "deny"` and a reason.

- **Finds `gh` calls** in the command, including after `&&`, `|`, `;` and `$(`. A command with none exits at once, so the hook costs nothing for other Bash calls.
- **Picks the resource:** `gh api graphql` and the `gh pr`, `gh issue` and `gh repo` families count against `graphql`; other `gh api` paths and `gh run` against `core`; anything unknown against whichever has less left.
- **Prices known loops:** `gh run watch` without an `--interval` of 30 or more is denied outright, since its 3-second default polls about 1,200 times an hour. A command it can't price costs 1.
- **Fails open:** 800 ms timeout, and any error lets the call through. It tells the user once per session that the broker was unreachable.
- **Probes when asked,** in the background, so the agent's call isn't held up.
- **Off switch:** `QUOTA_HOOK=off`.

## MCP tools

| Tool             | Does                                                                                           | Writes? |
| ---------------- | ---------------------------------------------------------------------------------------------- | ------- |
| `quota_status`   | What's left per service and resource, when it resets, the floor, and the top sessions by spend | no      |
| `quota_acquire`  | Reserves cost for a batch of work, for a TTL; answers granted, or when to retry                | yes     |
| `quota_release`  | Returns what's left of a lease                                                                 | yes     |
| `quota_report`   | Records what a response's headers or a probe said                                              | yes     |
| `quota_services` | Lists the configured services, their floors and shares                                         | no      |

## Phases

1. **This spec,** reviewed.
2. **The broker:** Worker, Durable Object, the `github` parser and probe, `/v1/check`, `/v1/report`, the tools. Tests run the Durable Object in workerd through Miniflare, as openFDA's worker tests do.
3. **The hook,** in the dotfiles, first in a warn-only mode for a few days (it says what it would deny, and denies nothing), then enforcing.
4. **More services,** one parser at a time, each checked against that service's docs.
5. **A GitHub read proxy** with an ETag cache, so repeated reads such as CI polling come back 304. This needs a read-only token in the Worker. Whether GitHub counts a 304 against the limit isn't stated on its rate-limit pages; confirm before relying on it.

## Deploying

The package publishes from this monorepo like the others. Following temporal, the Worker itself would deploy from `sapientsai/somamcp-hosted` through Cloudflare Workers Builds, installing the package from npm, so this repo never holds a Cloudflare token. The owner's steps: connect the Worker in Cloudflare, set `QUOTA_KEY`, and put `QUOTA_URL` and `QUOTA_KEY` in envpkt.

## Open questions

- **Floor:** 1,000 for GitHub core and graphql?
- **Share:** 40% of a window per session, while others are active?
- **Names in the ledger:** sessions are recorded by `session_id` and machine hostname. That stays in the owner's own Worker, but it is still personal data; keep 7 days?
- **Other accounts:** each account is its own ledger key (`github:<login>`), so sessions signed in as different GitHub users never share or see each other's budget.
