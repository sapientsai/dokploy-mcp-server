#!/usr/bin/env node
/**
 * OpenFDA MCP Server CLI
 * Command-line interface for starting the MCP server
 */

import { Command } from "commander"

import { createOpenFDAServer } from "./server.js"
import { loggers } from "./utils/logger.js"

const program = new Command()

program
  .name("openfda-mcp-server")
  .description("MCP server for querying U.S. FDA public datasets")
  .version("0.1.0")
  .option("-t, --transport <type>", "Transport type (stdio or http)", "stdio")
  .option("-p, --port <number>", "Port for HTTP transport", "3000")
  .option("--host <host>", "Host for HTTP transport", "localhost")
  .action(async (options) => {
    const { transport, port, host } = options

    loggers.main(`Starting OpenFDA MCP server with transport: ${transport}`)

    const server = createOpenFDAServer({
      name: "openfda-mcp-server",
      version: "0.1.0" as `${number}.${number}.${number}`,
    })

    try {
      if (transport === "http") {
        const portNum = parseInt(port, 10)
        loggers.main(`Starting HTTP server on ${host}:${portNum}`)

        await server.start({
          transportType: "httpStream",
          httpStream: {
            endpoint: "/mcp" as `/${string}`,
            port: portNum,
          },
        })

        console.error(`OpenFDA MCP server running at http://${host}:${portNum}/mcp`)
      } else {
        loggers.main("Starting stdio server")

        await server.start({
          transportType: "stdio",
        })
      }
    } catch (error) {
      console.error("Failed to start server:", error)
      process.exit(1)
    }
  })

program.parse()
