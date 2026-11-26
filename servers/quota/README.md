# quota-mcp-server

A shared API-quota broker for fleets of AI agents. Many agent sessions, on several machines, often call the same API as the same account, and the service gives that account one budget: GitHub gives a user 5,000 REST calls an hour, shared by every token and app they sign in with. One polling loop can drain it for everyone, and afterwards nobody can tell who spent it.

This broker keeps **one ledger per service and account**. Every session checks with it before it spends:

- **What's left:** from the service's own status endpoint and rate-limit headers, less every call since.
- **Your limits on top:** calls per second, minute, hour or day; calls in flight; one session's share of a window; how often one command may repeat. Each can refuse, hold the call until it fits, or only warn.
- **Who spent what:** every call is recorded by session and machine, with the command's first words but never its arguments.
- **A floor kept for you:** agents are refused before the budget hits it.

It runs on Cloudflare Workers, with a SQLite-backed Durable Object per ledger, which the Workers Free plan supports. GitHub comes configured; other services are config entries. The spec is [`docs/MCP_SPEC_quota-mcp-server_2026-11-26.md`](docs/MCP_SPEC_quota-mcp-server_2026-11-26.md).

## How a check is decided

1. **Free calls pass,** such as `gh api rate_limit`, which GitHub doesn't count.
2. **Every policy that matches runs.** The strictest answer wins: a refusal, then the longest hold. Warnings ride along.
3. **An allowed call is recorded** as a spend. A held call is recorded at the time it may run, so calls held behind it queue in order.

A refusal says which policy refused, why, and when to try again, in words an agent can act on:

> GitHub (user) core has 940 left, under the 1000 kept for the owner. It resets at 16:25 UTC (in 11 minutes). Wait until then.

## Where the numbers come from

- **Your own limits** are counted exactly, from the checks themselves.
- **The service's budget** comes from the service. When the Worker holds `GITHUB_PROBE_TOKEN`, the broker reads `GET /rate_limit` itself, at most once a minute, only when its reading is stale, and after answering, so no check waits on it. That call is free, and it sees spending the hook never does: CI, your own `gh` use, other apps. Give it a fine-grained token with no repository access; every token of yours sees the same budget.
- **Without that token,** the broker asks one client at a time to run `gh api rate_limit` and report, and clients can report any response's `x-ratelimit-*` headers. Between readings, it subtracts each call it allowed.

## Policies

Policies live in the Worker's config, so a change is a reviewed commit. Nothing a client sends can loosen a limit:

- **No tool changes a policy.**
- **A client's reading can only ever lower what's left,** in a live window or just after a reset, whose rollover already grants the full budget. It must name a reset still to come, and keeps the later reset and the smaller limit, so it can't bring a refill sooner or raise the limit. The broker's own readings are taken as they are. Readings that can't be true (remaining over the limit, a reset more than a window off) are refused from anyone.
- **Only a lease can be changed after the fact, and only lowered.** Nothing changes the record of a call.

The broker governs agents that cooperate: an agent can skip the hook, and the hook lets calls through when the broker can't be reached.

| Kind          | Limits                                                                | Scopes                  |
| ------------- | --------------------------------------------------------------------- | ----------------------- |
| `floor`       | keeps `keep` of each budget out of agents' reach                      | the account             |
| `rate`        | `max` cost per sliding window `per` (`1s`, `10m`, `1h`, `1d`, …)      | fleet, machine, session |
| `share`       | one scope's part of the service's own window, while another is active | machine, session        |
| `concurrency` | calls in flight                                                       | fleet, machine, session |
| `repeat`      | the same command within a window, to catch loops                      | machine, session        |

- **`match`** narrows a policy to a `resource` (`core`, `graphql`), a `class` (`read`, `write`) or a `label` prefix (`gh pr create`).
- **`action`:** `deny` (the default), `delay` (hold up to `maxDelayMs`, default 10 s, then refuse), or `warn`.
- **`mode`:** `enforce` (the default), `warn` (say what it would have done, do nothing) or `off`.

The defaults for GitHub sit well under GitHub's own secondary limits, which allow "No more than 100 concurrent requests" and "no more than 80 content-generating requests per minute and no more than 500 content-generating requests per hour". Everything but the floor starts in `warn` mode, so a first week shows what they would have stopped.

| Policy           | Default                                                  |
| ---------------- | -------------------------------------------------------- |
| `floor`          | keep 1,000 of each budget                                |
| `fleet-minute`   | 60 calls a minute across the fleet, held past that       |
| `fleet-second`   | 5 a second across the fleet, held past that              |
| `session-second` | 2 a second per session, held past that                   |
| `session-share`  | 40% of a window per session, while another is working    |
| `writes-minute`  | 40 writes a minute                                       |
| `writes-hour`    | 300 writes an hour                                       |
| `in-flight`      | 10 calls at once across the fleet, held past that        |
| `loop`           | the same command 20 times in 10 minutes from one session |

## Leases

Before a batch, such as a script that will make 200 calls, `quota_acquire` reserves budget and returns a lease. A lease is checked against the budget (`floor`, `share`), not the per-call limits, which its calls meet one at a time. Pass the lease to `/v1/check` with each call on the same budget, and the call draws from it, so the budget counts it once. A lease counts against the budget until it's used, released or an hour old, even across fresh readings, since the service can't have seen its calls yet. `quota_release` lowers a lease to what it used.

## Tools

| Tool             | Does                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `quota_status`   | What's left of each budget, when it resets and how fresh that is, calls in flight, top sessions |
| `quota_policies` | Each policy, its mode, and how close the busiest scope is to it now                             |
| `quota_services` | The configured services and how each learns what's left                                         |
| `quota_acquire`  | Reserves budget for a batch of calls; returns a lease, or why not and when                      |
| `quota_release`  | Gives back what a lease didn't use                                                              |
| `quota_report`   | Records a response's rate-limit headers, or a status endpoint's body                            |

## The hook

The package ships `quota-hook`, a Claude Code hook that checks every `gh` call in a Bash command with the broker before it runs. Register it for `PreToolUse` and `PostToolUse` on `Bash`:

```jsonc
{
  "hooks": {
    "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "quota-hook", "timeout": 20 }] }],
    "PostToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "quota-hook", "timeout": 5 }] }],
  },
}
```

- **It finds every `gh` call** in the command: after `&&`, `|` and `;`; inside `$(…)`, backticks, `bash -c '…'` (and `-lc`), `eval "…"` and a quoted `watch '…'`; in `if`, `while` and `until` conditions; and past assignments and wrappers (`sudo -u`, `timeout -k 5 30`, `env`, `xargs`, `watch`). Heredoc bodies and comments are data, not commands. A command with no `gh` costs only Node's start, about 80 ms.
- **It labels each call** from known words only: a known subcommand (`gh pr view`), a known HTTP method (`gh api PATCH`), or else just the family (`gh browse`) or `gh`. No argument ever reaches a label. It classes each call as a read or a write, and names the budget: GraphQL for `gh pr`, `gh issue` and `gh repo`, REST for `gh run`, `gh release` and `gh api`.
- **It refuses fast polling itself,** broker or no broker: `gh run watch` or `gh pr checks --watch` under a 30 s interval, `watch` around `gh` under 30 s, and a `while` or `until` loop with `gh` in it that sleeps less than 30 s. A `for` loop over a list and a `while read` over input are bounded, so they're allowed, but their rounds aren't checked one by one: `for i in $(seq 1 500)` runs 500 calls the broker sees as one.
- **It waits when told to,** up to 10 s for a whole command, asking again no sooner than every 250 ms, and starts a background `gh api rate_limit` when the broker asks for a reading. When it refuses a command, it frees the calls the broker had already booked.
- **It fails open.** If the broker doesn't answer within 800 ms, the call runs, the rest of the command isn't checked, and the session is told once.
- **Modes:** `QUOTA_HOOK=warn`, the default, tells the agent what the broker would refuse and refuses nothing; `enforce` refuses; `off` does nothing.
- **Where it finds the broker:** `QUOTA_URL` and `QUOTA_KEY` in the environment, or else from envpkt, once (`envpkt exec` takes most of a second), cached in `~/.cache/quota-hook/broker.json`, readable only by you. With no broker configured, it checks envpkt again every 10 minutes. The GitHub account comes from gh's own `hosts.yml`.
- **What it can't see:** `gh` run by a script, an alias or a tool other than Bash, and a loop's later rounds. The broker's own probe still counts that spending.

## The hook's API

Every request sends `Authorization: Bearer <QUOTA_KEY>`. Bodies are JSON.

| Route             | Body                                                                                                      | Answers                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /v1/check`  | `service`, `account`, `session`, `machine`, `label`, and optionally `resource`, `class`, `cost`, `callId` | `decision` (`allow`, `wait`, `deny`), `waitMs` and `booked`, `retryAt`, `policy`, `reason`, `warnings`, `remaining`, `resetAt`, `probe`, `lease` |
| `POST /v1/finish` | `service`, `account`, `callId`                                                                            | `{ ok: true }`; frees a slot for `concurrency` policies                                                                                          |
| `POST /v1/report` | `service`, `account`, and `headers` or `body`                                                             | `{ kept }`                                                                                                                                       |
| `GET /v1/status`  | `?service=github&account=<login>`                                                                         | the ledger's estimates, calls in flight, top sessions and policy usage                                                                           |

- **`wait` with `booked: true`:** the slot is yours; run after `waitMs` without asking again.
- **`wait` with `booked: false`:** a concurrency slot; ask again after `waitMs`.
- **`probe`:** a command to run and send back with `/v1/report`, when the ledger is stale and no one else was asked.

## Deploying

The package exports the Worker and its Durable Object, so a deploy repo keeps its own config:

```ts
// worker.ts in the deploy repo
import { createQuotaWorker, QuotaLedger } from "quota-mcp-server/worker"
import config from "./quota.config.js"

export { QuotaLedger }
export default createQuotaWorker(config)
```

```jsonc
// wrangler.jsonc
{
  "main": "worker.ts",
  "compatibility_flags": ["no_nodejs_compat", "no_nodejs_compat_v2"],
  "durable_objects": { "bindings": [{ "name": "LEDGER", "class_name": "QuotaLedger" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["QuotaLedger"] }],
}
```

```bash
wrangler secret put QUOTA_KEY            # every client sends it; unset, the broker refuses everything
wrangler secret put GITHUB_PROBE_TOKEN   # optional: lets the broker read /rate_limit itself
```

Clients connect to `/mcp` with the same bearer key, for example `claude mcp add --transport http quota https://<your-worker>/mcp --header "Authorization: Bearer $QUOTA_KEY"`.

## What it costs to run

Each `gh` call costs about 2 Durable Object requests and 6 rows written, and each check reads the rows in every window its policies count. At 10,000 calls a day, that's about 27 million rows read with the default policies, against the Workers Free plan's 5 million; a day-long window would add the day's calls to every check. **Plan on Workers Paid**, which includes 25 billion rows read a month. Past a free limit, Cloudflare fails the operation, and the hook then lets calls through ungoverned. The spec has the breakdown.

## Development

```bash
pnpm install          # once, at the repo root
pnpm validate         # format + lint + typecheck + test + build
pnpm test             # unit tests, plus the Worker in workerd through Miniflare
pnpm cf:dev           # local workerd via wrangler, with the default config
```

This server lives in `servers/quota` of [sapientsai/mcp-servers](https://github.com/sapientsai/mcp-servers).

## License

MIT
