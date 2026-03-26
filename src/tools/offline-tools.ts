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
      "Log offline time in RescueTime (meetings, breaks, activities away from computer). Max 4 hours per entry, no future dates allowed.",
    parameters: z.object({
      start_time: z.string().describe("Start time in ISO 8601 format (e.g., 2024-01-15T09:00:00-05:00)"),
      end_time: z.string().optional().describe("End time in ISO 8601 format. Provide either end_time or duration."),
      duration: z
        .number()
        .optional()
        .describe("Duration in seconds. Provide either end_time or duration. Max 14400 (4 hours)."),
      activity_name: z.string().describe("Name of the activity (e.g., 'Team Meeting', 'Lunch Break')"),
      activity_details: z.string().optional().describe("Additional details about the activity"),
    }),
    execute: async (args) =>
      IO.fromEither(unwrapClient())
        .flatMap((client) =>
          client.logOfflineTime({
            start_time: args.start_time,
            end_time: args.end_time,
            duration: args.duration,
            activity_name: args.activity_name,
            activity_details: args.activity_details,
          }),
        )
        .map(() => `Offline time logged: "${args.activity_name}" starting at ${args.start_time}`)
        .runOrThrow(),
  })
}
