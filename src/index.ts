import dotenv from "dotenv"
import { FastMCP } from "fastmcp"

import { initializeDokployClient } from "./client/dokploy-client"
import {
  registerApplicationTools,
  registerBackupTools,
  registerComposeTools,
  registerDatabaseTools,
  registerDeploymentTools,
  registerDockerTools,
  registerDomainTools,
  registerEnvironmentTools,
  registerInfrastructureTools,
  registerProjectTools,
  registerServerTools,
  registerSettingsTools,
} from "./tools"

dotenv.config()

declare const __VERSION__: string
const VERSION = (typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.0.0-dev") as `${number}.${number}.${number}`

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

const server = new FastMCP({
  name: "dokploy-mcp-server",
  version: VERSION,
  instructions: `A comprehensive Dokploy MCP server for managing deployments, applications, databases, domains, and infrastructure.

Available capabilities:
- Projects: list, create, update, remove, duplicate
- Applications: create, deploy, redeploy, start, stop, delete, configure builds, manage environment variables
- Docker Compose: create, deploy, start, stop, manage services
- Databases: unified tools for postgres, mysql, mariadb, mongo, redis (create, deploy, start, stop, manage)
- Domains: create, configure, validate DNS, generate traefik.me domains
- Docker: list containers, restart, inspect configuration
- Servers: add, configure, monitor remote servers
- Deployments: list, track, kill deployment processes
- Backups: schedule, trigger manual backups, list backup files
- Environments: create, duplicate, manage project environments
- Infrastructure: ports, certificates, basic auth security
- Settings: health checks, version info, cleanup, reload services`,
})

registerProjectTools(server)
registerApplicationTools(server)
registerComposeTools(server)
registerDeploymentTools(server)
registerDockerTools(server)
registerDomainTools(server)
registerServerTools(server)
registerSettingsTools(server)
registerDatabaseTools(server)
registerBackupTools(server)
registerEnvironmentTools(server)
registerInfrastructureTools(server)

async function main() {
  try {
    setupDokployClient()

    const useHttp = process.env.TRANSPORT_TYPE === "httpStream" || process.env.TRANSPORT_TYPE === "http"
    const port = parseInt(process.env.PORT || "3000")
    const host = process.env.HOST || "0.0.0.0"

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
  } catch (error) {
    console.error("[Error] Failed to start server:", error)
    process.exit(1)
  }
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
