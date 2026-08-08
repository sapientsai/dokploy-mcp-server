import { defineConfig } from "tsdown"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8")) as { version: string }

const isProduction = process.env.NODE_ENV === "production"

/** Returns trimmed stdout, or undefined when git is absent or this is not a work tree. */
function git(...args: string[]): string | undefined {
  try {
    const out = execFileSync("git", args, {
      cwd: __dirname,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    return out.length > 0 ? out : undefined
  } catch {
    return undefined
  }
}

// A `-dirty` suffix marks an artifact built from uncommitted code — the case
// where "which commit is this?" is otherwise actively misleading.
const sha = git("rev-parse", "--short=12", "HEAD")
const buildCommit = sha === undefined ? undefined : git("status", "--porcelain") ? `${sha}-dirty` : sha

// actions/checkout detaches HEAD (so --abbrev-ref yields "HEAD"); GITHUB_REF_NAME
// carries the real branch or tag there.
const headRef = git("rev-parse", "--abbrev-ref", "HEAD")
const buildBranch = headRef !== undefined && headRef !== "HEAD" ? headRef : process.env.GITHUB_REF_NAME

// Only defined keys are injected, so a missing value leaves the global undeclared
// and lets somamcp fall back to its SOMAMCP_BUILD_* env vars at runtime.
const buildDefines = Object.fromEntries(
  Object.entries({
    __BUILD_COMMIT__: buildCommit,
    __BUILD_BRANCH__: buildBranch,
    __BUILD_DATE__: new Date().toISOString(),
  })
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k, JSON.stringify(v)]),
)

export default defineConfig({
  entry: {
    index: "src/index.ts",
    bin: "src/bin.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: isProduction,
  clean: true,
  target: "node16",
  outDir: "dist",
  platform: "node",
  treeshake: true,
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    ...buildDefines,
  },
  outExtensions: () => ({
    js: ".js",
    dts: ".d.ts",
  }),
})
