# quota-mcp-server: a shared API-quota broker for agent fleets

Status: phase 2 (the broker) built, 2026-11-26. The hook (phase 3) is next.

## The problem

Many agent sessions, on several machines, call the same APIs as the same account. Each service gives that account one budget. GitHub gives a user 5,000 REST calls an hour and 5,000 GraphQL points an hour, shared by every token and every app the user signs in with. Today no session knows what the others are spending. One polling loop can drain the budget, and then `gh` fails for every session on every machine until the window resets. No one can tell afterwards which session spent it.

## The goal

One broker that every session checks before it spends, for any rate-limited API:

- **A shared ledger** per service and account: what's left, when it resets, and who spent what.
- **A floor** kept for the human: agents are refused before the budget hits it.
- **Governance:** the owner's own limits on top of the service's: calls per second, minute, hour or day, for the whole fleet, one machine or one session; how many calls may run at once; how much of a window one session may take; and how often one command may repeat. Each limit can deny, delay or only warn.
- **Generic:** GitHub first. Each further service is a config entry that names a header scheme and a probe, not new code.
- **Fails open:** if the broker can't be reached, work goes on as it does today.

Not goals: proxying writes, holding any credential beyond an optional read-only probe token (until phase 5), or limiting a human's own calls.

## How it fits together

```
 agent session ──(Bash: gh …)──► PreToolUse hook ──► /v1/check ──► quota Worker ──► Durable Object
       │                          (fails open)                      (somamcp)        one per service:account
       └──(MCP tools)──────────────────────────────► /mcp ─────────┘
```

- **The broker** is a Cloudflare Worker built on somamcp (WinterTC entry only, as `servers/temporal` does), with a SQLite-backed Durable Object per ledger key `service:account`. A Durable Object runs one request's code at a time, and a check runs without awaiting anything, so every check sees every spend before it. SQLite-backed Durable Objects are on the Workers Free plan (Cloudflare's pricing page: "Workers Free plan: Only Durable Objects with SQLite storage backend are available"), with 5 GB of storage for the account; a ledger needs kilobytes.
- **Two doors on one Worker:** `/mcp` for the MCP tools, and a small JSON API (`/v1/check`, `/v1/report`) for the hook, which runs on every Bash call and must answer fast.
- **Auth:** one bearer key, `QUOTA_KEY`, set with `wrangler secret put` and kept on each machine in envpkt beside `QUOTA_URL`. Without the secret set, the Worker refuses every request rather than run open.
- **The hook** is a Claude Code `PreToolUse` hook on `Bash`, shipped in the owner's dotfiles so every machine gets it.

## Services are config

A service entry:

```jsonc
{
  "id": "github",
  "label": "GitHub (user)",
  // Budgets within the service, and how long each one's window is.
  "resources": [
    { "id": "core", "windowSeconds": 3600 },
    { "id": "graphql", "windowSeconds": 3600 },
  ],
  "headers": "github", // which parser reads its rate-limit headers in quota_report
  "probe": {
    "command": "gh api rate_limit", // what a client runs, for free, when asked
    "parse": "github-rate-limit-json",
    // The broker's own probe, used when the Worker holds the named secret.
    "http": { "url": "https://api.github.com/rate_limit", "tokenSecret": "GITHUB_PROBE_TOKEN" },
  },
  "free": ["gh api rate_limit", "gh auth status"], // never limited, never recorded
  "staleAfterSeconds": 60, // older than this, the ledger looks for a fresh reading
  "policies": [/* see Governance */],
}
```

`src/config.ts` holds the schema, and `src/defaults.ts` this service with its default policies.

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

## Where the numbers come from

- **The owner's own limits are exact.** Rates, calls in flight, shares and repeats are counted from the checks themselves; no service is asked.
- **The service's budget comes from the service,** because tallies alone drift: CI, the owner's own `gh` use and other apps spend the same budget without passing the hook, and one `gh` command can make several calls.
  - **The broker's own probe,** when the Worker holds the secret `probe.http.tokenSecret` names. For GitHub that's `GET /rate_limit`, which is free, and a fine-grained token with no repository access sees the same budget as every other token of the user. The broker reads it at most once per `staleAfterSeconds`, only when its reading is stale, and after answering the check that found it stale, so a check never waits on it. The reading is dated when the probe started, so calls allowed while it was in flight still count, and the fetch doesn't follow redirects, so the token goes nowhere else.
  - **Clients,** otherwise. When the ledger is stale, a check answers with `probe`, a command to run and report; the broker asks one client at a time, at most every 30 seconds. Clients can also report any response's `x-ratelimit-*` headers.
  - **Between readings,** each allowed call comes off the last reading.

## Trust

The broker governs agents that cooperate: an agent can skip the hook (`QUOTA_HOOK=off`, or calls outside Bash), and the hook fails open. Within that, nothing a client sends can loosen a limit:

- **No tool changes a policy.** Policies come only from the deploy config.
- **A client's reading can only lower what's left of a live window,** keeping that window's limit and reset. It can start a new window only once the last one has reset, at no more than the last limit. The broker's own readings are taken as they are. Readings that can't be true (remaining over the limit, a reset more than a window off) are refused from anyone. So a refused agent can't report a full budget, a later reset or a bigger limit to pass the floor or its share.
- **Only leases can be changed after the fact, and only lowered.** `quota_release` and a call drawing from a lease can reduce a lease; nothing can change the record of a call.

## The ledger

Per Durable Object (`service:account`):

- **`observations`:** for each resource, the last reading: `limit`, `remaining`, `reset_at`, `observed_at`, and its source (`broker`, `probe`, `header`).
- **`spends`:** one row per allowed call, and one per lease: `session`, `machine`, `label` (the command's first words, such as `gh pr create`, never its arguments), `class`, `resource`, `cost`, `at`, and `reserve` for a lease. Kept 7 days. A held call's row is dated when it may run.
- **`inflight`:** calls started and not yet finished, by the client's `callId`, each with a 10-minute TTL in case its finish never arrives.
- **`meta`:** when a client and the broker last probed, and, in the `__accounts` instance, every ledger key seen.

## Leases

`quota_acquire` reserves budget for a batch, such as a script that will make 200 calls. A lease is checked against the budget, the `floor` and `share` policies, and not against per-call limits, since a 200-call lease would never fit a 2-a-second rate. Its calls meet those limits one at a time as they run. A call on the same budget that passes its lease to `/v1/check` draws from it: the lease drops by the call's cost, so the budget counts the call once. An outstanding lease comes off the estimate whatever its date, because no reading includes calls the service hasn't seen; it lapses after an hour, so a forgotten one doesn't hold budget for the 7 days rows are kept. `quota_release` lowers a lease to what it used.

## Deciding a check

`check(service, account, resource, session, machine, label, class, cost, callId, lease)` answers `allow`, `allow` after a delay, `deny` with a reason and a `retryAt`, or any of those with `probe: true`. In order:

1. **Free calls pass:** the probe itself, and a short allowlist per service (`gh auth status`, `gh api rate_limit`).
2. **Every matching policy,** each answering allow, delay, warn or deny. The `floor` refuses a call that would take the estimate under it, with `retryAt` at the resource's reset. The strictest answer wins: deny, then the longest delay, then warn.
3. **Allow:** record the spend, dated when the call may run, and the call in flight; draw it from its lease, if any.

A deny names the policy that refused, and for a loop suggests a longer interval or waiting with ScheduleWakeup.

A deny reaches the agent as the hook's `permissionDecisionReason`, so it reads, for example: "GitHub core has 940 calls left, under the 1,000 kept for the owner. It resets at 16:25 UTC (in 11 minutes). Wait until then."

## The hook

`quota-check.mjs`, registered under `PreToolUse` with matcher `Bash`, and again under `PostToolUse` to mark the call finished for `concurrency` policies. Claude Code sends it `session_id`, `cwd` and `tool_input.command` on stdin, and it blocks a call by printing `hookSpecificOutput` with `permissionDecision: "deny"` and a reason.

- **Finds `gh` calls** in the command, including after `&&`, `|`, `;` and `$(`. A command with none exits at once, so the hook costs nothing for other Bash calls.
- **Classes each call:** `write` for `gh pr create`, `gh issue create`, `gh issue comment`, `gh release create` and any `gh api` with `-X POST`, `PATCH`, `PUT` or `DELETE`; otherwise `read`.
- **Picks the resource:** `gh api graphql` and the `gh pr`, `gh issue` and `gh repo` families count against `graphql`; other `gh api` paths and `gh run` against `core`; anything unknown against whichever has less left.
- **Prices known loops:** `gh run watch` without an `--interval` of 30 or more is denied outright, since its 3-second default polls about 1,200 times an hour. A command it can't price costs 1.
- **Waits when told to:** a `delay` answer holds the call for at most `maxDelayMs`, then lets it run. The hook's own timeout in the settings is set above that.
- **Draws from a lease** when the session holds one, passing it as `lease`.
- **Fails open:** 800 ms timeout on the check itself, and any error lets the call through. It tells the user once per session that the broker was unreachable. The broker's own probe runs after the check answers, so it never adds to that time.
- **Probes when asked,** in the background, so the agent's call isn't held up.
- **Off switch:** `QUOTA_HOOK=off`.

## MCP tools

| Tool             | Does                                                                                           | Writes? |
| ---------------- | ---------------------------------------------------------------------------------------------- | ------- |
| `quota_status`   | What's left per service and resource, when it resets, the floor, and the top sessions by spend | no      |
| `quota_acquire`  | Reserves budget for a batch; returns a lease, or why not and when                              | yes     |
| `quota_release`  | Lowers a lease to what it used                                                                 | yes     |
| `quota_report`   | Records what a response's headers or a probe said                                              | yes     |
| `quota_services` | Lists the configured services and their resources                                              | no      |
| `quota_policies` | Lists every policy, its mode, and how close each scope is to it now                            | no      |

## Phases

1. **This spec,** reviewed.
2. **The broker (built):** Worker, Durable Object, the `github` parser and probe, `/v1/check`, `/v1/report`, the tools. Tests run the Durable Object in workerd through Miniflare, as openFDA's worker tests do.
3. **The hook,** in the dotfiles, first in a warn-only mode for a few days (it says what it would deny, and denies nothing), then enforcing.
4. **More services,** one parser at a time, each checked against that service's docs.
5. **A GitHub read proxy** with an ETag cache, so repeated reads such as CI polling come back 304. This needs a read-only token in the Worker. Whether GitHub counts a 304 against the limit isn't stated on its rate-limit pages; confirm before relying on it.

## Deploying

The package publishes from this monorepo like the others. Following temporal, the Worker itself would deploy from `sapientsai/somamcp-hosted` through Cloudflare Workers Builds, installing the package from npm, so this repo never holds a Cloudflare token. The owner's steps: connect the Worker in Cloudflare, set `QUOTA_KEY`, and put `QUOTA_URL` and `QUOTA_KEY` in envpkt.

## What it costs to run

Cloudflare's Workers Free plan (read 2026-11-26) allows 100,000 Durable Object requests, 5 million rows read and 100,000 rows written a day, and fails further operations of a type past its limit. The hook fails open, so past a limit governance silently stops.

Per `gh` call: about 2 Durable Object requests (the check, and the finish when it sends a `callId`) and about 6 rows written. Rows read is the binding limit, because each check scans every window its policies count: with the defaults, about twice the last hour's calls (`writes-hour` and `session-share`), plus a few hundred for the short windows. A day-long window would add the whole day's calls to every check, which is why the defaults have none.

| Day                              | Requests | Rows written | Rows read   |
| -------------------------------- | -------- | ------------ | ----------- |
| 10,000 calls, 1,000 at peak hour | 20,000   | 60,000       | ~27 million |
| Free plan                        | 100,000  | 100,000      | 5 million   |

So the free plan fits only light use. Workers Paid includes 25 billion rows read and 50 million rows written a month, which covers this many times over. Running counters for the hour and day windows would cut rows read by about a hundred times; that's the first follow-up if the broker has to fit the free plan.

## Open questions

- **Default policies:** the example under Governance: a floor of 1,000; the fleet at 60 a minute and 5 a second; a session at 2 a second and 40% of a window; writes at 40 a minute and 300 an hour; 10 in flight; loops at 20 in 10 minutes.
- **First week:** every policy except the floor in `warn` mode, then `enforce`?
- **Names in the ledger:** sessions are recorded by `session_id` and machine hostname. That stays in the owner's own Worker, but it is still personal data; keep 7 days?
- **Other accounts:** each account is its own ledger key (`github:<login>`), so sessions signed in as different GitHub users never share or see each other's budget.
