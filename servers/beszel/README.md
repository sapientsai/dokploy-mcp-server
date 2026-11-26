# Beszel MCP Server

A Model Context Protocol (MCP) server for [Beszel](https://beszel.dev), the lightweight server monitor. It reads your hub: the machines it watches, their metrics over time, their containers and systemd services, disk health, and alerts.

It only reads. It can't pause a system, change an alert or touch a user.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

| Category       | Tool                    | What it answers                                                                                     |
| -------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| **Systems**    | `list_systems`          | What's up and what's down: status, CPU, memory, disk, load, uptime, failed services, updates        |
|                | `get_system`            | Everything current about one machine: OS, hardware, use, filesystems, temperatures                  |
|                | `get_system_stats`      | Min, average, max and latest of CPU, memory, disk, I/O, network, load and temperatures over a range |
| **Containers** | `list_containers`       | Docker and Podman containers with status, health, CPU, memory, network and available updates        |
|                | `get_container_stats`   | One container's CPU, memory and network over a range                                                |
| **Services**   | `list_systemd_services` | systemd services with state, CPU and memory, or only the failed ones                                |
| **Disks**      | `list_smart_devices`    | S.M.A.R.T. health: model, status, temperature, power-on hours and power cycles                      |
| **Alerts**     | `list_alerts`           | Your alert rules, their thresholds, and which are triggered now                                     |
|                | `get_alert_history`     | When alerts fired and resolved (Beszel keeps each user's newest 200–250)                            |
| **Server**     | `info`                  | Server name, version, build, and capability counts (built into SomaMCP)                             |

Ranges are `1h`, `12h`, `24h`, `7d` and `30d`. Each reads the interval Beszel keeps for it, from 1-minute points for an hour to 8-hour points for 30 days, so a call reads at most about a hundred records.

## Quick Start

### Option 1: NPX (no install)

Add it to your MCP config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "beszel": {
      "command": "npx",
      "args": ["beszel-mcp-server"],
      "env": {
        "BESZEL_URL": "https://beszel.example.com",
        "BESZEL_EMAIL": "readonly@example.com",
        "BESZEL_PASSWORD": "your_password_here"
      }
    }
  }
}
```

### Option 2: Claude Code

```bash
claude mcp add --transport stdio beszel \
  --env BESZEL_URL=https://beszel.example.com \
  --env BESZEL_EMAIL=readonly@example.com \
  --env BESZEL_PASSWORD=your_password_here \
  -- npx beszel-mcp-server
```

## Configuration

| Variable                          | Required    | Meaning                                                               |
| --------------------------------- | ----------- | --------------------------------------------------------------------- |
| `BESZEL_URL`                      | yes         | Your hub's base URL                                                   |
| `BESZEL_EMAIL`, `BESZEL_PASSWORD` | one sign-in | A Beszel user                                                         |
| `BESZEL_TOKEN`                    | one sign-in | A PocketBase auth token, instead of an email and password (see below) |
| `TRANSPORT_TYPE`                  | no          | `stdio` (default) or `httpStream`                                     |
| `PORT`                            | no          | HTTP port with `httpStream` (default 3000)                            |

### Which user to sign in as

**Use a user with Beszel's `readonly` role.** It can read everything these tools show, and can't change systems. Create the user and set its role in the hub's PocketBase admin panel (`/_/` on your hub), then share the systems you want with it. A hub started with `SHARE_ALL_SYSTEMS=true` shares every system with every user.

- **Alerts are per user.** `list_alerts` and `get_alert_history` show the alerts of the user this server signs in as.
- **Sign-ins are rate-limited.** Beszel allows 10 a minute, so the server signs in once and reuses the token until a minute before it expires.
- **MFA isn't supported.** For a user with multi-factor sign-in, or a hub started with `DISABLE_PASSWORD_AUTH=true` (OAuth only), set `BESZEL_TOKEN` instead. A superuser can mint a long-lived token for a user with PocketBase's impersonate endpoint ([PocketBase records API](https://pocketbase.io/docs/api-records/)). When it expires, mint another.

## Beszel versions

Checked against **Beszel 0.21.x**. Beszel's docs warn that the API's data "may change in minor releases", so a newer hub may show fields this server doesn't know yet. It reads what it recognizes and shows "–" for the rest.

## Units

- **Rates** (network, disk I/O) are per second.
- **Sizes** use 1024-based units, labelled KB, MB and GB, as Beszel shows them.
- **Times** are UTC, as PocketBase stores them.

## Development

```bash
pnpm install          # once, at the repo root
pnpm validate         # format + lint + typecheck + test + build
pnpm test             # tests only
pnpm inspect          # build, then open the MCP Inspector
pnpm smoke:live       # call every tool against a real hub (reads BESZEL_* from the environment)
```

A checked-in `.mcp.json`, both here and at the repo root, registers the local build as the `beszel` server. It runs `envpkt exec --skip-audit -- node …/dist/bin.js`, so it needs:

- [envpkt](https://www.npmjs.com/package/envpkt) installed, with your default envpkt config holding `BESZEL_URL` and either `BESZEL_EMAIL` plus `BESZEL_PASSWORD` or `BESZEL_TOKEN`, and the key to decrypt its secrets;
- a build first: `pnpm --filter beszel-mcp-server build`.

`envpkt exec` passes every entry in that config to the server, not just the Beszel ones.

This server lives in `servers/beszel` of [sapientsai/mcp-servers](https://github.com/sapientsai/mcp-servers).

## License

MIT
