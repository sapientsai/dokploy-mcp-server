import { IO, Left, Option, Right } from "functype"
import type { SomaServerInstance } from "somamcp"
import { UserError } from "somamcp"
import { z } from "zod"

import { getClient } from "../client/rescuetime-client"
import { toUserError } from "../errors"
import type { DailySummary } from "../types"
import { localDate } from "../utils/dates"
import { formatActivityData, formatDailySummary, formatProductivityScore } from "../utils/formatters"
import { formatRecentActivity } from "../utils/resource-formatters"

/** The newest day in the feed, or None when it is empty. Don't assume which end of the feed is newest. */
export function latestDate(summaries: readonly DailySummary[]): Option<string> {
  return summaries.reduce<Option<string>>(
    (latest, s) =>
      Option(
        latest.fold(
          () => s.date,
          (l) => (s.date > l ? s.date : l),
        ),
      ),
    Option.none(),
  )
}

function unwrapClient() {
  return getClient().toEither(new Error("RescueTime client not initialized. Is RESCUETIME_API_KEY set?"))
}

export function registerAnalyticsTools(server: SomaServerInstance): void {
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
        .mapError(toUserError)
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
        .mapError(toUserError)
        .runOrThrow(),
  })

  server.addTool({
    name: "get_productivity_score",
    description:
      "Get the productivity score and detailed breakdown for one completed day. Shows the productivity pulse (0-100), time by productivity level, and category breakdown. RescueTime's daily summaries never include today; for today, use get_activity_data or get_recent_activity.",
    parameters: z.object({
      date: z
        .string()
        .optional()
        .describe("Date to get score for (YYYY-MM-DD). Defaults to the most recent completed day, usually yesterday."),
    }),
    execute: async (args) =>
      IO.gen(function* () {
        const client = yield* IO.fromEither(unwrapClient())
        const summaries = yield* client.getDailySummary()
        const target = args.date ?? latestDate(summaries).orUndefined()
        if (target === undefined) {
          return yield* IO.fail(
            new UserError("RescueTime has no daily summaries yet. A day's summary appears after midnight.", {
              category: "not_found",
              suggestions: ["For today, use get_activity_data or get_recent_activity."],
            }),
          )
        }
        const match = summaries.find((s: DailySummary) => s.date === target)
        return yield* IO.fromEither(
          match
            ? Right<Error, string>(formatProductivityScore(match))
            : Left<Error, string>(
                new UserError(
                  target === localDate()
                    ? `No summary for ${target} yet: RescueTime's daily summaries never include today. Its summary appears after midnight.`
                    : `No productivity data found for ${target}. Daily summaries cover the last 2 weeks, excluding today.`,
                  {
                    category: "not_found",
                    suggestions: ["For today, use get_activity_data or get_recent_activity."],
                  },
                ),
              ),
        )
      })
        .mapError(toUserError)
        .runOrThrow(),
  })

  server.addTool({
    name: "get_recent_activity",
    description:
      "Show the latest stretch of a day's RescueTime timeline: each 5-minute window with its main activity, newest first. Good for 'what was I just doing?'. Use get_activity_data for totals.",
    parameters: z.object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Day to show (YYYY-MM-DD). Defaults to today in the RescueTime account's timezone."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(288)
        .default(24)
        .describe(
          "How many 5-minute windows with activity to show. Untracked windows are skipped, so 24 covers 2 hours only when nothing was untracked. 288 always covers a full day.",
        ),
    }),
    execute: async (args) =>
      IO.fromEither(unwrapClient())
        .flatMap((client) => client.getTimeline(args.date))
        .map((timeline) => formatRecentActivity(timeline, args.limit, args.date ?? "today"))
        .mapError(toUserError)
        .runOrThrow(),
  })
}
