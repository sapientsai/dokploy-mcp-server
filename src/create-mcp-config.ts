#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

// Get the directory path for the current module
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Define paths
const tokenPath = process.argv[2] || path.join(process.cwd(), "tokens.json")
const outputPath = process.argv[3] || path.join(process.cwd(), "mcp.json")

console.log(`Reading tokens from: ${tokenPath}`)
console.log(`Writing config to: ${outputPath}`)

try {
  // Read the tokens
  const tokenData = JSON.parse(fs.readFileSync(tokenPath, "utf8"))

  // Create the MCP config - only include the actual tokens
  const mcpConfig = {
    mcpServers: {
      mstodo: {
        command: "npx",
        args: ["--yes", "mstodo"],
        env: {
          MSTODO_ACCESS_TOKEN: tokenData.accessToken,
          MSTODO_REFRESH_TOKEN: tokenData.refreshToken,
        },
      },
    },
  }

  // Write the config
  fs.writeFileSync(outputPath, JSON.stringify(mcpConfig, null, 2), "utf8")

  console.log("MCP configuration file created successfully!")
  console.log("You can now use the service with Claude or Cursor by referencing this mcp.json file.")
} catch (error) {
  // Fix potential TypeScript error with unknown error type
  const errorMessage = error instanceof Error ? error.message : String(error)
  console.error("Error creating MCP config:", errorMessage)
  process.exit(1)
}
