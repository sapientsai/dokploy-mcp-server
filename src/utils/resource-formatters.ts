import type { Option } from "functype"

import type {
  GlobalState,
  ProjectTimeDay,
  ProjectTimeEntry,
  StopSessionResponse,
  TimelineActivity,
  TimelineResponse,
} from "../types"
import { formatDuration, tableCell } from "./formatters"
import { clockIn, dateTimeIn, isoOffset } from "./time"

// === Focus State ===

function stateKind(s: GlobalState): string {
  if (s.state.is_timer ?? s.is_timer) return "Timer"
  if (s.state.in_zone) return "Focus zone"
  return "Focus session"
}

const timeFromEpoch = (epoch: number, zone: Option<string>): string => dateTimeIn(new Date(epoch * 1000), zone)

const onOff = (flag: boolean | undefined): string => (flag ? "on" : "off")

function formatState(s: GlobalState, nowEpoch: number, zone: Option<string>): string {
  const kind = stateKind(s)
  const label = s.state.label_name ?? s.label_name
  const remaining = s.expiration_epoch - nowEpoch
  const lines = [
    `### ${kind}${label ? `: ${label}` : ""}`,
    "",
    `- **Started:** ${timeFromEpoch(s.start_time_epoch, zone)} (${formatDuration(Math.max(0, nowEpoch - s.start_time_epoch))} ago)`,
    kind === "Timer"
      ? `- **Expires:** ${timeFromEpoch(s.expiration_epoch, zone)} unless stopped`
      : `- **Ends:** ${timeFromEpoch(s.expiration_epoch, zone)} (${formatDuration(Math.max(0, remaining))} left)`,
    `- **Blocking:** apps and sites ${onOff(s.state.block_apps_sites)}, communication apps ${onOff(s.state.block_comms)}`,
  ]
  const project = s.state.project ? [`- **Project:** ${s.state.project.name}`] : []
  return [...lines, ...project].join("\n")
}

export function formatFocusState(states: readonly GlobalState[], nowEpoch: number, zone: Option<string>): string {
  if (states.length === 0) {
    return ["## Focus State", "", "Nothing is active: no focus session, focus zone, or timer is running."].join("\n")
  }
  return ["## Focus State", "", ...states.map((s) => formatState(s, nowEpoch, zone))].join("\n")
}

export type TimerLink = {
  readonly projectName?: string
  readonly taskName?: string
}

export function formatTimerStarted(state: GlobalState, link: TimerLink, zone: Option<string>): string {
  const label = state.state.label_name ?? state.label_name
  const linkText = link.projectName
    ? ` for project **${link.projectName}**${link.taskName ? ` / task **${link.taskName}**` : ""}`
    : ""
  return [
    `Timer started${linkText}${label ? ` with label "${label}"` : ""} at ${timeFromEpoch(state.start_time_epoch, zone)}.`,
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

function formatDay(day: ProjectTimeDay, zone: Option<string>): readonly string[] {
  const entries = day.response.project_times
  if (entries.length === 0) return []
  return [
    `### ${day.date}`,
    "",
    ...entries.map(
      (e) =>
        `- ${clockIn(e.start_time, zone)}–${clockIn(e.end_time, zone)} **${entryLabel(e)}** ${formatDuration(e.duration)}${e.extra?.draft ? " *(draft)*" : ""}`,
    ),
    "",
  ]
}

/** Where the clock times come from, so a reader never has to guess the zone. */
/** Every distinct offset among the entries, e.g. "UTC-07:00, UTC-08:00" for a range across a DST change. */
const offsetsOf = (entries: readonly ProjectTimeEntry[]): string =>
  [...new Set(entries.map((e) => isoOffset(e.start_time)).filter((o) => o.length > 0))].map((o) => `UTC${o}`).join(", ")

function zoneNote(zone: Option<string>, entries: readonly ProjectTimeEntry[]): string {
  return zone.fold(
    () => `*Times are as RescueTime sent them (${offsetsOf(entries)}); the account's time zone was unavailable.*`,
    (tz) => `*Times are in the account's time zone, ${tz}.*`,
  )
}

export function formatProjectTime(days: readonly ProjectTimeDay[], rangeLabel: string, zone: Option<string>): string {
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
    zoneNote(zone, entries),
    ...draftNote,
    "",
    "| Project / Task | Time |",
    "| --- | --- |",
    ...totalsByLabel(entries).map(([label, seconds]) => `| ${tableCell(label)} | ${formatDuration(seconds)} |`),
    "",
    ...days.flatMap((d) => formatDay(d, zone)),
    ...partialNote,
  ].join("\n")
}

// === Recent Activity ===

type TimedActivity = readonly [string, TimelineActivity]

/** Buckets with an activity name. Untracked windows arrive as `{}` and are dropped. */
function trackedActivities(timeline: TimelineResponse): readonly TimedActivity[] {
  const { activities } = timeline
  const all: readonly TimedActivity[] = Array.isArray(activities)
    ? activities.map((a): TimedActivity => ["", a])
    : Object.entries(activities as Readonly<Record<string, TimelineActivity>>)
  return all.filter(([, a]) => typeof a.display_name === "string" && a.display_name.length > 0)
}

/** "2026-11-08 09:10:00 -0500" → "09:10". */
const bucketTime = (key: string): string => (key.length >= 16 ? key.slice(11, 16) : "—")

/** Whether RescueTime recorded a different activity in a guessed window and hid it in `masked_bucket`. */
const hidesTrackedActivity = (a: TimelineActivity): boolean => a.was_empty === false || Boolean(a.masked_bucket)

function activityLabel(a: TimelineActivity): string {
  const name = a.display_name ?? ""
  if (a.guess)
    return hidesTrackedActivity(a) ? `${name} (guessed over other activity)` : `${name} (guessed, nothing tracked)`
  return a.continuation ? `${name} (continued)` : name
}

/** A guessed bucket has no measurement of its own, so it never shows a time. */
const activityTime = (a: TimelineActivity): string =>
  !a.guess && typeof a.duration === "number" ? formatDuration(a.duration) : "—"

export function formatRecentActivity(timeline: TimelineResponse, limit: number, dayLabel: string): string {
  const tracked = trackedActivities(timeline)
  if (tracked.length === 0) {
    return [`## Recent Activity (${dayLabel})`, "", "No activity tracked."].join("\n")
  }

  const recent = tracked.toSorted(([a], [b]) => b.localeCompare(a)).slice(0, limit)
  const guessNote = recent.some(([, a]) => a.guess)
    ? [
        "*Guessed* rows are windows where RescueTime carried the activity before them forward and gave no time. *Nothing tracked* means it recorded nothing there. *Over other activity* means it recorded a different activity there, which isn't shown.",
      ]
    : []

  return [
    `## Recent Activity (${dayLabel})`,
    "",
    "Each row is a 5-minute window and its main activity. Windows with nothing tracked are left out. For full totals, use get_activity_data.",
    "",
    "| Window | Activity | Category | Time |",
    "| --- | --- | --- | --- |",
    ...recent.map(
      ([key, a]) =>
        `| ${bucketTime(key)} | ${tableCell(activityLabel(a))} | ${tableCell(a.category ?? "—")} | ${activityTime(a)} |`,
    ),
    "",
    ...guessNote,
    `*Showing the latest ${recent.length} of ${tracked.length} windows with activity, newest first.*`,
  ].join("\n")
}
