import { List, Option } from "functype"

/**
 * Finds the `gh` calls in a shell command and describes each one for the broker: a label of its first
 * words (never its arguments), whether it writes, which budget it spends, and whether to refuse it
 * outright. Pure functions, so they're tested on their own.
 */

export type GhCall = { readonly args: ReadonlyArray<string> }

export type CallClass = "read" | "write"

export type Described = {
  readonly label: string
  readonly class: CallClass
  /** `core` or `graphql`; left out, the broker picks the budget with less left. */
  readonly resource?: string
  /** Set when the call polls too fast for the shared limit, whatever the broker says. */
  readonly refuse?: string
}

type Scan = {
  readonly segments: ReadonlyArray<ReadonlyArray<string>>
  readonly words: ReadonlyArray<string>
  readonly word: string
  readonly quote: "" | "'" | '"'
  readonly escaped: boolean
  /**
   * Substitutions opened inside double quotes, innermost last: `)` for `$(`, `` ` `` for a backtick.
   * Their contents run as commands, unquoted, and the double quote resumes when they close.
   */
  readonly open: ReadonlyArray<")" | "`">
}

const START: Scan = { segments: [], words: [], word: "", quote: "", escaped: false, open: [] }

/** Characters that end one simple command and start another, outside single quotes. */
const SEPARATORS = List.of(";", "&", "|", "\n", "(", ")", "`")

const endWord = (s: Scan): Scan => (s.word === "" ? s : { ...s, words: [...s.words, s.word], word: "" })
const endSegment = (s: Scan): Scan => {
  const w = endWord(s)
  return w.words.length === 0 ? w : { ...w, segments: [...w.segments, w.words], words: [] }
}

const step = (s: Scan, ch: string): Scan => {
  if (s.escaped) return { ...s, word: s.word + ch, escaped: false }
  if (ch === "\\" && s.quote !== "'") return { ...s, escaped: true }
  if (s.quote === "'") return ch === "'" ? { ...s, quote: "" } : { ...s, word: s.word + ch }
  // Inside double quotes, $( and backticks still run commands: their contents split like any other.
  if (s.quote === '"') {
    if (ch === '"') return { ...s, quote: "" }
    if (ch === "`" || (ch === "(" && s.word.endsWith("$"))) {
      const closer = ch === "`" ? "`" : ")"
      return endSegment({ ...s, word: s.word.replace(/\$$/, ""), quote: "", open: [...s.open, closer] })
    }
    return { ...s, word: s.word + ch }
  }
  const closing = s.open.at(-1)
  if (closing !== undefined && ch === closing) {
    return endSegment({ ...s, quote: '"', open: s.open.slice(0, -1) })
  }
  if (ch === "'" || ch === '"') return { ...s, quote: ch }
  if (SEPARATORS.contains(ch)) return endSegment({ ...s, word: s.word.replace(/\$$/, "") })
  if (/\s/.test(ch)) return endWord(s)
  return { ...s, word: s.word + ch }
}

/** Splits a command line into simple commands, as words, honouring quotes and escapes. */
export const segments = (command: string): ReadonlyArray<ReadonlyArray<string>> =>
  endSegment(Array.from(command).reduce(step, START)).segments

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
/** Words that run the command after them. `timeout` takes a duration first. */
const WRAPPERS = List.of("sudo", "command", "env", "time", "nice", "nohup", "exec", "then", "do", "else", "!")
const DURATION = /^\d+(?:\.\d+)?[smhd]?$/

/** Drops leading assignments and wrappers, so `FOO=1 timeout 30 gh pr view` is a `gh` call. */
const unwrap = (words: ReadonlyArray<string>): ReadonlyArray<string> => {
  if (words.length === 0) return words
  const head = words[0] ?? ""
  const rest = words.slice(1)
  if (ASSIGNMENT.test(head) || WRAPPERS.contains(head)) return unwrap(rest)
  if (head === "timeout") return unwrap(DURATION.test(rest[0] ?? "") ? rest.slice(1) : rest)
  return words
}

const isGh = (word: string): boolean => word === "gh" || word.endsWith("/gh")

/** Every `gh` call in the command, in order. */
export const ghCalls = (command: string): ReadonlyArray<GhCall> =>
  segments(command)
    .map(unwrap)
    .flatMap((words) => (words.length > 0 && isGh(words[0] ?? "") ? [{ args: words.slice(1) }] : []))

/** Whether the command wraps its calls in a shell loop, and the longest `sleep` in it, in seconds. */
export const loopOf = (command: string): { readonly loops: boolean; readonly sleepSeconds: number } => {
  const simple = segments(command).map(unwrap)
  const loops = simple.flat().some((w) => w === "while" || w === "until" || w === "for")
  const sleeps = simple
    .flatMap((words) => (words[0] === "sleep" && words.length > 1 ? [Number.parseFloat(words[1] ?? "")] : []))
    .filter((n) => Number.isFinite(n))
  return { loops, sleepSeconds: sleeps.length === 0 ? 0 : Math.max(...sleeps) }
}

/** Commands that never reach the API, or reach only what the limit doesn't count. */
const OFFLINE = List.of("auth", "config", "alias", "help", "version", "completion", "--version", "--help", "-h")

const WRITES: Readonly<Partial<Record<string, ReadonlyArray<string>>>> = {
  pr: ["create", "merge", "comment", "edit", "close", "reopen", "review", "ready", "lock", "unlock"],
  issue: ["create", "comment", "edit", "close", "reopen", "delete", "transfer", "lock", "unlock", "pin", "unpin"],
  release: ["create", "delete", "edit", "upload", "delete-asset"],
  repo: ["create", "delete", "edit", "rename", "fork", "archive", "unarchive", "sync"],
  label: ["create", "edit", "delete", "clone"],
  workflow: ["run", "enable", "disable"],
  run: ["rerun", "cancel", "delete"],
  secret: ["set", "delete"],
  variable: ["set", "delete"],
  gist: ["create", "edit", "delete"],
  cache: ["delete"],
}

/** Families gh serves from GraphQL; the rest of its commands use REST. */
const GRAPHQL = List.of("pr", "issue", "repo", "project", "label", "discussion")
const REST = List.of("run", "workflow", "release", "secret", "variable", "gist", "cache", "ruleset", "api")

/** `gh api` flags that take a value, so the value isn't mistaken for the path. */
const API_VALUE_FLAGS = List.of(
  "-X",
  "--method",
  "-H",
  "--header",
  "-f",
  "--raw-field",
  "-F",
  "--field",
  "--input",
  "-q",
  "--jq",
  "-t",
  "--template",
  "--hostname",
  "--cache",
  "-p",
  "--preview",
)
const API_FIELD_FLAGS = List.of("-f", "--raw-field", "-F", "--field", "--input")

type ApiShape = { readonly path: Option<string>; readonly method: Option<string>; readonly fields: boolean }

type ApiScan = { readonly shape: ApiShape; readonly pending: Option<string> }

const apiStep = (acc: ApiScan, word: string): ApiScan => {
  const { shape } = acc
  // The value of the flag before it.
  if (acc.pending.isSome()) {
    const isMethod = acc.pending.exists((flag) => flag === "-X" || flag === "--method")
    return { shape: isMethod ? { ...shape, method: Option(word.toUpperCase()) } : shape, pending: Option.none() }
  }
  const inline = Option(/^(?:-X|--method=)([A-Za-z]+)$/.exec(word)?.[1])
  if (inline.isSome()) return { ...acc, shape: { ...shape, method: inline.map((m) => m.toUpperCase()) } }
  if (API_VALUE_FLAGS.contains(word)) {
    return { shape: { ...shape, fields: shape.fields || API_FIELD_FLAGS.contains(word) }, pending: Option(word) }
  }
  if (/^--(?:raw-field|field|input)=/.test(word)) return { ...acc, shape: { ...shape, fields: true } }
  if (word.startsWith("-") || shape.path.isSome()) return acc
  return { ...acc, shape: { ...shape, path: Option(word.replace(/^\//, "")) } }
}

const apiShape = (args: ReadonlyArray<string>): ApiShape =>
  args.reduce(apiStep, {
    shape: { path: Option.none<string>(), method: Option.none<string>(), fields: false },
    pending: Option.none<string>(),
  }).shape

/** The interval a watching command polls at, from `--interval N`, `-i N` or `--interval=N`. */
const intervalOf = (args: ReadonlyArray<string>, fallback: number): number => {
  const at = args.findIndex((w) => w === "--interval" || w === "-i")
  const value =
    at >= 0 ? Option(args[at + 1]) : Option(args.map((w) => /^--interval=(\d+)$/.exec(w)?.[1]).find(Boolean))
  return value
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .getOrElse(() => fallback)
}

const MIN_POLL_SECONDS = 30

const describeApi = (args: ReadonlyArray<string>): Described => {
  const { path, method, fields } = apiShape(args)
  if (path.exists((p) => p === "rate_limit")) return { label: "gh api rate_limit", class: "read", resource: "core" }
  const verb = method.getOrElse(() => (fields ? "POST" : "GET"))
  const graphql = path.exists((p) => p === "graphql")
  return {
    label: graphql ? "gh api graphql" : `gh api ${verb}`,
    // A GraphQL call can read or write; gh sends both as POST, so only REST methods are classed.
    class: !graphql && verb !== "GET" && verb !== "HEAD" ? "write" : "read",
    resource: graphql ? "graphql" : "core",
  }
}

/** What the broker needs to know about one `gh` call; none for one that never reaches the API. */
export const describe = (call: GhCall): Option<Described> => {
  if (call.args.length === 0) return Option.none()
  const family = call.args[0] ?? ""
  if (OFFLINE.contains(family)) return Option.none()
  if (family === "api") return Option(describeApi(call.args.slice(1)))

  const sub = Option(call.args[1]).filter((w) => !w.startsWith("-"))
  const label = sub.fold(
    () => `gh ${family}`,
    (s) => `gh ${family} ${s}`,
  )
  const writes = sub.exists((s) => (WRITES[family] ?? []).includes(s))
  const resource = GRAPHQL.contains(family) ? "graphql" : REST.contains(family) ? "core" : undefined
  const base: Described = { label, class: writes ? "write" : "read", ...(resource === undefined ? {} : { resource }) }

  // `gh run watch` polls every 3 s by default and `gh pr checks --watch` every 10 s: about 1,200 and
  // 360 calls an hour, from one command the hook sees once.
  const subIs = (s: string): boolean => sub.exists((x) => x === s)
  const watching =
    (family === "run" && subIs("watch")) || (family === "pr" && subIs("checks") && call.args.includes("--watch"))
  const interval = intervalOf(call.args, family === "run" ? 3 : 10)
  return Option(
    watching && interval < MIN_POLL_SECONDS
      ? {
          ...base,
          refuse: `\`${label}\` polls every ${interval} s, about ${Math.round(3600 / interval)} GitHub calls an hour from one command. Pass --interval ${MIN_POLL_SECONDS} or more, or check once and wait with ScheduleWakeup.`,
        }
      : base,
  )
}

/** Refuses a shell loop around `gh` that sleeps less than 30 s between rounds, or not at all. */
export const loopRefusal = (command: string): Option<string> => {
  const { loops, sleepSeconds } = loopOf(command)
  return loops && sleepSeconds < MIN_POLL_SECONDS
    ? Option(
        `This command runs \`gh\` in a shell loop that sleeps ${sleepSeconds === 0 ? "not at all" : `${sleepSeconds} s`} between rounds, and each round spends the shared GitHub limit. Sleep ${MIN_POLL_SECONDS} s or more and cap the time, or wait with ScheduleWakeup.`,
      )
    : Option.none()
}
