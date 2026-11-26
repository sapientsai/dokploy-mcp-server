// The `quota-hook` command: a Claude Code hook for PreToolUse and PostToolUse on Bash. It checks each
// `gh` call with the quota broker before it runs, and never stops work when the broker is down.
//
//   quota-hook              reads the hook event from stdin
//   quota-hook probe <who>  runs `gh api rate_limit` and reports it (the hook starts this itself)
//
// QUOTA_HOOK=off turns it off, =enforce makes it refuse, and the default, =warn, only reports.
// The broker's address and key come from QUOTA_URL and QUOTA_KEY, or from envpkt once, cached in a
// file only this user can read.

import { execFile, execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir, hostname } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { Option, Try, type Wire } from "functype"

import { type Broker, type Deps, type HookInput, type Mode, runPost, runPre } from "./run"

/** How long a "no broker configured" answer is trusted before envpkt is asked again. */
const ABSENT_TTL_MS = 10 * 60_000
const ENVPKT_TIMEOUT_MS = 5_000

const cacheDir = (): string => join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "quota-hook")
const brokerFile = (): string => join(cacheDir(), "broker.json")

type Cached = Wire<{ readonly url?: string; readonly key?: string; readonly at: number }>

const readJson = <T>(path: string): Option<T> =>
  Option(path)
    .filter(existsSync)
    .flatMap((p) => Try(() => JSON.parse(readFileSync(p, "utf8")) as T).toOption())

const writePrivate = (path: string, body: string): void => {
  mkdirSync(cacheDir(), { recursive: true, mode: 0o700 })
  writeFileSync(path, body, { mode: 0o600 })
}

/**
 * Asks envpkt for QUOTA_URL and QUOTA_KEY, which takes most of a second, so the answer is cached.
 * No envpkt, or no broker in it, caches as "none" for a while.
 */
const fromEnvpkt = (): Cached =>
  Try(() => {
    const script = "process.stdout.write(JSON.stringify({url:process.env.QUOTA_URL,key:process.env.QUOTA_KEY}))"
    const out = execFileSync("envpkt", ["exec", "--skip-audit", "--", process.execPath, "-e", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: ENVPKT_TIMEOUT_MS,
    })
    return JSON.parse(out) as Wire<{ readonly url?: string; readonly key?: string }>
  }).fold(
    (): Cached => ({ at: Date.now() }),
    (found): Cached => ({ url: found.url, key: found.key, at: Date.now() }),
  )

const complete = (c: Cached): Option<Broker> =>
  c.url !== undefined && c.url !== "" && c.key !== undefined && c.key !== ""
    ? Option({ url: c.url, key: c.key })
    : Option.none()

const loadBroker = (): Promise<Option<Broker>> => {
  const fromEnv = complete({ url: process.env.QUOTA_URL, key: process.env.QUOTA_KEY, at: Date.now() })
  if (fromEnv.isSome()) return Promise.resolve(fromEnv)
  const cached = readJson<Cached>(brokerFile()).filter((c) => complete(c).isSome() || Date.now() - c.at < ABSENT_TTL_MS)
  const entry = cached.getOrElse(() => {
    const fresh = fromEnvpkt()
    writePrivate(brokerFile(), JSON.stringify(fresh))
    return fresh
  })
  return Promise.resolve(complete(entry))
}

const HOSTS_USER = /^github\.com:\s*\n(?:[ \t]+.*\n)*?[ \t]+user:\s*(\S+)/m

/** The GitHub login gh is signed in as, from its hosts file; the broker keys its ledger on it. */
const ghAccount = (): Option<string> =>
  Option(join(process.env.GH_CONFIG_DIR ?? join(homedir(), ".config", "gh"), "hosts.yml"))
    .filter(existsSync)
    .flatMap((path) => Option(HOSTS_USER.exec(readFileSync(path, "utf8"))?.[1]))

/** True the first time for this session and key, by leaving a marker file. */
const firstTime = (session: string, key: string): boolean => {
  const marker = join(cacheDir(), `seen-${createHash("sha256").update(session).digest("hex").slice(0, 16)}-${key}`)
  if (existsSync(marker)) return false
  writePrivate(marker, "")
  return true
}

const startProbe = (account: string): void => {
  spawn(process.execPath, [fileURLToPath(import.meta.url), "probe", account], {
    detached: true,
    stdio: "ignore",
  }).unref()
}

const ghRateLimit = (): Promise<Option<unknown>> =>
  new Promise((resolve) => {
    execFile("gh", ["api", "rate_limit"], { timeout: 10_000 }, (error, stdout) => {
      resolve(error === null ? Try(() => JSON.parse(stdout) as unknown).toOption() : Option.none())
    })
  })

/** `quota-hook probe <account>`: reads GitHub's free rate_limit and reports it to the broker. */
const probe = async (account: string): Promise<void> => {
  const broker = await loadBroker()
  const body = await ghRateLimit()
  await broker
    .flatMap((b) => body.map((rateLimit) => ({ b, rateLimit })))
    .fold(
      () => Promise.resolve(),
      ({ b, rateLimit }) =>
        fetch(`${b.url.replace(/\/+$/, "")}/v1/report`, {
          method: "POST",
          headers: { authorization: `Bearer ${b.key}`, "content-type": "application/json" },
          body: JSON.stringify({ service: "github", account, body: rateLimit }),
          signal: AbortSignal.timeout(5_000),
        }).then(
          () => undefined,
          () => undefined,
        ),
    )
}

const readStdin = async (): Promise<string> =>
  Buffer.concat((await Array.fromAsync(process.stdin)) as ReadonlyArray<Buffer>).toString("utf8")

const deps = (mode: Mode): Deps => ({
  mode,
  broker: loadBroker,
  forgetBroker: () => rmSync(brokerFile(), { force: true }),
  account: ghAccount,
  machine: hostname(),
  fetch: (url, init) => fetch(url, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  probe: startProbe,
  firstTime,
})

const main = async (): Promise<void> => {
  const setting = (process.env.QUOTA_HOOK ?? "warn").toLowerCase()
  if (setting === "off") return
  if (process.argv[2] === "probe") return probe(process.argv[3] ?? "")
  const text = await readStdin()
  const mode: Mode = setting === "enforce" ? "enforce" : "warn"
  await Try(() => JSON.parse(text) as HookInput).fold(
    () => Promise.resolve(),
    async (input) => {
      if (input.hook_event_name === "PostToolUse") return runPost(input, deps(mode))
      const result = await runPre(input, deps(mode))
      result.map((r) => process.stdout.write(JSON.stringify(r)))
    },
  )
}

// Whatever happens, exit 0: a failing hook must never block a command.
main().catch(() => undefined)
