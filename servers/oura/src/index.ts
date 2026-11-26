#!/usr/bin/env node
import "dotenv/config"

import { readFileSync } from "node:fs"

import { createServer } from "somamcp"

import { parseConfig } from "./config"
import { runLogin } from "./login"
import { createTokenProvider } from "./oura/auth"
import { buildTelemetry } from "./telemetry"
import { createOuraDataTool } from "./tools/ouraData"

// Single source of truth for identity: package.json sits at the package root in every
// layout we ship (npm install and the .mcpb bundle both keep it one level above dist/).
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  name: string
  version: `${number}.${number}.${number}`
}
const NAME = pkg.name
const VERSION = pkg.version

const stderr = (message: string): void => {
  process.stderr.write(`[${NAME}] ${message}\n`)
}

const main = async (): Promise<void> => {
  const configResult = parseConfig(process.env)
  if (configResult.isLeft()) {
    stderr(configResult.value)
    process.exit(1)
  }
  const config = configResult.value

  // `oura-ring-mcp-server login` runs the one-time OAuth authorization flow, then exits.
  if (process.argv[2] === "login") {
    if (config.auth.mode !== "oauth") {
      stderr("`login` requires OAuth mode. Set OURA_CLIENT_ID and OURA_CLIENT_SECRET, then retry.")
      process.exit(1)
    }
    const result = await runLogin(config.auth)
    if (result.isLeft()) {
      stderr(result.value.message)
      process.exit(1)
    }
    process.exit(0)
  }

  const server = createServer({
    name: NAME,
    version: VERSION,
    telemetry: buildTelemetry(config, process.env),
    enableIntrospection: true,
  })

  // One provider per process so OAuth token caching + single-flight refresh work across requests.
  const tokenProvider = createTokenProvider(config.auth)
  stderr(`auth mode: ${config.auth.mode}`)

  // Warm up OAuth so a bad/expired refresh token surfaces at startup, not on the first tool call.
  // Non-fatal: a transient network blip should not stop the server from starting.
  if (config.auth.mode === "oauth") {
    const warm = await tokenProvider.getToken()
    if (warm.isLeft()) stderr(`warning: OAuth startup token fetch failed: ${warm.value.message}`)
  }

  server.addTool(createOuraDataTool(config, { tokenProvider }))

  if (config.transportType === "httpStream") {
    await server.start({
      transportType: "httpStream",
      httpStream: { port: config.port, host: config.host },
    })
    stderr(`listening on http://${config.host}:${config.port} (sandbox=${config.sandbox})`)
  } else {
    await server.start({ transportType: "stdio" })
  }
}

main().catch((err: unknown) => {
  stderr(`fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`)
  process.exit(1)
})
