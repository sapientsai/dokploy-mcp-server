#!/usr/bin/env node
// Deploys the Worker with build provenance baked in.
//
// Cloudflare Workers Builds exposes WORKERS_CI_COMMIT_SHA and WORKERS_CI_BRANCH
// during the build, but build variables are NOT available at runtime — they have
// to be forwarded explicitly as Worker vars. Without this, `info` and /info
// report an empty build and you cannot tell what is actually deployed.
//
// Falls back to local git so a manual `pnpm cf:deploy` is just as traceable as a
// CI one.

import { execFileSync, spawnSync } from "node:child_process"

const fromGit = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return ""
  }
}

const firstNonEmpty = (...values) => values.find((v) => v !== undefined && v !== "") ?? "unknown"

const commit = firstNonEmpty(process.env.WORKERS_CI_COMMIT_SHA, fromGit(["rev-parse", "HEAD"]))
const branch = firstNonEmpty(process.env.WORKERS_CI_BRANCH, fromGit(["rev-parse", "--abbrev-ref", "HEAD"]))

// A local deploy from a dirty tree does not correspond to any commit; say so
// rather than stamping a sha that does not describe what is running.
const dirty = process.env.WORKERS_CI === undefined && fromGit(["status", "--porcelain"]) !== ""
const stampedCommit = dirty ? `${commit}-dirty` : commit

const date = new Date().toISOString()

console.log(`Deploying commit=${stampedCommit} branch=${branch}`)

const result = spawnSync(
  "wrangler",
  [
    "deploy",
    "--var",
    `GIT_COMMIT:${stampedCommit}`,
    "--var",
    `GIT_BRANCH:${branch}`,
    "--var",
    `BUILD_DATE:${date}`,
    ...process.argv.slice(2),
  ],
  { shell: process.platform === "win32", stdio: "inherit" },
)

process.exit(result.status ?? 1)
