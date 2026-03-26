import type { FastMCP } from "fastmcp"
import { IO } from "functype"
import { z } from "zod"

import { getClient } from "../client/rescuetime-client"
import { formatHighlights } from "../utils/formatters"

function unwrapClient() {
  return getClient().toEither(new Error("RescueTime client not initialized. Is RESCUETIME_API_KEY set?"))
}

export function registerHighlightTools(server: FastMCP): void {
  server.addTool({
    name: "get_highlights",
    description: "Get recent RescueTime highlights (accomplishments/milestones logged by the user). Premium feature.",
    parameters: z.object({}),
    execute: async () =>
      IO.gen(function* () {
        const client = yield* IO.fromEither(unwrapClient())
        const highlights = yield* client.getHighlights()
        return formatHighlights(highlights)
      }).runOrThrow(),
  })

  // eslint-disable-next-line functype/prefer-do-notation -- already using IO.gen
  server.addTool({
    name: "post_highlight",
    description: "Log a new highlight (accomplishment/milestone) in RescueTime. Max 255 characters. Premium feature.",
    parameters: z.object({
      description: z.string().min(1).max(255).describe("The highlight text (max 255 characters)"),
      highlight_date: z.string().optional().describe("Date for the highlight (YYYY-MM-DD). Defaults to today."),
      source: z.string().optional().describe("Optional source label (e.g., 'mcp-server')"),
    }),
    execute: async (args) =>
      IO.gen(function* () {
        const client = yield* IO.fromEither(unwrapClient())
        const highlight = yield* client.postHighlight({
          description: args.description,
          highlight_date: args.highlight_date,
          source: args.source ?? "mcp-server",
        })
        return `Highlight logged for ${highlight.date}: "${highlight.description}"`
      }).runOrThrow(),
  })
}
