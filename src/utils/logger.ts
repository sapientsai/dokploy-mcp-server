/**
 * Namespaced debug logging for the OpenFDA MCP server.
 *
 * Off unless DEBUG names a namespace, as the `debug` package did: `DEBUG=openfda-mcp:*` turns
 * them all on, a comma- or space-separated list picks some, and a leading `-` excludes one.
 * Output goes to stderr, because stdout carries JSON-RPC on stdio. With no `process`, as on
 * Workers, nothing is logged.
 */

import { Option } from "functype"
import { createDirectConsoleLogger } from "functype-log"

type ProcessLike = { process?: { env?: Partial<Record<string, string>> } }

/** A namespace logger: a message, and anything worth showing with it. */
export type NamespaceLogger = (message: string, ...data: readonly unknown[]) => void

const debugSetting = (): Option<string> =>
  Option((globalThis as ProcessLike).process)
    .flatMap((p) => Option(p.env))
    .flatMap((env) => Option(env.DEBUG))

const globToRegExp = (glob: string): RegExp =>
  new RegExp(
    `^${glob
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  )

/** Whether a DEBUG `setting` turns `namespace` on. */
export const isEnabled = (namespace: string, setting: string): boolean => {
  const patterns = setting.split(/[\s,]+/).filter((pattern) => pattern !== "")
  const matches = (pattern: string): boolean => globToRegExp(pattern).test(namespace)
  const excluded = patterns.filter((p) => p.startsWith("-")).some((p) => matches(p.slice(1)))
  return !excluded && patterns.filter((p) => !p.startsWith("-")).some(matches)
}

const output = createDirectConsoleLogger({ stream: "stderr" })

const namespaced =
  (namespace: string): NamespaceLogger =>
  (message, ...data) => {
    // Read per call, so a change to DEBUG takes effect without a restart.
    if (!debugSetting().exists((setting) => isEnabled(namespace, setting))) return
    output.debug(`${namespace} ${message}`, data.length === 0 ? undefined : { data })
  }

export const loggers = {
  api: namespaced("openfda-mcp:api"),
  bulk: namespaced("openfda-mcp:bulk"),
  core: namespaced("openfda-mcp:core"),
  main: namespaced("openfda-mcp:main"),
  tools: namespaced("openfda-mcp:tools"),
}
