import { IO } from "functype"
import type { SomaServerInstance } from "somamcp"
import { z } from "zod"

import { getClient } from "../client/rescuetime-client"
import { toUserError } from "../errors"
import { formatFocusSessions } from "../utils/formatters"
import { formatFocusState } from "../utils/resource-formatters"

function unwrapClient() {
  return getClient().toEither(new Error("RescueTime client not initialized. Is RESCUETIME_API_KEY set?"))
}

export function registerFocusTools(server: SomaServerInstance): void {
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
        .mapError(toUserError)
        .runOrThrow(),
  })

  server.addTool({
    name: "end_focus_session",
    description:
      "End a Focus Session started with start_focus_session early, unblocking distracting websites and apps. To stop a Timesheets timer, or anything get_focus_state shows running, use stop_timer.",
    parameters: z.object({}),
    execute: async () =>
      IO.fromEither(unwrapClient())
        .flatMap((client) => client.endFocusSession())
        .map(() => "Focus session ended. Distracting sites and apps are no longer blocked.")
        .mapError(toUserError)
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
        .mapError(toUserError)
        .runOrThrow(),
  })

  server.addTool({
    name: "get_focus_state",
    description:
      "Show what is running right now: a focus session, a focus zone, or a Timesheets timer, with start time, end or expiry, and blocking settings. Use get_focus_sessions for past sessions.",
    parameters: z.object({}),
    execute: async () =>
      IO.fromEither(unwrapClient())
        .flatMap((client) => client.getFocusState())
        .map((states) => formatFocusState(states, Math.floor(Date.now() / 1000)))
        .mapError(toUserError)
        .runOrThrow(),
  })
}
