import dotenv from "dotenv"
import type { TransportConfig } from "somamcp"
import { createServer } from "somamcp/node"

import { initializeClient } from "./client/beszel-client"
import { readConfig } from "./config"
import { registerAllTools } from "./tools"

dotenv.config({ quiet: true })

declare const __VERSION__: string
const VERSION = (typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.0.0-dev") as `${number}.${number}.${number}`

const config = readConfig(process.env).fold(
  (problem) => {
    console.error(`[Error] ${problem}`)
    console.error("[Error] See https://github.com/sapientsai/mcp-servers/tree/main/servers/beszel#configuration")
    return process.exit(1)
  },
  (c) => c,
)

// The client signs in on the first call, so a hub that's down doesn't stop the server from starting.
initializeClient(config)
console.error(`[Setup] Beszel MCP Server v${VERSION}`)
console.error(
  `[Setup] Hub ${config.baseUrl}, signing in with ${config.auth.kind === "token" ? "BESZEL_TOKEN" : "a password"}`,
)
console.error(`[Setup] Writes ${config.writes ? "on (BESZEL_ENABLE_WRITES=true)" : "off"}`)

const server = createServer({
  name: "beszel-mcp-server",
  version: VERSION,
  instructions: `Beszel MCP Server — access to a Beszel monitoring hub: the machines it watches, their metrics, containers, services, disks and alerts.

## Tool Selection Guide
- **"What's down?" / "How are my servers?"** → list_systems (status, CPU, memory, disk for every system)
- **"Tell me about X"** → get_system (OS, hardware, current use, filesystems, temperatures)
- **"Has X been busy?" / "Memory over the last week?"** → get_system_stats with a range (1h, 12h, 24h, 7d, 30d)
- **"Which containers are unhealthy?"** → list_containers with health="unhealthy"
- **"How much memory does container Y use over time?"** → get_container_stats
- **"Any failed services?"** → list_systemd_services with failed_only=true
- **"Are my disks healthy?"** → list_smart_devices
- **"What alerts are set?" / "Is anything alerting?"** → list_alerts (triggered_only=true for what's firing now)
- **"When did X go down?"** → get_alert_history
${
  config.writes
    ? `- **"Rename X" / "X moved to a new address"** → update_system
- **"Stop watching X for now"** → pause_system, then resume_system
- **"The wrong machine is reporting as X"** → get_system shows the hostname the agent reports. Rename the system with update_system, or, once the wrong machine has its own system, reset_system_fingerprint
`
    : ""
}
## Notes
- A system is named by its Beszel name or record id; list_systems shows both.
- Stats come at the interval Beszel keeps for the range, so a 30d range has 8-hour points. Times are UTC.
- Rates (network, disk I/O) are per second. Memory and disk sizes use 1024-based units, as Beszel shows them.
- ${
    config.writes
      ? "Writes are on: update_system, pause_system, resume_system and reset_system_fingerprint change the hub. Confirm with the user before each one. Alerts can't be changed."
      : "This server only reads. It can't change systems or alerts (BESZEL_ENABLE_WRITES=true adds tools that change systems)."
  }`,
})

registerAllTools(server, { writes: config.writes })

/** Starts the server, or exits with the reason when it can't (a port in use, say). */
const startOrExit = (transport: TransportConfig): Promise<void> =>
  server.start(transport).catch((error: unknown) => {
    console.error("[beszel-mcp-server] failed to start:", error)
    process.exit(1)
  })

const transportType = (process.env.TRANSPORT_TYPE ?? "stdio") as "stdio" | "httpStream"
const port = Number(process.env.PORT ?? 3000)

void startOrExit(transportType === "httpStream" ? { transportType, httpStream: { port } } : { transportType: "stdio" })

console.error(`[Setup] Server started with ${transportType} transport`)
