import { PinoTransport } from "@loglayer/transport-pino"
import dotenv from "dotenv"
import { Try } from "functype"
import { logLayerAdapter, toDirectLogger } from "functype-log"
import { LogLayer } from "loglayer"
import pino from "pino"
import { createLogLayerTelemetry, createServer } from "somamcp"

import { initializeDokployClient } from "./client/dokploy-client"
import {
  registerApplicationTools,
  registerAuditLogTools,
  registerBackupTools,
  registerComposeTools,
  registerDatabaseTools,
  registerDeploymentTools,
  registerDestinationTools,
  registerDnsProviderTools,
  registerDockerImageTools,
  registerDockerTools,
  registerDockerVolumeTools,
  registerDomainTools,
  registerEnvironmentTools,
  registerInfrastructureTools,
  registerMountsTools,
  registerNetworkTools,
  registerOverviewTools,
  registerPreviewDeploymentTools,
  registerProjectTools,
  registerRedirectsTools,
  registerRegistryTools,
  registerScheduleTools,
  registerServerTools,
  registerSettingsTools,
  registerSshKeyTools,
  registerVaultProviderTools,
  registerVolumeBackupTools,
} from "./tools"

// quiet: dotenv 17 prints a banner to stdout, which under the stdio transport is
// the JSON-RPC channel itself. Same invariant as the pino-to-stderr setup below.
dotenv.config({ quiet: true })

declare const __VERSION__: string
const VERSION = (typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.0.0-dev") as `${number}.${number}.${number}`

// Injected by tsdown from git at build time, so `info` identifies the artifact
// rather than the host it runs on. Each is left undeclared when git had nothing
// to report; somamcp then falls back to its SOMAMCP_BUILD_* env vars.
declare const __BUILD_COMMIT__: string
declare const __BUILD_BRANCH__: string
declare const __BUILD_DATE__: string

const BUILD = {
  branch: typeof __BUILD_BRANCH__ !== "undefined" ? __BUILD_BRANCH__ : undefined,
  commit: typeof __BUILD_COMMIT__ !== "undefined" ? __BUILD_COMMIT__ : undefined,
  date: typeof __BUILD_DATE__ !== "undefined" ? __BUILD_DATE__ : undefined,
}

function setupDokployClient() {
  const baseUrl = process.env.DOKPLOY_URL
  const apiKey = process.env.DOKPLOY_API_KEY

  if (!baseUrl) {
    console.error("[Error] DOKPLOY_URL environment variable is required")
    console.error("[Error] Set it to your Dokploy instance URL (e.g., https://dokploy.example.com)")
    process.exit(1)
  }

  if (!apiKey) {
    console.error("[Error] DOKPLOY_API_KEY environment variable is required")
    console.error("[Error] Generate an API key in Dokploy Settings > API Keys")
    process.exit(1)
  }

  initializeDokployClient(baseUrl, apiKey)
  console.error(`[Setup] Dokploy client initialized for ${baseUrl}`)
}

// Pino writes to stderr (fd 2) so stdio (used by MCP) stays clean for the JSON-RPC channel.
const pinoLogger = pino({ level: process.env.LOG_LEVEL ?? "info" }, pino.destination(2))
const logger = new LogLayer({ transport: new PinoTransport({ logger: pinoLogger }) })
const telemetry = createLogLayerTelemetry(toDirectLogger(logLayerAdapter(logger)))

const server = createServer({
  name: "dokploy-mcp-server",
  version: VERSION,
  build: BUILD,
  telemetry,
  instructions: `A comprehensive Dokploy MCP server for managing deployments, applications, databases, domains, and infrastructure.

Available capabilities:
- Projects: list, create, update, remove, duplicate
- Applications: create, deploy, redeploy, start, stop, delete, read logs, configure builds, manage environment variables, search
- Docker Compose: create, deploy, start, stop, read logs, manage services, search
- Databases: unified tools for postgres, mysql, mariadb, mongo, redis, libsql (create, deploy, start, stop, manage, search)
- Domains: create, configure, enable/disable, validate DNS, generate traefik.me domains
- Redirects: URL redirect rules on applications (Traefik regex → replacement, 301/302)
- Docker: list containers, start/stop/kill/restart/remove, inspect configuration, read/write files inside containers, daemon events, server health, disk usage and build cache
- Networks: create, inspect, recreate, resync, remove Docker networks; import ones already on the host
- Docker Volumes: list, size, inspect, remove volumes and read/write files inside them
- Docker Images: list images, inspect image config, remove images
- Overview: fleet-wide rollups of services, backups and domains across every project
- DNS Providers: Cloudflare, Route53, Porkbun, Infomaniak and OVH credentials plus DNS zone and record management
- Vault Providers: external secret managers (HashiCorp, Infisical, AWS Secrets Manager, AWS Parameter Store, Doppler, Azure, Scaleway, Phase); secret names only, never values
- Servers: add, configure, monitor remote servers; list the services deployed on each
- Deployments: list, queue, read logs, kill process, remove
- Backups: schedule, trigger manual backups, list backup files
- Volume Backups: schedule volume-level backups (rclone-based); complements DB-native backups
- Preview Deployments: PR/branch preview deploys off a parent application
- Schedules: cron jobs against applications, compose services, servers, or dokploy itself
- Audit Log: query the audit trail with filters (user/action/resource/date range)
- Environments: create, duplicate, manage project environments
- Infrastructure: ports, certificates, basic auth security
- Mounts: volumes, bind mounts, and file mounts attached to applications/databases/compose services
- SSH Keys: create, list, update, remove, generate SSH keys for server access and git-based deployments
- Registries: manage container registries for private image pulls
- Destinations: manage S3-compatible backup destinations
- Settings: health checks, version info, cleanup, reload services`,
})

registerProjectTools(server)
registerApplicationTools(server)
registerComposeTools(server)
registerDeploymentTools(server)
registerDockerTools(server)
registerDockerVolumeTools(server)
registerDockerImageTools(server)
registerNetworkTools(server)
registerOverviewTools(server)
registerDnsProviderTools(server)
registerVaultProviderTools(server)
registerDomainTools(server)
registerRedirectsTools(server)
registerServerTools(server)
registerSettingsTools(server)
registerDatabaseTools(server)
registerBackupTools(server)
registerVolumeBackupTools(server)
registerPreviewDeploymentTools(server)
registerScheduleTools(server)
registerAuditLogTools(server)
registerEnvironmentTools(server)
registerInfrastructureTools(server)
registerMountsTools(server)
registerSshKeyTools(server)
registerRegistryTools(server)
registerDestinationTools(server)

async function main() {
  // Bootstrap path: failures here are fatal (process.exit), so a Try wrapper
  // routes any startup error through a single fold instead of try/catch.
  const result = await Try.async(async () => {
    setupDokployClient()

    const useHttp = process.env.TRANSPORT_TYPE === "httpStream" || process.env.TRANSPORT_TYPE === "http"
    const port = parseInt(process.env.PORT ?? "3000")
    const host = process.env.HOST ?? "0.0.0.0"

    if (useHttp) {
      console.error(`[Setup] Starting HTTP server on ${host}:${port}`)
      await server.start({
        transportType: "httpStream",
        httpStream: {
          port,
          host,
          endpoint: "/mcp",
        },
      })
      console.error(`[Setup] HTTP server ready at http://${host}:${port}/mcp`)
    } else {
      console.error("[Setup] Starting in stdio mode")
      await server.start({
        transportType: "stdio",
      })
    }
  })

  result.fold(
    (error) => {
      console.error("[Error] Failed to start server:", error)
      process.exit(1)
    },
    () => undefined,
  )
}

process.on("SIGINT", () => {
  console.error("[Shutdown] Shutting down Dokploy MCP Server...")
  process.exit(0)
})

process.on("SIGTERM", () => {
  console.error("[Shutdown] Shutting down Dokploy MCP Server...")
  process.exit(0)
})

main().catch(console.error)
