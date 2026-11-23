import { Option, Try } from "functype"

/**
 * RescueTime writes some timestamps (project time, focus records) with its own server's Pacific offset,
 * whatever the account's time zone. Tools convert every printed time to the account's zone with these.
 */

const isValidZone = (tz: string): boolean => Try(() => new Intl.DateTimeFormat("en-US", { timeZone: tz })).isSuccess()

/** An IANA zone name the runtime can format in, or None. Takes the raw wire value, which can be null. */
// eslint-disable-next-line functype/prefer-option -- wire boundary: RescueTime's JSON sends null
export function resolveZone(raw: string | null | undefined): Option<string> {
  return Option(raw ?? undefined).filter((tz) => tz.length > 0 && isValidZone(tz))
}

type Parts = Readonly<Record<string, string>>

function partsIn(date: Date, timeZone: string): Option<Parts> {
  return Try(() =>
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      // "h23", not hour12: false, which can print midnight as 24:00.
      hourCycle: "h23",
      timeZoneName: "short",
    })
      .formatToParts(date)
      .reduce<Parts>((acc, p) => ({ ...acc, [p.type]: p.value }), {}),
  ).toOption()
}

const utcDateTime = (date: Date): string => `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`

/** "2026-11-12 09:04 EST" in the account's zone, or "2026-11-12 14:04 UTC" when the zone is unknown. */
export function dateTimeIn(date: Date, zone: Option<string>): string {
  return zone
    .flatMap((tz) => partsIn(date, tz))
    .fold(
      () => utcDateTime(date),
      (p) => `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${p.timeZoneName}`,
    )
}

/** "09:00" in the account's zone. When the zone is unknown, the clock time exactly as RescueTime wrote it. */
export function clockIn(iso: string, zone: Option<string>): string {
  return zone
    .flatMap((tz) => partsIn(new Date(iso), tz))
    .fold(
      () => iso.slice(11, 16),
      (p) => `${p.hour}:${p.minute}`,
    )
}

/** The UTC offset at the end of an ISO timestamp, e.g. "-08:00", or "" when it has none. */
export const isoOffset = (iso: string): string => /[+-]\d{2}:\d{2}$/.exec(iso)?.[0] ?? ""
