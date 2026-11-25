import { Option } from "functype"

export type Summary = {
  readonly min: number
  readonly avg: number
  readonly max: number
  readonly latest: number
  readonly count: number
}

/** A field Beszel may leave out, as an Option, with non-finite numbers treated as missing. */
// eslint-disable-next-line functype/prefer-option -- the wire boundary: Beszel's JSON omits fields
export const present = (value: number | null | undefined): Option<number> =>
  Option(value).filter((n) => Number.isFinite(n))

/** Minimum, average, maximum and latest of a series in time order, skipping missing points. */
export const summarize = (series: ReadonlyArray<Option<number>>): Option<Summary> => {
  const values = series.flatMap((v) => v.toArray())
  return Option(values.at(-1)).map((latest) => ({
    min: Math.min(...values),
    avg: values.reduce((sum, v) => sum + v, 0) / values.length,
    max: Math.max(...values),
    latest,
    count: values.length,
  }))
}

/**
 * A summary whose maximum also counts each record's own peak. Beszel stores the highest reading
 * inside an averaged record beside the average, so the max of averages alone understates spikes.
 */
export const summarizeWithPeaks = (
  series: ReadonlyArray<Option<number>>,
  peaks: ReadonlyArray<Option<number>>,
): Option<Summary> =>
  summarize(series).map((s) => ({ ...s, max: Math.max(s.max, ...peaks.flatMap((p) => p.toArray())) }))

/** The sum of a pair such as [sent, received], when both parts are present. */
export const pairSum = (pair: ReadonlyArray<number> = []): Option<number> =>
  pair.length < 2 ? Option.none() : present((pair[0] ?? 0) + (pair[1] ?? 0))

/** Distinct values in sorted order. */
export const distinctSorted = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  values.filter((v, i) => values.indexOf(v) === i).toSorted()
