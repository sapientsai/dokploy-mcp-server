#!/usr/bin/env tsx

/**
 * Sync version numbers in server.json (and manifest.json if present) to match
 * package.json. Wired into the npm `version` lifecycle so `npm version <bump>`
 * automatically updates side-channel manifests and stages them into the
 * version commit — preventing the "package.json bumped but server.json stale"
 * class of CI failure.
 */

import fs from "fs"
import path from "path"
import { execFileSync } from "child_process"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "..")

function readJSON<T>(file: string): { data: T; raw: string } | null {
  const full = path.join(ROOT, file)
  if (!fs.existsSync(full)) return null
  const raw = fs.readFileSync(full, "utf-8")
  return { data: JSON.parse(raw) as T, raw }
}

function writeJSON(file: string, data: unknown, trailingNewline: boolean): void {
  const out = JSON.stringify(data, null, 2) + (trailingNewline ? "\n" : "")
  fs.writeFileSync(path.join(ROOT, file), out)
}

function stage(file: string): void {
  // Best-effort: in non-git contexts (CI tarball etc.) we still want the sync to succeed.
  try {
    execFileSync("git", ["add", "--", file], { cwd: ROOT, stdio: "ignore" })
  } catch {
    // ignored: outside a git repo
  }
}

const pkg = readJSON<{ version: string }>("package.json")
if (!pkg) {
  console.error("Could not read package.json")
  process.exit(1)
}
const version = pkg.data.version

let touched = false

const server = readJSON<{ version: string; packages?: Array<{ version: string }> }>("server.json")
if (server) {
  const next = { ...server.data, version }
  if (Array.isArray(next.packages) && next.packages[0]) {
    next.packages = next.packages.map((p, i) => (i === 0 ? { ...p, version } : p))
  }
  const trailingNewline = server.raw.endsWith("\n")
  writeJSON("server.json", next, trailingNewline)
  stage("server.json")
  console.log(`✓ server.json synced to ${version}`)
  touched = true
}

const manifest = readJSON<{ version: string }>("manifest.json")
if (manifest) {
  const next = { ...manifest.data, version }
  const trailingNewline = manifest.raw.endsWith("\n")
  writeJSON("manifest.json", next, trailingNewline)
  stage("manifest.json")
  console.log(`✓ manifest.json synced to ${version}`)
  touched = true
}

if (!touched) {
  console.log("No side-channel manifests to sync.")
}
