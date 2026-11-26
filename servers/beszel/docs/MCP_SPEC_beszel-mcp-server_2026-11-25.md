# beszel-mcp-server spec

An MCP server that reads a [Beszel](https://beszel.dev) hub: the machines it monitors, their metrics over time, their containers and systemd services, disk health, and alerts. It lives in `servers/beszel` and follows the other servers here: somamcp 2.11, functype 2, zod 4, ts-builds 5.

## Scope

**Version 0.1 is read-only.** Every tool lists or reads records. Nothing pauses a system, changes an alert or touches a user.

**Behind a flag.** `BESZEL_ENABLE_WRITES=true` adds `update_system` (name, host, port), `pause_system`, `resume_system` and `reset_system_fingerprint`. Each makes the update Beszel's web UI makes, or a narrower one: `update_system` sets `pending` only for a move and never on a paused system, and the reset sends only `fingerprint`, without re-sending `token`. Creating a system and rotating its token stay in the UI, because both hand out the agent's secret token; deleting a system can't be undone, so it stays there too. Changing alerts and quiet hours may come later.

**Out of scope:** adding or removing systems, managing users, and anything that needs a superuser.

## What Beszel exposes

The hub is a [PocketBase](https://pocketbase.io) app, so its data is PocketBase's records API: `GET /api/collections/<name>/records`, with `page`, `perPage` (up to 1,000), `sort`, `filter` and `fields`. Beszel's own docs warn that "the structure and content of data returned by the API may change in minor releases", so this server names the versions it was checked against: **Beszel 0.21.x** (read from the v0.21.2 source).

The collections it reads, and what a normal user may list (from `internal/hub/collections.go`):

| Collection         | Holds                                                                            | Who can list it    |
| ------------------ | -------------------------------------------------------------------------------- | ------------------ |
| `systems`          | name, `status` (up, down, paused, pending), host, port, `info` (current summary) | the system's users |
| `system_details`   | hostname, OS, kernel, CPU model, cores, threads, memory                          | the system's users |
| `system_stats`     | `stats` JSON per interval; `type` is 1m, 10m, 20m, 120m or 480m                  | the system's users |
| `containers`       | current state per container: name, image, status, health, cpu, memory, net       | the system's users |
| `container_stats`  | an array of per-container stats per interval                                     | the system's users |
| `systemd_services` | name, state, sub-state, cpu, memory, and their peaks                             | the system's users |
| `smart_devices`    | disk model, state, temperature, power-on hours, attributes                       | the system's users |
| `alerts`           | the user's thresholds per system and whether each is triggered                   | the alert's owner  |
| `alerts_history`   | when an alert fired and when it resolved; the newest 200 to 250 per user         | the alert's owner  |

With `SHARE_ALL_SYSTEMS=true` on the hub, any signed-in user can read every system. A user with Beszel's `readonly` role can read all of the above and can't write anything else, so **the README recommends a `readonly` user for this server.**

### Field meanings the formatters rely on

- **`systems.info`:** `cpu` %, `mp` memory %, `dp` disk %, `u` uptime in seconds, `v` agent version, `la` load averages [1, 5, 15], `bb` bandwidth in bytes/s, `g` GPU %, `dt` dashboard temperature, `sv` [services, failed services], `pu` [package updates, security updates], `efs` extra filesystem % by name, `ct` connection type (1 SSH, 2 WebSocket).
- **`system_stats.stats`:** `cpu` %, `mp` memory %, `mem` [total, used, buff/cache, ZFS ARC] in bytes (older agents send `m`, `mu`, `mb` in GB instead), `swap` [total, used] in bytes, `d`, `du` disk in GB, `dp` disk %, `dio` [read, write] bytes/s, `b` [sent, received] bytes/s, `la` load averages, `t` temperatures by sensor, `efs` extra filesystems, `g` GPUs, `bat` battery.
- **`containers`:** `health` 0 none, 1 starting, 2 healthy, 3 unhealthy. `memory` is in MB, `net` in bytes/s, and `updated` is Unix milliseconds.
- **Rates:** `b`, `bb`, `dio` and a container's `net` are bytes per second. The agent divides each counter's change by the time since the last read (`agent/network.go`, `agent/disk.go`, `agent/docker.go`).
- **`system_details`:** its record id is the system's id, so one system has one details record.
- **`systemd_services`:** `state` 0 active, 1 inactive, 2 failed, 3 activating, 4 deactivating, 5 reloading. `sub` 0 dead, 1 running, 2 exited, 3 failed, 4 unknown.
- **`alerts.name`:** Status, CPU, Memory, Disk, Temperature, Bandwidth, GPU, LoadAvg1, LoadAvg5, LoadAvg15, Battery, ContainerHealth, SystemdFailed, CPUIOWait, CPUSteal, NetworkMonitorLoss, and NetworkMonitorCert (added by a later migration).

## Configuration

| Variable                          | Required    | Meaning                                                                                                                                                         |
| --------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BESZEL_URL`                      | yes         | The hub's base URL, e.g. `https://beszel.example.com`                                                                                                           |
| `BESZEL_EMAIL`, `BESZEL_PASSWORD` | one sign-in | A Beszel user, ideally with the `readonly` role                                                                                                                 |
| `BESZEL_TOKEN`                    | one sign-in | A PocketBase auth token, for hubs with `DISABLE_PASSWORD_AUTH=true` (OAuth only). A superuser can mint a long-lived one with PocketBase's impersonate endpoint. |
| `TRANSPORT_TYPE`                  | no          | `stdio` (default) or `httpStream`                                                                                                                               |
| `PORT`                            | no          | HTTP port with `httpStream` (default 3000)                                                                                                                      |

The server starts only when `BESZEL_URL` and one sign-in are set, and says which is missing otherwise.

## Sign-in

What PocketBase 0.42.2 (the version Beszel 0.21.2 builds on) does, read from its source:

- **Password sign-in:** `POST /api/collections/users/auth-with-password` with `{ identity, password }` returns `{ token, record }`. A wrong email or password is a **400** ("Failed to authenticate."). A user with MFA on gets a **401** with `{ mfaId }`; this server can't finish MFA, so it says to use `BESZEL_TOKEN`.
- **Stale tokens are refused.** PocketBase answers a request carrying an unknown, invalid or expired token with **401** ("unknown authorization token"), rather than treating it as a guest. So a 401 on a records call means the token is no longer good.
- **Sign-ins are rate-limited.** Beszel 0.21 turns on PocketBase's limits with `*:auth` at 10 sign-ins a minute. So the server signs in once and reuses the token:
  - It signs in on the first call, not at start, so a hub that's down doesn't stop the server from starting.
  - It keeps the token in a `Ref`, reads its `exp`, and signs in again a minute before it lapses.
  - A 401 on a call signs in once more and retries that call once. A second 401 is reported as a sign-in failure.
  - A 429 is reported with a hint to wait, never retried in a loop.
- **`BESZEL_TOKEN`:** used as is. A 401 is reported with a hint to mint a new one, since there's no password to sign in again with.
- **The token and password never reach a tool's output or a log line.**

## Tools

Every tool is read-only and returns markdown text: a short summary line, then a table or list. Units are converted for reading (bytes to KB/MB/GB, seconds to days and hours). A tool that takes `system` accepts its name or its record id. A name that matches more than one system is an error that lists the matches.

| Tool                    | Answers                                                                                                                                                                        | Reads                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `list_systems`          | "What's up, what's down?" Status, CPU, memory, disk, load, uptime, agent version, failed services, pending updates. Filters: `status`, `name` (substring).                     | `systems`                   |
| `get_system`            | Everything current about one machine: the summary above, plus OS, kernel, CPU model, cores, memory, extra filesystems and temperatures.                                        | `systems`, `system_details` |
| `get_system_stats`      | "How has it been doing?" Minimum, average, maximum and latest of CPU, memory, disk, disk I/O, network, load and temperatures over a `range` (`1h`, `12h`, `24h`, `7d`, `30d`). | `system_stats`              |
| `list_containers`       | Containers with status, health, CPU, memory and network. Filters: `system`, `health` (e.g. only unhealthy), `name`.                                                            | `containers`                |
| `get_container_stats`   | One container's CPU, memory and network over a `range`.                                                                                                                        | `container_stats`           |
| `list_systemd_services` | Services on a system with state, CPU and memory. Filter: `failed_only`.                                                                                                        | `systemd_services`          |
| `list_smart_devices`    | Disks with model, health state, temperature, power-on hours and power cycles.                                                                                                  | `smart_devices`             |
| `list_alerts`           | The user's alert thresholds, and which are triggered now. Filters: `system`, `triggered_only`.                                                                                 | `alerts`                    |
| `get_alert_history`     | When alerts fired and resolved. Filters: `system`, `since` (ISO date), `active_only`.                                                                                          | `alerts_history`            |

### Ranges

`get_system_stats` and `get_container_stats` pick the interval Beszel keeps for the range, so a call reads at most a few hundred records:

| Range | Interval | Records, at most |
| ----- | -------- | ---------------- |
| `1h`  | 1m       | 60               |
| `12h` | 10m      | 72               |
| `24h` | 20m      | 72               |
| `7d`  | 120m     | 84               |
| `30d` | 480m     | 90               |

**Max uses Beszel's peaks.** A 10-minute or longer record averages the readings in it, and keeps the highest beside the average: `cpum` for CPU, `memm` for used memory, `bm` for network and `diom` for disk I/O (`internal/records/records.go`). Max takes those where they exist, so a short spike still shows. Other metrics, and containers, have no stored peak, and the output says their Max is the highest interval average.

**A missing rate is zero.** Beszel leaves a zero network or disk I/O rate out of the record (`omitzero`), so a record without one counts as an idle interval, not a missing one.

**Lists never come back partial.** Past 5,000 records a list fails and asks to narrow the request, rather than summarize part of the data. Sorts add `id` as a tiebreak, so paging can't skip or repeat a record.

They filter on `created >= <now - range>` and sort by `created`. PocketBase stores dates as text in the layout `2006-01-02 15:04:05.000Z` and compares them as text, so the start time is written in that layout. An ISO string with a `T` would compare wrongly within a day.

### Filters are built, never interpolated

PocketBase filters are text. A value from a tool argument goes into a filter only through one helper that escapes `\` and `"` and wraps it in quotes. Tests cover a name with quotes, backslashes and `&&` in it.

## Errors

Errors follow the others here: a `UserError` with a category and suggestions, so somamcp doesn't report them as internal errors.

- **Unreachable hub:** names `BESZEL_URL` and the network error.
- **401 after a fresh sign-in:** names the sign-in variables in use.
- **403:** PocketBase gives it on a list only when the collection has no list rule, so superusers alone can read it. That would mean a newer Beszel changed the collection's rules. A system that isn't shared with this user gives no error: its records just don't come back.
- **400:** PocketBase's own message, which usually means a bad filter.
- **429:** the hub's rate limit. Says to wait a minute.
- **Unknown system:** lists the names this user can see.

## Layout

```
servers/beszel/
  src/
    index.ts            createServer from somamcp/node, instructions, tool registration, start
    bin.ts              CLI entry: --version, --help, stdio by default
    config.ts           reads and checks the environment
    errors.ts           UserError helpers
    types.ts            readonly record types for each collection
    client/
      beszel-client.ts  sign-in, token Ref, records requests as functype IO, filter escaping
    tools/              one file per area: systems, stats, containers, services, disks, alerts
    utils/
      format.ts         units, tables, health and state names
      ranges.ts         range to interval and start time
      stats.ts          min, avg, max and latest over a series
  test/                 vitest, with fetch mocked; fixtures shaped from Beszel 0.21.2
  scripts/
    smoke-live.ts       calls each tool against a real hub; reads BESZEL_* from the environment; not run in CI
```

Package: `beszel-mcp-server`, starting at 0.1.0, `mcpName` `io.github.sapientsai/beszel-mcp-server`, with `server.json` and `glama.json`. No Dockerfile: nothing self-hosts it over HTTP yet, per the repo rule.

## Privacy

No real hub URL, hostname, IP or user appears in the repo. Tests, docs and examples use `beszel.example.com` and made-up system names. The live smoke script reads everything from the environment.

## Testing

- **Unit:** the client (sign-in, the 401 retry, `BESZEL_TOKEN`, error mapping, filter escaping), range selection, stats summaries, unit formatting, and each tool's output against fixtures.
- **Live, by hand:** `scripts/smoke-live.ts` against a real hub before the first release, with credentials from envpkt.

## Releasing

The first release waits for Jordan's ask. The other servers publish through npm trusted publishing, which is set per package. `publish.yml` falls back to an `NPM_TOKEN` secret, but none is visible to this repo today. So the first publish needs either that secret or a trusted publisher set up for the new package name; settle which when the release is asked for.
