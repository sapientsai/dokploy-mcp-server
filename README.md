# dokploy-mcp-server

[![npm version](https://img.shields.io/npm/v/dokploy-mcp-server)](https://www.npmjs.com/package/dokploy-mcp-server)

A comprehensive [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for [Dokploy](https://dokploy.com/) - the open-source, self-hosted PaaS. Deploy apps, manage containers, databases, domains, and servers through AI assistants like Claude.

## Why This Server?

> **Tracks Dokploy v0.30.8.** Tools are built against the v0.30.8 OpenAPI spec (604 paths). The comparison below was measured on 2026-10-03.

The [official Dokploy MCP](https://github.com/Dokploy/mcp) generates one tool per API endpoint. Its latest release, `@dokploy/mcp@0.30.7`, exposes 604 tools, one for each of the 604 paths in Dokploy's v0.30.8 OpenAPI spec. Coverage is complete, and every one of those schemas loads into the model's context before you ask your first question.

This server hand-curates the same API into **27 tools** (one per category, each taking an `action` enum), covering the deploy-and-operate surface most self-hosters use daily.

### Context cost

|                                    | Official `@dokploy/mcp` | This server      |
| ---------------------------------- | ----------------------- | ---------------- |
| Tools exposed                      | 604                     | 28 (27 + `info`) |
| `tools/list` schema payload        | 319,143 bytes           | 51,974 bytes     |
| Approximate tokens loaded up front | **~80k**                | **~13k**         |
| Median tool schema                 | 387 bytes               | 1,257 bytes      |

Measured 2026-10-03 against `@dokploy/mcp@0.30.7` (the latest published) and this server's build tracking Dokploy v0.30.8. Each server was started over stdio, sent `tools/list`, and its serialized tool array counted in bytes (divided by 4 for a rough token estimate).

On a 200k-token context window, the official server spends about 40% of it before you ask anything; this server spends about 6.5%. The larger median schema here is deliberate: descriptions carry the workflow knowledge that prevents failed calls, such as which service id pairs with which `databaseType`.

### Feature Comparison

Tool counts for the official server are per category, taken from its live `tools/list` at `@dokploy/mcp@0.30.7`.

| Category            | Official MCP                  | This Server                   |
| ------------------- | ----------------------------- | ----------------------------- |
| Projects            | 11 tools                      | 1 tool (6 actions)            |
| Applications        | 32 tools                      | 1 tool (24 actions)           |
| Compose             | 31 tools                      | 1 tool (21 actions)           |
| Deployments         | 9 tools                       | 1 tool (5 actions)            |
| Docker              | 21 tools (incl. disk usage)   | 1 tool (17 actions)           |
| Docker Volumes      | 8 tools                       | 1 tool (8 actions)            |
| Docker Images       | 3 tools                       | 1 tool (3 actions)            |
| Networks            | 9 tools                       | 1 tool (9 actions)            |
| Overview            | 3 tools                       | 1 tool (3 actions)            |
| DNS Providers       | 11 tools                      | 1 tool (11 actions)           |
| Vault Providers     | 7 tools                       | 1 tool (7 actions)            |
| Domains             | 10 tools                      | 1 tool (9 actions)            |
| Redirects           | 4 tools                       | 1 tool (4 actions)            |
| Servers             | 19 tools                      | 1 tool (9 actions)            |
| Settings            | 52 tools                      | 1 tool (5 actions)            |
| Databases           | 94 tools (6 engines)          | 1 tool (17 actions, all 6 DB) |
| Backups             | 12 tools                      | 1 tool (6 actions)            |
| Volume Backups      | 6 tools                       | 1 tool (6 actions)            |
| Preview Deployments | 4 tools                       | 1 tool (4 actions)            |
| Schedules           | 6 tools                       | 1 tool (6 actions)            |
| Audit Log           | 1 tool                        | 1 tool (1 action)             |
| Environments        | 7 tools                       | 1 tool (6 actions)            |
| Infrastructure      | 13 tools (ports, certs, auth) | 1 tool (8 actions)            |
| Mounts              | 6 tools                       | 1 tool (6 actions)            |
| SSH Keys            | 7 tools                       | 1 tool (6 actions)            |
| Registries          | 7 tools                       | 1 tool (7 actions)            |
| Destinations        | 6 tools                       | 1 tool (6 actions)            |
| **Total**           | **399 tools**                 | **27 tools**                  |

Key advantages:

- **Minimal token usage** - 399 endpoints' worth of surface in 27 tools, for about a sixth of the context
- **Unified database tool** - One tool handles all 6 database types (postgres, mysql, mariadb, mongo, redis, libsql) via `dbType` + `action` params
- **Curated descriptions** - Each tool documents which parameters pair with which action, so calls succeed on the first try
- **Action-based design** - Each tool has an `action` enum parameter; other params are optional based on action

### When to use the official server instead

Of the official server's 604 tools, 399 fall inside the categories above; the remaining 205 have no equivalent here:

- **Notifications** (41 tools) - email, Slack, Discord, Telegram, Gotify webhooks
- **Users, organizations, roles, SSO** (67 tools) - user management, organizations, custom roles, SSO, SCIM, forwardAuth
- **Git providers** (32 tools) - GitHub, GitLab, Gitea, Bitbucket app configuration
- **AI providers** (14 tools) - Dokploy's own LLM integration for log analysis and compose generation
- **Cluster and Swarm** (8 tools), **patch** (12), **tags** (8), **rollback** (2), **admin** (1)
- **Dokploy Cloud commercial features** (20 tools) - Stripe billing, license keys, whitelabeling

If your workflow needs any of those, use the official server, or run both.

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

## Tools (27)

Each tool uses an `action` enum to select the operation. Parameters are optional and used based on the chosen action.

### `dokploy_project` (6 actions)

Actions: `list | get | create | update | remove | duplicate`

Manage projects. `list` and `get` return nested environments with their applications, composes, and databases (with names, IDs, and status), so you can discover service IDs without extra calls. `create` requires `name`. `update` requires `projectId` + fields. `remove` requires `projectId`. `duplicate` requires `sourceEnvironmentId` + `name`.

**Reading the status label.** Dokploy's status enum is `idle | running | done | error`, rendered as `[IDLE]`, `[RUNNING]`, `[DONE]`, `[ERROR]`. It describes the **deployment**, not live container state — `[DONE]` means the last deploy finished, and `[IDLE]` means nothing has run, neither of which implies a container is up right now. Check `dokploy_docker` `getContainers` for what is actually running.

### `dokploy_application` (24 actions)

Actions: `create | get | update | move | deploy | start | stop | delete | markRunning | refreshToken | cleanQueues | killBuild | cancelDeployment | reload | saveEnvironment | setEnvVars | getEnvKeys | getEnvValuesUnsafe | saveBuildType | traefikConfig | readMonitoring | readLogs | search | deployNginxQuickstart`

Full application lifecycle. Most actions require `applicationId`. `create` requires `name` + `environmentId`. `deploy` supports `redeploy` flag. `readMonitoring` requires `appName`. `search` finds applications by `q`/`name`/`appName`/`repository`/`owner`/`dockerImage`/`projectId`/`environmentId`, with `limit` (1–100, default 20) and `offset`; the reply flags a truncated page. `deployNginxQuickstart` takes `environmentId` (+ optional `serverId`) and creates and deploys a "Hello World" nginx demo app on a generated traefik.me domain — Dokploy's onboarding smoke test.

**Env handling.** `get` returns a masked env summary (count only) — never the values. Three actions cover the rest:

- `setEnvVars` — granular merge inside the server. Pass `set` (KEY=VALUE per line, upsert) and/or `unset` (array of KEY names). The read-modify-write happens server-side; the tool result is a masked confirmation listing only the changed key names. No untouched-key values ever enter the transcript.
- `getEnvKeys` — returns KEY names only, sorted. Safe to read.
- `getEnvValuesUnsafe` — **unsafe escape hatch** that returns the full `KEY=VALUE` blob. Use only when you genuinely need the values; the output is in the tool transcript and any retained agent logs.
- `saveEnvironment` — full-replace, kept for explicit blob-set workflows.

`sourceType`:

- `github` → `repository` + `owner` + `branch` (+ `githubId` for private)
- `git` → `customGitUrl` + `customGitBranch`
- `docker` → `dockerImage`

`buildType`: `dockerfile | heroku_buildpacks | paketo_buildpacks | nixpacks | static | railpack`.

The underlying API also supports `gitlab`/`bitbucket`/`gitea`/`drop` sources, but those need provider-specific fields not yet exposed by this tool.

### `dokploy_compose` (21 actions)

Actions: `create | get | update | delete | deploy | start | stop | move | loadServices | loadMounts | getDefaultCommand | cancelDeployment | cleanQueues | killBuild | refreshToken | saveEnvironment | setEnvVars | getEnvKeys | getEnvValuesUnsafe | readLogs | search`

Docker Compose management. Most actions require `composeId`. `create` requires `name` + `environmentId`. `deploy` takes optional `redeploy` and `freshVolumes` — **`freshVolumes` runs `docker compose down --volumes` first, deleting the service's volume data** (docker-compose type only). `loadMounts` requires `serviceName`. `cancelDeployment`/`cleanQueues`/`killBuild`/`refreshToken` require `composeId`. `search` takes the same query fields as `dokploy_application`.

**Env handling.** Same shape as `dokploy_application`: `get` returns a masked summary, `setEnvVars` merges, `getEnvKeys` lists key names, `getEnvValuesUnsafe` is the escape hatch, `saveEnvironment` full-replaces.

`sourceType`:

- `github` → `repository` + `owner` + `branch` (+ `composePath`)
- `git` → `customGitUrl` + `customGitBranch` (+ `customGitSSHKeyId` for private)
- `raw` → `composeFile` (inline YAML)

The underlying API also supports `gitlab`/`bitbucket`/`gitea` sources, but those need provider-specific fields not yet exposed by this tool.

### `dokploy_database` (17 actions)

Actions: `create | get | update | move | start | stop | deploy | rebuild | remove | reload | changeStatus | saveEnvironment | setEnvVars | getEnvKeys | getEnvValuesUnsafe | saveExternalPort | search`

Unified database management. All actions require `dbType` (`postgres | mysql | mariadb | mongo | redis | libsql`); most also require `databaseId`. `create` baseline: `dbType` + `name` + `environmentId` + `databasePassword`.

**Env handling.** Same shape as `dokploy_application`: `get` returns a masked summary, `setEnvVars` merges (works for every engine), `getEnvKeys` lists key names, `getEnvValuesUnsafe` is the escape hatch.

Per-engine extras:

- `postgres` / `mysql` / `mariadb` — also require `databaseName` + `databaseUser`. `mysql`/`mariadb` accept `databaseRootPassword`.
- `mongo` — requires `databaseUser` (no `databaseName`).
- `redis` — only `databasePassword`.
- `libsql` — requires `appName` + `dockerImage` + `sqldNode` (`primary | replica`); accepts `sqldPrimaryUrl` + `enableNamespaces`.

`changeStatus` uses `applicationStatus` (`idle | running | done | error`). `search` covers every engine except `libsql`, which has no search endpoint — locate libsql databases via `dokploy_project` or `dokploy_environment`.

### `dokploy_domain` (9 actions)

Actions: `create | list | get | update | delete | toggleEnable | generate | canGenerateTraefikMe | validate`

Domain/DNS management. `create` requires `host` + `applicationId`|`composeId` (and `serviceName` for compose domains). Enums: `certificateType` (`letsencrypt | none | custom`), `domainType` (`compose | application | preview`). `validate` requires `domain` and optionally takes `serverId` to check DNS against that server's IPs (Dokploy v0.30.8 replaced the old `serverIp` field).

`update` accepts `enabled` to set the domain's enable flag to a known value. `toggleEnable` flips that flag without reporting the result — the API returns an undescribed body — so prefer `update` when you need a deterministic end state.

### `dokploy_redirects` (4 actions)

Actions: `create | update | remove | get`

URL redirect rules on an application, expressed as Traefik regex/replacement pairs. `create` requires `regex` + `replacement` + `permanent` + `applicationId`. `update` requires `redirectId` + the rule fields. `remove`/`get` require `redirectId`. Changes take effect only after the application is redeployed.

### `dokploy_environment` (6 actions)

Actions: `create | get | list | update | remove | duplicate`

Project environment management. `create` requires `projectId` + `name`. `list` requires `projectId`.

### `dokploy_server` (9 actions)

Actions: `list | get | create | update | remove | count | publicIp | getMetrics | getServices`

Server management. `create` requires `name` + `ipAddress` + `port` + `username` + `sshKeyId` + `serverType` (`deploy | build`). `getMetrics` requires `url` + `token`. `getServices` requires `serverId` and lists the applications, compose services and databases deployed there — check it before removing a server.

### `dokploy_backup` (6 actions)

Actions: `create | get | update | remove | listFiles | manualBackup`

Backup scheduling and triggers. `create` requires `schedule` + `prefix` + `destinationId` + `database` + `databaseType`. Provide the **one** service id matching the engine:

- `databaseType: postgres` → `postgresId`
- `databaseType: mysql` → `mysqlId`
- `databaseType: mariadb` → `mariadbId`
- `databaseType: mongo` → `mongoId`
- `databaseType: libsql` → `libsqlId`
- `databaseType: web-server` → no service id (backs up the Dokploy server itself)
- Backing up a DB inside a compose stack → `composeId` + `serviceName` + the engine as `databaseType`

`create` and `update` also accept `includeEncryptionKey`, which stores the database encryption key alongside the backup.

`manualBackup` requires `backupId` + `backupType`:

- `postgres | mysql | mariadb | mongo | libsql` — individual DB backups
- `compose` — whole-stack backup
- `webServer` — Dokploy server backup

### `dokploy_volume_backup` (6 actions)

Actions: `create | update | remove | get | list | runManually`

Scheduled volume-level backups, taken with rclone. Distinct from `dokploy_backup`, which takes DB-native dumps.

`create` requires `name` + `volumeName` + `prefix` + `cronExpression` + `destinationId`, and accepts `serviceType` with the matching `*Id`, plus `appName`, `keepLatestCount`, `enabled`, and `turnOff` (stops the service for the backup window). `volumeName` must match `^[a-zA-Z0-9][a-zA-Z0-9_.-]*$` — it is validated before the request is sent. `update` takes `volumeBackupId` plus the same fields. `remove`/`get` take `volumeBackupId`. `list` requires `id` (the parent service id) + `volumeBackupType`. `runManually` triggers a backup immediately from `volumeBackupId`.

### `dokploy_deployment` (5 actions)

Actions: `list | queueList | killProcess | readLogs | remove`

Deployment tracking. `list` requires `applicationId`|`composeId`|`serverId`|`type`+`id`. `type` enum: `application | compose | server | schedule | previewDeployment | backup | volumeBackup` (database deployments are listed via the database resource itself, not this endpoint). `queueList` requires `applicationId`. `killProcess` requires `deploymentId`. `readLogs` reads a single deployment's log file. `remove` deletes a deployment record.

### `dokploy_preview_deployment` (4 actions)

Actions: `list | get | remove | redeploy`

Per-PR and per-branch preview deploys hanging off a parent application. `list` requires `applicationId`. `get`/`remove`/`redeploy` require `previewDeploymentId`; `redeploy` optionally takes `title` and `description` for the deploy record.

### `dokploy_schedule` (6 actions)

Actions: `create | update | remove | get | list | runManually`

Cron schedules that run commands against an application, a compose service, a server, or the Dokploy server itself. `create` requires `name` + `cronExpression` + `command`, plus `scheduleType` and its matching id; it also accepts `shellType` (`bash | sh`), `script` for multi-line commands, and `timezone`. `list` requires `id` (the parent id, or `dokploy-server`) + `scheduleType`. `runManually` fires a schedule immediately from `scheduleId`.

`scheduleType`: `application | compose | server | dokploy-server`.

### `dokploy_docker` (17 actions)

Actions: `getContainers | restartContainer | startContainer | stopContainer | killContainer | removeContainer | getConfig | findContainers | listContainerFiles | readContainerFile | writeContainerFile | deleteContainerFile | getEvents | getServerHealth | getDiskUsage | getBuildCache | pruneBuildCache`

Docker daemon management. Every action accepts an optional `serverId` to target a remote server.

**Containers.** The lifecycle actions (`restart`/`start`/`stop`/`kill`/`removeContainer`) and `getConfig` take `containerId`. `findContainers` requires `appName` + `method` (`match | label | stack | service`). For `method=match`, `appType` accepts `stack | docker-compose`. For `method=label`, `type` is **required** and accepts `standalone | swarm` (the API rejects without it).

**Container files.** `listContainerFiles`, `readContainerFile`, `writeContainerFile`, and `deleteContainerFile` take `containerId` + `path` (absolute, inside the container); `writeContainerFile` also takes `content`. `readContainerFile` truncates its output at 100,000 characters. `writeContainerFile` writes into the **running** container — the change is lost on redeploy unless the path lives on a mount.

**Observability.** `getEvents` takes `minutes` (1–1440, default 15). `getServerHealth` takes `sinceHours` (1–168).

**Disk.** `getDiskUsage` is `docker system df` — it covers containers, volumes, images, and build cache, so start here when hunting space. `getBuildCache` details the cache; `pruneBuildCache` clears it (the same effect as `dokploy_settings` `clean` with `cleanType=dockerBuilder`).

### `dokploy_docker_volume` (8 actions)

Actions: `getVolumes | getVolumesSize | getVolumeConfig | removeVolume | listVolumeFiles | readVolumeFile | writeVolumeFile | deleteVolumeFile`

Docker volume management and volume file access. Every action accepts an optional `serverId`. `getVolumeConfig` and `removeVolume` take `volumeName`; the file actions take `volumeName` + `path`, and `writeVolumeFile` also takes `content`. `readVolumeFile` truncates at 100,000 characters. `removeVolume` destroys the volume's data — take a `dokploy_volume_backup` first. Unlike a write into a running container, a volume write survives redeploys.

### `dokploy_docker_image` (3 actions)

Actions: `getImages | getImageConfig | removeImage`

Docker image inventory. `getImageConfig` takes `imageRef` (`nginx:latest` or an image ID). `removeImage` requires **all three** of `repository`, `tag`, and `id` — read them off `getImages` — plus optional `force`. Disk usage and build cache live in `dokploy_docker` (`getDiskUsage`, `getBuildCache`, `pruneBuildCache`).

### `dokploy_network` (9 actions)

Actions: `list | get | create | remove | recreate | resync | inspect | import | networksToSync`

Docker network management. `create` requires `name` and accepts `driver` (`bridge | overlay`), `internal`, `attachable`, `enableIPv4`, `enableIPv6`, `mtu` (68–65535), `ipam`, and `serverId`. `get`, `inspect`, `remove`, `recreate`, and `resync` take `networkId` — `recreate` drops and re-adds the network, so attached services are briefly disconnected; `resync` re-reads the network from Docker and refreshes Dokploy's stored record without touching the network. `networksToSync` lists networks that exist on the Docker host but are not yet tracked by Dokploy; `import` brings them in by `names`. Attach networks to workloads via `dokploy_application` `update` `networkIds`, or `dokploy_compose` `update` `serviceNetworks`.

### `dokploy_overview` (3 actions)

Actions: `services | backups | domains`

Read-only rollups spanning every project — no parameters. Use these to orient before drilling in: `services` lists every application, compose service, and database with its status; `backups` every configured backup and schedule; `domains` every domain and what it points at. Dokploy's OpenAPI spec does not describe these response bodies, so the tool renders them as JSON.

**Prefer this over `search` for inventory.** Dokploy's search index is narrower than the project tree — on a test instance holding 1 application and 14 compose services, `application.search` reported 0 matches and `compose.search` reported 5. The `search` actions on `dokploy_application`, `dokploy_compose`, and `dokploy_database` are for finding a service you already know exists; `dokploy_overview` and `dokploy_project` are for enumerating what is there.

### `dokploy_infrastructure` (8 actions)

Actions: `createPort | deletePort | createAuth | deleteAuth | listCerts | getCert | createCert | removeCert`

Ports, basic auth, and SSL certificates.

### `dokploy_mounts` (6 actions)

Actions: `create | update | remove | get | listByServiceId | allNamedByApplicationId`

Volumes, bind mounts, and file mounts attached to a service. `create` requires `type` + `mountPath` + `serviceId` + `serviceType`, then one field per type: `volumeName` for a volume, `hostPath` for a bind, `filePath` + `content` for a file. `update` takes `mountId` plus any field. `remove`/`get` take `mountId`. `listByServiceId` requires `serviceType` + `serviceId`. `allNamedByApplicationId` lists named volumes for an `applicationId`.

`serviceType`: `application | postgres | mysql | mariadb | mongo | redis | compose | libsql`.

Mount changes require a redeploy of the parent service to take effect.

### `dokploy_ssh_key` (6 actions)

Actions: `create | list | get | update | remove | generate`

SSH key management for git-based deployments. `create` requires `name` + `privateKey` + `publicKey` + `organizationId`. `get` requires `sshKeyId`. `update` requires `sshKeyId`, optional `name`, `description`, `lastUsedAt`. `remove` requires `sshKeyId`. `generate` uses `type` (rsa|ed25519).

### `dokploy_registry` (7 actions)

Actions: `list | get | create | update | remove | test | testById`

Container registries for pulling private images. `create` requires `registryName` + `username` + `password` + `registryUrl`; `registryType` defaults to `cloud`. `get`/`remove` require `registryId`, `update` takes `registryId` + fields. `test` checks credentials without persisting them; `testById` tests a saved registry by `registryId`, optionally against a `serverId`.

### `dokploy_destination` (6 actions)

Actions: `list | get | create | update | remove | test`

S3-compatible destinations that backups are written to. `create` requires `name` + `accessKey` + `bucket` + `region` + `endpoint` + `secretAccessKey`, and accepts `provider` and `additionalFlags` (passed to rclone). `get`/`remove` require `destinationId`, `update` takes `destinationId` + fields. `test` validates the same fields as `create` without saving.

### `dokploy_audit_log` (1 action)

Actions: `list`

Query the Dokploy audit trail. Every filter is optional: `userId`, `userEmail`, `resourceName`, `auditAction`, `resourceType`, `from`/`to` (ISO timestamps), `limit` (default 50, max 500), and `offset`.

`auditAction`: `create | update | delete | deploy | cancel | redeploy | login | logout`.

`resourceType`: `project | service | environment | deployment | user | customRole | domain | certificate | registry | server | sshKey | gitProvider | notification | settings | session`.

The wire-level query parameter is named `action`; this tool exposes it as `auditAction` so it does not collide with the `action` discriminator every tool uses.

### `dokploy_dns_provider` (11 actions)

Actions: `list | get | create | update | remove | testConnection | listZones | listRecords | createRecord | updateRecord | deleteRecord`

DNS provider credentials plus zone and record management. `config` is discriminated on `providerType`: `cloudflare` (`apiToken`), `route53` (`accessKeyId`, `secretAccessKey`), `porkbun` (`apiKey`, `secretApiKey`), `infomaniak` (`apiToken`), or `ovh` (`applicationKey`, `applicationSecret`, `consumerKey`, optional `endpoint`, default `ovh-eu`). `update` requires `dnsProviderId` + `name` + `config` — the API **replaces** the provider rather than patching it, so a rename means re-sending the credentials. `testConnection` takes either a saved `dnsProviderId` or a raw `config` to check credentials before saving.

Records: `listZones` (`dnsProviderId`), `listRecords` (`+ zoneId`), `createRecord`/`updateRecord` (`+ type`, `recordName`, `content`, optional `ttl` and `proxied`, plus `recordId` for update), `deleteRecord` (`+ recordId`). `type` accepts `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `NS`, `SRV`, `CAA`, or `PTR`. `proxied` only takes effect on Cloudflare. Note `recordName` is the DNS record name — it maps to the API's `name` field, kept distinct here from the provider's `name`.

Provider reads return id, name, and `providerType` only; stored credentials are never rendered into tool output.

### `dokploy_vault_provider` (7 actions)

Actions: `list | get | create | update | remove | testConnection | listSecretNames`

External secret-manager configuration. `config` is discriminated on `providerType` across eight backends: `hashicorp`, `infisical`, `aws` (Secrets Manager), `aws-parameter-store` (optional `parameterPath`, must start with `/`), `doppler`, `azure`, `scaleway`, `phase` (`token`, `appId`, `env`, optional `path` and `apiUrl`). `assignments` is `[{ projectId, environmentIds? }]` naming the Dokploy projects the vault serves.

Watch the overloaded field name: `infisical.projectId` and `scaleway.projectId` are that provider's own project ID, **not** the Dokploy `projectId` used in `assignments`.

`update` requires all four of `vaultProviderId`, `name`, `config`, and `assignments` — like the DNS provider, the API replaces rather than patches, so run `get` first to recover the current name and assignments.

`listSecretNames` (`vaultProviderId` + `projectId`, optional `environmentId`) returns secret **names only**. Dokploy exposes no API to read a secret's value, and provider credentials are never echoed back — the same rule the env tools follow.

### `dokploy_settings` (5 actions)

Actions: `health | version | ip | clean | reload`

System settings. `clean` uses `cleanType` — server-scoped: `all | images | volumes | stoppedContainers | dockerBuilder | dockerPrune` (honor `serverId`); global: `monitoring | deploymentQueue | sshPrivateKey`. `reload` uses `reloadTarget` (`server | traefik`); `serverId` is honored for `traefik`.

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
