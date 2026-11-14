import type { ToolServer } from "../../src/tools/types"

type CapturedTool<TArgs = Record<string, unknown>> = {
  name: string
  description: string
  parameters: unknown
  execute: (args: TArgs) => Promise<string | undefined> | string | undefined
}

/**
 * Drives a tool `register` function with a fake ToolServer and returns the
 * registered tool config (so tests can invoke `.execute(args)` directly).
 * Each spec file declares its own `vi.hoisted` mocks for `getDokployClient`.
 */
export function captureTool<TArgs = Record<string, unknown>>(
  register: (server: ToolServer) => void,
): CapturedTool<TArgs> {
  let captured: CapturedTool<TArgs> | undefined
  const fakeServer = {
    addTool: (config: CapturedTool<TArgs>) => {
      captured = config
    },
  } as unknown as ToolServer
  register(fakeServer)
  if (!captured) throw new Error("register did not call server.addTool")
  return captured
}
