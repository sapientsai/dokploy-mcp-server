import type { FastMCP } from "fastmcp"
import { IO } from "functype"
import { z } from "zod"

import { getClient } from "../client/rescuetime-client"
import { formatFocusSessions } from "../utils/formatters"

function unwrapClient() {
  return getClient().toEither(new Error("RescueTime client not initialized. Is RESCUETIME_API_KEY set?"))
}

export function registerFocusTools(server: FastMCP): void {
  server.addTool({
    name: "start_focus_session",
    description:
      "Start a RescueTime Focus Session. This blocks distracting websites and apps. Duration must be a multiple of 5 minutes, or -1 for until end of day. Note: the desktop app syncs on a 1-minute interval.",
    parameters: z.object({
      duration: z.number().describe("Duration in minutes. Must be a multiple of 5, or -1 for until end of day."),
    }),
    execute: async (args) =>
      IO.fromEither(unwrapClient())
        .flatMap((client) => client.startFocusSession(args.duration))
        .map(() => {
          const durationText = args.duration === -1 ? "until end of day" : `${args.duration} minutes`
          return `Focus session started for ${durationText}. Distracting sites and apps will be blocked.`
        })
        .runOrThrow(),
  })

  server.addTool({
    name: "end_focus_session",
    description: "End the current RescueTime Focus Session. Unblocks distracting websites and apps.",
    parameters: z.object({}),
    execute: async () =>
      IO.fromEither(unwrapClient())
        .flatMap((client) => client.endFocusSession())
        .map(() => "Focus session ended. Distracting sites and apps are no longer blocked.")
        .runOrThrow(),
  })

  server.addTool({
    name: "get_focus_sessions",
    description: "Get recent focus session history, including both started and ended sessions.",
    parameters: z.object({}),
    execute: async () =>
      IO.fromEither(unwrapClient())
        .flatMap((client) =>
          client
            .getFocusSessionsStarted()
            .zip(client.getFocusSessionsEnded())
            .map(([started, ended]) => formatFocusSessions(started, ended)),
        )
        .runOrThrow(),
  })
}
