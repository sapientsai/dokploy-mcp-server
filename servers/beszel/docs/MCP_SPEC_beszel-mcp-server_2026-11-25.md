# beszel-mcp-server spec

An MCP server that reads a [Beszel](https://beszel.dev) hub: the machines it monitors, their metrics over time, their containers and systemd services, disk health, and alerts. It lives in `servers/beszel` and follows the other servers here: somamcp 2.11, functype 2, zod 4, ts-builds 5.

## Scope

**Version 0.1 is read-only.** Every tool lists or reads records. Nothing pauses a system, changes an alert or touches a user.

**Later, behind a flag.** `BESZEL_ENABLE_WRITES=true` would add tools that pause and resume a system, and create, change and delete alerts and quiet hours. They wait until the read side has been used for a while.

**Out of scope:** adding or removing systems, managing users, and anything that needs a superuser.

## What Beszel exposes

The hub is a [PocketBase](https://pocketbase.io) app, so its data is PocketBase's records API: `GET /api/collections/<name>/records`, with `page`, `perPage` (up to 1,000), `sort`, `filter` and `fields`. Beszel's own docs warn that "the structure and content of data returned by the API may change in minor releases", so this server names the versions it was checked against: **Beszel 0.21.x** (read from the v0.21.2 source).

The collections it reads, and what a normal user may list (from `internal/hub/collections.go`):

| Collection | Holds | Who can list it |
| --- | --- | --- |
| `systems` | name, `status` (up, down, paused, pending), host, port, `info` (current summary) | the system's users |
| `system_details` | hostname, OS, kernel, CPU model, cores, threads, memory | the system's users |
| `system_stats` | `stats` JSON per interval; `type` is 1m, 10m, 20m, 120m or 480m | the system's users |
| `containers` | current state per container: name, image, status, health, cpu, memory, net | the system's users |
| `container_stats` | an array of per-container stats per interval | the system's users |
| `systemd_services` | name, state, sub-state, cpu, memory, and their peaks | the system's users |
| `smart_devices` | disk model, state, temperature, power-on hours, attributes | the system's users |
| `alerts` | the user's thresholds per system and whether each is triggered | the alert's owner |
| `alerts_history` | when an alert fired and when it resolved; kept 90 days | the alert's owner |

With `SHARE_ALL_SYSTEMS=true` on the hub, any signed-in user can read every system. A user with Beszel's `readonly` role can read all of the above and can't write anything else, so **the README recommends a `readonly` user for this server.**

### Field meanings the formatters rely on

- **`systems.info`:** `cpu` %, `mp` memory %, `dp` disk %, `u` uptime in seconds, `v` agent version, `la` load averages [1, 5, 15], `bb` bandwidth in bytes/s, `g` GPU %, `dt` dashboard temperature, `sv` [services, failed services], `pu` [package updates, security updates], `efs` extra filesystem % by name, `ct` connection type (1 SSH, 2 WebSocket).
- **`system_stats.stats`:** `cpu` %, `mp` memory %, `mem` [total, used, buff/cache, ZFS ARC] in bytes (older agents send `m`, `mu`, `mb` in GB instead), `swap` [total, used] in bytes, `d`, `du` disk in GB, `dp` disk %, `dio` [read, write] bytes/s, `b` [sent, received] bytes/s, `la` load averages, `t` temperatures by sensor, `efs` extra filesystems, `g` GPUs, `bat` battery.
- **`containers`:** `health` 0 none, 1 starting, 2 healthy, 3 unhealthy. `memory` is in MB, `net` in bytes/s, and `updated` is Unix milliseconds.
- **`systemd_services`:** `state` 0 active, 1 inactive, 2 failed, 3 activating, 4 deactivating, 5 reloading. `sub` 0 dead, 1 running, 2 exited, 3 failed, 4 unknown.
- **`alerts.name`:** Status, CPU, Memory, Disk, Temperature, Bandwidth, GPU, LoadAvg1, LoadAvg5, LoadAvg15, Battery, ContainerHealth, SystemdFailed, CPUIOWait, CPUSteal, NetworkMonitorLoss.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `BESZEL_URL` | yes | The hub's base URL, e.g. `https://beszel.example.com` |
| `BESZEL_EMAIL`, `BESZEL_PASSWORD` | one sign-in | A Beszel user, ideally with the `readonly` role |
| `BESZEL_TOKEN` | one sign-in | A PocketBase auth token, for hubs with `DISABLE_PASSWORD_AUTH=true` (OAuth only). A superuser can mint a long-lived one with PocketBase's impersonate endpoint. |
| `TRANSPORT_TYPE` | no | `stdio` (default) or `httpStream` |
| `PORT` | no | HTTP port with `httpStream` (default 3000) |

The server starts only when `BESZEL_URL` and one sign-in are set, and says which is missing otherwise.

## Sign-in

- **Password:** `POST /api/collections/users/auth-with-password` with `{ identity, password }` returns `{ token, record }`. The server signs in on the first call, not at start, so a hub that's down doesn't stop the server from starting.
- **Keeping the token:** the token lives in a `Ref`. A 401 on any call signs in once more and retries that call once. A second 401 is reported as a sign-in failure.
- **`BESZEL_TOKEN`:** used as is. A 401 is reported with a hint to mint a new one, since there's no password to sign in again with.
- **The token never reaches a tool's output or a log line.**

## Tools

Every tool is read-only and returns markdown text: a short summary line, then a table or list. Units are converted for reading (bytes to KB/MB/GB, seconds to days and hours). A tool that takes `system` accepts its name or its record id. A name that matches more than one system is an error that lists the matches.

| Tool | Answers | Reads |
| --- | --- | --- |
| `list_systems` | "What's up, what's down?" Status, CPU, memory, disk, load, uptime, agent version, failed services, pending updates. Filters: `status`, `name` (substring). | `systems` |
| `get_system` | Everything current about one machine: the summary above, plus OS, kernel, CPU model, cores, memory, extra filesystems and temperatures. | `systems`, `system_details` |
| `get_system_stats` | "How has it been doing?" Minimum, average, maximum and latest of CPU, memory, disk, disk I/O, network, load and temperatures over a `range` (`1h`, `12h`, `24h`, `7d`, `30d`). | `system_stats` |
| `list_containers` | Containers with status, health, CPU, memory and network. Filters: `system`, `health` (e.g. only unhealthy), `name`. | `containers` |
| `get_container_stats` | One container's CPU, memory and network over a `range`. | `container_stats` |
| `list_systemd_services` | Services on a system with state, CPU and memory. Filter: `failed_only`. | `systemd_services` |
| `list_smart_devices` | Disks with model, health state, temperature, power-on hours and power cycles. | `smart_devices` |
| `list_alerts` | The user's alert thresholds, and which are triggered now. Filters: `system`, `triggered_only`. | `alerts` |
| `get_alert_history` | When alerts fired and resolved. Filters: `system`, `since` (ISO date), `active_only`. | `alerts_history` |

### Ranges

`get_system_stats` and `get_container_stats` pick the interval Beszel keeps for the range, so a call reads at most a few hundred records:

| Range | Interval | Records, at most |
| --- | --- | --- |
| `1h` | 1m | 60 |
| `12h` | 10m | 72 |
| `24h` | 20m | 72 |
| `7d` | 120m | 84 |
| `30d` | 480m | 90 |

They filter on `created >= <now - range>` and sort by `created`.

### Filters are built, never interpolated

PocketBase filters are text. A value from a tool argument goes into a filter only through one helper that escapes `\` and `"` and wraps it in quotes. Tests cover a name with quotes, backslashes and `&&` in it.

## Errors

Errors follow the others here: a `UserError` with a category and suggestions, so somamcp doesn't report them as internal errors.

- **Unreachable hub:** names `BESZEL_URL` and the network error.
- **401 after a fresh sign-in:** names the sign-in variables in use.
- **403:** this user can't see that collection or system. Suggests the `readonly` role or `SHARE_ALL_SYSTEMS`.
- **400:** PocketBase's own message, which usually means a bad filter.
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

The first release waits for Jordan's ask. npm trusted publishing can be set up only once the package exists, so 0.1.0 publishes with the `NPM_TOKEN` fallback in `publish.yml`. Then the trusted publisher is pointed at `sapientsai/mcp-servers` and `publish.yml`.
