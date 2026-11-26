/**
 * Test-only: a fixed CPU-bound task shaped like the bulk-file work (build rows, split their fields,
 * filter, sort). The test Worker serves it at CALIBRATE_PATH, and bulk-cpu.spec.ts times it from
 * outside, through the same dispatchFetch path as the tool calls, to measure how fast this machine
 * runs workerd. Never part of a real Worker.
 */
export const CALIBRATE_PATH = "/__calibrate"

export const calibrationTask = (): number => {
  const parsed = Array.from(
    { length: 60_000 },
    (_, i) => `N~${String(i).padStart(6, "0")}~001~${7_000_000 + i}~${(i * 7) % 12} ${(i * 13) % 28}~Y`,
  ).map((row) => row.split("~"))
  const hits = parsed.filter((fields) => fields[1]!.endsWith("7"))
  hits.sort((a, b) => (a[4]! < b[4]! ? -1 : a[4]! > b[4]! ? 1 : 0))
  return hits.length
}
