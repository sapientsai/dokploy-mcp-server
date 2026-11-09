import type {
  GlobalState,
  ProjectTimeDay,
  ProjectTimeEntry,
  StopSessionResponse,
  TimelineActivity,
  TimelineResponse,
} from "../types"
import { formatDuration } from "./formatters"

// === Focus State ===

function stateKind(s: GlobalState): string {
  if (s.state.is_timer ?? s.is_timer) return "Timer"
  if (s.state.in_zone) return "Focus zone"
  return "Focus session"
}

const isoFromEpoch = (epoch: number): string => new Date(epoch * 1000).toISOString()

const onOff = (flag: boolean | undefined): string => (flag ? "on" : "off")

function formatState(s: GlobalState, nowEpoch: number): string {
  const kind = stateKind(s)
  const label = s.state.label_name ?? s.label_name
  const remaining = s.expiration_epoch - nowEpoch
  const lines = [
    `### ${kind}${label ? `: ${label}` : ""}`,
    "",
    `- **Started:** ${isoFromEpoch(s.start_time_epoch)} (${formatDuration(Math.max(0, nowEpoch - s.start_time_epoch))} ago)`,
    kind === "Timer"
      ? `- **Expires:** ${isoFromEpoch(s.expiration_epoch)} unless stopped (RescueTime caps timers at 24h)`
      : `- **Ends:** ${isoFromEpoch(s.expiration_epoch)} (${formatDuration(Math.max(0, remaining))} left)`,
    `- **Blocking:** apps and sites ${onOff(s.state.block_apps_sites)}, communication apps ${onOff(s.state.block_comms)}`,
  ]
  const project = s.state.v2_project_id === undefined ? [] : [`- **Project ID:** ${s.state.v2_project_id}`]
  return [...lines, ...project].join("\n")
}

export function formatFocusState(states: readonly GlobalState[], nowEpoch: number): string {
  if (states.length === 0) {
    return ["## Focus State", "", "Nothing is active: no focus session, focus zone, or timer is running."].join("\n")
  }
  return ["## Focus State", "", ...states.map((s) => formatState(s, nowEpoch))].join("\n")
}

export type TimerLink = {
  readonly projectName?: string
  readonly taskName?: string
}

export function formatTimerStarted(state: GlobalState, link: TimerLink): string {
  const label = state.state.label_name ?? state.label_name
  const linkText = link.projectName
    ? ` for project **${link.projectName}**${link.taskName ? ` / task **${link.taskName}**` : ""}`
    : ""
  return [
    `Timer started${linkText}${label ? ` with label "${label}"` : ""} at ${isoFromEpoch(state.start_time_epoch)}.`,
    "",
    "App and site blocking is off. RescueTime ends the timer after 24h if it is not stopped. Call stop_timer to stop it.",
  ].join("\n")
}

export function formatStopResult(result: StopSessionResponse): string {
  if (result.message === "none") return "Nothing was active, so nothing was stopped."

  const name = result.focus_session?.name
  const named = name ? ` "${name}"` : ""
  const projectLine = result.project_time
    ? [
        "",
        `Logged ${formatDuration(result.project_time.duration)} to ${result.project_time.project?.name ?? result.project_time.name}.`,
      ]
    : []

  if (result.message === "deleted") {
    return [
      `Cancelled${named}. RescueTime discarded its record: it treats a session stopped early as cancelled.`,
      ...projectLine,
    ].join("\n")
  }
  const duration = result.focus_session ? ` after ${formatDuration(result.focus_session.duration)}` : ""
  return [`Stopped${named}${duration} and kept its record.`, ...projectLine].join("\n")
}

// === Project Time ===

/** "2026-11-06T05:45:00.000-08:00" → "05:45", in the offset RescueTime returned. */
const clockTime = (iso: string): string => iso.slice(11, 16)

function entryLabel(e: ProjectTimeEntry): string {
  const project = e.project?.name ?? e.name
  const task = e.task && !e.task.hidden ? ` / ${e.task.name}` : ""
  const client = e.client ? ` (${e.client.name})` : ""
  return `${project}${task}${client}`
}

function totalsByLabel(entries: readonly ProjectTimeEntry[]): ReadonlyArray<readonly [string, number]> {
  const totals = entries.reduce<Readonly<Record<string, number>>>(
    (acc, e) => ({ ...acc, [entryLabel(e)]: (acc[entryLabel(e)] ?? 0) + e.duration }),
    {},
  )
  return Object.entries(totals).toSorted(([, a], [, b]) => b - a)
}

function formatDay(day: ProjectTimeDay): readonly string[] {
  const entries = day.response.project_times
  if (entries.length === 0) return []
  return [
    `### ${day.date}`,
    "",
    ...entries.map(
      (e) =>
        `- ${clockTime(e.start_time)}–${clockTime(e.end_time)} **${entryLabel(e)}** ${formatDuration(e.duration)}${e.extra?.draft ? " *(draft)*" : ""}`,
    ),
    "",
  ]
}

export function formatProjectTime(days: readonly ProjectTimeDay[], rangeLabel: string): string {
  const entries = days.flatMap((d) => d.response.project_times)
  const partial = days.filter((d) => !d.response.is_complete).map((d) => d.date)
  const partialNote =
    partial.length > 0
      ? ["", `*RescueTime was still computing ${partial.join(", ")}. Those days may be incomplete; ask again shortly.*`]
      : []

  if (entries.length === 0) {
    return [`## Project Time (${rangeLabel})`, "", "No project time logged.", ...partialNote].join("\n")
  }

  const total = entries.reduce((sum, e) => sum + e.duration, 0)
  const drafts = entries.filter((e) => e.extra?.draft).length
  const draftNote =
    drafts > 0
      ? [
          "",
          `*${drafts} of ${entries.length} entries are drafts RescueTime suggested and nobody has reviewed. They count in the totals.*`,
        ]
      : []

  return [
    `## Project Time (${rangeLabel})`,
    "",
    `**Total:** ${formatDuration(total)} across ${entries.length} entries`,
    ...draftNote,
    "",
    "| Project / Task | Time |",
    "| --- | --- |",
    ...totalsByLabel(entries).map(([label, seconds]) => `| ${label} | ${formatDuration(seconds)} |`),
    "",
    ...days.flatMap(formatDay),
    ...partialNote,
  ].join("\n")
}

// === Recent Activity ===

type TimedActivity = readonly [string, TimelineActivity]

function timedActivities(timeline: TimelineResponse): readonly TimedActivity[] {
  const { activities } = timeline
  return Array.isArray(activities)
    ? activities.map((a): TimedActivity => ["", a])
    : Object.entries(activities as Readonly<Record<string, TimelineActivity>>)
}

/** "2026-11-08 09:10:00 -0500" → "09:10". */
const bucketTime = (key: string): string => (key.length >= 16 ? key.slice(11, 16) : "—")

export function formatRecentActivity(timeline: TimelineResponse, limit: number, dayLabel: string): string {
  const all = timedActivities(timeline)
  if (all.length === 0) {
    return [`## Recent Activity (${dayLabel})`, "", "No activity tracked."].join("\n")
  }

  const recent = all.toSorted(([a], [b]) => b.localeCompare(a)).slice(0, limit)

  return [
    `## Recent Activity (${dayLabel})`,
    "",
    "Each row is a 5-minute window and the activity that took most of it. For full totals, use get_activity_data.",
    "",
    "| Window | Activity | Category | Time |",
    "| --- | --- | --- | --- |",
    ...recent.map(
      ([key, a]) =>
        `| ${bucketTime(key)} | ${a.display_name}${a.continuation ? " (continued)" : ""} | ${a.category} | ${formatDuration(a.duration)} |`,
    ),
    "",
    `*Showing the latest ${recent.length} of ${all.length} windows, newest first.*`,
  ].join("\n")
}
