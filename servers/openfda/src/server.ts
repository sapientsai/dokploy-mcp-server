/**
 * OpenFDA MCP Server
 * SomaMCP server implementation with FDA tools
 */

import { createServer, type SomaServerInstance } from "somamcp/node"

import { registerOpenFDATools } from "./register.js"
import { loggers } from "./utils/logger.js"
import { type Semver, VERSION } from "./version.js"

export type ServerOptions = {
  name?: string
  version?: Semver
}

/**
 * Create and configure the OpenFDA MCP server
 */
export function createOpenFDAServer(options: ServerOptions = {}): SomaServerInstance {
  const { name = "openfda-mcp-server", version = VERSION } = options

  loggers.core(`Creating OpenFDA MCP server: ${name} v${version}`)

  const server = createServer({
    name,
    version,
  })

  registerOpenFDATools(server)

  return server
}
