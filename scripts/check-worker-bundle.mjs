#!/usr/bin/env node
// Guards the Cloudflare Worker bundle against Node-only code.
//
// The worker deliberately runs without `nodejs_compat`, so any Node built-in
// reaching dist/worker.js is a deploy-time failure that neither typecheck nor
// the unit tests would catch. The most likely regression is an accidental
// `from "somamcp"` (the root barrel re-exports node:fs-backed helpers) instead
// of `from "somamcp/edge"`.

import { readFile } from "node:fs/promises"

const DIST = "dist"

// `somamcp/edge` is the allowed one; the root barrel is not.
const FORBIDDEN_MODULES = ["somamcp"]

// Node built-ins are importable with or without the `node:` prefix, and real
// packages use the bare form — checking only `node:` would miss them.
const BARE_NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
])

/** True for "fs" and "fs/promises" alike. */
const isBareNodeBuiltin = (specifier) => BARE_NODE_BUILTINS.has(specifier.split("/")[0])

const ENTRY = `${DIST}/worker.js`

const specifiersIn = (source) =>
  [
    // `from "x"`, bare side-effect `import "x"`, dynamic `import("x")`
    ...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g),
    ...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1])

const isRelative = (specifier) => specifier.startsWith("./") || specifier.startsWith("../")

/** Resolve a relative specifier against the directory of the importing file. */
const resolveFrom = (importer, specifier) => {
  const dir = importer.slice(0, importer.lastIndexOf("/"))
  const joined = `${dir}/${specifier}`
  const parts = []
  for (const segment of joined.split("/")) {
    if (segment === "." || segment === "") continue
    if (segment === "..") parts.pop()
    else parts.push(segment)
  }
  return parts.join("/")
}

// Walk the actual import graph from the worker entry rather than trusting
// filenames. Rolldown hoists code shared between entries into a chunk with an
// arbitrary name (e.g. src-CG2z5T85.js); a filename glob would skip it, which is
// exactly how a Node built-in sneaks into an edge bundle unnoticed.
const problems = []
const visited = new Set()
const queue = [ENTRY]
let total = 0

while (queue.length > 0) {
  const path = queue.shift()
  if (visited.has(path)) continue
  visited.add(path)

  let source
  try {
    source = await readFile(path, "utf8")
  } catch {
    if (path === ENTRY) {
      console.error(`✗ ${ENTRY} not found — run the build first.`)
      process.exit(1)
    }
    problems.push(`${path} is imported but missing from the build`)
    continue
  }

  for (const specifier of specifiersIn(source)) {
    total += 1

    if (isRelative(specifier)) {
      queue.push(resolveFrom(path, specifier))
      continue
    }
    if (specifier.startsWith("node:")) {
      problems.push(`${path} imports Node built-in "${specifier}"`)
    } else if (isBareNodeBuiltin(specifier)) {
      problems.push(`${path} imports Node built-in "${specifier}" (bare, no node: prefix)`)
    } else if (FORBIDDEN_MODULES.includes(specifier)) {
      problems.push(`${path} imports "${specifier}" — the worker must import "somamcp/edge"`)
    }
  }
}

if (problems.length > 0) {
  console.error("✗ worker bundle is not edge-safe:")
  problems.forEach((p) => console.error(`    - ${p}`))
  process.exit(1)
}

console.log(
  `✓ worker bundle is edge-safe (${visited.size} file(s): ${[...visited].join(", ")}; ${total} imports, no Node built-ins)`,
)
