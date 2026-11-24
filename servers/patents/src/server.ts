import { createServer } from "somamcp/node"

import { VERSION } from "./version"

export const server = createServer({
  name: "patents-mcp-server",
  version: VERSION,
})
