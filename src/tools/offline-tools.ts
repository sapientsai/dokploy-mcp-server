import type { FastMCP } from "fastmcp"
import { IO } from "functype"
import { z } from "zod"

import { getClient } from "../client/rescuetime-client"

function unwrapClient() {
  return getClient().toEither(new Error("RescueTime client not initialized. Is RESCUETIME_API_KEY set?"))
}

export function registerOfflineTools(server: FastMCP): void {
  server.addTool({
    name: "log_offline_time",
    description:
      "Log offline time in RescueTime for activities away from the computer (meetings, breaks, phone calls). Max 4 hours per entry. Times must be in the past — no future dates allowed. Both start and end times are required in ISO 8601 format.",
    parameters: z.object({
      start_time: z.string().describe("Start time in ISO 8601 format with timezone (e.g., 2026-03-26T09:00:00-04:00)"),
      end_time: z
        .string()
        .describe(
          "End time in ISO 8601 format with timezone (e.g., 2026-03-26T10:00:00-04:00). Max 4 hours after start.",
        ),
      activity_name: z
        .string()
        .describe("Short name for the activity (e.g., 'Team Meeting', 'Lunch Break', 'Phone Call')"),
      activity_details: z.string().optional().describe("Additional details about the activity"),
    }),
    execute: async (args) =>
      IO.fromEither(unwrapClient())
        .flatMap((client) =>
          client.logOfflineTime({
            start_time: args.start_time,
            end_time: args.end_time,
            activity_name: args.activity_name,
            activity_details: args.activity_details,
          }),
        )
        .map(() => `Offline time logged: "${args.activity_name}" from ${args.start_time} to ${args.end_time}`)
        .runOrThrow(),
  })
}
