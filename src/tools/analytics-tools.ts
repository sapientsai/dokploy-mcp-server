import type { FastMCP } from "fastmcp"
import { IO, Left, Right } from "functype"
import { z } from "zod"

import { getClient } from "../client/rescuetime-client"
import type { DailySummary } from "../types"
import { formatActivityData, formatDailySummary, formatProductivityScore } from "../utils/formatters"

function unwrapClient() {
  return getClient().toEither(new Error("RescueTime client not initialized. Is RESCUETIME_API_KEY set?"))
}

export function registerAnalyticsTools(server: FastMCP): void {
  server.addTool({
    name: "get_activity_data",
    description:
      "Query RescueTime activity data with flexible filters. Returns time spent on activities, categories, or productivity levels for a given date range.",
    parameters: z.object({
      perspective: z
        .enum(["rank", "interval", "member"])
        .default("rank")
        .describe("Data perspective: rank (top activities by time), interval (time series), member (team breakdown)"),
      resolution: z
        .enum(["month", "week", "day", "hour", "minute"])
        .default("day")
        .describe("Time granularity for interval perspective"),
      restrict_kind: z
        .enum(["category", "activity", "productivity", "document", "efficiency", "overview"])
        .default("activity")
        .describe("Type of grouping for the data"),
      restrict_begin: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to today."),
      restrict_end: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
      restrict_thing: z.string().optional().describe("Filter to a specific activity or category name"),
      restrict_thingy: z.string().optional().describe("Filter to a specific document or sub-activity"),
      restrict_source_type: z.enum(["computers", "mobile", "offline"]).optional().describe("Filter by device type"),
    }),
    execute: async (args) =>
      IO.fromEither(unwrapClient())
        .flatMap((client) =>
          client.getAnalyticData({
            perspective: args.perspective,
            resolution_time: args.resolution,
            restrict_kind: args.restrict_kind,
            restrict_begin: args.restrict_begin,
            restrict_end: args.restrict_end,
            restrict_thing: args.restrict_thing,
            restrict_thingy: args.restrict_thingy,
            restrict_source_type: args.restrict_source_type,
          }),
        )
        .map((data) => formatActivityData(data, { perspective: args.perspective, restrict_kind: args.restrict_kind }))
        .runOrThrow(),
  })

  server.addTool({
    name: "get_daily_summary",
    description:
      "Get daily productivity summaries for the last 2 weeks. Each day includes a productivity pulse score (0-100), time breakdowns by productivity level, and category percentages.",
    parameters: z.object({}),
    execute: async () =>
      IO.fromEither(unwrapClient())
        .flatMap((client) => client.getDailySummary())
        .map(formatDailySummary)
        .runOrThrow(),
  })

  server.addTool({
    name: "get_productivity_score",
    description:
      "Get the productivity score and detailed breakdown for a specific date. Shows the productivity pulse (0-100), time by productivity level, and category breakdown.",
    parameters: z.object({
      date: z.string().optional().describe("Date to get score for (YYYY-MM-DD). Defaults to today."),
    }),
    execute: async (args) =>
      IO.gen(function* () {
        const client = yield* IO.fromEither(unwrapClient())
        const summaries = yield* client.getDailySummary()
        const target = args.date ?? new Date().toISOString().slice(0, 10)
        const match = summaries.find((s: DailySummary) => s.date === target)
        return yield* IO.fromEither(
          match
            ? Right<Error, string>(formatProductivityScore(match))
            : Left<Error, string>(
                new Error(`No productivity data found for ${target}. Data is available for the last 2 weeks.`),
              ),
        )
      }).runOrThrow(),
  })
}
