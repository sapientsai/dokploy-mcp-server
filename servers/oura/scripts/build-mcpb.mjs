#!/usr/bin/env node
/**
 * Build a self-contained `.mcpb` bundle (one-click install for Claude Desktop).
 *
 * The production build emits unbundled ESM that imports its deps (somamcp, pino, …)
 * from node_modules at runtime, and pino/fastmcp do not inline-bundle cleanly. So we
 * stage the compiled `dist/` alongside a FLAT production `node_modules` (a fresh
 * `npm install --omit=dev`), drop in `manifest.json` + a minimal ESM `package.json`,
 * then `mcpb pack` the staging dir.
 *
 * Usage: `node scripts/build-mcpb.mjs` (or `pnpm build:mcpb`).
 */
import { execFileSync } from "node:child_process"
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const stage = join(root, "build", "mcpb")
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const outFile = join(root, "build", `${pkg.name}-${pkg.version}.mcpb`)

const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: "inherit", env: process.env })

// 1. Fresh production build → dist/
console.log("→ building (ts-builds build)")
run("pnpm", ["build"])

// 2. Reset staging dir
rmSync(join(root, "build"), { recursive: true, force: true })
mkdirSync(stage, { recursive: true })

// 3. Copy compiled output + docs, then stamp the manifest version from package.json
cpSync(join(root, "dist"), join(stage, "dist"), { recursive: true })
cpSync(join(root, "README.md"), join(stage, "README.md"))
cpSync(join(root, "LICENSE"), join(stage, "LICENSE"))

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"))
manifest.version = pkg.version // package.json is the single source of truth
writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n")

// 4. Minimal ESM package.json so Node resolves dist/ as ESM and npm installs prod deps only
const stagePkg = {
  name: pkg.name,
  version: pkg.version,
  type: "module",
  private: true,
  dependencies: pkg.dependencies,
}
writeFileSync(join(stage, "package.json"), JSON.stringify(stagePkg, null, 2) + "\n")

// 5. Flat production node_modules
console.log("→ installing production deps (npm install --omit=dev)")
run("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--no-package-lock"], stage)

// 6. Pack
console.log("→ packing (mcpb pack)")
run("npx", ["--yes", "@anthropic-ai/mcpb", "pack", stage, outFile])

console.log(`\n✓ ${outFile}`)
