# dokploy-mcp-server

[![npm version](https://img.shields.io/npm/v/dokploy-mcp-server)](https://www.npmjs.com/package/dokploy-mcp-server)

A comprehensive [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for [Dokploy](https://dokploy.com/) - the open-source, self-hosted PaaS. Deploy apps, manage containers, databases, domains, and servers through AI assistants like Claude.

## Why This Server?

The [official Dokploy MCP](https://github.com/Dokploy/mcp) covers only ~5 of 42 API categories. This server provides **12 tools** (one per category with action enums) covering the full DevOps lifecycle with minimal token usage.

### Feature Comparison

| Category       | Official MCP        | This Server                   |
| -------------- | ------------------- | ----------------------------- |
| Projects       | 6 tools             | 1 tool (6 actions)            |
| Applications   | 26 tools            | 1 tool (18 actions)           |
| Compose        | -                   | 1 tool (15 actions)           |
| Deployments    | -                   | 1 tool (2 actions)            |
| Docker         | -                   | 1 tool (4 actions)            |
| Domains        | 9 tools             | 1 tool (8 actions)            |
| Servers        | -                   | 1 tool (8 actions)            |
| Settings       | -                   | 1 tool (5 actions)            |
| Databases      | 26 tools (pg+mysql) | 1 tool (13 actions, all 5 DB) |
| Backups        | -                   | 1 tool (6 actions)            |
| Environments   | -                   | 1 tool (6 actions)            |
| Infrastructure | -                   | 1 tool (8 actions)            |
| **Total**      | **67 tools**        | **12 tools**                  |

Key advantages:

- **Minimal token usage** - 12 tools instead of 67+, dramatically reducing context consumption
- **Unified database tool** - One tool handles all 5 database types (postgres, mysql, mariadb, mongo, redis) via `dbType` + `action` params
- **Full API coverage** - Docker Compose, containers, servers, deployments, backups, certificates, ports, and basic auth
- **Action-based design** - Each tool has an `action` enum parameter; other params are optional based on action

## Installation

### Claude Desktop / Claude Code

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "dokploy": {
      "command": "npx",
      "args": ["-y", "dokploy-mcp-server"],
      "env": {
        "DOKPLOY_URL": "https://dokploy.example.com",
        "DOKPLOY_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "dokploy": {
      "command": "npx",
      "args": ["-y", "dokploy-mcp-server"],
      "env": {
        "DOKPLOY_URL": "https://dokploy.example.com",
        "DOKPLOY_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Docker

```bash
docker run -e DOKPLOY_URL=https://dokploy.example.com \
           -e DOKPLOY_API_KEY=your-api-key \
           -e TRANSPORT_TYPE=httpStream \
           -p 3000:3000 \
           dokploy-mcp-server
```

## Environment Variables

| Variable          | Required | Default   | Description                              |
| ----------------- | -------- | --------- | ---------------------------------------- |
| `DOKPLOY_URL`     | Yes      | -         | Your Dokploy instance URL                |
| `DOKPLOY_API_KEY` | Yes      | -         | API key from Dokploy Settings > API Keys |
| `TRANSPORT_TYPE`  | No       | `stdio`   | Transport mode: `stdio` or `httpStream`  |
| `PORT`            | No       | `3000`    | HTTP port (httpStream mode only)         |
| `HOST`            | No       | `0.0.0.0` | HTTP host (httpStream mode only)         |

## Tools (12)

Each tool uses an `action` enum to select the operation. Parameters are optional and used based on the chosen action.

### `dokploy_project` (6 actions)

Actions: `list | get | create | update | remove | duplicate`

Manage projects. `list` returns all projects. `get` requires `projectId`. `create` requires `name`. `update` requires `projectId` + fields. `remove` requires `projectId`. `duplicate` requires `sourceEnvironmentId` + `name`.

### `dokploy_application` (18 actions)

Actions: `create | get | update | move | deploy | start | stop | delete | markRunning | refreshToken | cleanQueues | killBuild | cancelDeployment | reload | saveEnvironment | saveBuildType | traefikConfig | readMonitoring`

Full application lifecycle. Most actions require `applicationId`. `create` requires `name` + `environmentId`. `deploy` supports `redeploy` flag. `readMonitoring` requires `appName`.

### `dokploy_compose` (15 actions)

Actions: `create | get | update | delete | deploy | start | stop | move | loadServices | loadMounts | getDefaultCommand | cancelDeployment | cleanQueues | killBuild | refreshToken`

Docker Compose management. Most actions require `composeId`. `create` requires `name` + `environmentId`. `loadMounts` requires `serviceName`. `cancelDeployment`/`cleanQueues`/`killBuild`/`refreshToken` require `composeId`.

### `dokploy_database` (13 actions)

Actions: `create | get | update | move | start | stop | deploy | rebuild | remove | reload | changeStatus | saveEnvironment | saveExternalPort`

Unified database management. All actions require `dbType` (postgres/mysql/mariadb/mongo/redis). Most also require `databaseId`.

### `dokploy_domain` (8 actions)

Actions: `create | list | get | update | delete | generate | canGenerateTraefikMe | validate`

Domain/DNS management. `create` requires `host` + `applicationId`|`composeId`. `validate` requires `domain`.

### `dokploy_environment` (6 actions)

Actions: `create | get | list | update | remove | duplicate`

Project environment management. `create` requires `projectId` + `name`. `list` requires `projectId`.

### `dokploy_server` (8 actions)

Actions: `list | get | create | update | remove | count | publicIp | getMetrics`

Server management. `create` requires `name` + `ipAddress` + `port` + `username` + `sshKeyId` + `serverType`. `getMetrics` requires `url` + `token`.

### `dokploy_backup` (6 actions)

Actions: `create | get | update | remove | listFiles | manualBackup`

Backup scheduling and triggers. `create` requires `schedule` + `prefix` + `destinationId` + `database` + `databaseType`. `manualBackup` requires `backupId` + `backupType`.

### `dokploy_deployment` (2 actions)

Actions: `list | killProcess`

Deployment tracking. `list` requires `applicationId`|`composeId`|`serverId`|`type`+`id`. `killProcess` requires `deploymentId`.

### `dokploy_docker` (4 actions)

Actions: `getContainers | restartContainer | getConfig | findContainers`

Container management. `findContainers` requires `appName` + `method` (match|label|stack|service).

### `dokploy_infrastructure` (8 actions)

Actions: `createPort | deletePort | createAuth | deleteAuth | listCerts | getCert | createCert | removeCert`

Ports, basic auth, and SSL certificates.

### `dokploy_settings` (5 actions)

Actions: `health | version | ip | clean | reload`

System settings. `clean` uses `cleanType` (all|images). `reload` uses `reloadTarget` (server|traefik).

## Usage Examples

### Deploy an application

```
"Deploy my web app" → dokploy_application { action: "deploy", applicationId: "app-123" }
```

### Start a PostgreSQL database

```
"Start the postgres database" → dokploy_database { action: "start", dbType: "postgres", databaseId: "db-456" }
```

### Check system health

```
"Is Dokploy healthy?" → dokploy_settings { action: "health" }
```

### List all containers

```
"What containers are running?" → dokploy_docker { action: "getContainers" }
```

## Development

```bash
pnpm install
pnpm dev          # Development mode with watch
pnpm validate     # Format + lint + test + build
pnpm inspect      # Open MCP Inspector
```

## License

MIT

---

**Sponsored by <a href="https://sapientsai.com/"><img src="https://sapientsai.com/images/logo.svg" alt="SapientsAI" width="20" style="vertical-align: middle;"> SapientsAI</a>** — Building agentic AI for businesses
