import { IO, Option } from "functype"
import type { SomaServerInstance } from "somamcp"
import { UserError } from "somamcp"
import { z } from "zod"

import { getClient } from "../client/rescuetime-client"
import { toUserError } from "../errors"
import type { GlobalState, ProjectTimeDay, StartTimerParams } from "../types"
import { dateRange, MAX_RANGE_DAYS } from "../utils/dates"
import { type ResolvedLink, resolveTimerLink } from "../utils/projects"
import { formatProjectTime, formatStopResult, formatTimerStarted } from "../utils/resource-formatters"

/** Parallel day fetches for get_project_time, kept low for RescueTime's 60 requests/minute limit. */
const DAY_FETCH_CONCURRENCY = 3

const datePattern = /^\d{4}-\d{2}-\d{2}$/

function unwrapClient() {
  return getClient().toEither(new Error("RescueTime client not initialized. Is RESCUETIME_API_KEY set?"))
}

function describeActive(states: readonly GlobalState[]): string {
  return states
    .map((s) => {
      const kind = (s.state.is_timer ?? s.is_timer) ? "a timer" : s.state.in_zone ? "a focus zone" : "a focus session"
      const label = s.state.label_name ?? s.label_name
      return label ? `${kind} ("${label}")` : kind
    })
    .join(" and ")
}

const toTimerParams = (link: Option<ResolvedLink>, label: Option<string>): StartTimerParams => ({
  label_name: label.orUndefined(),
  v2_project_id: link.map((l) => l.project.id).orUndefined(),
  task_id: link.flatMap((l) => l.task.map((t) => t.id)).orUndefined(),
})

export function registerTimesheetTools(server: SomaServerInstance): void {
  server.addTool({
    name: "start_timer",
    description:
      "Start a RescueTime Timesheets timer, optionally for a project and task. It never blocks apps or sites (use start_focus_session for that). Refuses if a timer, focus session or focus zone is already running. RescueTime ends an unstopped timer after 24h.",
    parameters: z.object({
      project: z
        .string()
        .min(1)
        .optional()
        .describe("Project name. Matches case-insensitively; a unique partial name also works."),
      task: z.string().min(1).optional().describe("Task name within the project. Requires project."),
      label: z.string().min(1).max(255).optional().describe("Short description of what the timer is for."),
    }),
    execute: async (args) =>
      IO.gen(function* () {
        const client = yield* IO.fromEither(unwrapClient())
        const states = yield* client.getFocusState()
        if (states.length > 0) {
          return yield* IO.fail(
            new UserError(`Cannot start a timer: ${describeActive(states)} is already running.`, {
              suggestions: ["Call stop_timer first, or get_focus_state to see what is running."],
            }),
          )
        }
        if (args.task !== undefined && args.project === undefined) {
          return yield* IO.fail(
            new UserError("task needs project: name the project the task belongs to.", { category: "validation" }),
          )
        }
        const link: Option<ResolvedLink> =
          args.project === undefined
            ? Option.none()
            : Option(
                yield* client
                  .getProjects()
                  .flatMap((projects) =>
                    IO.fromEither(resolveTimerLink(projects, args.project ?? "", Option(args.task))),
                  ),
              )
        const state = yield* client.startTimer(toTimerParams(link, Option(args.label)))
        return formatTimerStarted(state, {
          projectName: link.map((l) => l.project.name).orUndefined(),
          taskName: link.flatMap((l) => l.task.map((t) => t.name)).orUndefined(),
        })
      })
        .mapError(toUserError)
        .runOrThrow(),
  })

  server.addTool({
    name: "stop_timer",
    description:
      "Stop whatever timer, focus session or focus zone is running, via RescueTime's Resource API. RescueTime decides from progress whether to keep the record or cancel it, and reports any project time logged. Safe to call when nothing is running.",
    parameters: z.object({}),
    execute: async () =>
      IO.fromEither(unwrapClient())
        .flatMap((client) => client.stopSession())
        .map(formatStopResult)
        .mapError(toUserError)
        .runOrThrow(),
  })

  server.addTool({
    name: "get_project_time",
    description: `Get RescueTime Timesheets project time: totals per project and task, then each entry by day. Omit both dates for today. Covers up to ${MAX_RANGE_DAYS} days per call.`,
    parameters: z.object({
      start_date: z.string().regex(datePattern).optional().describe("First day (YYYY-MM-DD). Defaults to end_date."),
      end_date: z.string().regex(datePattern).optional().describe("Last day (YYYY-MM-DD). Defaults to start_date."),
    }),
    execute: async (args) =>
      IO.gen(function* () {
        const client = yield* IO.fromEither(unwrapClient())
        const start = args.start_date ?? args.end_date
        const end = args.end_date ?? args.start_date
        if (start === undefined || end === undefined) {
          const today = yield* client.getProjectTimes()
          const date = today.project_times[0]?.date ?? "today"
          return formatProjectTime([{ date, response: today }], date === "today" ? "today" : `today, ${date}`)
        }
        const days = yield* IO.fromEither(dateRange(start, end))
        const results = yield* IO.forEach(
          days,
          (date) => client.getProjectTimes(date).map((response): ProjectTimeDay => ({ date, response })),
          { concurrency: DAY_FETCH_CONCURRENCY },
        )
        return formatProjectTime(results, start === end ? start : `${start} to ${end}`)
      })
        .mapError(toUserError)
        .runOrThrow(),
  })
}
