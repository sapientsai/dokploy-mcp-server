import type { SomaServerInstance } from "somamcp"
import { expect } from "vitest"

import { registerTemporalTools } from "../../src/tools.js"

// Drives the tool layer in process: register the real tools against a stub
// server, validate arguments through each tool's own schema, and surface an
// `isError` result as a rejection — which is what somamcp/edge does on the wire
// (it rethrows so the client gets a JSON-RPC error). Tests therefore exercise
// the same contract a client sees, without HTTP.

type StandardSchema = {
  readonly "~standard": {
    readonly validate: (
      value: unknown,
    ) => { value: unknown } | { issues: ReadonlyArray<{ message: string }> } | Promise<unknown>
  }
}

type RegisteredTool = {
  execute: (args: unknown, context: unknown) => Promise<unknown>
  name: string
  parameters?: StandardSchema
}

const tools = new Map<string, RegisteredTool>()

registerTemporalTools({
  addTool: (tool: unknown) => {
    const registered = tool as RegisteredTool
    tools.set(registered.name, registered)
  },
} as unknown as SomaServerInstance)

/** The tools never touch it, but `execute` takes one. */
const context = {
  client: { version: undefined },
  log: { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} },
  reportProgress: async () => {},
  session: undefined,
  streamContent: async () => {},
}

const textOf = (result: unknown): string => {
  const parts = (result as { content?: Array<{ text?: string }> }).content
  return parts?.map((p) => p.text ?? "").join("\n") ?? String(result)
}

export const callTool = async <T>(name: string, args: Readonly<Record<string, unknown>>): Promise<T> => {
  const tool = tools.get(name)
  if (!tool) throw new Error(`No such tool: ${name}. Registered: ${[...tools.keys()].join(", ")}`)

  // Mirror the server's argument validation rather than passing raw input.
  const parsed = tool.parameters ? await tool.parameters["~standard"].validate(args) : { value: args }
  const issues = (parsed as { issues?: ReadonlyArray<{ message: string }> }).issues
  if (issues) throw new Error(`Invalid arguments: ${issues.map((i) => i.message).join(", ")}`)

  const result = await tool.execute((parsed as { value: unknown }).value, context)

  if ((result as { isError?: boolean }).isError === true) throw new Error(textOf(result))

  return JSON.parse(textOf(result)) as T
}

export const expectToolError = async (p: Promise<unknown>, pattern: RegExp): Promise<void> => {
  await expect(p).rejects.toThrow(pattern)
}
