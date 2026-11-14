#!/usr/bin/env tsx

/**
 * Starts the built server over stdio and checks it answers initialize and tools/list.
 *
 * Tool specs drive each tool through a fake server, so they never exercise startup.
 * somamcp 2.0 moved stdio to `somamcp/node`, and importing from `somamcp` made the
 * server exit at start while every spec still passed. This runs after the build.
 */

import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const BIN = path.join(ROOT, "dist", "bin.js")
const TIMEOUT_MS = 15_000
const EXPECTED_TOOLS = 28 // 27 dokploy_* tools + info

type RpcMessage = { id?: number; result?: { tools?: Array<{ name: string }> }; error?: unknown }

const child = spawn(process.execPath, [BIN], {
  cwd: ROOT,
  // A dead local port: startup must not depend on reaching Dokploy.
  env: { ...process.env, DOKPLOY_URL: "http://127.0.0.1:9", DOKPLOY_API_KEY: "smoke", TRANSPORT_TYPE: "stdio" },
  stdio: ["pipe", "pipe", "pipe"],
})

let stderr = ""
child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()))

function fail(reason: string): never {
  child.kill()
  console.error(`✗ stdio smoke: ${reason}`)
  if (stderr) console.error(`--- server stderr ---\n${stderr.trim()}`)
  process.exit(1)
}

const timer = setTimeout(() => fail(`no tools/list reply within ${TIMEOUT_MS / 1000}s`), TIMEOUT_MS)
child.on("exit", (code) => fail(`server exited early with code ${code}`))

let buffer = ""
child.stdout.on("data", (chunk: Buffer) => {
  buffer += chunk.toString()
  const lines = buffer.split("\n")
  buffer = lines.pop() ?? ""
  for (const line of lines) {
    if (!line.trim()) continue
    let message: RpcMessage
    try {
      message = JSON.parse(line) as RpcMessage
    } catch {
      continue
    }
    if (message.error) fail(`request ${message.id} returned ${JSON.stringify(message.error)}`)
    if (message.id !== 2) continue

    const tools = message.result?.tools ?? []
    if (tools.length !== EXPECTED_TOOLS) fail(`expected ${EXPECTED_TOOLS} tools, got ${tools.length}`)
    clearTimeout(timer)
    child.removeAllListeners("exit")
    child.kill()
    console.log(`✓ stdio smoke: server started and listed ${tools.length} tools`)
    process.exit(0)
  }
})

const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`)
send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } },
})
send({ jsonrpc: "2.0", method: "notifications/initialized" })
send({ jsonrpc: "2.0", id: 2, method: "tools/list" })
