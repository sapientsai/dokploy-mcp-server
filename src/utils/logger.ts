/**
 * Logger utility for OpenFDA MCP Server
 * Uses debug module for namespace-based logging
 *
 * Enable with: DEBUG=openfda-mcp:* <command>
 */

import debug from "debug"

export const loggers = {
  core: debug("openfda-mcp:core"),
  api: debug("openfda-mcp:api"),
  tools: debug("openfda-mcp:tools"),
  main: debug("openfda-mcp:main"),
  fastmcp: debug("openfda-mcp:fastmcp"),
  bulk: debug("openfda-mcp:bulk"),
}
