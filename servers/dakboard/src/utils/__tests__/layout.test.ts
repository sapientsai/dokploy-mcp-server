import { Map } from "functype"
import { describe, expect, it } from "vitest"

import type { DakboardBlock } from "../../types"
import { formatBlockLayout, parseScreenPagePercentages } from "../layout"

const bigCalendarBlocks: DakboardBlock[] = [
  { id: "blk_65ac66634830c0612e6b89a4", name: null, type: "calendar", w: 303, h: 263, x: 165, y: 0, z_index: 2 },
  { id: "blk_65ac66634830c0612e6b89a5", name: null, type: "photos", w: 963, h: 542, x: 0, y: 0, z_index: 0 },
  { id: "blk_65ac66634830c0612e6b89a6", name: null, type: "weather", w: 281, h: 170, x: 12, y: 328, z_index: 3 },
  { id: "blk_65ac6723d9e37a23b6331cea", name: null, type: "audio", w: 114, h: 113, x: 608, y: 288, z_index: 4 },
  { id: "blk_65ac6a9ca4086f06c37c39b6", name: null, type: "dailyfacts", w: 284, h: 84, x: 30, y: 87, z_index: 5 },
  { id: "blk_65ac6be6135dff171e5077e5", name: null, type: "todo", w: 202, h: 87, x: 78, y: 205, z_index: 6 },
  { id: "blk_65ac6c3bb2e921550d719795", name: null, type: "datetime", w: 129, h: 79, x: 116, y: 3, z_index: 7 },
  { id: "blk_65ac6c85d8599513bc2eb828", name: null, type: "weather", w: 148, h: 55, x: 6, y: 208, z_index: 8 },
  {
    id: "blk_65b8224fffdfd65d200e811c",
    name: "Taylor Swift",
    type: "photos",
    w: 207,
    h: 220,
    x: 351,
    y: 308,
    is_disabled: 1,
    z_index: 1,
  },
]

// Simulated CSS percentages from the actual DAKboard page
const bigCalendarPctMap = Map([
  ["65ac66634830c0612e6b89a4", { pctX: 35.356, pctY: 0, pctW: 64.645, pctH: 99.997 }],
  ["65ac66634830c0612e6b89a5", { pctX: 0, pctY: 0, pctW: 99.998, pctH: 99.997 }],
  ["65ac66634830c0612e6b89a6", { pctX: 1.316, pctY: 65.657, pctW: 31.259, pctH: 33.925 }],
  ["65ac6723d9e37a23b6331cea", { pctX: 83.435, pctY: 70.117, pctW: 15.68, pctH: 27.652 }],
  ["65ac6a9ca4086f06c37c39b6", { pctX: 3.161, pctY: 16.179, pctW: 29.798, pctH: 15.712 }],
  ["65ac6be6135dff171e5077e5", { pctX: 8.132, pctY: 37.811, pctW: 20.986, pctH: 16.141 }],
  ["65ac6c3bb2e921550d719795", { pctX: 12.032, pctY: 0.629, pctW: 13.346, pctH: 14.588 }],
  ["65ac6c85d8599513bc2eb828", { pctX: 1.22, pctY: 79.096, pctW: 31.55, pctH: 20.904 }],
  ["65b8224fffdfd65d200e811c", { pctX: 36.363, pctY: 56.832, pctW: 21.46, pctH: 40.593 }],
])

describe("formatBlockLayout", () => {
  it("should return message for empty block list", () => {
    expect(formatBlockLayout([])).toBe("No blocks to visualize.")
  })

  it("should render a single block with coordinate fallback", () => {
    const blocks: DakboardBlock[] = [{ id: "b1", type: "clock", w: 100, h: 50, x: 0, y: 0, z_index: 0 }]
    const result = formatBlockLayout(blocks)
    expect(result).toContain("┌")
    expect(result).toContain("┘")
    expect(result).toContain("clock")
    expect(result).toContain("Layout: 1 blocks")
    expect(result).toContain("API coordinates")
  })

  it("should render Big Calendar with CSS percentages", () => {
    const result = formatBlockLayout(bigCalendarBlocks, bigCalendarPctMap)
    expect(result).toContain("calendar")
    expect(result).toContain("datetime")
    expect(result).toContain("dailyfacts")
    expect(result).toContain("audio")
    expect(result).toContain("CSS percentages")
  })

  it("should show calendar taking up right side with percentages", () => {
    const result = formatBlockLayout(bigCalendarBlocks, bigCalendarPctMap)
    const lines = result.split("\n")
    // Calendar starts at ~35% = col 27 of 76. The right edge should be near col 76.
    // Check that the first line has content past column 27
    const firstLine = lines[0]
    expect(firstLine.length).toBeGreaterThan(50)
  })

  it("should show disabled blocks with dashed borders", () => {
    const blocks: DakboardBlock[] = [
      { id: "b1", type: "widget", w: 500, h: 300, x: 0, y: 0, is_disabled: 1, z_index: 0 },
    ]
    const result = formatBlockLayout(blocks)
    expect(result).toContain("╌")
    expect(result).toContain("1 disabled")
  })

  it("should fill background blocks with dots when using percentages", () => {
    const blocks: DakboardBlock[] = [
      { id: "blk_bg1", type: "photos", w: 1000, h: 1000, x: 0, y: 0, z_index: 0 },
      { id: "blk_fg1", type: "clock", w: 100, h: 100, x: 10, y: 10, z_index: 1 },
    ]
    const pctMap = Map([
      ["bg1", { pctX: 0, pctY: 0, pctW: 100, pctH: 100 }],
      ["fg1", { pctX: 10, pctY: 10, pctW: 20, pctH: 20 }],
    ])
    const result = formatBlockLayout(blocks, pctMap)
    expect(result).toContain("·")
    expect(result).toContain("clock")
  })

  it("should use block name over type when available", () => {
    const blocks: DakboardBlock[] = [
      { id: "b1", name: "My Widget", type: "custom", w: 500, h: 300, x: 0, y: 0, z_index: 0 },
    ]
    const result = formatBlockLayout(blocks)
    expect(result).toContain("My Widget")
  })

  it("should fall back to coordinates when no percentages provided", () => {
    const result = formatBlockLayout(bigCalendarBlocks)
    expect(result).toContain("API coordinates")
  })
})

describe("parseScreenPagePercentages", () => {
  it("should parse CSS custom properties from HTML", () => {
    const html = `
      <div id="abc123def456abc123def456" class="block calendar"
        style="--block-width: 64.645%; --block-height: 99.997%; --block-x: 35.356%; --block-y: 0%;">
      </div>
    `
    const result = parseScreenPagePercentages(html)
    expect(result.size).toBe(1)
    const pct = result.get("abc123def456abc123def456").orThrow()
    expect(pct.pctW).toBeCloseTo(64.645)
    expect(pct.pctH).toBeCloseTo(99.997)
    expect(pct.pctX).toBeCloseTo(35.356)
    expect(pct.pctY).toBe(0)
  })

  it("should return empty map for HTML without blocks", () => {
    const result = parseScreenPagePercentages("<div>no blocks</div>")
    expect(result.size).toBe(0)
  })
})
