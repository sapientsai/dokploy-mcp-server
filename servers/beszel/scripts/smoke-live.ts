/**
 * Calls every tool against a real Beszel hub and prints the first lines of each answer.
 *
 * Usage: BESZEL_URL=… BESZEL_EMAIL=… BESZEL_PASSWORD=… pnpm smoke:live [system]
 *
 * Reads the hub and sign-in from the environment only, so nothing about a real hub lands in the repo.
 * Not run in CI. Its output names your machines: don't paste it into an issue or commit.
 */

import type { SomaServerInstance } from "somamcp"

import { initializeClient } from "../src/client/beszel-client"
import { readConfig } from "../src/config"
import { registerAllTools } from "../src/tools"

type Execute = (args: Record<string, unknown>) => Promise<unknown>

const config = readConfig(process.env).fold(
  (problem) => {
    console.error(problem)
    return process.exit(1)
  },
  (c) => c,
)
initializeClient(config)

const tools = new Map<string, Execute>()
registerAllTools({
  addTool: (tool: { readonly name: string; readonly execute: Execute }) => tools.set(tool.name, tool.execute),
} as unknown as SomaServerInstance)

const call = async (name: string, args: Record<string, unknown>): Promise<string> => {
  const execute = tools.get(name)
  if (execute === undefined) throw new Error(`no tool ${name}`)
  return String(await execute(args))
}

const report = async (name: string, args: Record<string, unknown>): Promise<boolean> => {
  try {
    const text = await call(name, args)
    console.log(`✓ ${name} ${JSON.stringify(args)}\n${text.split("\n").slice(0, 4).join("\n")}\n`)
    return true
  } catch (e) {
    console.log(`✗ ${name} ${JSON.stringify(args)}: ${e instanceof Error ? e.message : String(e)}\n`)
    return false
  }
}

const listed = await call("list_systems", {})
const firstSystem = /^\| [^|]+ \| ([a-z0-9]{15}) \|/m.exec(listed)?.[1]
const system = process.argv[2] ?? firstSystem
if (system === undefined) {
  console.log(listed)
  console.error("No system to test against.")
  process.exit(1)
}

const results = [
  await report("list_systems", {}),
  await report("get_system", { system }),
  await report("get_system_stats", { system, range: "1h" }),
  await report("get_system_stats", { system, range: "7d" }),
  await report("list_containers", {}),
  await report("list_systemd_services", { system, failed_only: false }),
  await report("list_smart_devices", {}),
  await report("list_alerts", { triggered_only: false }),
  await report("get_alert_history", { active_only: false, limit: 5 }),
]

const failed = results.filter((ok) => !ok).length
console.log(failed === 0 ? "All tools answered." : `${failed} tool call(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
