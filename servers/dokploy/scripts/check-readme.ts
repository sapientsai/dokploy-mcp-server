#!/usr/bin/env tsx

/**
 * README/source consistency checker
 *
 * The README documents every tool and its action enum by hand, so it drifts
 * silently as tools gain actions. This treats the ACTIONS arrays in
 * src/tools/*-tools.ts as the source of truth and fails when the README
 * disagrees — on the tool count, a missing section, a stale count, or an
 * action listed in one place but not the other.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

type Tool = {
  name: string
  actions: string[]
}

type Section = {
  name: string
  declaredCount: number
  actions: string[]
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "..")
const TOOLS_DIR = path.join(ROOT, "src", "tools")

/** Reads tool name + ACTIONS out of each src/tools/*-tools.ts. */
function collectTools(): Tool[] {
  return fs
    .readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith("-tools.ts"))
    .flatMap((f) => {
      const source = fs.readFileSync(path.join(TOOLS_DIR, f), "utf-8")
      const name = /name: "(dokploy_[a-z_]+)"/.exec(source)?.[1]
      const actionsBlock = /const ACTIONS = \[([^\]]*)\]/s.exec(source)?.[1]
      if (name === undefined || actionsBlock === undefined) return []
      const actions = [...actionsBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1])
      return [{ name, actions }]
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Parses the `### \`dokploy_x\` (N actions)` blocks and their Actions: lines. */
function collectSections(readme: string): Section[] {
  const pattern = /### `(dokploy_[a-z_]+)` \((\d+) actions?\)\s*\n\s*\nActions: `([^`]+)`/g
  return [...readme.matchAll(pattern)].map((m) => ({
    name: m[1],
    declaredCount: Number(m[2]),
    actions: m[3]
      .split("|")
      .map((a) => a.trim())
      .filter(Boolean),
  }))
}

/**
 * Maps a comparison-table row label to a tool name. Tool names are not
 * consistently singular (dokploy_mounts but dokploy_backup), so try the
 * plural, the de-pluralized form, and the -ies/-y form, and accept whichever
 * names a real tool. An unmatched label is itself reported.
 */
function labelToToolName(label: string, known: Set<string>): string | undefined {
  const snake = label.trim().toLowerCase().replace(/\s+/g, "_")
  const candidates = [snake, snake.replace(/ies$/, "y"), snake.replace(/s$/, "")]
  return candidates.map((c) => `dokploy_${c}`).find((c) => known.has(c))
}

function checkSections(tools: Tool[], sections: Section[]): string[] {
  const errors: string[] = []
  const byName = new Map(sections.map((s) => [s.name, s]))

  for (const tool of tools) {
    const section = byName.get(tool.name)
    if (!section) {
      errors.push(`${tool.name}: registered in src/tools but has no README section`)
      continue
    }
    if (section.declaredCount !== tool.actions.length) {
      errors.push(
        `${tool.name}: README heading says ${section.declaredCount} actions, source has ${tool.actions.length}`,
      )
    }
    if (section.actions.length !== section.declaredCount) {
      errors.push(
        `${tool.name}: README heading says ${section.declaredCount} actions but lists ${section.actions.length}`,
      )
    }
    const undocumented = tool.actions.filter((a) => !section.actions.includes(a))
    if (undocumented.length > 0) {
      errors.push(`${tool.name}: actions missing from README: ${undocumented.join(", ")}`)
    }
    const phantom = section.actions.filter((a) => !tool.actions.includes(a))
    if (phantom.length > 0) {
      errors.push(`${tool.name}: README lists actions absent from source: ${phantom.join(", ")}`)
    }
  }

  const known = new Set(tools.map((t) => t.name))
  for (const section of sections) {
    if (!known.has(section.name)) {
      errors.push(`${section.name}: documented in README but no such tool is registered`)
    }
  }

  return errors
}

function checkComparisonTable(readme: string, tools: Tool[]): string[] {
  const errors: string[] = []
  const known = new Set(tools.map((t) => t.name))
  const counts = new Map(tools.map((t) => [t.name, t.actions.length]))
  const seen = new Set<string>()

  for (const m of readme.matchAll(/^\| ([A-Za-z ]+?)\s*\|[^|]*\| 1 tool \((\d+) actions?[^)]*\)\s*\|/gm)) {
    const label = m[1]
    const toolName = labelToToolName(label, known)
    if (toolName === undefined) {
      errors.push(`comparison table: row "${label}" does not correspond to any registered tool`)
      continue
    }
    seen.add(toolName)
    const actual = counts.get(toolName)
    if (actual !== Number(m[2])) {
      errors.push(`comparison table: "${label}" says ${m[2]} actions, source has ${String(actual)}`)
    }
  }

  for (const tool of tools) {
    if (!seen.has(tool.name)) {
      errors.push(`comparison table: no row for ${tool.name}`)
    }
  }

  return errors
}

function checkCounts(readme: string, toolCount: number): string[] {
  const errors: string[] = []

  const heading = /## Tools \((\d+)\)/.exec(readme)
  if (!heading) {
    errors.push('README has no "## Tools (N)" heading')
  } else if (Number(heading[1]) !== toolCount) {
    errors.push(`"## Tools (${heading[1]})" heading disagrees with the ${toolCount} registered tools`)
  }

  const total = /\| \*\*Total\*\*.*\*\*(\d+) tools\*\* \|/.exec(readme)
  if (total && Number(total[1]) !== toolCount) {
    errors.push(`comparison table total says ${total[1]} tools, source has ${toolCount}`)
  }

  const intro = /\*\*(\d+) tools\*\* \(one per category/.exec(readme)
  if (intro && Number(intro[1]) !== toolCount) {
    errors.push(`intro says ${intro[1]} tools, source has ${toolCount}`)
  }

  return errors
}

function main(): void {
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf-8")
  const tools = collectTools()

  if (tools.length === 0) {
    console.error("Found no tools in src/tools — the checker cannot verify anything")
    process.exit(1)
  }

  const sections = collectSections(readme)

  console.log(`\nChecking README against src/tools (${tools.length} tools registered)\n`)

  const errors = [
    ...checkCounts(readme, tools.length),
    ...checkSections(tools, sections),
    ...checkComparisonTable(readme, tools),
  ]

  console.log(`✓ tool sections: ${sections.length}/${tools.length} documented`)
  console.log(`✓ actions checked: ${tools.reduce((n, t) => n + t.actions.length, 0)}`)
  console.log("")

  if (errors.length > 0) {
    console.error("README is out of sync with src/tools:\n")
    errors.forEach((err) => console.error(`  ✗ ${err}`))
    console.error("\nUpdate README.md so it matches the ACTIONS enums\n")
    process.exit(1)
  }

  console.log("README matches the registered tools!\n")
}

main()
