#!/usr/bin/env node
// Cut a release of one server: bump its version, commit, and tag <name>@<version>.
//
//   pnpm release <server> <patch|minor|major>     e.g. pnpm release dokploy patch
//
// <server> is the folder under servers/. The tag is what publishes: pushing it with
// `git push --follow-tags` starts .github/workflows/publish.yml for that package alone.
// Run it from a clean, up-to-date main. It never pushes.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const LEVELS = ["patch", "minor", "major"]

const fail = (message) => {
  console.error(`release: ${message}`)
  process.exit(1)
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim()

const [server, level] = process.argv.slice(2)
if (!server || !LEVELS.includes(level)) fail("usage: pnpm release <server> <patch|minor|major>")

const dir = join("servers", server)
const manifest = join(dir, "package.json")
if (!existsSync(manifest)) fail(`no ${manifest}`)

if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") fail("run it on main")
if (git("status", "--porcelain") !== "") fail("the working tree has changes; commit or stash them first")
git("fetch", "--quiet", "origin", "main")
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) fail("main isn't in sync with origin/main")

// --no-git-tag-version: npm can't tag <name>@<version> from a subfolder. It still runs the
// package's own "version" script, which is where a server syncs server.json.
execFileSync("npm", ["version", level, "--no-git-tag-version"], { cwd: dir, stdio: "inherit" })

const { name, version } = JSON.parse(readFileSync(manifest, "utf8"))
const tag = `${name}@${version}`

git("add", "--", dir)
git("commit", "--quiet", "-m", `chore(release): ${tag}`)
git("tag", "-a", tag, "-m", tag)

console.log(`Tagged ${tag}. Push it to publish: git push --follow-tags`)
