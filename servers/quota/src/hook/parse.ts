import { List, Option } from "functype"

/**
 * Finds the `gh` calls in a shell command and describes each one for the broker: a label of known
 * words only (never an argument), whether it writes, which budget it spends, and whether to refuse it
 * outright. Pure functions, so they're tested on their own.
 */

export type GhCall = {
  readonly args: ReadonlyArray<string>
  /** Set when `watch` reruns the call, in seconds between runs. */
  readonly repeatEvery?: number
}

export type CallClass = "read" | "write"

export type Described = {
  readonly label: string
  readonly class: CallClass
  /** `core` or `graphql`; left out, the broker picks the budget with less left. */
  readonly resource?: string
  /** Set when the call polls too fast for the shared limit, whatever the broker says. */
  readonly refuse?: string
}

/* ---------- Splitting a command line ---------- */

/** `<<WORD`, `<<-WORD` or `<<'WORD'`, but not a here-string (`<<<`), whose text is on its own line. */
const HEREDOC = /(?<!<)<<(?!<)(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/g

type Terminator = { readonly word: string; readonly tabs: boolean }
type Lines = { readonly kept: ReadonlyArray<string>; readonly until: ReadonlyArray<Terminator> }

/**
 * Drops heredoc bodies, which are data, not commands: `cat <<'EOF' … EOF` inside a `--body "$(…)"`
 * would otherwise read as commands. The line holding `<<WORD` is kept; the lines up to `WORD` aren't.
 */
export const stripHeredocs = (command: string): string =>
  command
    .split("\n")
    .reduce<Lines>(
      (acc, line) => {
        const current = acc.until.at(0)
        if (current !== undefined) {
          const ends = (current.tabs ? line.replace(/^\t+/, "") : line) === current.word
          return ends ? { ...acc, until: acc.until.slice(1) } : acc
        }
        const opened = Array.from(line.matchAll(HEREDOC), (m) => ({ word: m[3], tabs: m[1] === "-" }))
        return { kept: [...acc.kept, line], until: opened }
      },
      { kept: [], until: [] },
    )
    .kept.join("\n")

type Scan = {
  readonly segments: ReadonlyArray<ReadonlyArray<string>>
  readonly words: ReadonlyArray<string>
  readonly word: string
  readonly quote: "" | "'" | '"'
  readonly escaped: boolean
  readonly comment: boolean
  /**
   * Substitutions opened inside double quotes, innermost last: `)` for `$(`, `` ` `` for a backtick.
   * Their contents run as commands, unquoted, and the double quote resumes when they close.
   */
  readonly open: ReadonlyArray<")" | "`">
}

const START: Scan = { segments: [], words: [], word: "", quote: "", escaped: false, comment: false, open: [] }

/** Characters that end one simple command and start another, outside single quotes. */
const SEPARATORS = List.of(";", "&", "|", "\n", "(", ")", "`")

const endWord = (s: Scan): Scan => (s.word === "" ? s : { ...s, words: [...s.words, s.word], word: "" })
const endSegment = (s: Scan): Scan => {
  const w = endWord(s)
  return w.words.length === 0 ? w : { ...w, segments: [...w.segments, w.words], words: [] }
}

const step = (s: Scan, ch: string): Scan => {
  // A comment runs to the end of the line.
  if (s.comment) return ch === "\n" ? endSegment({ ...s, comment: false }) : s
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
  if (closing !== undefined && ch === closing) return endSegment({ ...s, quote: '"', open: s.open.slice(0, -1) })
  if (ch === "#" && s.word === "") return { ...endWord(s), comment: true }
  if (ch === "'" || ch === '"') return { ...s, quote: ch }
  if (SEPARATORS.contains(ch)) return endSegment({ ...s, word: s.word.replace(/\$$/, "") })
  if (/\s/.test(ch)) return endWord(s)
  return { ...s, word: s.word + ch }
}

/** Splits a command line into simple commands, as words, honouring quotes, escapes, comments and heredocs. */
export const segments = (command: string): ReadonlyArray<ReadonlyArray<string>> =>
  endSegment(Array.from(stripHeredocs(command)).reduce(step, START)).segments

/* ---------- Seeing past wrappers ---------- */

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
/** Keywords and wrappers that run the command after them, with no flags of their own to skip. */
const KEYWORDS = List.of(
  "then",
  "do",
  "else",
  "elif",
  "if",
  "while",
  "until",
  "!",
  "{",
  "time",
  "nohup",
  "exec",
  "command",
)
const DURATION = /^\d+(?:\.\d+)?[smhd]?$/

/** Skips a wrapper's flags: `valued` ones take the next word too. Returns the words after them. */
const skipFlags = (words: ReadonlyArray<string>, valued: ReadonlyArray<string>): ReadonlyArray<string> => {
  const head = words.at(0)
  const rest = words.slice(1)
  if (head === undefined) return words
  if (head === "--") return rest
  if (!head.startsWith("-") || head === "-") return words
  return skipFlags(valued.includes(head) ? rest.slice(1) : rest, valued)
}

/** Seconds from `watch -n N` / `--interval N` / `-nN`, which defaults to 2. */
const watchInterval = (words: ReadonlyArray<string>): number => {
  const at = words.findIndex((w) => w === "-n" || w === "--interval")
  const inline = words.map((w) => /^(?:-n|--interval=)(\d+(?:\.\d+)?)$/.exec(w)?.[1]).find(Boolean)
  const n = Number(at >= 0 ? words[at + 1] : inline)
  return Number.isFinite(n) && n > 0 ? n : 2
}

type Unwrapped = { readonly words: ReadonlyArray<string>; readonly repeatEvery?: number }

const withRepeat = (words: ReadonlyArray<string>, repeatEvery: number | undefined): Unwrapped =>
  repeatEvery === undefined ? { words } : { words, repeatEvery }

/** Drops what runs a command rather than being it, so `FOO=1 sudo -u me timeout -k 5 30 gh …` is a `gh` call. */
const unwrap = (words: ReadonlyArray<string>, repeatEvery?: number): Unwrapped => {
  const head = words.at(0)
  const rest = words.slice(1)
  const again = (next: ReadonlyArray<string>): Unwrapped => unwrap(next, repeatEvery)
  if (head === undefined) return withRepeat(words, repeatEvery)
  if (ASSIGNMENT.test(head) || KEYWORDS.contains(head)) return again(rest)
  if (head === "sudo") return again(skipFlags(rest, ["-u", "-g", "-U", "-C", "-h", "-p", "-r", "-t", "-D"]))
  if (head === "env") return again(skipFlags(rest, ["-u", "-C", "-S"]))
  if (head === "nice") return again(skipFlags(rest, ["-n"]))
  if (head === "xargs") return again(skipFlags(rest, ["-n", "-I", "-P", "-L", "-s", "-d", "-E", "-a"]))
  if (head === "timeout") {
    const after = skipFlags(rest, ["-k", "-s", "--kill-after", "--signal"])
    return again(DURATION.test(after[0] ?? "") ? after.slice(1) : after)
  }
  if (head === "watch") return unwrap(skipFlags(rest, ["-n", "--interval"]), watchInterval(rest))
  return withRepeat(words, repeatEvery)
}

const isGh = (word: string): boolean => word === "gh" || word.endsWith("/gh")
const SHELLS = List.of("bash", "sh", "zsh", "dash")
const isShell = (word: string): boolean => SHELLS.exists((s) => word === s || word.endsWith(`/${s}`))

/** The script a shell runs with `-c`, also in combined flags such as `-lc` or `-ec`. */
const shellScript = (args: ReadonlyArray<string>): Option<string> => {
  const at = args.findIndex((w) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(w))
  return at >= 0 ? Option(args[at + 1]) : Option.none()
}

/**
 * The text a segment runs as a command of its own: a shell's `-c` script, `eval`'s arguments, or a
 * command `watch` (or another wrapper) was given as one quoted string.
 */
export const nestedScript = (words: ReadonlyArray<string>): Option<string> => {
  const head = words.at(0)
  if (head === undefined) return Option.none()
  if (isShell(head)) return shellScript(words.slice(1))
  if (head === "eval") return Option(words.slice(1).join(" "))
  return words.length === 1 && /\s/.test(head) ? Option(head) : Option.none()
}

const callsIn = (command: string, repeatEvery: number | undefined): ReadonlyArray<GhCall> =>
  segments(command).flatMap((segment): ReadonlyArray<GhCall> => {
    const unwrapped = unwrap(segment)
    const every = unwrapped.repeatEvery ?? repeatEvery
    const { words } = unwrapped
    const head = words.at(0)
    if (head === undefined) return []
    return nestedScript(words).fold(
      () => (isGh(head) ? [{ args: words.slice(1), ...(every === undefined ? {} : { repeatEvery: every }) }] : []),
      (script) => callsIn(script, every),
    )
  })

/** Every `gh` call in the command, in order, including those inside `bash -c '…'`, `eval` and `watch '…'`. */
export const ghCalls = (command: string): ReadonlyArray<GhCall> => callsIn(command, undefined)

/* ---------- Loops ---------- */

const SLEEP_UNITS: Readonly<Partial<Record<string, number>>> = { "": 1, s: 1, m: 60, h: 3600, d: 86_400 }

const sleepSeconds = (arg: string): number => {
  const m = /^(\d+(?:\.\d+)?)([smhd]?)$/.exec(arg)
  return m === null ? Number.NaN : Number(m[1]) * (SLEEP_UNITS[m[2]] ?? 1)
}

type LoopScan = {
  /** Loops open at this point, innermost last: open-ended, or bounded by a list or its input. */
  readonly stack: ReadonlyArray<"open" | "bounded">
  readonly ghInLoop: boolean
  readonly sleeps: ReadonlyArray<number>
}

/** Words that can come before a loop keyword in the same segment, as in `then while …` or `do until …`. */
const LEADERS = List.of("then", "do", "else", "elif", "{", "!", "time")

/** A segment's first word that isn't a leader, and the word after it. */
const leading = (segment: ReadonlyArray<string>): { readonly head: string; readonly next: string } => {
  const at = segment.findIndex((w) => !LEADERS.contains(w))
  return at < 0 ? { head: "", next: "" } : { head: segment[at] ?? "", next: segment[at + 1] ?? "" }
}

/**
 * Whether `gh` runs inside an open-ended `while` or `until` loop (its condition or its body), and the
 * longest `sleep` inside such a loop, looking into `bash -c` scripts too. A `for` over a list and a
 * `while read` over input are bounded by what they're given, so they aren't counted.
 */
export const loopOf = (command: string): { readonly loops: boolean; readonly sleepSeconds: number } => {
  const scan = segments(command).reduce<LoopScan>(
    (acc, segment) => {
      const { head, next } = leading(segment)
      const opened: ReadonlyArray<"open" | "bounded"> =
        head === "while" || head === "until"
          ? [next === "read" ? "bounded" : "open"]
          : head === "for" || head === "select"
            ? ["bounded"]
            : []
      const stack = acc.stack.concat(opened)
      const inside = stack.includes("open")
      const { words } = unwrap(segment)
      const nested = nestedScript(words).map(loopOf)
      const ghHere = inside && words.length > 0 && isGh(words[0] ?? "")
      const sleep = inside && words[0] === "sleep" ? [sleepSeconds(words[1] ?? "")] : []
      return {
        stack: head === "done" ? stack.slice(0, -1) : stack,
        ghInLoop: acc.ghInLoop || ghHere || nested.exists((n) => n.loops),
        sleeps: [
          ...acc.sleeps,
          ...sleep,
          ...nested.fold(
            () => [],
            (n) => (n.loops ? [n.sleepSeconds] : []),
          ),
        ],
      }
    },
    { stack: [], ghInLoop: false, sleeps: [] },
  )
  const sleeps = scan.sleeps.filter((n) => Number.isFinite(n))
  return { loops: scan.ghInLoop, sleepSeconds: sleeps.length === 0 ? 0 : Math.max(...sleeps) }
}

/* ---------- Describing a call ---------- */

/** Commands that never reach the API, or reach only what the limit doesn't count. */
const OFFLINE = List.of("auth", "config", "alias", "help", "version", "completion", "--version", "--help", "-h")

/** The subcommands a label may name, per family. Anything else is labelled by the family alone. */
const KNOWN: Readonly<Partial<Record<string, ReadonlyArray<string>>>> = {
  pr: [
    "checkout",
    "checks",
    "close",
    "comment",
    "create",
    "diff",
    "edit",
    "list",
    "lock",
    "merge",
    "ready",
    "reopen",
    "revert",
    "review",
    "status",
    "unlock",
    "update-branch",
    "view",
  ],
  issue: [
    "close",
    "comment",
    "create",
    "delete",
    "develop",
    "edit",
    "list",
    "lock",
    "pin",
    "reopen",
    "status",
    "transfer",
    "unlock",
    "unpin",
    "view",
  ],
  repo: [
    "archive",
    "autolink",
    "clone",
    "create",
    "delete",
    "deploy-key",
    "edit",
    "fork",
    "gitignore",
    "license",
    "list",
    "rename",
    "set-default",
    "sync",
    "unarchive",
    "view",
  ],
  run: ["cancel", "delete", "download", "list", "rerun", "view", "watch"],
  workflow: ["disable", "enable", "list", "run", "view"],
  release: ["create", "delete", "delete-asset", "download", "edit", "list", "upload", "view"],
  label: ["clone", "create", "delete", "edit", "list"],
  secret: ["delete", "list", "set"],
  variable: ["delete", "get", "list", "set"],
  gist: ["clone", "create", "delete", "edit", "list", "rename", "view"],
  cache: ["delete", "list"],
  project: [
    "close",
    "copy",
    "create",
    "delete",
    "edit",
    "field-create",
    "field-delete",
    "field-list",
    "item-add",
    "item-archive",
    "item-create",
    "item-delete",
    "item-edit",
    "item-list",
    "link",
    "list",
    "mark-template",
    "unlink",
    "view",
  ],
  ruleset: ["check", "list", "view"],
  search: ["code", "commits", "issues", "prs", "repos"],
  browse: [],
  status: [],
  org: ["list"],
  codespace: [],
  extension: [],
  attestation: [],
}

const WRITES: Readonly<Partial<Record<string, ReadonlyArray<string>>>> = {
  pr: [
    "close",
    "comment",
    "create",
    "edit",
    "lock",
    "merge",
    "ready",
    "reopen",
    "revert",
    "review",
    "unlock",
    "update-branch",
  ],
  issue: [
    "close",
    "comment",
    "create",
    "delete",
    "develop",
    "edit",
    "lock",
    "pin",
    "reopen",
    "transfer",
    "unlock",
    "unpin",
  ],
  repo: ["archive", "create", "delete", "edit", "fork", "rename", "sync", "unarchive"],
  run: ["cancel", "delete", "rerun"],
  workflow: ["disable", "enable", "run"],
  release: ["create", "delete", "delete-asset", "edit", "upload"],
  label: ["clone", "create", "delete", "edit"],
  secret: ["delete", "set"],
  variable: ["delete", "set"],
  gist: ["create", "delete", "edit", "rename"],
  cache: ["delete"],
  project: [
    "close",
    "copy",
    "create",
    "delete",
    "edit",
    "field-create",
    "field-delete",
    "item-add",
    "item-archive",
    "item-create",
    "item-delete",
    "item-edit",
    "link",
    "mark-template",
    "unlink",
  ],
}

/** Families gh serves from GraphQL; the rest of its commands use REST. */
const GRAPHQL = List.of("pr", "issue", "repo", "project", "label", "discussion")
const REST = List.of("run", "workflow", "release", "secret", "variable", "gist", "cache", "ruleset", "api", "search")

/** Flags gh takes on most commands, with a value, before or after the subcommand. */
const COMMON_VALUED = ["-R", "--repo", "--hostname"]

/** The first word after the family that isn't a flag or a flag's value: the subcommand, if any. */
const subcommandOf = (args: ReadonlyArray<string>): Option<string> => {
  const first = args.at(0)
  const rest = args.slice(1)
  if (first === undefined) return Option.none()
  if (COMMON_VALUED.includes(first)) return subcommandOf(rest.slice(1))
  if (first.startsWith("-")) return subcommandOf(rest)
  return Option(first)
}

const METHODS = List.of("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE")

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
  const inline = Option(/^(?:-X|--method=)(.+)$/.exec(word)?.[1])
  if (inline.isSome()) return { ...acc, shape: { ...shape, method: inline.map((m) => m.toUpperCase()) } }
  if (API_VALUE_FLAGS.contains(word)) {
    return { shape: { ...shape, fields: shape.fields || API_FIELD_FLAGS.contains(word) }, pending: Option(word) }
  }
  // Fields given inline: -fkey=v, -Ftitle=x, --field=k=v, --raw-field=…, --input=file.
  if (/^(?:-[fF].+|--(?:raw-field|field|input)=.*)$/.test(word)) return { ...acc, shape: { ...shape, fields: true } }
  if (word.startsWith("-") || shape.path.isSome()) return acc
  return { ...acc, shape: { ...shape, path: Option(word.replace(/^\//, "")) } }
}

const apiShape = (args: ReadonlyArray<string>): ApiShape =>
  args.reduce(apiStep, {
    shape: { path: Option.none<string>(), method: Option.none<string>(), fields: false },
    pending: Option.none<string>(),
  }).shape

const MIN_POLL_SECONDS = 30

const describeApi = (args: ReadonlyArray<string>): Described => {
  const { path, method, fields } = apiShape(args)
  if (path.exists((p) => p === "rate_limit" || p.startsWith("rate_limit?"))) {
    return { label: "gh api rate_limit", class: "read", resource: "core" }
  }
  if (path.exists((p) => p === "graphql")) return { label: "gh api graphql", class: "read", resource: "graphql" }
  const verb = method.getOrElse(() => (fields ? "POST" : "GET"))
  const known = METHODS.contains(verb)
  return {
    // An unknown method goes unnamed, and counts as a write.
    label: known ? `gh api ${verb}` : "gh api",
    class: known && (verb === "GET" || verb === "HEAD") ? "read" : "write",
    resource: "core",
  }
}

const describeFamily = (family: string, args: ReadonlyArray<string>): Described => {
  const known = KNOWN[family]
  const sub = subcommandOf(args).filter((s) => (known ?? []).includes(s))
  const label =
    known === undefined
      ? "gh"
      : sub.fold(
          () => `gh ${family}`,
          (s) => `gh ${family} ${s}`,
        )
  const writes = sub.exists((s) => (WRITES[family] ?? []).includes(s))
  const resource = GRAPHQL.contains(family) ? "graphql" : REST.contains(family) ? "core" : undefined
  return { label, class: writes ? "write" : "read", ...(resource === undefined ? {} : { resource }) }
}

/** The interval a watching gh command polls at, from `--interval N`, `-i N` or `--interval=N`. */
const intervalOf = (args: ReadonlyArray<string>, fallback: number): number => {
  const at = args.findIndex((w) => w === "--interval" || w === "-i")
  const value =
    at >= 0 ? Option(args[at + 1]) : Option(args.map((w) => /^--interval=(\d+)$/.exec(w)?.[1]).find(Boolean))
  return value
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .getOrElse(() => fallback)
}

const pollingRefusal = (what: string, seconds: number): string =>
  `${what} polls every ${seconds} s, about ${Math.round(3600 / seconds)} GitHub calls an hour from one command. Poll every ${MIN_POLL_SECONDS} s or more, or check once and wait with ScheduleWakeup.`

/** What the broker needs to know about one `gh` call; none for one that never reaches the API. */
export const describe = (call: GhCall): Option<Described> => {
  const family = call.args.at(0)
  if (family === undefined || OFFLINE.contains(family)) return Option.none()
  const described = family === "api" ? describeApi(call.args.slice(1)) : describeFamily(family, call.args.slice(1))

  // `gh run watch` polls every 3 s by default and `gh pr checks --watch` every 10 s: about 1,200 and
  // 360 calls an hour, from one command the hook sees once. `watch -n N gh …` reruns any call.
  const watching =
    described.label === "gh run watch" || (described.label === "gh pr checks" && call.args.includes("--watch"))
  const ownInterval = intervalOf(call.args, described.label === "gh run watch" ? 3 : 10)
  const refuse =
    call.repeatEvery !== undefined && call.repeatEvery < MIN_POLL_SECONDS
      ? pollingRefusal(`\`watch\` around \`${described.label}\``, call.repeatEvery)
      : watching && ownInterval < MIN_POLL_SECONDS
        ? pollingRefusal(`\`${described.label}\``, ownInterval)
        : undefined
  return Option(refuse === undefined ? described : { ...described, refuse })
}

/** Refuses an open-ended shell loop around `gh` that sleeps less than 30 s between rounds, or not at all. */
export const loopRefusal = (command: string): Option<string> => {
  const { loops, sleepSeconds: slept } = loopOf(command)
  return loops && slept < MIN_POLL_SECONDS
    ? Option(
        `This command runs \`gh\` in a \`while\`/\`until\` loop that sleeps ${slept === 0 ? "not at all" : `${slept} s`} between rounds, and each round spends the shared GitHub limit. Sleep ${MIN_POLL_SECONDS} s or more and cap the time, or wait with ScheduleWakeup.`,
      )
    : Option.none()
}
