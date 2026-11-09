import type { Either } from "functype"
import { Left, Right } from "functype"
import { UserError } from "somamcp"

/** Longest project-time range one call may cover; each day is its own request against a 60/min limit. */
export const MAX_RANGE_DAYS = 31

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

const pad = (n: number): string => String(n).padStart(2, "0")

/** The calendar date on this machine's clock, e.g. "2026-11-08". Not UTC, which runs a day ahead in the evening. */
export function localDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Parse "YYYY-MM-DD" as a calendar day, rejecting impossible dates such as 2026-02-30. */
function toUtcDay(date: string): Either<UserError, number> {
  if (!DATE_PATTERN.test(date))
    return Left(new UserError(`Invalid date "${date}". Use YYYY-MM-DD.`, { category: "validation" }))
  const [y, m, d] = date.split("-").map(Number) as [number, number, number]
  const ms = Date.UTC(y, m - 1, d)
  const check = new Date(ms)
  return check.getUTCMonth() === m - 1 && check.getUTCDate() === d
    ? Right(ms)
    : Left(new UserError(`Invalid date "${date}". That day does not exist.`, { category: "validation" }))
}

const fromUtcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** Every day from start to end inclusive, capped at MAX_RANGE_DAYS. */
export function dateRange(start: string, end: string): Either<UserError, readonly string[]> {
  return toUtcDay(start).flatMap((startMs) =>
    toUtcDay(end).flatMap((endMs) => {
      const days = Math.round((endMs - startMs) / DAY_MS) + 1
      if (days < 1)
        return Left<UserError, readonly string[]>(
          new UserError(`end_date ${end} is before start_date ${start}.`, { category: "validation" }),
        )
      if (days > MAX_RANGE_DAYS)
        return Left<UserError, readonly string[]>(
          new UserError(`That range is ${days} days. Ask for ${MAX_RANGE_DAYS} days or fewer.`, {
            category: "validation",
          }),
        )
      return Right<UserError, readonly string[]>(
        Array.from({ length: days }, (_, i) => fromUtcDay(startMs + i * DAY_MS)),
      )
    }),
  )
}
