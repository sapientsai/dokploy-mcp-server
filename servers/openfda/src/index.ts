#!/usr/bin/env node
/**
 * OpenFDA MCP Server CLI
 * Command-line interface for starting the MCP server
 */

import { Command } from "commander"
import { Try } from "functype"

import { createOpenFDAServer } from "./server.js"
import { loggers } from "./utils/logger.js"
import { VERSION } from "./version.js"

const program = new Command()

program
  .name("openfda-mcp-server")
  .description("MCP server for querying U.S. FDA public datasets")
  .version(VERSION)
  .option("-t, --transport <type>", "Transport type (stdio or http)", "stdio")
  .option("-p, --port <number>", "Port for HTTP transport", "3000")
  .option("--host <host>", "Host for HTTP transport", "localhost")
  .action(async (options) => {
    const { transport, port, host } = options

    loggers.main(`Starting OpenFDA MCP server with transport: ${transport}`)

    const server = createOpenFDAServer({ name: "openfda-mcp-server", version: VERSION })

    const start = (): Promise<void> => {
      if (transport === "http") {
        const portNum = parseInt(port, 10)
        loggers.main(`Starting HTTP server on ${host}:${portNum}`)
        return server
          .start({
            transportType: "httpStream",
            httpStream: {
              endpoint: "/mcp" as `/${string}`,
              port: portNum,
              host,
            },
          })
          .then(() => console.error(`OpenFDA MCP server running at http://${host}:${portNum}/mcp`))
      }
      loggers.main("Starting stdio server")
      return server.start({ transportType: "stdio" })
    }

    const started = await Try.async(start)
    started.fold(
      (error) => {
        console.error("Failed to start server:", error)
        process.exit(1)
      },
      () => undefined,
    )
  })

program.parse()
