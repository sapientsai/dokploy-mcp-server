# dokploy-mcp-server

A comprehensive [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for [Dokploy](https://dokploy.com/) - the open-source, self-hosted PaaS. Deploy apps, manage containers, databases, domains, and servers through AI assistants like Claude.

## Why This Server?

The [official Dokploy MCP](https://github.com/Dokploy/mcp) covers only ~5 of 42 API categories. This server provides **107 tools** across 12 categories, covering the full DevOps lifecycle.

### Feature Comparison

| Category            |    Official MCP    |   This Server    |
| ------------------- | :----------------: | :--------------: |
| Projects            |         6          |        6         |
| Applications        |         26         |        20        |
| Compose             |         -          |        12        |
| Deployments         |         -          |        5         |
| Docker              |         -          |        7         |
| Domains             |         9          |        9         |
| Servers             |         -          |        8         |
| Settings            |         -          |        7         |
| Databases (unified) | 26 (pg+mysql only) | 13 (all 5 types) |
| Backups             |         -          |        6         |
| Environments        |         -          |        6         |
| Infrastructure      |         -          |        8         |
| **Total**           |       **67**       |     **~107**     |

Key advantages:

- **Unified database tools** - One set of 13 tools handles all 5 database types (postgres, mysql, mariadb, mongo, redis) via a `dbType` parameter
- **Docker Compose support** - Full lifecycle management for compose services
- **Docker management** - Container listing, restart, inspect
- **Server management** - Add, configure, and monitor remote servers
- **Deployment tracking** - List and manage deployments across resources
- **Backup management** - Schedule and trigger backups for all database types
- **Infrastructure** - Port mappings, certificates, basic auth

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

## Tools by Category

### Projects (6 tools)

- `dokploy_project_list` - List all projects
- `dokploy_project_get` - Get project details
- `dokploy_project_create` - Create a new project
- `dokploy_project_update` - Update project name/description
- `dokploy_project_remove` - Delete a project
- `dokploy_project_duplicate` - Duplicate a project environment

### Applications (20 tools)

- `dokploy_application_create` - Create a new application
- `dokploy_application_get` - Get application details
- `dokploy_application_deploy` - Trigger deployment
- `dokploy_application_redeploy` - Redeploy application
- `dokploy_application_start` - Start application
- `dokploy_application_stop` - Stop application
- `dokploy_application_delete` - Delete application
- `dokploy_application_update` - Update configuration
- `dokploy_application_saveEnvironment` - Set environment variables
- `dokploy_application_saveBuildType` - Configure build type
- `dokploy_application_readMonitoring` - Read metrics
- `dokploy_application_readTraefikConfig` - Read Traefik config
- `dokploy_application_updateTraefikConfig` - Update Traefik config
- `dokploy_application_reload` - Reload without redeploy
- `dokploy_application_markRunning` - Mark as running
- `dokploy_application_refreshToken` - Refresh webhook token
- `dokploy_application_cleanQueues` - Clean build queues
- `dokploy_application_killBuild` - Kill running build
- `dokploy_application_move` - Move to different environment
- `dokploy_application_cancelDeployment` - Cancel ongoing deployment

### Docker Compose (12 tools)

- `dokploy_compose_create` - Create compose service
- `dokploy_compose_get` - Get compose details
- `dokploy_compose_update` - Update configuration
- `dokploy_compose_delete` - Delete compose service
- `dokploy_compose_deploy` - Deploy compose service
- `dokploy_compose_redeploy` - Redeploy compose service
- `dokploy_compose_start` - Start compose service
- `dokploy_compose_stop` - Stop compose service
- `dokploy_compose_loadServices` - List services in compose file
- `dokploy_compose_loadMounts` - List mounts for a service
- `dokploy_compose_getDefaultCommand` - Get default command
- `dokploy_compose_move` - Move to different environment

### Databases - Unified (13 tools)

All database tools accept a `dbType` parameter: `postgres`, `mysql`, `mariadb`, `mongo`, or `redis`.

- `dokploy_database_create` - Create database service
- `dokploy_database_get` - Get database details
- `dokploy_database_deploy` - Deploy database
- `dokploy_database_start` - Start database
- `dokploy_database_stop` - Stop database
- `dokploy_database_remove` - Remove database
- `dokploy_database_reload` - Reload database
- `dokploy_database_update` - Update configuration
- `dokploy_database_rebuild` - Rebuild container
- `dokploy_database_move` - Move to different environment
- `dokploy_database_changeStatus` - Change status
- `dokploy_database_saveEnvironment` - Set environment variables
- `dokploy_database_saveExternalPort` - Set external port

### Deployments (5 tools)

- `dokploy_deployment_list` - List deployments for an app
- `dokploy_deployment_listByCompose` - List compose deployments
- `dokploy_deployment_listByServer` - List server deployments
- `dokploy_deployment_listByType` - List by resource type
- `dokploy_deployment_killProcess` - Kill deployment process

### Docker (7 tools)

- `dokploy_docker_getContainers` - List all containers
- `dokploy_docker_restartContainer` - Restart a container
- `dokploy_docker_getConfig` - Get container config
- `dokploy_docker_getByAppNameMatch` - Find containers by name
- `dokploy_docker_getByAppLabel` - Find containers by label
- `dokploy_docker_getStackContainers` - Get stack containers
- `dokploy_docker_getServiceContainers` - Get service containers

### Domains (9 tools)

- `dokploy_domain_create` - Create a domain
- `dokploy_domain_listByApplication` - List app domains
- `dokploy_domain_listByCompose` - List compose domains
- `dokploy_domain_get` - Get domain details
- `dokploy_domain_update` - Update domain
- `dokploy_domain_delete` - Delete domain
- `dokploy_domain_generateDomain` - Auto-generate domain
- `dokploy_domain_canGenerateTraefikMe` - Check traefik.me availability
- `dokploy_domain_validate` - Validate DNS configuration

### Servers (8 tools)

- `dokploy_server_list` - List all servers
- `dokploy_server_get` - Get server details
- `dokploy_server_create` - Add a remote server
- `dokploy_server_update` - Update server config
- `dokploy_server_remove` - Remove a server
- `dokploy_server_count` - Get server count
- `dokploy_server_publicIp` - Get public IP
- `dokploy_server_getMetrics` - Get server metrics

### Settings (7 tools)

- `dokploy_settings_health` - Health check
- `dokploy_settings_getDokployVersion` - Get version
- `dokploy_settings_getIp` - Get server IP
- `dokploy_settings_cleanAll` - Run all cleanup tasks
- `dokploy_settings_cleanUnusedImages` - Clean unused images
- `dokploy_settings_reloadServer` - Reload server
- `dokploy_settings_reloadTraefik` - Reload Traefik

### Backups (6 tools)

- `dokploy_backup_create` - Create backup schedule
- `dokploy_backup_get` - Get backup details
- `dokploy_backup_update` - Update backup config
- `dokploy_backup_remove` - Remove backup config
- `dokploy_backup_listFiles` - List backup files
- `dokploy_backup_manualBackup` - Trigger manual backup

### Environments (6 tools)

- `dokploy_environment_create` - Create environment
- `dokploy_environment_get` - Get environment details
- `dokploy_environment_listByProject` - List project environments
- `dokploy_environment_remove` - Remove environment
- `dokploy_environment_update` - Update environment
- `dokploy_environment_duplicate` - Duplicate environment

### Infrastructure (8 tools)

- `dokploy_port_create` - Create port mapping
- `dokploy_port_delete` - Delete port mapping
- `dokploy_security_create` - Create basic auth
- `dokploy_security_delete` - Remove basic auth
- `dokploy_certificate_list` - List certificates
- `dokploy_certificate_get` - Get certificate details
- `dokploy_certificate_create` - Upload certificate
- `dokploy_certificate_remove` - Remove certificate

## Usage Examples

### Deploy an application

```
"Deploy my web app" → dokploy_application_deploy { applicationId: "app-123" }
```

### Start a PostgreSQL database

```
"Start the postgres database" → dokploy_database_start { dbType: "postgres", databaseId: "db-456" }
```

### Check system health

```
"Is Dokploy healthy?" → dokploy_settings_health {}
```

### List all containers

```
"What containers are running?" → dokploy_docker_getContainers {}
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
