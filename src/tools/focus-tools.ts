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
      "Start a RescueTime Focus Session that blocks distracting websites and apps. The desktop app syncs on a 1-minute interval, so there may be a brief delay before blocking takes effect. Common durations: 25 (pomodoro), 60, 90, 120 minutes.",
    parameters: z.object({
      duration: z
        .number()
        .int()
        .refine((n) => n === -1 || (n >= 5 && n % 5 === 0 && n <= 480), {
          message: "Duration must be -1 (until end of day) or a multiple of 5 between 5 and 480 minutes",
        })
        .describe(
          "Duration in minutes. Must be a multiple of 5 (e.g., 25, 60, 90), or -1 for until end of day. Max 480 minutes (8 hours).",
        ),
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
    description:
      "End the current RescueTime Focus Session early. Unblocks distracting websites and apps. Only useful if a focus session is currently active.",
    parameters: z.object({}),
    execute: async () =>
      IO.fromEither(unwrapClient())
        .flatMap((client) => client.endFocusSession())
        .map(() => "Focus session ended. Distracting sites and apps are no longer blocked.")
        .runOrThrow(),
  })

  server.addTool({
    name: "get_focus_sessions",
    description: "Get recent focus session history, including both started and completed sessions with timestamps.",
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
