# oura-ring-mcp-server

[![Node.js CI](https://github.com/jordanburke/oura-ring-mcp-server/actions/workflows/node.js.yml/badge.svg)](https://github.com/jordanburke/oura-ring-mcp-server/actions/workflows/node.js.yml)
[![npm version](https://img.shields.io/npm/v/oura-ring-mcp-server.svg)](https://www.npmjs.com/package/oura-ring-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A [Model Context Protocol](https://modelcontextprotocol.io) server for the
[Oura Ring API v2](https://cloud.ouraring.com/v2/docs). Point Claude (or any MCP client)
at your Oura data and ask about your sleep, readiness, activity, heart rate, workouts, and more.

Built with [`somamcp`](https://github.com/sapientsai/SomaMCP) (telemetry + introspection),
[`functype`](https://functype.org) (typed error handling), and `zod`.

## Design

Rather than one tool per endpoint, the server exposes a **single consolidated `oura_data` tool**
with a `collection` parameter. This keeps the tool schema small (low token cost) while covering
every Oura `usercollection` endpoint. The tool validates that the parameters you pass are legal
for the chosen collection and returns actionable messages when they are not.

## Requirements

- **Node.js 24+** (pinned in `.nvmrc`)
- An Oura **OAuth2 application** — register one at
  [cloud.ouraring.com/oauth/applications](https://cloud.ouraring.com/oauth/applications) to get a
  client ID and secret. Set the redirect URI to `http://localhost:8080/callback` and enable the
  read scopes you want. The default requests the full set —
  `email personal daily heartrate tag workout session spo2 ring_configuration stress heart_health` —
  so every collection works (`heart_health` in particular gates `vO2_max` and
  `daily_cardiovascular_age`).

  > Oura stopped issuing new **personal access tokens** in December 2025, so OAuth2 is the path for
  > new setups. A previously-issued PAT still works — see [Authentication](#authentication).

## Authentication

The server authenticates to Oura with an OAuth2 access token that it refreshes automatically. You
authorize once with the built-in `login` command:

```bash
# with OURA_CLIENT_ID and OURA_CLIENT_SECRET set in the environment
npx -y oura-ring-mcp-server login
```

This opens your browser for consent, captures the redirect on `http://localhost:8080/callback`, and
writes the tokens to `~/.config/oura-ring-mcp/tokens.json` (override with `OURA_TOKEN_STORE`). Oura
refresh tokens are single-use, so the server owns and rotates them in that store from then on — you
never put a refresh token in your environment. The MCP server reads the store on startup; re-run
`login` only if the refresh token is ever revoked.

**Legacy PAT:** if you still have a valid personal access token, set `OURA_API_KEY` instead and skip
the OAuth setup. When both are configured, OAuth takes precedence.

## Usage

### Claude Desktop / Claude Code

Add to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "oura": {
      "command": "npx",
      "args": ["-y", "oura-ring-mcp-server"],
      "env": {
        "OURA_CLIENT_ID": "your-oauth-client-id",
        "OURA_CLIENT_SECRET": "your-oauth-client-secret"
      }
    }
  }
}
```

That runs the server over stdio, which is what most MCP clients expect. Run `login` once first (see
[Authentication](#authentication)) so the token store exists.

### Configuration

| Env var                  | Required       | Default                               | Description                                                                 |
| ------------------------ | -------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `OURA_CLIENT_ID`         | for OAuth      | —                                     | Oura OAuth2 client ID.                                                      |
| `OURA_CLIENT_SECRET`     | for OAuth      | —                                     | Oura OAuth2 client secret.                                                  |
| `OURA_API_KEY`           | for legacy PAT | —                                     | Legacy personal access token (Bearer). Alternative to the OAuth pair.       |
| `OURA_REDIRECT_URI`      | no             | `http://localhost:8080/callback`      | Redirect URI for `login`; must match the Oura app registration.             |
| `OURA_SCOPES`            | no             | _full read set (see Requirements)_    | Space-separated scopes requested during `login`.                            |
| `OURA_TOKEN_STORE`       | no             | `~/.config/oura-ring-mcp/tokens.json` | Path to the OAuth token store.                                              |
| `OURA_SANDBOX`           | no             | `false`                               | Use Oura's `/sandbox/` demo data instead of your real data.                 |
| `TRANSPORT_TYPE`         | no             | `stdio`                               | `stdio` or `httpStream`.                                                    |
| `PORT`                   | no             | `3000`                                | Port for `httpStream` transport.                                            |
| `HOST`                   | no             | `0.0.0.0`                             | Host for `httpStream` transport.                                            |
| `OURA_TELEMETRY_FILE`    | no             | —                                     | Write NDJSON telemetry events to this file path (safe under any transport). |
| `OURA_TELEMETRY_CONSOLE` | no             | `true`                                | Console telemetry, `httpStream` only (never enabled under stdio).           |

### HTTP transport

For a long-running / networked deployment:

```bash
OURA_CLIENT_ID=... OURA_CLIENT_SECRET=... TRANSPORT_TYPE=httpStream PORT=3000 npx -y oura-ring-mcp-server
```

The MCP endpoint is served at `/mcp`; `somamcp` also exposes a public `GET /health` probe.

## The `oura_data` tool

| Parameter                         | Applies to                        | Notes                                       |
| --------------------------------- | --------------------------------- | ------------------------------------------- |
| `collection`                      | all                               | Which data collection to fetch (see below). |
| `start_date` / `end_date`         | daily collections                 | `YYYY-MM-DD`. Omitted → last 7 days.        |
| `start_datetime` / `end_datetime` | `heartrate`, `ring_battery_level` | ISO-8601. Omitted → last 24 hours.          |
| `latest`                          | `heartrate`, `ring_battery_level` | Return only the most recent sample.         |
| `document_id`                     | collections with a detail route   | Fetch a single record by id.                |
| `next_token`                      | list collections                  | Pagination cursor from a previous response. |
| `fields`                          | list collections                  | Comma-separated sparse fieldset.            |

### Collections

**Daily** (`start_date`/`end_date`): `daily_activity`, `daily_sleep`, `daily_readiness`,
`daily_spo2`, `daily_stress`, `daily_resilience`, `daily_cardiovascular_age`, `vO2_max`,
`sleep`, `sleep_time`, `session`, `workout`, `tag`, `enhanced_tag`, `rest_mode_period`

**Time-series** (`start_datetime`/`end_datetime`): `heartrate`, `ring_battery_level`

**List / singleton**: `ring_configuration`, `personal_info`

### Example prompts

- "What was my average readiness score last week?"
- "Show my sleep stages for the night of 2026-06-20."
- "Get my most recent heart rate reading."
- "How many workouts did I log this month and how long were they?"

## Development

```bash
pnpm install
pnpm validate   # format + lint + typecheck + test + build
pnpm run ci     # validate's checks without fixing, as CI runs them (type `run`: `pnpm ci` is a clean install)
pnpm dev        # watch build
pnpm inspect    # run against the MCP Inspector
```

Try it without a ring by setting `OURA_SANDBOX=true` to hit Oura's demo dataset.

## License

MIT

---

Maintained by [Jordan Burke](https://github.com/jordanburke) · **Affiliated with <a href="https://sapientsai.com/"><img src="https://sapientsai.com/images/logo.svg" alt="" width="20" style="vertical-align: middle;"> SapientsAI</a>**
